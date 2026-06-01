/**
 * Traffic padding (crypto/traffic-padding.js).
 *
 * Confirms pad → unpad round-trips across bucket sizes, that different small
 * messages pad to an identical size (size-indistinguishable to an observer),
 * that oversized messages round up and still round-trip, and that chaff /
 * malformed frames are dropped by unpadMessage.
 *
 * RUN: node --test client/test/traffic-padding.test.js
 */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';

import { padMessage, unpadMessage, setPrivacyLevel } from '../src/crypto/traffic-padding.js';

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);

before(() => setPrivacyLevel('high')); // deterministic buckets: [1024,1536,4096,16384,65536]

test('Traffic padding: pad → unpad round-trips for various sizes', () => {
  for (const text of ['', 'hi', 'a normal message', 'x'.repeat(2000)]) {
    const out = unpadMessage(padMessage(enc(text)));
    assert.equal(dec(out), text, `round-trip failed for length ${text.length}`);
  }
});

test('Traffic padding: different small messages pad to the same size', () => {
  const a = padMessage(enc('short'));
  const b = padMessage(enc('a different short msg'));
  assert.equal(a.length, b.length, 'small messages must be size-indistinguishable');
  assert.equal(a.length, 1024, 'smallest high-tier bucket is 1024');
});

test('Traffic padding: a message larger than the biggest bucket rounds up and round-trips', () => {
  const big = 'z'.repeat(70_000); // > 65536
  const padded = padMessage(enc(big));
  assert.equal(padded.length % 65536, 0, 'oversized payloads round up to a bucket multiple');
  assert.equal(dec(unpadMessage(padded)), big);
});

test('Traffic padding: chaff frames are dropped', () => {
  const chaff = new Uint8Array(1024);
  crypto.getRandomValues(chaff);
  chaff[0] = 0x01; // FLAG_CHAFF
  assert.equal(unpadMessage(chaff), null);
});

test('Traffic padding: malformed (too-short) frames are dropped', () => {
  assert.equal(unpadMessage(new Uint8Array([0, 0, 0])), null);
});
