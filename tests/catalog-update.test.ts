// Adding or editing a piece in the admin form used to build the new catalog from
// the `products` prop, which is only as fresh as the last render. Two changes
// close together started from the same stale snapshot and the first was lost:
// the admin looked like its upload had not been saved.
// Run: npm test
import assert from 'node:assert/strict';
import { resolveProductsUpdate, upsertProduct } from '../src/lib/catalog';
import type { ClothingProduct } from '../src/types';

let pass = 0;
const check = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ok  ${label}`);
};

const make = (id: number, name: string, price = 10): ClothingProduct => ({
  id,
  name,
  series: '',
  price,
  size: '',
  sizes: ['S'],
  colors: [],
  description: '',
  imageUrl: 'https://example.com/a.png',
  gallery: [],
  categories: ['vestidos'],
  isFavorite: false,
  rating: 5,
  reviewCount: 0,
  reviews: [],
});

console.log('\nCatalog updates');

check('adding a piece puts it first', () => {
  const list = upsertProduct([make(1, 'A')], make(2, 'B'));
  assert.deepEqual(list.map(p => p.id), [2, 1]);
});

check('editing replaces in place without reordering', () => {
  const list = upsertProduct([make(1, 'A'), make(2, 'B')], make(2, 'B edited', 99));
  assert.deepEqual(list.map(p => p.id), [1, 2]);
  assert.equal(list[1].name, 'B edited');
  assert.equal(list[1].price, 99);
});

check('editing an unknown id does not duplicate it', () => {
  const list = upsertProduct([make(1, 'A')], make(1, 'A', 50));
  assert.equal(list.length, 1);
  assert.equal(list[0].price, 50);
});

check('the original list is not mutated', () => {
  const original = [make(1, 'A')];
  const snapshot = JSON.parse(JSON.stringify(original));
  upsertProduct(original, make(1, 'A', 77));
  assert.deepEqual(original, snapshot);
});

check('an updater sees the newest list, so two saves both survive', () => {
  // Simulates: state === [1]; two handlers fire before React re-renders.
  let latest = [make(1, 'A')];
  const firstSave = (current: ClothingProduct[]) => upsertProduct(current, make(2, 'B'));
  const secondSave = (current: ClothingProduct[]) => upsertProduct(current, make(3, 'C'));

  // Correct behaviour: each resolves against whatever is latest at the time.
  latest = resolveProductsUpdate(latest, firstSave);
  latest = resolveProductsUpdate(latest, secondSave);
  assert.deepEqual(latest.map(p => p.id).sort(), [1, 2, 3]);
});

check('the old stale-snapshot approach loses an edit (regression)', () => {
  // This is what the code did before: both computed from the SAME captured list.
  const captured = [make(1, 'A')];
  const firstResult = upsertProduct(captured, make(2, 'B'));
  const secondResult = upsertProduct(captured, make(3, 'C')); // stale: no 2
  const finalState = secondResult;
  assert.equal(firstResult.some(p => p.id === 2), true);
  // B is gone because the second save started from the old snapshot.
  assert.equal(finalState.some(p => p.id === 2), false);
});

check('a plain array is still accepted', () => {
  const explicit = [make(9, 'Z')];
  assert.deepEqual(resolveProductsUpdate([make(1, 'A')], explicit), explicit);
});

console.log(`\n${pass} assertions passed`);
