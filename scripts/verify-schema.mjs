#!/usr/bin/env node
/**
 * verify-schema.mjs — static contract check between the SQL schema and the code.
 *
 * There is no Postgres server in this environment, so this parses the schema
 * string out of src/services/supabase.ts and asserts that every column the
 * application reads or writes actually exists, with a compatible type.
 *
 * Catches the class of bug that only shows up on first connect:
 * "column products.colors does not exist".
 *
 *   npm run verify:schema
 */

import { readFileSync } from 'node:fs';

const src = readFileSync('src/services/supabase.ts', 'utf8');

// ---------------------------------------------------------------------------
// extract the schema
// ---------------------------------------------------------------------------

const schemaMatch = src.match(/export const SUPABASE_SQL_SCHEMA = `([\s\S]*?)`;/);
if (!schemaMatch) {
  console.error('✗ Could not find SUPABASE_SQL_SCHEMA in src/services/supabase.ts');
  process.exit(1);
}
const schema = schemaMatch[1];

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------
// parse CREATE TABLE blocks
// ---------------------------------------------------------------------------

const tables = {};
const tableRe = /CREATE TABLE IF NOT EXISTS public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
let m;
while ((m = tableRe.exec(schema)) !== null) {
  const [, tableName, body] = m;
  const cols = {};
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim().replace(/,$/, '');
    if (!line || line.startsWith('--')) continue;
    const col = line.match(/^(\w+)\s+([A-Z][A-Z0-9_]*(\[\])?)/);
    if (col) cols[col[1]] = col[2];
  }
  tables[tableName] = cols;
}

console.log('\n\x1b[1mSchema contract check\x1b[0m\n');

// ---------------------------------------------------------------------------
// 1. tables exist
// ---------------------------------------------------------------------------

for (const t of ['products', 'orders', 'store_settings']) {
  check(`table public.${t} is defined`, Boolean(tables[t]));
}

// ---------------------------------------------------------------------------
// 2. columns the code reads/writes
// ---------------------------------------------------------------------------

const required = {
  products: [
    'id', 'name', 'series', 'price', 'size', 'sizes', 'colors', 'description',
    'image_url', 'gallery', 'categories', 'is_favorite', 'rating',
    'review_count', 'reviews',
  ],
  orders: [
    'id', 'customer_name', 'customer_phone', 'city_address', 'payment_method',
    'courier', 'notes', 'subtotal', 'discount', 'total', 'status', 'items',
    'created_at',
  ],
  store_settings: [
    'id', 'store_name', 'whatsapp_number', 'instagram_url', 'tiktok_url',
    'currency', 'bcv_rate', 'show_bs_rate', 'free_delivery_threshold',
  ],
};

for (const [table, cols] of Object.entries(required)) {
  const defined = tables[table] ?? {};
  const missing = cols.filter(c => !(c in defined));
  check(
    `${table}: all ${cols.length} columns the app uses exist`,
    missing.length === 0,
    missing.length ? `missing: ${missing.join(', ')}` : ''
  );
}

// ---------------------------------------------------------------------------
// 3. type compatibility for the tricky ones
// ---------------------------------------------------------------------------

const typeChecks = [
  ['products', 'id', ['BIGINT'], 'app sends Date.now() integers'],
  ['products', 'colors', ['JSONB'], 'array of {name,hex} objects'],
  ['products', 'reviews', ['JSONB'], 'array of review objects'],
  ['products', 'sizes', ['TEXT[]'], 'string array'],
  ['products', 'gallery', ['TEXT[]'], 'string array'],
  ['products', 'categories', ['TEXT[]'], 'string array'],
  ['products', 'price', ['NUMERIC'], 'decimal price'],
  ['orders', 'items', ['JSONB'], 'array of line items'],
  ['orders', 'total', ['NUMERIC'], 'decimal total'],
  ['store_settings', 'bcv_rate', ['NUMERIC'], 'exchange rate'],
  ['store_settings', 'show_bs_rate', ['BOOLEAN'], 'toggle'],
  ['store_settings', 'free_delivery_threshold', ['NUMERIC'], 'money'],
];

for (const [table, col, allowed, why] of typeChecks) {
  const actual = tables[table]?.[col];
  const ok = actual && allowed.some(a => actual.startsWith(a));
  check(
    `${table}.${col} is ${allowed.join('/')}`,
    Boolean(ok),
    ok ? why : `found ${actual ?? 'nothing'}`
  );
}

// ---------------------------------------------------------------------------
// 4. primary keys
// ---------------------------------------------------------------------------

check(
  'products.id is the primary key (upsert onConflict: id)',
  /id BIGINT PRIMARY KEY/.test(schema)
);
check(
  'orders.id is the primary key',
  /id TEXT PRIMARY KEY/.test(schema)
);
check(
  'store_settings.id is the primary key (single row, id = 1)',
  /id INTEGER PRIMARY KEY/.test(schema)
);

// ---------------------------------------------------------------------------
// 5. storage bucket + policies
// ---------------------------------------------------------------------------

check(
  'product-images bucket is created',
  /'product-images'/.test(schema) && /INSERT INTO storage\.buckets/.test(schema)
);
check('bucket is public (storefront needs unauthenticated reads)', /'product-images',\s*\n?\s*'product-images',\s*\n?\s*true/.test(schema));
check('bucket has a file size limit', /file_size_limit/.test(schema));
check('bucket restricts MIME types', /allowed_mime_types/.test(schema));

