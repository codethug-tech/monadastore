#!/usr/bin/env node
/**
 * verify-supabase.mjs — proves a Supabase project is wired correctly.
 *
 * Run AFTER pasting the SQL schema into the Supabase SQL Editor:
 *   npm run verify:supabase
 *
 * It reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env, then does real
 * round-trips against every table and the storage bucket. Nothing is left
 * behind: every test row and object is deleted before the script exits.
 *
 * Exit code 0 = everything works. 1 = something is broken (see the report).
 */

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// env loading (no dotenv dependency)
// ---------------------------------------------------------------------------

function loadEnv() {
  const path = '.env';
  if (!existsSync(path)) {
    return { error: 'No .env file found. Copy .env.example to .env and fill it in.' };
  }
  const text = readFileSync(path, 'utf8');
  const env = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return { env };
}

const { env, error: envError } = loadEnv();
if (envError) {
  console.error(`\n  ✗ ${envError}\n`);
  process.exit(1);
}

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('\n  ✗ .env is missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.\n');
  process.exit(1);
}
if (url.includes('your-project') || key.includes('your-anon-key')) {
  console.error('\n  ✗ .env still holds the placeholder values. Paste your real project URL and anon key.\n');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// The catalog is world-readable, so an anonymous client is enough for the
// read-side checks. Writes require a signed-in admin, which is why this script
// also needs credentials: set VERIFY_ADMIN_EMAIL / VERIFY_ADMIN_PASSWORD in
// .env (or the environment) to the Supabase Auth user you use for the admin
// panel. Without them the write checks are skipped, not failed, so you still
// get a useful read-only report.
const adminEmail = env.VERIFY_ADMIN_EMAIL || process.env.VERIFY_ADMIN_EMAIL || '';
const adminPassword = env.VERIFY_ADMIN_PASSWORD || process.env.VERIFY_ADMIN_PASSWORD || '';

let adminClient = null;
let adminSignedIn = false;

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  const mark = ok ? '✓' : '✗';
  const color = ok ? '\x1b[32m' : '\x1b[31m';
  console.log(`  ${color}${mark}\x1b[0m ${name}${detail ? ` — ${detail}` : ''}`);
};

const warn = (name, detail) => {
  results.push({ name, ok: true, warn: true, detail });
  console.log(`  \x1b[33m!\x1b[0m ${name} — ${detail}`);
};

const section = title => console.log(`\n\x1b[1m${title}\x1b[0m`);

// Skipped checks are neither passes nor failures: something could not be
// tested (usually missing admin credentials), so they are reported separately
// and never affect the exit code.
const skip = (name, why) => {
  results.push({ name, ok: true, skipped: true, detail: why });
  console.log(`  \x1b[90m-\x1b[0m ${name} — skipped: ${why}`);
};

// ---------------------------------------------------------------------------
// tests
// ---------------------------------------------------------------------------

const TEST_PRODUCT_ID = 900000000001;
const TEST_ORDER_ID = 'VERIFY-TEST-ORDER';
const TEST_IMAGE_PATH = `verify-${Date.now()}.png`;

// 1x1 transparent PNG
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

async function signInAdmin() {
  section('Admin authentication');

  if (!adminEmail || !adminPassword) {
    skip(
      'Sign in as admin',
      'set VERIFY_ADMIN_EMAIL and VERIFY_ADMIN_PASSWORD in .env to test the write paths'
    );
    return false;
  }

  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await adminClient.auth.signInWithPassword({
    email: adminEmail,
    password: adminPassword,
  });

  if (error) {
    record('Sign in as admin', false, error.message);
    return false;
  }

  adminSignedIn = Boolean(data?.session);
  record('Sign in as admin', adminSignedIn, adminEmail);
  return adminSignedIn;
}

// Writes go through the admin client when we have one, otherwise the anon
// client. The latter is expected to fail once RLS is locked down, so callers
// decide whether a failure is a bug or a correctly-enforced policy.
const writer = () => adminClient ?? supabase;

async function testConnection() {
  section('Connection');
  const { error } = await supabase.from('products').select('id', { head: true, count: 'exact' });
  if (error) {
    record('Reach Supabase', false, error.message);
    return false;
  }
  record('Reach Supabase', true, new URL(url).host);
  return true;
}

