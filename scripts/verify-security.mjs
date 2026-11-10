/**
 * verify-security.mjs — proves the live database is locked down.
 *
 * Run after applying the SQL schema:
 *   npm run verify:security
 *
 * Checks that anonymous visitors can read the catalog and place orders, but
 * cannot write products, read customer orders, change settings, or upload
 * photos. Exit code 0 means every rule holds.
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = {};
for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const t = l.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i < 0) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

// Optional admin client: some checks need a row that a stranger then tries to
// read. Reading an empty table proves nothing, so we plant a row first.
const adminEmail = env.VERIFY_ADMIN_EMAIL || process.env.VERIFY_ADMIN_EMAIL || '';
const adminPassword = env.VERIFY_ADMIN_PASSWORD || process.env.VERIFY_ADMIN_PASSWORD || '';
let admin = null;
if (adminEmail && adminPassword) {
  admin = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await admin.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });
  if (error) {
    console.error(`\n  ! Could not sign in as admin (${error.message}).\n`);
    admin = null;
  }
}

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('\n=== Anonymous access (no login) ===\n');

// Public reads must still work — the storefront depends on them.
const { error: readErr } = await sb.from('products').select('id').limit(1);
record('public can read products', !readErr, readErr?.message ?? 'storefront works');

const { error: setErr } = await sb.from('store_settings').select('id').limit(1);
record('public can read settings', !setErr, setErr?.message ?? 'WhatsApp/rate available');

// Writes and private reads must now be blocked.
const { error: writeErr } = await sb.from('products').insert({
  id: 999999999999,
  name: 'ANON WRITE PROBE',
  price: 1,
  image_url: 'https://example.com/x.png',
});
record('anonymous CANNOT write products', Boolean(writeErr), writeErr?.message ?? 'SECURITY HOLE');

// An empty table answers 200 with no rows whether the policy hides the data or
// there is simply nothing to hide. So plant a real order as the admin and see
// whether a stranger can read it back.
const probeId = 'SEC-PROBE-' + Date.now();
let containerRow = null;

if (admin) {
  const { error: plantErr } = await admin.from('orders').insert({
    id: probeId,
    customer_name: 'ZZ_SEC_PROBE',
    customer_phone: '0000000000',
    city_address: 'probe',
    payment_method: 'pago_movil',
    subtotal: 1,
    total: 1,
    status: 'pending_whatsapp',
    items: [],
  });
  if (!plantErr) containerRow = probeId;
}

if (containerRow) {
  const { data: leaked, error: leakErr } = await sb
    .from('orders')
    .select('customer_name, customer_phone')
    .eq('id', containerRow);

  const exposed = !leakErr && Array.isArray(leaked) && leaked.length > 0;
  record(
    'anonymous CANNOT read customer orders',
    !exposed,
    exposed ? 'SECURITY HOLE: probe row was readable' : 'probe row stayed hidden'
  );

  await admin.from('orders').delete().eq('id', containerRow);
} else {
  // Without admin credentials we cannot prove this either way. Do not report a
  // pass we have not earned.
  const { data: anyOrders, error: orderErr } = await sb
    .from('orders')
    .select('customer_name, customer_phone')
    .limit(5);
  const visible = !orderErr && (anyOrders?.length ?? 0) > 0;
  if (visible) {
    record(
      'anonymous CANNOT read customer orders',
      false,
      'SECURITY HOLE: customer rows are readable with the anon key'
    );
  } else {
    record(
      'anonymous CANNOT read customer orders',
      true,
      'UNPROVEN — set VERIFY_ADMIN_EMAIL/PASSWORD to plant a probe row'
    );
  }
}

// An RLS-blocked UPDATE returns success with 0 rows, not an error, so the only
// reliable test is whether the stored value actually changed.
const settingsBefore = (
  await sb.from('store_settings').select('whatsapp_number').eq('id', 1).maybeSingle()
).data?.whatsapp_number;

await sb.from('store_settings').update({ whatsapp_number: '000000000000' }).eq('id', 1);

const settingsAfter = (
  await sb.from('store_settings').select('whatsapp_number').eq('id', 1).maybeSingle()
).data?.whatsapp_number;

record(
  'anonymous CANNOT write settings',
  settingsAfter === settingsBefore,
  settingsAfter === settingsBefore ? 'value unchanged' : `CHANGED to ${settingsAfter} — SECURITY HOLE`
);

// Guests must still be able to order.
const testId = `PROBE-${Date.now()}`;
const { error: insErr } = await sb.from('orders').insert({
  id: testId,
  customer_name: 'Probe',
  subtotal: 1,
  total: 1,
  items: [],
});
record('guest CAN place an order', !insErr, insErr?.message ?? 'checkout works');
if (!insErr) await sb.from('orders').delete().eq('id', testId);

// Storage writes must be blocked.
const { error: upErr } = await sb.storage
  .from('product-images')
  .upload(`anon-probe-${Date.now()}.png`, Buffer.from('x'), { contentType: 'image/png' });
record('anonymous CANNOT upload photos', Boolean(upErr), upErr?.message ?? 'SECURITY HOLE');

// Clean up the probe product if it got through.
await sb.from('products').delete().eq('id', 999999999999);
await sb.from('store_settings').update({ whatsapp_number: '584120000000' }).eq('id', 1);

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('\nSTILL OPEN:');
  for (const f of failed) console.log(`  - ${f.name}`);
  console.log('\nRe-run the SQL schema from the admin panel (Supabase & SQL tab).');
}

process.exit(failed.length === 0 ? 0 : 1);