for (const policy of [
  'product_images_read',
  'product_images_write',
  'product_images_update',
  'product_images_delete',
]) {
  check(`storage policy ${policy} exists`, schema.includes(policy));
}

// ---------------------------------------------------------------------------
// 6. RLS enabled + policies for every operation the admin performs
// ---------------------------------------------------------------------------

for (const t of ['products', 'orders', 'store_settings']) {
  check(
    `RLS enabled on ${t}`,
    new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`).test(schema)
  );
}

const policyOps = [
  ['products_read', 'products', 'SELECT'],
  ['products_write', 'products', 'ALL'],
  ['orders_insert', 'orders', 'INSERT'],
  ['orders_read', 'orders', 'SELECT'],
  ['orders_update', 'orders', 'UPDATE'],
  ['orders_delete', 'orders', 'DELETE'],
  ['settings_read', 'store_settings', 'SELECT'],
  ['settings_write', 'store_settings', 'ALL'],
];

for (const [name, table, op] of policyOps) {
  const re = new RegExp(`CREATE POLICY "${name}" ON public\\.${table}\\s+FOR ${op}`);
  check(`${name} (${op} on ${table})`, re.test(schema));
}

// The admin status dropdown and delete button depend on these two specifically.
check(
  'orders UPDATE policy present (admin status dropdown)',
  /CREATE POLICY "orders_update" ON public\.orders\s+FOR UPDATE/.test(schema)
);
check(
  'orders DELETE policy present (admin delete button)',
  /CREATE POLICY "orders_delete" ON public\.orders\s+FOR DELETE/.test(schema)
);

// ---------------------------------------------------------------------------
// 6b. Security: admin-only operations must require authentication
// ---------------------------------------------------------------------------

/** Extracts the body of a CREATE POLICY statement so we can inspect its clauses. */
const policyBody = (name) => {
  const re = new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?;`);
  const m = schema.match(re);
  return m ? m[0] : '';
};

const adminOnly = [
  'products_write',
  'orders_read',
  'orders_update',
  'orders_delete',
  'settings_write',
  'product_images_write',
  'product_images_update',
  'product_images_delete',
];

for (const name of adminOnly) {
  const body = policyBody(name);
  check(
    `${name} requires an authenticated user`,
    /TO authenticated/.test(body),
    body ? '' : 'policy not found'
  );
}

// Public reads must stay public, or the storefront breaks.
for (const name of ['products_read', 'settings_read', 'product_images_read']) {
  const body = policyBody(name);
  check(
    `${name} stays public (storefront needs it)`,
    body.length > 0 && !/TO authenticated/.test(body)
  );
}

// Customers must be able to place an order without signing in.
check(
  'orders_insert stays open (guests must be able to order)',
  policyBody('orders_insert').length > 0 && !/TO authenticated/.test(policyBody('orders_insert'))
);

// The old client-side password must not survive anywhere.
check(
  'no hardcoded admin password in the admin panel',
  !readFileSync('src/components/AdminPortal.tsx', 'utf8').includes('monada2026')
);
check(
  'admin panel uses Supabase Auth',
  /signInAdmin|signInWithPassword/.test(readFileSync('src/components/AdminPortal.tsx', 'utf8'))
);

// ---------------------------------------------------------------------------
// 7. idempotency — the schema must be safe to re-run
// ---------------------------------------------------------------------------

const createTables = (schema.match(/CREATE TABLE IF NOT EXISTS/g) || []).length;
const rawCreateTables = (schema.match(/CREATE TABLE(?! IF NOT EXISTS)/g) || []).length;
check(
  'every CREATE TABLE is idempotent (IF NOT EXISTS)',
  rawCreateTables === 0,
  `${createTables} guarded, ${rawCreateTables} unguarded`
);

const dropPolicies = (schema.match(/DROP POLICY IF EXISTS/g) || []).length;
const createPolicies = (schema.match(/CREATE POLICY/g) || []).length;
check(
  'every CREATE POLICY is preceded by DROP POLICY IF EXISTS',
  dropPolicies >= createPolicies,
  `${createPolicies} policies, ${dropPolicies} drops`
);

check(
  'bucket insert uses ON CONFLICT (safe to re-run)',
  /ON CONFLICT \(id\) DO UPDATE/.test(schema)
);

// ---------------------------------------------------------------------------
// 8. no service_role key anywhere in shipped code
// ---------------------------------------------------------------------------

const appFiles = [
  'src/services/supabase.ts',
  'src/App.tsx',
  'src/components/AdminPortal.tsx',
];
let leakedKey = false;
for (const f of appFiles) {
  const text = readFileSync(f, 'utf8');
  if (/service_role|SUPABASE_SERVICE/i.test(text)) leakedKey = true;
}
check('no service_role key referenced in app code', !leakedKey);

// ---------------------------------------------------------------------------
// summary
// ---------------------------------------------------------------------------

const failed = results.filter(r => !r.ok);
console.log('\n' + '─'.repeat(58));
if (failed.length === 0) {
  console.log(`\x1b[32m✓ ${results.length} schema checks passed.\x1b[0m`);
  console.log('  The SQL matches what the app reads and writes.');
} else {
  console.log(`\x1b[31m✗ ${failed.length} of ${results.length} checks failed:\x1b[0m`);
  for (const f of failed) console.log(`   • ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
}
console.log('─'.repeat(58) + '\n');

process.exit(failed.length === 0 ? 0 : 1);
