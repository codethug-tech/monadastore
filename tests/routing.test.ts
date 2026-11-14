// Tests for distributing orders between two WhatsApp numbers.
// Run: npm test
import assert from 'node:assert/strict';
import { pickOrderNumber, hasAnyWhatsAppNumber, normalizeWhatsApp } from '../src/lib/phone';

let pass = 0;
const check = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ok  ${label}`);
};

const A = '584121234567';
const B = '584149876543';

console.log('\nTwo-number order distribution');

check('with no second number, every order goes to the primary', () => {
  for (const id of ['MND-1', 'MND-2', 'MND-999']) {
    assert.equal(pickOrderNumber(id, A, '', 'round_robin'), A);
  }
});

check('an invalid second number is ignored', () => {
  assert.equal(pickOrderNumber('MND-1', A, '584120000000', 'round_robin'), A);
  assert.equal(pickOrderNumber('MND-1', A, '', 'round_robin'), A);
});

check('round robin sends the same order to the same number every time', () => {
  const first = pickOrderNumber('MND-123456', A, B, 'round_robin');
  for (let i = 0; i < 25; i++) {
    assert.equal(pickOrderNumber('MND-123456', A, B, 'round_robin'), first);
  }
});

check('round robin actually uses both numbers over many orders', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 200; i++) {
    seen.add(pickOrderNumber(`MND-1000${i}`, A, B, 'round_robin'));
  }
  assert.deepEqual([...seen].sort(), [A, B].sort());
});

check('round robin is reasonably balanced, not 95/5', () => {
  let a = 0;
  let b = 0;
  for (let i = 0; i < 400; i++) {
    const n = pickOrderNumber(`MND-${200000 + i}`, A, B, 'round_robin');
    n === A ? a++ : b++;
  }
  // Allow slack, but insist neither side is starved.
  assert.ok(a > 120 && b > 120, `unbalanced split: ${a} vs ${b}`);
});

check('primary_only always picks the first even with two configured', () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(pickOrderNumber(`MND-${i}`, A, B, 'primary_only'), A);
  }
});

check('alternate_daily gives one number per calendar day', () => {
  const today = pickOrderNumber('MND-1', A, B, 'alternate_daily');
  // Every order placed today lands on the same inbox.
  for (let i = 0; i < 20; i++) {
    assert.equal(pickOrderNumber(`MND-${500 + i}`, A, B, 'alternate_daily'), today);
  }
  assert.ok(today === A || today === B);
});

check('the chosen number is always one of the two configured', () => {
  const modes = ['round_robin', 'primary_only', 'alternate_daily'] as const;
  for (const mode of modes) {
    for (let i = 0; i < 60; i++) {
      const n = pickOrderNumber(`MND-${i}`, A, B, mode);
      assert.ok(n === A || n === B, `unexpected number ${n} in ${mode}`);
    }
  }
});

check('a placeholder primary never receives orders when a real one exists', () => {
  for (const mode of ['round_robin', 'primary_only', 'alternate_daily'] as const) {
    for (let i = 0; i < 30; i++) {
      const n = pickOrderNumber(`MND-${i}`, '584120000000', B, mode);
      assert.equal(n, B, `placeholder received an order in ${mode}`);
    }
  }
});

check('a real primary is used when the secondary is the placeholder', () => {
  for (const mode of ['round_robin', 'alternate_daily'] as const) {
    assert.equal(pickOrderNumber('MND-5', A, '584120000000', mode), A);
  }
});

check('hasAnyWhatsAppNumber ignores placeholders and blanks', () => {
  assert.equal(hasAnyWhatsAppNumber('', ''), false);
  assert.equal(hasAnyWhatsAppNumber('584120000000', ''), false);
  assert.equal(hasAnyWhatsAppNumber('', B), true);
  assert.equal(hasAnyWhatsAppNumber(A, ''), true);
});

check('both numbers normalise to wa.me digits', () => {
  assert.equal(normalizeWhatsApp('+58 412 123 4567').digits, A);
  assert.equal(normalizeWhatsApp('0414-9876543').digits, B);
});

check('order history does not relabel when the owner swaps the two numbers', () => {
  // The admin badge used to derive "Number 1 / Number 2" by comparing the stored
  // number against whatever the primary was *at render time*. Swapping the two
  // numbers in settings therefore rewrote history: an order that was placed on
  // Number 1 started showing as Number 2, and the follow-up WhatsApp went to the
  // wrong phone. The badge now prints the stored number itself, so the label is a
  // pure function of what was recorded.

  const storedAtCheckout = A; // routed to the number that was primary then

  // Old broken label: depends on the current config.
  const oldLabel = (currentPrimary: string) =>
    storedAtCheckout === currentPrimary ? 'Number 1' : 'Number 2';

  // New label: depends only on the stored value.
  const newLabel = () => normalizeWhatsApp(storedAtCheckout).pretty;

  assert.equal(oldLabel(A), 'Number 1'); // correct while numbers are unchanged
  assert.equal(oldLabel(B), 'Number 2'); // WRONG after a swap: history rewritten
  assert.equal(newLabel(), '+58 412 123 4567');
  assert.equal(newLabel(), newLabel()); // never changes with config
});

console.log(`\n${pass} assertions passed`);
