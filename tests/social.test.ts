// Tests for social profile URL normalisation (Instagram / TikTok).
// Run: npm test
import assert from 'node:assert/strict';
import { normalizeSocial, isUsableSocialUrl } from '../src/lib/social';

let pass = 0;
const check = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ok  ${label}`);
};

console.log('\nSocial profile links');

check('a bare handle becomes a full Instagram URL', () => {
  assert.equal(normalizeSocial('monadastore', 'instagram').url, 'https://instagram.com/monadastore');
});

check('a leading @ is dropped', () => {
  assert.equal(normalizeSocial('@monadastore', 'instagram').url, 'https://instagram.com/monadastore');
});

check('a full pasted URL is kept canonical', () => {
  assert.equal(
    normalizeSocial('https://instagram.com/monadastore', 'instagram').url,
    'https://instagram.com/monadastore'
  );
});

check('www and missing scheme are handled', () => {
  assert.equal(
    normalizeSocial('www.instagram.com/monadastore', 'instagram').url,
    'https://instagram.com/monadastore'
  );
  assert.equal(
    normalizeSocial('instagram.com/monadastore', 'instagram').url,
    'https://instagram.com/monadastore'
  );
});

check('a trailing slash is removed', () => {
  assert.equal(
    normalizeSocial('https://instagram.com/monadastore/', 'instagram').url,
    'https://instagram.com/monadastore'
  );
});

check('query strings and fragments are stripped', () => {
  assert.equal(
    normalizeSocial('https://instagram.com/monadastore?igsh=abc', 'instagram').url,
    'https://instagram.com/monadastore'
  );
  assert.equal(
    normalizeSocial('https://instagram.com/monadastore#top', 'instagram').url,
    'https://instagram.com/monadastore'
  );
});

check('TikTok uses the tiktok.com host', () => {
  assert.equal(normalizeSocial('@monadastore', 'tiktok').url, 'https://tiktok.com/monadastore');
});

check('an empty value is allowed and hides the icon', () => {
  for (const blank of ['', '   ']) {
    const r = normalizeSocial(blank, 'instagram');
    assert.equal(r.valid, true);
    assert.equal(r.url, '');
  }
});

check('handles with dots and underscores survive', () => {
  assert.equal(
    normalizeSocial('monada.store_v2', 'instagram').url,
    'https://instagram.com/monada.store_v2'
  );
});

check('characters that cannot be a handle are rejected', () => {
  const bad = normalizeSocial('monada store!', 'instagram');
  assert.equal(bad.valid, false);
  assert.ok(bad.error, 'expected a message explaining the problem');
  assert.equal(bad.url, '');
});

check('a pasted link to another site is rejected, not silently kept', () => {
  const r = normalizeSocial('https://evil.example.com/monadastore', 'instagram');
  assert.equal(r.valid, false);
});

check('isUsableSocialUrl accepts real profile links', () => {
  assert.equal(isUsableSocialUrl('https://instagram.com/monadastore'), true);
  assert.equal(isUsableSocialUrl('https://tiktok.com/@monadastore'), true);
  assert.equal(isUsableSocialUrl('https://www.instagram.com/monadastore'), true);
});

check('a stored URL containing a space is rejected (paste accident)', () => {
  // This exact value reached the live database and would have rendered a
  // broken link on the storefront.
  assert.equal(isUsableSocialUrl('https://instagram.com/monada_store 1'), false);
  assert.equal(isUsableSocialUrl('https://instagram.com/mon ada'), false);
});

check('a post URL is rejected: the icon must point at the profile', () => {
  // "/p/abc123" is a post. Linking the storefront icon there would take
  // customers to one photo instead of the shop's profile.
  assert.equal(isUsableSocialUrl('https://instagram.com/p/abc123'), false);
  // Anything past the handle is not a canonical profile URL either.
  assert.equal(isUsableSocialUrl('https://instagram.com/monada_store/extra'), false);
});

check('isUsableSocialUrl rejects empty, junk and other hosts', () => {
  assert.equal(isUsableSocialUrl(''), false);
  assert.equal(isUsableSocialUrl(undefined), false);
  assert.equal(isUsableSocialUrl('not a url'), false);
  assert.equal(isUsableSocialUrl('https://evil.example.com/x'), false);
  assert.equal(isUsableSocialUrl('https://instagram.com'), false);
});

console.log(`\n${pass} assertions passed`);