async function testTables() {
  section('Tables');

  const { error: pErr } = await supabase.from('products').select('id').limit(1);
  record('products table', !pErr, pErr?.message ?? '');

  const { error: oErr } = await supabase.from('orders').select('id').limit(1);
  record('orders table', !oErr, oErr?.message ?? '');

  const { error: sErr } = await supabase.from('store_settings').select('id').limit(1);
  record('store_settings table', !sErr, sErr?.message ?? '');

  return !pErr && !oErr && !sErr;
}

async function testProductRoundTrip() {
  section('Products (write → read → update → delete)');

  const row = {
    id: TEST_PRODUCT_ID,
    name: 'VERIFY TEST PRODUCT',
    series: 'verification',
    price: 12.34,
    size: 'M',
    sizes: ['S', 'M', 'L'],
    colors: [{ name: 'Sage', hex: '#8F9E8B' }],
    description: 'temporary row created by verify-supabase.mjs',
    image_url: 'https://example.com/test.png',
    gallery: ['https://example.com/test.png'],
    categories: ['Trending Now'],
    is_favorite: false,
    rating: 5.0,
    review_count: 0,
    reviews: [],
  };

  // Clean up any row left by an interrupted earlier run, then insert fresh.
  await writer().from('products').delete().eq('id', TEST_PRODUCT_ID);

  const { error: insErr } = await writer().from('products').insert(row);
  if (insErr) {
    record('Insert product', false, insErr.message);
    return false;
  }
  record('Insert product', true);

  const { data: read, error: readErr } = await writer()
    .from('products')
    .select('*')
    .eq('id', TEST_PRODUCT_ID)
    .maybeSingle();

  if (readErr || !read) {
    record('Read product back', false, readErr?.message ?? 'row not found');
  } else {
    const fieldsOk =
      read.name === row.name &&
      Number(read.price) === row.price &&
      Array.isArray(read.sizes) &&
      read.sizes.length === 3 &&
      Array.isArray(read.colors) &&
      read.colors[0]?.name === 'Sage';
    record('Read product back', fieldsOk, fieldsOk ? 'all fields intact' : 'field mismatch');
  }

  const { error: updErr } = await writer()
    .from('products')
    .update({ price: 99.99 })
    .eq('id', TEST_PRODUCT_ID);
  record('Update product', !updErr, updErr?.message ?? '');

  const { error: delErr } = await writer()
    .from('products')
    .delete()
    .eq('id', TEST_PRODUCT_ID);
  record('Delete product', !delErr, delErr?.message ?? '');

  return true;
}

async function testOrderRoundTrip() {
  section('Orders (insert → read → status update → delete)');

  const order = {
    id: TEST_ORDER_ID,
    customer_name: 'Verification Test',
    customer_phone: '584000000000',
    city_address: 'Test City',
    payment_method: 'pago_movil',
    courier: 'mrw',
    notes: 'temporary row from verify-supabase.mjs',
    subtotal: 100,
    discount: 10,
    total: 90,
    status: 'pending_whatsapp',
    items: [
      { productId: 1, name: 'Test Item', size: 'M', color: 'Sage', quantity: 2, price: 50 },
    ],
  };

  // Clean up any row left by an interrupted earlier run, then insert fresh.
  // (Anon cannot see or delete orders, so this needs the admin client.)
  await writer().from('orders').delete().eq('id', TEST_ORDER_ID);

  const { error: insErr } = await writer().from('orders').insert(order);
  if (insErr) {
    record('Insert order', false, insErr.message);
    return false;
  }
  record('Insert order', true);

  const { data: read, error: readErr } = await writer()
    .from('orders')
    .select('*')
    .eq('id', TEST_ORDER_ID)
    .maybeSingle();

  if (readErr || !read) {
    record('Read order back', false, readErr?.message ?? 'row not found');
  } else {
    const ok =
      read.customer_name === order.customer_name &&
      Number(read.total) === 90 &&
      Array.isArray(read.items) &&
      read.items.length === 1 &&
      read.items[0].size === 'M';
    record('Read order back', ok, ok ? 'items JSONB intact' : 'field mismatch');
  }

  // The admin status dropdown needs UPDATE permission.
  const { error: updErr } = await writer()
    .from('orders')
    .update({ status: 'confirmed' })
    .eq('id', TEST_ORDER_ID);
  record('Update order status', !updErr, updErr?.message ?? 'admin dropdown will work');

  // The admin delete button needs DELETE permission.
  const { error: delErr } = await writer().from('orders').delete().eq('id', TEST_ORDER_ID);
  record('Delete order', !delErr, delErr?.message ?? 'admin delete will work');

  return true;
}

