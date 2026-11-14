// The storefront config is merged from the database on every boot and refocus.
// A NULL column arrives as undefined, and spreading it directly wiped good local
// values: a stored second WhatsApp number disappeared from the admin form, which
// made a successful save look like it had never been applied.
// Run: npm test
import assert from 'node:assert/strict';
import { mergeRemoteConfig, DEFAULT_STORE_CONFIG, type StoreConfig } from '../src/config/storeConfig';

let pass = 0;
const check = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ok  ${label}`);
};

const local: StoreConfig = {
  ...DEFAULT_STORE_CONFIG,
  storeName: 'Monada Store',
  whatsappNumber: '584164472327',
  whatsappNumber2: '584122456283',
  orderDistribution: 'round_robin',
  instagramUrl: 'https://instagram.com/monada_store',
  bcvRate: 911.63,
};

console.log('\nRemote config merge');

check('undefined fields never overwrite a stored value', () => {
  const merged = mergeRemoteConfig(local, { storeName: 'Renamed', whatsappNumber2: undefined });
  assert.equal(merged.storeName, 'Renamed');
  assert.equal(merged.whatsappNumber2, '584122456283'); // survived
});

check('a NULL column (undefined here) does not clear the second number', () => {
  const merged = mergeRemoteConfig(local, {
    whatsappNumber2: undefined,
    orderDistribution: undefined,
  });
  assert.equal(merged.whatsappNumber2, '584122456283');
  assert.equal(merged.orderDistribution, 'round_robin');
});

check('real remote values do win', () => {
  const merged = mergeRemoteConfig(local, {
    whatsappNumber: '584120000001',
    whatsappNumber2: '584129999999',
  });
  assert.equal(merged.whatsappNumber, '584120000001');
  assert.equal(merged.whatsappNumber2, '584129999999');
});

check('a false boolean is a real value and is kept', () => {
  const merged = mergeRemoteConfig(local, { showBsRate: false });
  assert.equal(merged.showBsRate, false);
});

check('a zero rate is kept, not treated as absent', () => {
  const merged = mergeRemoteConfig(local, { bcvRate: 0 });
  assert.equal(merged.bcvRate, 0);
});

check('an empty string is a real value and clears the field', () => {
  // Clearing the second number on purpose must work.
  const merged = mergeRemoteConfig(local, { whatsappNumber2: '' });
  assert.equal(merged.whatsappNumber2, '');
});

check('a null patch leaves the config untouched', () => {
  assert.deepEqual(mergeRemoteConfig(local, null), local);
  assert.deepEqual(mergeRemoteConfig(local, undefined), local);
});

check('the input object is not mutated', () => {
  const before = { ...local };
  mergeRemoteConfig(local, { storeName: 'X' });
  assert.deepEqual(local, before);
});

console.log(`\n${pass} assertions passed`);
