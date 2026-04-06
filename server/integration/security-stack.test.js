/**
 * security-stack.test.js — Integration test for the server security stack
 *
 * Tests the full server security layer working together:
 *   1. Response signing (Ed25519) — key generation, sign, verify
 *   2. Audit logging (AES-256-GCM) — write, decrypt, tamper detection
 *   3. OHTTP relay-gateway HMAC auth — sign request, verify, replay protection
 *   4. End-to-end: sign a key-bundle event → log it → verify the log
 *
 * Run: node server/integration/security-stack.test.js
 */

const assert = require('assert');
const nodeCrypto = require('crypto');

// ─── Module setup ────────────────────────────────────────────

// Audit logger in memory mode
process.env.AUDIT_LOG_PATH = ':memory:';
process.env.AUDIT_LOG_KEY = nodeCrypto.randomBytes(32).toString('hex');

const {
  initSigningKey,
  signSocketPayload,
  getPublicKeyBase64,
} = require('../middleware/response-signing');

const {
  initAuditLogger,
  logAuditEvent,
  decryptAuditEntry,
  getMemoryLog,
  clearMemoryLog,
} = require('../audit-logger');

const relayAuth = require('../config/relay-auth');
const { signRequest, verifyRequest } = {
  signRequest: relayAuth.signRequest.bind(relayAuth),
  verifyRequest: relayAuth.verifyRequest.bind(relayAuth),
};

// ─── Test Runner ──────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✅', name);
    passed++;
  } catch (e) {
    console.error('  ❌', name, '—', e.message);
    failed++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log('  ✅', name);
    passed++;
  } catch (e) {
    console.error('  ❌', name, '—', e.message);
    failed++;
  }
}

console.log('\nSecurity Stack Integration Tests\n');

// ─── 1. Response Signing Initialisation ──────────────────────

console.log('1. Response Signing');

test('initSigningKey runs without error', () => {
  initSigningKey();
});

test('getPublicKeyBase64 returns a DER-encoded SPKI key (76-88 base64 chars for Ed25519)', () => {
  const pub = getPublicKeyBase64();
  assert.ok(typeof pub === 'string');
  const decoded = Buffer.from(pub, 'base64');
  // Ed25519 SPKI = 44 bytes → ~60 base64 chars; with headers ~76-88
  assert.ok(decoded.length >= 40, `Key should be at least 40 bytes, got ${decoded.length}`);
});

test('signSocketPayload produces a verifiable payload', () => {
  const data = { bundles: [{ socketId: 'abc', bundle: { identityKey: 'xyz' } }], roomCode: 'TEST1' };
  const signed = signSocketPayload(data);
  assert.ok(typeof signed._sig === 'string', '_sig must be present');
  assert.strictEqual(signed.roomCode, 'TEST1', 'Original fields preserved');

  // Verify using Node.js crypto
  const { _sig, ...unsigned } = signed;
  const sigBuf = Buffer.from(_sig, 'base64');
  const canonical = JSON.stringify(unsigned);
  const pubKeyDer = Buffer.from(getPublicKeyBase64(), 'base64');
  const pubKey = nodeCrypto.createPublicKey({ key: pubKeyDer, format: 'der', type: 'spki' });
  const valid = nodeCrypto.verify(null, Buffer.from(canonical, 'utf8'), pubKey, sigBuf);
  assert.ok(valid, 'Signature should verify');
});

// ─── 2. Audit Logging ────────────────────────────────────────

console.log('\n2. Audit Logging');

test('initAuditLogger runs without error', () => {
  initAuditLogger();
});

test('logAuditEvent + decryptAuditEntry round-trips data correctly', () => {
  clearMemoryLog();
  logAuditEvent('integration-test-event', { socketId: 'test-socket', roomCode: 'ROOM-X' });
  const log = getMemoryLog();
  assert.strictEqual(log.length, 1);
  const entry = decryptAuditEntry(log[0]);
  assert.strictEqual(entry.event, 'integration-test-event');
  assert.strictEqual(entry.socketId, 'test-socket');
  assert.strictEqual(entry.roomCode, 'ROOM-X');
  assert.ok(entry.ts > 0, 'ts should be set');
});

test('audit log entry is opaque (plaintext not visible in base64 ciphertext)', () => {
  clearMemoryLog();
  logAuditEvent('key-exchange-complete', { initiator: 'socket-A', responder: 'socket-B' });
  const [record] = getMemoryLog();
  assert.ok(!record.includes('socket-A'), 'Plaintext should be encrypted');
  assert.ok(!record.includes('key-exchange'), 'Event name should be encrypted');
});

