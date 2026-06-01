/**
 * Secure memory zeroing (crypto/secure-zero.js).
 *
 * secureZero wipes key material. The Rust/WASM volatile-write path is only
 * available in the browser bundle; under Node the belt-and-suspenders JS
 * fill(0) path runs. Either way the buffer must end up zeroed, and the call
 * must be safe on empty / non-Uint8Array inputs.
 *
 * RUN: node --test client/test/secure-zero.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { secureZero } from '../src/crypto/secure-zero.js';

test('secureZero wipes a populated buffer to all zeros', () => {
  const buf = crypto.getRandomValues(new Uint8Array(64));
  assert.ok(buf.some((b) => b !== 0), 'precondition: buffer has non-zero bytes');

  secureZero(buf);
  assert.ok(buf.every((b) => b === 0), 'every byte must be zeroed');
});

test('secureZero zeroes a small known buffer', () => {
  const buf = new Uint8Array([1, 2, 3, 255]);
  secureZero(buf);
  assert.deepEqual([...buf], [0, 0, 0, 0]);
});

test('secureZero is safe on empty and non-Uint8Array inputs', () => {
  assert.doesNotThrow(() => secureZero(new Uint8Array(0)));
  assert.doesNotThrow(() => secureZero(null));
  assert.doesNotThrow(() => secureZero(undefined));
});
