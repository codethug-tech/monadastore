/**
 * migrate-categories.mjs — retag existing products from legacy collection
 * names to real category slugs.
 *
 *   node scripts/migrate-categories.mjs --dry-run   (preview)
 *   node scripts/migrate-categories.mjs             (apply)
 *
 * Requires an authenticated admin session, because products_write is now
 * restricted to signed-in users. Set MONADA_ADMIN_EMAIL and MONADA_ADMIN_PASSWORD
 * in the environment, or run it from the admin panel instead.
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');

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

// Sign in so the write is allowed by RLS.
const email = process.env.MONADA_ADMIN_EMAIL;
const password = process.env.MONADA_ADMIN_PASSWORD;

if (!email || !password) {
  console.log('No admin credentials supplied.');
  console.log('Set MONADA_ADMIN_EMAIL and MONADA_ADMIN_PASSWORD, or retag products in the admin panel.');
  console.log('\nCurrent state (read-only):\n');
} else {
  const { error: authErr } = await sb.auth.signInWithPassword({ email, password });
  if (authErr) {
    console.error('Sign-in failed:', authErr.message);
    process.exit(1);
  }
  console.log('Signed in as', email, '\n');
}

const { data: products, error } = await sb.from('products').select('id, name, categories');
if (error) {
  console.error('Read failed:', error.message);
  process.exit(1);
}

// Legacy collection name -> the product type it actually represents.
const LEGACY_MAP = {
  'Trending Now': null, // not a product type; drop it
  'Fresh Drops': null,
  'Street Edit': null,
};

// Per-product overrides, matched by name. These reflect what each seed piece is.
const BY_NAME = {
  'Aesthetic Linen Overshirt': ['camisas'],
  'French Terry Relaxed Hoodie': ['pijamas'],
  'Monada Heavyweight Popover': ['camisas'],
  'Pleated Utility Trousers': ['pantalones'],
  'Canvas Field Utility Jacket': ['camisas'],
  'Boxy Heavyweight Studio Tee': ['camisas'],
  oversize: ['pijamas'],
};

const VALID = new Set([
  'camisas', 'pantalones', 'faldas', 'vestidos', 'pantaletas-medias',
  'pijamas', 'pijamas-navidad', 'pijamas-ninos', 'bebes', 'cobijas', 'sabanas',
]);

let changed = 0;

for (const p of products ?? []) {
  const current = p.categories ?? [];
  const kept = current.filter(c => VALID.has(c));
  const legacy = current.filter(c => !VALID.has(c));

  let next = kept;
  if (kept.length === 0) {
    // Nothing valid left: fall back to the per-product mapping, then to pijamas.
    next = BY_NAME[p.name] ?? ['pijamas'];
  }

  const same = next.length === current.length && next.every(c => current.includes(c));
  if (same) {
    console.log(`  = ${p.name}: ${JSON.stringify(current)} (unchanged)`);
    continue;
  }

  console.log(
    `  ${DRY ? '~' : '>'} ${p.name}: ${JSON.stringify(current)} -> ${JSON.stringify(next)}` +
      (legacy.length ? `  (dropped: ${legacy.join(', ')})` : '')
  );

  if (!DRY) {
    const { error: upErr } = await sb.from('products').update({ categories: next }).eq('id', p.id);
    if (upErr) {
      console.error(`    FAILED: ${upErr.message}`);
      continue;
    }
  }
  changed++;
}

console.log(`\n${DRY ? 'Would change' : 'Changed'}: ${changed} product(s)`);
if (DRY) console.log('Run without --dry-run to apply.');
