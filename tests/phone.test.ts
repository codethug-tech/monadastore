// Tests for WhatsApp number normalisation and the checkout redirect guard.
// Run: npm test
import assert from 'node:assert/strict';
import {
  normalizeWhatsApp,
  formatPretty,
  isWhatsAppConfigured,
  buildWaLink,
  PLACEHOLDER_WHATSAPP,
} from '../src/lib/phone';

let pass = 0;
const check = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ok  ${label}`);
};

console.log('\nWhatsApp number handling');

// ---------------------------------------------------------------------------
// The formats a Venezuelan shop owner actually types
// ---------------------------------------------------------------------------

const toDigits = (raw: string) => normalizeWhatsApp(raw).digits;

check('international with plus and spaces', () => {
  assert.equal(toDigits('+58 412 123 4567'), '584121234567');
});

check('international with dashes', () => {
  assert.equal(toDigits('+58-412-123-4567'), '584121234567');
});

check('international without plus', () => {
  assert.equal(toDigits('584121234567'), '584121234567');
});

check('local trunk format 0412-1234567', () => {
  assert.equal(toDigits('0412-1234567'), '584121234567');
});

check('local trunk with spaces 0412 123 4567', () => {
  assert.equal(toDigits('0412 123 4567'), '584121234567');
});

check('bare mobile 4121234567', () => {
  assert.equal(toDigits('4121234567'), '584121234567');
});

check('bare landline 2121234567', () => {
  assert.equal(toDigits('2121234567'), '582121234567');
});

check('00 international prefix is dropped', () => {
  assert.equal(toDigits('00584121234567'), '584121234567');
});

check('parentheses and dots are stripped', () => {
  assert.equal(toDigits('(+58) 412.123.4567'), '584121234567');
});

// ---------------------------------------------------------------------------
// Validity
// ---------------------------------------------------------------------------

check('a real number is valid', () => {
  const r = normalizeWhatsApp('+58 412 123 4567');
  assert.equal(r.valid, true);
  assert.equal(r.isPlaceholder, false);
  assert.equal(r.error, undefined);
});

check('the shipped placeholder is rejected', () => {
  const r = normalizeWhatsApp(PLACEHOLDER_WHATSAPP);
  assert.equal(r.valid, false);
  assert.equal(r.isPlaceholder, true);
  assert.match(r.error ?? '', /placeholder/i);
});

check('the placeholder is rejected in any formatting', () => {
  for (const form of ['584120000000', '+58 412 000 0000', '0412-0000000', '4120000000']) {
    assert.equal(normalizeWhatsApp(form).isPlaceholder, true, `missed: ${form}`);
  }
});

check('empty input is invalid with a clear message', () => {
  const r = normalizeWhatsApp('');
  assert.equal(r.valid, false);
  assert.match(r.error ?? '', /Enter/i);
});

check('too-short numbers are rejected', () => {
  const r = normalizeWhatsApp('12345');
  assert.equal(r.valid, false);
  assert.match(r.error ?? '', /8 to 15/);
});

check('too-long numbers are rejected', () => {
  const r = normalizeWhatsApp('1234567890123456');
  assert.equal(r.valid, false);
});

check('non-numeric input is rejected, not silently accepted', () => {
  assert.equal(normalizeWhatsApp('not a number').valid, false);
});

// ---------------------------------------------------------------------------
// Display formatting
// ---------------------------------------------------------------------------

check('Venezuelan numbers display in readable groups', () => {
  assert.equal(formatPretty('584121234567'), '+58 412 123 4567');
});

check('non-Venezuelan numbers keep their country code', () => {
  assert.equal(formatPretty('14155552671'), '+14155552671');
});

// ---------------------------------------------------------------------------
// The guard the checkout relies on
// ---------------------------------------------------------------------------

check('isWhatsAppConfigured is false for the placeholder', () => {
  assert.equal(isWhatsAppConfigured(PLACEHOLDER_WHATSAPP), false);
});

check('isWhatsAppConfigured is true for a real number', () => {
  assert.equal(isWhatsAppConfigured('+58 412 123 4567'), true);
});

check('buildWaLink returns null for the placeholder (checkout must not fire)', () => {
  assert.equal(buildWaLink(PLACEHOLDER_WHATSAPP, 'hello'), null);
});

check('buildWaLink returns null for empty input', () => {
  assert.equal(buildWaLink('', 'hello'), null);
});

check('buildWaLink points at the normalised number', () => {
  const url = buildWaLink('+58 412 123 4567', 'Hola');
  assert.ok(url);
  assert.ok(url!.startsWith('https://wa.me/584121234567?text='), url!);
});

check('buildWaLink percent-encodes the message', () => {
  const url = buildWaLink('584121234567', 'Hola mundo & más');
  assert.ok(url!.includes('%20'), 'space encoded');
  assert.ok(url!.includes('%26'), 'ampersand encoded');
  assert.ok(url!.includes('%C3%A1'), 'accent encoded');
});

check('a customer order can never be sent to the placeholder', () => {
  // This is the whole point: the guard must hold for every placeholder form.
  for (const form of ['584120000000', '+58 412 000 0000', '0412-0000000']) {
    assert.equal(buildWaLink(form, 'order'), null, `leaked through: ${form}`);
  }
});

console.log(`\n${pass} assertions passed\n`);