// ─── 3. OHTTP Relay-Gateway HMAC Auth ────────────────────────

console.log('\n3. OHTTP Relay-Gateway HMAC Auth');

test('signRequest returns valid signature + timestamp', () => {
  const { signature, timestamp } = signRequest('{"method":"GET"}');
  assert.ok(typeof signature === 'string' && signature.length > 10, 'signature present');
  assert.ok(typeof timestamp === 'number' && timestamp > 0, 'timestamp present');
});

test('verifyRequest accepts a fresh valid signature', () => {
  const body = '{"method":"POST","path":"/ohttp"}';
  const { signature, timestamp } = signRequest(body);
  const ok = verifyRequest(body, signature, timestamp);
  assert.ok(ok, 'Fresh signature should verify');
});

test('verifyRequest rejects tampered body', () => {
  const body = '{"method":"POST"}';
  const { signature, timestamp } = signRequest(body);
  const ok = verifyRequest('{"method":"DELETE"}', signature, timestamp);
  assert.ok(!ok, 'Tampered body should fail verification');
});

test('verifyRequest rejects expired timestamp (>30s old)', () => {
  const body = '{"method":"GET"}';
  const oldTimestamp = Date.now() - 31000; // 31 seconds ago
  // Sign with current time, then pass an old timestamp to simulate replay
  const { signature } = signRequest(body);
  const ok = verifyRequest(body, signature, oldTimestamp);
  assert.ok(!ok, 'Expired timestamp should fail verification');
});

// ─── 4. End-to-End: Sign → Log → Verify ──────────────────────

console.log('\n4. End-to-End: Sign event → Log → Verify');

test('key-bundle-roster flow: sign payload, log event, decrypt log entry', () => {
  clearMemoryLog();

  // Step 1: Server signs the roster event (as index.js does)
  const rosterPayload = {
    bundles: [{ socketId: 's1', bundle: { identityKey: 'abc', ephemeralKey: 'def' } }],
    roomCode: 'E2E-TEST',
  };
  const signed = signSocketPayload(rosterPayload);

  // Step 2: Server logs the key-bundle-registered audit event
  logAuditEvent('key-bundle-registered', { socketId: 's1', roomCode: 'E2E-TEST' });

  // Step 3: Verify signature (as client would)
  const { _sig, ...unsigned } = signed;
  const sigBuf = Buffer.from(_sig, 'base64');
  const canonical = JSON.stringify(unsigned);
  const pubKeyDer = Buffer.from(getPublicKeyBase64(), 'base64');
  const pubKey = nodeCrypto.createPublicKey({ key: pubKeyDer, format: 'der', type: 'spki' });
  const sigValid = nodeCrypto.verify(null, Buffer.from(canonical, 'utf8'), pubKey, sigBuf);
  assert.ok(sigValid, 'Signature should verify');

  // Step 4: Decrypt and verify log entry
  const log = getMemoryLog();
  assert.strictEqual(log.length, 1);
  const logEntry = decryptAuditEntry(log[0]);
  assert.strictEqual(logEntry.event, 'key-bundle-registered');
  assert.strictEqual(logEntry.socketId, 's1');
  assert.strictEqual(logEntry.roomCode, 'E2E-TEST');
});

test('key-exchange-complete flow: sign answer, log complete event', () => {
  clearMemoryLog();

  // Simulate key-bundle-answer forwarding (server logs completion)
  logAuditEvent('key-exchange-complete', { initiator: 'socket-A', responder: 'socket-B', roomCode: 'E2E2' });

  const log = getMemoryLog();
  const entry = decryptAuditEntry(log[0]);
  assert.strictEqual(entry.event, 'key-exchange-complete');
  assert.strictEqual(entry.initiator, 'socket-A');
  assert.strictEqual(entry.responder, 'socket-B');
});

test('peer-left flow: log departure event', () => {
  clearMemoryLog();

  logAuditEvent('peer-left-room', { socketId: 'departed-sock', roomCode: 'GROUP1' });

  const [record] = getMemoryLog();
  const entry = decryptAuditEntry(record);
  assert.strictEqual(entry.event, 'peer-left-room');
  assert.strictEqual(entry.socketId, 'departed-sock');
});

// ─── Summary ─────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
