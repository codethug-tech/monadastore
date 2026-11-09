// Tests for checkout completeness rules.
// Run: npm test
import assert from 'node:assert/strict';
import {
  validateCheckout,
  isCheckoutComplete,
  missingFieldCount,
  REQUIRED_FIELD_COUNT,
  type CheckoutValues,
} from '../src/lib/checkout';

let pass = 0;
const check = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ok  ${label}`);
};

const complete = (over: Partial<CheckoutValues> = {}): CheckoutValues => ({
  customerName: 'Ana Pérez',
  customerPhone: '0412 1234567',
  cityAddress: 'Caracas, Chacao, Av. Principal',
  paymentMethod: 'pago_movil',
  courier: 'mrw',
  ...over,
});

console.log('\nCheckout completeness');

check('a fully filled order passes', () => {
  const errors = validateCheckout(complete(), 'es');
  assert.deepEqual(errors, {});
  assert.equal(isCheckoutComplete(errors), true);
});

check('there are 5 required fields', () => {
  assert.equal(REQUIRED_FIELD_COUNT, 5);
});

// ---------------------------------------------------------------------------
// Name
// ---------------------------------------------------------------------------

check('empty name is rejected', () => {
  const e = validateCheckout(complete({ customerName: '' }), 'es');
  assert.ok(e.customerName);
});

check('whitespace-only name is rejected', () => {
  const e = validateCheckout(complete({ customerName: '   ' }), 'es');
  assert.ok(e.customerName);
});

check('a single letter is rejected', () => {
  const e = validateCheckout(complete({ customerName: 'A' }), 'es');
  assert.ok(e.customerName);
});

check('a name with no letters is rejected', () => {
  const e = validateCheckout(complete({ customerName: '12345' }), 'es');
  assert.ok(e.customerName);
});

check('accented names are accepted', () => {
  const e = validateCheckout(complete({ customerName: 'José Muñoz' }), 'es');
  assert.equal(e.customerName, undefined);
});

// ---------------------------------------------------------------------------
// Phone — the shop must be able to call back
// ---------------------------------------------------------------------------

check('empty phone is rejected', () => {
  const e = validateCheckout(complete({ customerPhone: '' }), 'es');
  assert.ok(e.customerPhone);
});

check('a short phone number is rejected', () => {
  const e = validateCheckout(complete({ customerPhone: '0412' }), 'es');
  assert.ok(e.customerPhone);
  assert.match(e.customerPhone!, /4/); // mentions how many digits were given
});

check('formatted 11-digit phone is accepted', () => {
  const e = validateCheckout(complete({ customerPhone: '0412-123 4567' }), 'es');
  assert.equal(e.customerPhone, undefined);
});

check('international phone is accepted', () => {
  const e = validateCheckout(complete({ customerPhone: '+58 412 123 4567' }), 'es');
  assert.equal(e.customerPhone, undefined);
});

check('an absurdly long phone is rejected', () => {
  const e = validateCheckout(complete({ customerPhone: '123456789012345678' }), 'es');
  assert.ok(e.customerPhone);
});

// ---------------------------------------------------------------------------
// Address — a courier needs more than a city
// ---------------------------------------------------------------------------

check('empty address is rejected', () => {
  const e = validateCheckout(complete({ cityAddress: '' }), 'es');
  assert.ok(e.cityAddress);
});

check('a bare city name is rejected as too short', () => {
  const e = validateCheckout(complete({ cityAddress: 'Caracas' }), 'es');
  assert.ok(e.cityAddress);
});

check('a full address is accepted', () => {
  const e = validateCheckout(complete({ cityAddress: 'Caracas, Chacao' }), 'es');
  assert.equal(e.cityAddress, undefined);
});

// ---------------------------------------------------------------------------
// Payment and courier
// ---------------------------------------------------------------------------

check('missing payment method is rejected', () => {
  const e = validateCheckout(complete({ paymentMethod: '' }), 'es');
  assert.ok(e.paymentMethod);
});

check('missing courier is rejected', () => {
  const e = validateCheckout(complete({ courier: '' }), 'es');
  assert.ok(e.courier);
});

// ---------------------------------------------------------------------------
// Multiple failures and language
// ---------------------------------------------------------------------------

check('an empty form reports all 5 fields', () => {
  const e = validateCheckout(
    { customerName: '', customerPhone: '', cityAddress: '', paymentMethod: '', courier: '' },
    'es'
  );
  assert.equal(missingFieldCount(e), 5);
  assert.equal(isCheckoutComplete(e), false);
});

check('errors are in Spanish for es', () => {
  const e = validateCheckout(complete({ customerName: '' }), 'es');
  assert.match(e.customerName!, /nombre/i);
});

check('errors are in English for en', () => {
  const e = validateCheckout(complete({ customerName: '' }), 'en');
  assert.match(e.customerName!, /name/i);
});

check('a partial order reports only what is missing', () => {
  const e = validateCheckout(complete({ customerPhone: '', cityAddress: '' }), 'es');
  assert.equal(missingFieldCount(e), 2);
  assert.ok(e.customerPhone);
  assert.ok(e.cityAddress);
  assert.equal(e.customerName, undefined);
});

console.log(`\n${pass} assertions passed\n`);