async function testSettings() {
  section('Store settings');

  const { data: existing, error: readErr } = await supabase
    .from('store_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (readErr) {
    record('Read store_settings', false, readErr.message);
    return false;
  }
  record('Read store_settings', true, existing ? 'row exists' : 'no row yet (will be created)');

  const payload = {
    id: 1,
    store_name: existing?.store_name ?? 'Monada Store',
    whatsapp_number: existing?.whatsapp_number ?? '584120000000',
    instagram_url: existing?.instagram_url ?? 'https://instagram.com/monadastore',
    tiktok_url: existing?.tiktok_url ?? 'https://tiktok.com/@monadastore',
    currency: existing?.currency ?? 'USD',
    bcv_rate: existing?.bcv_rate ?? 72.5,
    show_bs_rate: existing?.show_bs_rate ?? true,
    free_delivery_threshold: existing?.free_delivery_threshold ?? 100,
  };

  const { error: upsertErr } = await writer()
    .from('store_settings')
    .upsert(payload, { onConflict: 'id' });
  record('Upsert store_settings', !upsertErr, upsertErr?.message ?? '');

  // Confirm the columns the UI depends on actually round-trip.
  const { data: after } = await supabase
    .from('store_settings')
    .select('bcv_rate, show_bs_rate, free_delivery_threshold')
    .eq('id', 1)
    .maybeSingle();

  const colsOk =
    after != null &&
    after.bcv_rate != null &&
    after.show_bs_rate != null &&
    after.free_delivery_threshold != null;
  record(
    'Pricing columns (bcv_rate, show_bs_rate, free_delivery_threshold)',
    colsOk,
    colsOk ? 'present' : 'missing — re-run the SQL schema'
  );

  return true;
}

async function testStorage() {
  section('Storage (product-images bucket)');

  const { error: upErr } = await writer().storage
    .from('product-images')
    .upload(TEST_IMAGE_PATH, TINY_PNG, { contentType: 'image/png', upsert: true });

  if (upErr) {
    record('Upload image', false, upErr.message);
    if (/bucket/i.test(upErr.message)) {
      console.log('     → The bucket is missing. Re-run the SQL schema (section 4).');
    }
    return false;
  }
  record('Upload image', true);

  const { data: pub } = supabase.storage.from('product-images').getPublicUrl(TEST_IMAGE_PATH);
  const publicUrl = pub?.publicUrl;

  if (!publicUrl) {
    record('Get public URL', false, 'no URL returned');
  } else {
    record('Get public URL', true, publicUrl.split('/').slice(-1)[0]);
    // A public bucket must serve the file over plain HTTP with no auth.
    try {
      const res = await fetch(publicUrl);
      record('Public URL is readable', res.ok, `HTTP ${res.status}`);
    } catch (err) {
      record('Public URL is readable', false, err.message);
    }
  }

  const { error: delErr } = await writer().storage
    .from('product-images')
    .remove([TEST_IMAGE_PATH]);
  record('Delete image', !delErr, delErr?.message ?? '');

  return true;
}

