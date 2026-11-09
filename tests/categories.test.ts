// Tests for the category taxonomy.
// Run: npm test
import assert from 'node:assert/strict';
import {
  CATEGORIES,
  CATEGORY_SLUGS,
  CATEGORY_GROUPS,
  categoryLabel,
  isKnownCategory,
  unknownCategories,
} from '../src/config/categories';

let pass = 0;
const check = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ok  ${label}`);
};

console.log('\nCategories');

// The exact set the shop asked for.
const REQUESTED = [
  'Pijamas',
  'Camisas',
  'Pantalones',
  'Faldas',
  'Pijamas de Niños',
  'Pijamas de Navidad',
  'Vestidos',
  'Pantaletas y Medias',
  'Sección de Bebés',
  'Cobijas',
  'Sábanas',
];

check('every requested category exists in Spanish', () => {
  const es = CATEGORIES.map(c => c.es);
  for (const name of REQUESTED) {
    assert.ok(es.includes(name), `missing: ${name}`);
  }
});

check('there are exactly 11 categories', () => {
  assert.equal(CATEGORIES.length, 11);
});

check('no duplicate slugs', () => {
  assert.equal(new Set(CATEGORY_SLUGS).size, CATEGORY_SLUGS.length);
});

check('no duplicate Spanish labels', () => {
  const es = CATEGORIES.map(c => c.es);
  assert.equal(new Set(es).size, es.length);
});

check('no duplicate English labels', () => {
  const en = CATEGORIES.map(c => c.en);
  assert.equal(new Set(en).size, en.length);
});

check('every category has both languages filled in', () => {
  for (const c of CATEGORIES) {
    assert.ok(c.es.trim().length > 0, `${c.slug} missing es`);
    assert.ok(c.en.trim().length > 0, `${c.slug} missing en`);
  }
});

check('slugs are URL-safe (lowercase, no spaces or accents)', () => {
  for (const c of CATEGORIES) {
    assert.match(c.slug, /^[a-z0-9-]+$/, `bad slug: ${c.slug}`);
  }
});

check('every category belongs to a known group', () => {
  const groups = CATEGORY_GROUPS.map(g => g.key);
  for (const c of CATEGORIES) {
    assert.ok(groups.includes(c.group), `${c.slug} has unknown group ${c.group}`);
  }
});

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

check('labels resolve in Spanish', () => {
  assert.equal(categoryLabel('pijamas', 'es'), 'Pijamas');
  assert.equal(categoryLabel('pijamas-navidad', 'es'), 'Pijamas de Navidad');
  assert.equal(categoryLabel('bebes', 'es'), 'Sección de Bebés');
});

check('labels resolve in English', () => {
  assert.equal(categoryLabel('pijamas', 'en'), 'Pajamas');
  assert.equal(categoryLabel('pijamas-navidad', 'en'), 'Christmas Pajamas');
  assert.equal(categoryLabel('bebes', 'en'), 'Baby');
});

check('accented labels survive intact', () => {
  assert.equal(categoryLabel('sabanas', 'es'), 'Sábanas');
  assert.equal(categoryLabel('pijamas-ninos', 'es'), 'Pijamas de Niños');
});

check('an unknown slug falls back to itself instead of vanishing', () => {
  assert.equal(categoryLabel('mystery', 'es'), 'mystery');
});

// ---------------------------------------------------------------------------
// Legacy data handling
// ---------------------------------------------------------------------------

check('legacy collection names are not treated as categories', () => {
  assert.equal(isKnownCategory('Trending Now'), false);
  assert.equal(isKnownCategory('Fresh Drops'), false);
  assert.equal(isKnownCategory('Street Edit'), false);
});

check('real slugs are recognised', () => {
  for (const slug of CATEGORY_SLUGS) {
    assert.equal(isKnownCategory(slug), true);
  }
});

check('unknownCategories surfaces legacy tags for re-tagging', () => {
  assert.deepEqual(
    unknownCategories(['pijamas', 'Trending Now', 'camisas']),
    ['Trending Now']
  );
});

check('unknownCategories handles empty and undefined safely', () => {
  assert.deepEqual(unknownCategories(undefined), []);
  assert.deepEqual(unknownCategories([]), []);
});

check('a fully valid product reports no unknown categories', () => {
  assert.deepEqual(unknownCategories(['pijamas', 'pijamas-navidad']), []);
});

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

check('sleepwear group holds both pyjama categories', () => {
  const sleep = CATEGORIES.filter(c => c.group === 'sleepwear').map(c => c.slug);
  assert.deepEqual(sleep.sort(), ['pijamas', 'pijamas-navidad']);
});

check('kids group holds kids pyjamas and baby', () => {
  const kids = CATEGORIES.filter(c => c.group === 'kids').map(c => c.slug);
  assert.deepEqual(kids.sort(), ['bebes', 'pijamas-ninos']);
});

check('home group holds blankets and sheets', () => {
  const home = CATEGORIES.filter(c => c.group === 'home').map(c => c.slug);
  assert.deepEqual(home.sort(), ['cobijas', 'sabanas']);
});

check('every group has at least one category', () => {
  for (const g of CATEGORY_GROUPS) {
    const count = CATEGORIES.filter(c => c.group === g.key).length;
    assert.ok(count > 0, `group ${g.key} is empty`);
  }
});

console.log(`\n${pass} assertions passed\n`);
