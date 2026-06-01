/**
 * Key Transparency — RFC 6962 Merkle inclusion proofs.
 *
 * Builds Merkle trees (with the same leaf/node hashing and odd-node promotion
 * the client verifier uses) and confirms valid proofs verify for every leaf
 * across several tree sizes, while wrong roots, tampered siblings, and
 * mismatched indices are rejected.
 *
 * Also covers the cheap input-validation guards on verifyAndPinServerKey.
 * (The full TOFU pin/mismatch flow needs IndexedDB and is exercised in the
 * browser, not here.)
 *
 * RUN: node --test client/test/key-transparency.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KeyTransparencyClient } from '../src/crypto/key-transparency-client.js';

// ─── RFC 6962 reference tree (mirrors the client verifier) ──

async function sha256(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { buf.set(p, off); off += p.length; }
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}

const LEAF = new Uint8Array([0x00]);
const NODE = new Uint8Array([0x01]);

/** Build all tree levels (level 0 = leaf hashes) using RFC 6962 promotion. */
async function buildLevels(entries) {
  let level = [];
  for (const e of entries) level.push(await sha256(LEAF, e));

  const levels = [level];
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      if (i + 1 < level.length) next.push(await sha256(NODE, level[i], level[i + 1]));
      else next.push(level[i]); // odd node promoted unchanged
    }
    levels.push(next);
    level = next;
  }
  return levels;
}

/** Produce the sibling list for `index` in verifier-consumption order. */
function makeProof(levels, index, treeSize) {
  const siblings = [];
  let idx = index;
  let levelSize = treeSize;
  let level = 0;
  while (levelSize > 1) {
    const promoted = idx % 2 === 0 && idx + 1 >= levelSize;
    if (!promoted) {
      const sibIndex = idx % 2 === 0 ? idx + 1 : idx - 1;
      siblings.push(levels[level][sibIndex]);
    }
    idx = Math.floor(idx / 2);
    levelSize = Math.ceil(levelSize / 2);
    level++;
  }
  return siblings;
}

function entriesOf(n) {
  return Array.from({ length: n }, (_, i) => new TextEncoder().encode(`user-${i}:pubkey-${i}`));
}

// ─── Inclusion proof verification ──────────────────────────

for (const size of [1, 2, 4, 5, 7, 8]) {
  test(`KT: every leaf verifies in a tree of size ${size}`, async () => {
    const entries = entriesOf(size);
    const levels = await buildLevels(entries);
    const root = levels[levels.length - 1][0];

    for (let index = 0; index < size; index++) {
      const proof = { index, tree_size: size, siblings: makeProof(levels, index, size) };
      const ok = await KeyTransparencyClient.verifyInclusionProof(index, entries[index], proof, root);
      assert.equal(ok, true, `leaf ${index}/${size} should verify`);
    }
  });
}

test('KT: a wrong root is rejected', async () => {
  const entries = entriesOf(5);
  const levels = await buildLevels(entries);
  const badRoot = new Uint8Array(32); // all zeros
  const proof = { index: 2, tree_size: 5, siblings: makeProof(levels, 2, 5) };

  assert.equal(await KeyTransparencyClient.verifyInclusionProof(2, entries[2], proof, badRoot), false);
});

test('KT: a tampered sibling is rejected', async () => {
  const entries = entriesOf(4);
  const levels = await buildLevels(entries);
  const root = levels[levels.length - 1][0];

  const siblings = makeProof(levels, 1, 4);
  siblings[0] = new Uint8Array(siblings[0]);
  siblings[0][0] ^= 0xff; // corrupt the first sibling
  const proof = { index: 1, tree_size: 4, siblings };

  assert.equal(await KeyTransparencyClient.verifyInclusionProof(1, entries[1], proof, root), false);
});

test('KT: a proof whose index disagrees with the claim is rejected', async () => {
  const entries = entriesOf(4);
  const levels = await buildLevels(entries);
  const root = levels[levels.length - 1][0];
  const proof = { index: 3, tree_size: 4, siblings: makeProof(levels, 3, 4) };

  // Ask to verify index 2 with a proof built for index 3.
  assert.equal(await KeyTransparencyClient.verifyInclusionProof(2, entries[2], proof, root), false);
});

test('KT: an index outside the tree is rejected', async () => {
  const entries = entriesOf(4);
  const levels = await buildLevels(entries);
  const root = levels[levels.length - 1][0];
  const proof = { index: 4, tree_size: 4, siblings: [] };

  assert.equal(await KeyTransparencyClient.verifyInclusionProof(4, entries[0], proof, root), false);
});

// ─── verifyAndPinServerKey input guards ────────────────────

test('KT: verifyAndPinServerKey validates its inputs', async () => {
  await assert.rejects(
    () => KeyTransparencyClient.verifyAndPinServerKey('', 'ab'.repeat(32)),
    /required/,
  );
  await assert.rejects(
    () => KeyTransparencyClient.verifyAndPinServerKey('host.example', 'deadbeef'),
    /Invalid public key length/,
  );
});