async function checkRlsExposure() {
  section('Security posture (anonymous client, no login)');

  // --- Can a stranger write to the catalog? ---
  const { error: writeErr } = await supabase.from('products').insert({
    id: TEST_PRODUCT_ID + 1,
    name: 'RLS PROBE',
    price: 1,
    image_url: 'https://example.com/x.png',
  });

  if (!writeErr) {
    await writer().from('products').delete().eq('id', TEST_PRODUCT_ID + 1);
    record(
      'Anonymous write to products is BLOCKED',
      false,
      'a stranger can edit your catalog with the public anon key'
    );
  } else {
    record('Anonymous write to products is BLOCKED', true, 'RLS is enforced');
  }

  // --- Can a stranger read customer orders? ---
  //
  // Reading with an empty table proves nothing: PostgREST answers 200 with an
  // empty array whether the policy hides the rows or there simply are none.
  // So plant a row as the admin, then try to read it back as a stranger. If
  // the stranger sees it, customer names, phones and addresses are exposed.
  const probeId = 'RLS-PROBE-' + Date.now();
  let probePlanted = false;

  if (adminSignedIn) {
    const { error: plantErr } = await writer().from('orders').insert({
      id: probeId,
      customer_name: 'ZZ_RLS_PROBE',
      customer_phone: '0000000000',
      city_address: 'probe',
      payment_method: 'pago_movil',
      subtotal: 1,
      total: 1,
      status: 'pending_whatsapp',
      items: [],
    });
    probePlanted = !plantErr;
    if (plantErr) {
      skip('Anonymous read of orders', `could not plant probe row: ${plantErr.message}`);
    }
  } else {
    skip('Anonymous read of orders', 'needs admin credentials to plant a probe row');
  }

  if (probePlanted) {
    const { data: leaked, error: readErr } = await supabase
      .from('orders')
      .select('customer_name, customer_phone')
      .eq('id', probeId);

    const exposed = !readErr && Array.isArray(leaked) && leaked.length > 0;

    if (exposed) {
      record(
        'Anonymous read of orders is BLOCKED',
        false,
        'customer names and phone numbers are readable with the public anon key'
      );
    } else {
      record('Anonymous read of orders is BLOCKED', true, 'probe row stayed hidden');
    }

    // Always clean up, even when the probe leaked.
    await writer().from('orders').delete().eq('id', probeId);
  }

  // --- Guest checkout must still work ---
  const guestOrderId = 'RLS-GUEST-' + Date.now();
  const { error: guestErr } = await supabase.from('orders').insert({
    id: guestOrderId,
    customer_name: 'ZZ_GUEST_PROBE',
    customer_phone: '0000000000',
    city_address: 'probe',
    payment_method: 'pago_movil',
    subtotal: 1,
    total: 1,
    status: 'pending_whatsapp',
    items: [],
  });
  record(
    'Guest checkout still works',
    !guestErr,
    guestErr ? guestErr.message : 'anonymous visitors can place an order'
  );
  if (!guestErr) {
    // The guest cannot delete it (correctly), so remove it as the admin.
    const { error: cleanupErr } = await writer().from('orders').delete().eq('id', guestOrderId);
    if (cleanupErr) {
      console.log(`     → Could not delete probe order ${guestOrderId}: ${cleanupErr.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

console.log('\n\x1b[1mMonada Store — Supabase verification\x1b[0m');
console.log(`  project: ${url}`);

const connected = await testConnection();
if (!connected) {
  console.log('\n\x1b[31mCannot reach the project. Check the URL and anon key in .env.\x1b[0m\n');
  process.exit(1);
}

const tablesOk = await testTables();
if (!tablesOk) {
  console.log(
    '\n\x1b[31mTables are missing. Paste the full SQL schema from the admin panel' +
      ' (Supabase & SQL tab) into the Supabase SQL Editor and run it.\x1b[0m\n'
  );
  process.exit(1);
}

await signInAdmin();
await testProductRoundTrip();
await testOrderRoundTrip();
await testSettings();
await testStorage();
await checkRlsExposure();

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

const failed = results.filter(r => !r.ok);
const skipped = results.filter(r => r.skipped);
const passed = results.filter(r => r.ok && !r.skipped);

console.log('\n' + '─'.repeat(58));
if (failed.length === 0) {
  console.log(`\x1b[32m✓ ${passed.length} checks passed\x1b[0m${skipped.length ? `, ${skipped.length} skipped` : ''}.`);
  console.log('  Your backend is ready. Open the admin panel and hit "Test Connection".');
} else {
  console.log(`\x1b[31m✗ ${failed.length} of ${results.length} checks failed:\x1b[0m`);
  for (const f of failed) console.log(`   • ${f.name}: ${f.detail}`);
}
if (skipped.length > 0) {
  console.log(`\n\x1b[33m${skipped.length} check(s) skipped:\x1b[0m`);
  for (const s of skipped) console.log(`   • ${s.name}: ${s.detail}`);
}
console.log('─'.repeat(58) + '\n');

process.exit(failed.length === 0 ? 0 : 1);
