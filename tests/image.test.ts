// Tests for image intake validation and filename handling.
// Canvas/bitmap work needs a real browser, so those paths are exercised in the
// browser check; here we cover the pure logic that decides what gets accepted.
import assert from 'node:assert/strict';
import {
  validateImageFile,
  ImageError,
  ACCEPTED_IMAGE_TYPES,
  MAX_SOURCE_BYTES,
} from '../src/lib/image';

const fakeFile = (name: string, type: string, size: number): File =>
  ({ name, type, size } as File);

let pass = 0;
const check = (label: string, fn: () => void) => {
  fn();
  pass++;
  console.log(`  ok  ${label}`);
};

const rejects = (label: string, file: File, expectFragment?: string) => {
  check(label, () => {
    let threw = false;
    try {
      validateImageFile(file);
    } catch (err) {
      threw = true;
      assert.ok(err instanceof ImageError, 'should throw ImageError');
      if (expectFragment) {
        assert.ok(
          err.message.includes(expectFragment),
          `message should mention "${expectFragment}", got: ${err.message}`
        );
      }
    }
    assert.ok(threw, 'expected a rejection but the file was accepted');
  });
};

console.log('\nImage intake validation');

check('accepts every supported type under the size cap', () => {
  for (const type of ACCEPTED_IMAGE_TYPES) {
    validateImageFile(fakeFile(`photo.${type.split('/')[1]}`, type, 1024 * 1024));
  }
});

check('accepts a file exactly at the size limit', () => {
  validateImageFile(fakeFile('edge.jpg', 'image/jpeg', MAX_SOURCE_BYTES));
});

rejects('rejects a non-image file', fakeFile('invoice.pdf', 'application/pdf', 2048), 'not an image');
rejects('rejects a GIF (unsupported)', fakeFile('anim.gif', 'image/gif', 2048), 'not supported');
rejects('rejects an SVG (script vector)', fakeFile('x.svg', 'image/svg+xml', 2048), 'not supported');
rejects('rejects a file over the size limit', fakeFile('huge.jpg', 'image/jpeg', MAX_SOURCE_BYTES + 1), 'limit is 15 MB');
rejects('rejects an empty file', fakeFile('empty.jpg', 'image/jpeg', 0), 'empty');
rejects('rejects a file with no MIME type', fakeFile('mystery', '', 2048), 'not an image');

check('the error message names the offending file', () => {
  try {
    validateImageFile(fakeFile('my-photo.pdf', 'application/pdf', 100));
    assert.fail('should have thrown');
  } catch (err) {
    assert.ok((err as Error).message.includes('my-photo.pdf'));
  }
});

check('size limit is 15 MB and matches the copy shown in the UI', () => {
  assert.equal(MAX_SOURCE_BYTES, 15 * 1024 * 1024);
});

console.log(`\n${pass} assertions passed\n`);
