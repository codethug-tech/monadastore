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

const { data: orderData, error: orderErr } = await sb
  .from('orders')
  .select('customer_name, customer_phone')
  .limit(5);
const ordersBlocked = Boolean(orderErr) || (orderData?.length ?? 0) === 0;
record(
  'anonymous CANNOT read customer orders',
  ordersBlocked,
  orderErr?.message ?? (orderData?.length === 0 ? 'no rows returned' : 'SECURITY HOLE')
);

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
