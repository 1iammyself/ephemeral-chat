/**
 * Tests for device-attestation-verifier.js
 *
 * Uses Node.js built-in assert — no test framework required.
 * Run with: node server/device-attestation-verifier.test.js
 */

const assert = require('assert');

// ─── Test helpers ────────────────────────────────────────

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

// ─── Isolate module (reset env between tests) ─────────────

function loadModule() {
  // Clear require cache to re-evaluate env-based constants
  delete require.cache[require.resolve('./device-attestation-verifier')];
  return require('./device-attestation-verifier');
}

// ─── Tests ───────────────────────────────────────────────

async function main() {
  console.log('Device Attestation Verifier Tests\n');

  // ── Unconfigured mode ──

  console.log('Unconfigured mode (no env vars):');

  delete process.env.PLAY_INTEGRITY_DECRYPTION_KEY;
  delete process.env.PLAY_INTEGRITY_VERIFICATION_KEY;
  delete process.env.APPLE_APP_ID;
  delete process.env.APPLE_TEAM_ID;

  {
    const { verifyAndroidAttestation, verifyIOSAttestation } = loadModule();

    await test('Android: passes through when not configured', async () => {
      const result = await verifyAndroidAttestation('fake_token', 'fake_nonce');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.verdict.unconfigured, true);
    });

    await test('iOS: passes through when not configured', async () => {
      const result = await verifyIOSAttestation('fake_attest', 'fake_client_data', 'fake_nonce');
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.verdict.unconfigured, true);
    });
  }

  // ── Middleware tests ──

  console.log('\nMiddleware behavior:');

  {
    const { requireDeviceAttestation } = loadModule();

    await test('Non-mobile user agent: passes through without attestation', async () => {
      let nextCalled = false;
      const req = {
        headers: { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
      };
      const next = () => { nextCalled = true; };
      requireDeviceAttestation(req, {}, next);
      assert.strictEqual(nextCalled, true, 'next() should have been called');
      assert.strictEqual(req.deviceAttestation, undefined);
    });

    await test('Android user agent without headers: allowed when unconfigured', async () => {
      let nextCalled = false;
      const req = {
        headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13)' },
      };
      const next = () => { nextCalled = true; };
      requireDeviceAttestation(req, {}, next);
      assert.strictEqual(nextCalled, true, 'should pass through when unconfigured');
    });

    await test('Mobile with attestation headers: populates req.deviceAttestation', async () => {
      let nextCalled = false;
      const req = {
        headers: {
          'user-agent': 'Mozilla/5.0 (Linux; Android 13)',
          'x-device-attestation': 'token123',
          'x-attestation-nonce': 'nonce456',
        },
      };
      const next = () => { nextCalled = true; };
      requireDeviceAttestation(req, {}, next);
      assert.strictEqual(nextCalled, true);
      assert.deepStrictEqual(req.deviceAttestation, {
        token: 'token123',
        nonce: 'nonce456',
        platform: 'android',
      });
    });

    await test('iOS user agent with attestation headers: sets platform=ios', async () => {
      let nextCalled = false;
      const req = {
        headers: {
          'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
          'x-device-attestation': 'ios_token',
          'x-attestation-nonce': 'ios_nonce',
        },
      };
      const next = () => { nextCalled = true; };
      requireDeviceAttestation(req, {}, next);
      assert.strictEqual(nextCalled, true);
      assert.strictEqual(req.deviceAttestation.platform, 'ios');
    });
  }

  // ── Configured Android: token format validation ──

  console.log('\nAndroid configured mode (invalid token):');

  process.env.PLAY_INTEGRITY_DECRYPTION_KEY = Buffer.alloc(32).toString('base64');
  process.env.PLAY_INTEGRITY_VERIFICATION_KEY = Buffer.alloc(32).toString('base64');

  {
    const { verifyAndroidAttestation } = loadModule();

    await test('Android configured: rejects token with wrong format', async () => {
      await assert.rejects(
        () => verifyAndroidAttestation('not_a_jwe_token', 'nonce'),
        /attestation failed/i,
      );
    });
  }

  // ── Summary ──

  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
