/**
 * audit-logger.test.js — Tests for encrypted audit logging
 *
 * Run: node server/audit-logger.test.js
 */

const assert = require('assert');

// Force in-memory mode for tests
process.env.AUDIT_LOG_PATH = ':memory:';
// Use a fixed test key
process.env.AUDIT_LOG_KEY = 'a'.repeat(64); // 32 bytes hex

const {
  initAuditLogger,
  logAuditEvent,
  decryptAuditEntry,
  getMemoryLog,
  clearMemoryLog,
} = require('./audit-logger');

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

console.log('\nAudit Logger Tests\n');

// ─── Init ────────────────────────────────────────────────────

test('initAuditLogger initialises without throwing', () => {
  initAuditLogger(); // should not throw
});

// ─── logAuditEvent ───────────────────────────────────────────

test('logAuditEvent writes an entry to memory log', () => {
  clearMemoryLog();
  logAuditEvent('test-event', { roomCode: 'ABCD' });
  const log = getMemoryLog();
  assert.strictEqual(log.length, 1, 'Should have 1 log entry');
});

test('logAuditEvent entry is valid JSON with iv, ct, ts fields', () => {
  clearMemoryLog();
  logAuditEvent('test-event-2', { socketId: 'xyz' });
  const [record] = getMemoryLog();
  const parsed = JSON.parse(record);
  assert.ok(typeof parsed.iv === 'string', 'iv should be present');
  assert.ok(typeof parsed.ct === 'string', 'ct should be present');
  assert.ok(typeof parsed.ts === 'number', 'ts should be present');
});

test('logAuditEvent plaintext is not visible in the encrypted record', () => {
  clearMemoryLog();
  logAuditEvent('sensitive-event', { secret: 'do-not-log-this' });
  const [record] = getMemoryLog();
  assert.ok(!record.includes('do-not-log-this'), 'Plaintext should not appear in log record');
  assert.ok(!record.includes('sensitive-event'), 'Event name should not appear in log record');
});

// ─── decryptAuditEntry ────────────────────────────────────────

test('decryptAuditEntry recovers the original event and fields', () => {
  clearMemoryLog();
  logAuditEvent('key-exchange-complete', { peerId: 's123', roomCode: 'ROOM1' });
  const [record] = getMemoryLog();
  const entry = decryptAuditEntry(record);
  assert.strictEqual(entry.event, 'key-exchange-complete', 'Event name should round-trip');
  assert.strictEqual(entry.peerId, 's123', 'peerId should round-trip');
  assert.strictEqual(entry.roomCode, 'ROOM1', 'roomCode should round-trip');
  assert.ok(typeof entry.ts === 'number', 'ts should be a number');
});

test('decryptAuditEntry rejects tampered ciphertext (GCM auth tag check)', () => {
  clearMemoryLog();
  logAuditEvent('tamper-test', { roomCode: 'ROOM2' });
  const [record] = getMemoryLog();

  // Tamper with the ct field — flip a byte in the base64
  const parsed = JSON.parse(record);
  const ctBytes = Buffer.from(parsed.ct, 'base64');
  ctBytes[0] ^= 0xff; // flip first byte
  parsed.ct = ctBytes.toString('base64');
  const tampered = JSON.stringify(parsed);

  assert.throws(
    () => decryptAuditEntry(tampered),
    /Unsupported state|bad decrypt|authentication/i,
    'Tampered ciphertext should throw'
  );
});

test('decryptAuditEntry rejects with wrong key', () => {
  const nodeCrypto = require('crypto');
  clearMemoryLog();
  logAuditEvent('wrong-key-test', { data: 'secret' });
  const [record] = getMemoryLog();
  const wrongKey = nodeCrypto.randomBytes(32);

  assert.throws(
    () => decryptAuditEntry(record, wrongKey),
    /Unsupported state|bad decrypt|authentication/i,
    'Wrong key should throw'
  );
});

// ─── Multiple events ─────────────────────────────────────────

test('multiple events produce multiple independent log entries', () => {
  clearMemoryLog();
  logAuditEvent('event-a', { n: 1 });
  logAuditEvent('event-b', { n: 2 });
  logAuditEvent('event-c', { n: 3 });
  const log = getMemoryLog();
  assert.strictEqual(log.length, 3, 'Should have 3 entries');

  const entries = log.map(r => decryptAuditEntry(r));
  assert.deepStrictEqual(
    entries.map(e => e.event),
    ['event-a', 'event-b', 'event-c'],
    'Events should be in order'
  );
});

// ─── Summary ────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
