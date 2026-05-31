/**
 * ohttp-roundtrip.test.js — End-to-end OHTTP encrypt/decrypt round-trip
 *
 * Verifies the full Oblivious HTTP crypto path between the browser client
 * (client/src/crypto/ohttp.js) and the server gateway (server/ohttp-gateway.js):
 *
 *   1. Client builds a Binary HTTP request and HPKE-Seals it to the gateway key
 *   2. Gateway decapsulateRequest() decrypts + parses method/path/body
 *   3. Gateway encapsulateResponse() encrypts the route's JSON response
 *   4. Client decapsulateResponse() decrypts + parses [status(2)][body]
 *
 * This is the leg that was previously broken: the gateway emitted a compact
 * [status][body] frame (and double-JSON-stringified the body) while the client
 * tried to parse RFC 9292 text framing — so every OHTTP response decoded empty.
 * The client now parses [status(2)][body] and the gateway passes the body
 * through as-is. This test guards that contract.
 *
 * The client side is mirrored here using the SAME Web Crypto API the browser
 * uses (globalThis.crypto.subtle) so the assertions reflect real client behavior.
 *
 * Run: node server/integration/ohttp-roundtrip.test.js
 */

const assert = require('assert');
const { webcrypto } = require('crypto');
const subtle = webcrypto.subtle;

const gateway = require('../ohttp-gateway');

const KEM_ID = 0x0020; // DHKEM(X25519, HKDF-SHA256)

// ─── Client mirror — request encapsulation ───────────────────
// Mirrors client/src/crypto/ohttp.js buildBinaryHTTPRequest + buildEncapsulatedRequest.

function buildBinaryHTTPRequest(method, url, headers = {}, body = null) {
  const enc = new TextEncoder();
  const parts = [enc.encode(method), Uint8Array.of(0x20), enc.encode(url), Uint8Array.of(0x0d, 0x0a)];
  for (const [k, v] of Object.entries(headers)) {
    parts.push(enc.encode(`${k}: ${v}`), Uint8Array.of(0x0d, 0x0a));
  }
  parts.push(Uint8Array.of(0x0d, 0x0a)); // end of headers
  if (body) parts.push(typeof body === 'string' ? enc.encode(body) : new Uint8Array(body));
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

function buildEncapsulatedRequest(keyId, encapKey, ciphertext) {
  const nonce = new Uint8Array(0); // nonce is internal to single-shot HPKE
  const out = new Uint8Array(1 + 2 + 2 + encapKey.length + nonce.length + ciphertext.length);
  let off = 0;
  out[off++] = keyId;
  out[off++] = (KEM_ID >> 8) & 0xff; out[off++] = KEM_ID & 0xff;
  out[off++] = (encapKey.length >> 8) & 0xff; out[off++] = encapKey.length & 0xff;
  out.set(encapKey, off); off += encapKey.length;
  out.set(ciphertext, off);
  return out;
}

// ─── Client mirror — response decryption ─────────────────────
// Mirrors client/src/crypto/ohttp.js hpkeDecryptResponse + decapsulateResponse.

async function clientDecryptResponse(encResp, gatewayPublicKeyRaw, enc) {
  // HKDF-Extract: salt = gateway public key, IKM = enc
  const saltKey = await subtle.importKey('raw', gatewayPublicKeyRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = await subtle.sign('HMAC', saltKey, enc);
  // HKDF-Expand: info = "ohttp-response", counter 0x01
  const prkKey = await subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const info = new TextEncoder().encode('ohttp-response');
  const expandInput = new Uint8Array(info.length + 1);
  expandInput.set(info, 0); expandInput[info.length] = 0x01;
  const hash = await subtle.sign('HMAC', prkKey, expandInput);
  const aesKey = await subtle.importKey('raw', new Uint8Array(hash).slice(0, 32), 'AES-GCM', false, ['decrypt']);

  const nonce = encResp.slice(0, 12);
  const ct = encResp.slice(12);
  const plaintext = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aesKey, ct));

  // Client decapsulateResponse: [status (2, BE)][body]
  const status = (plaintext[0] << 8) | plaintext[1];
  const body = new TextDecoder().decode(plaintext.slice(2));
  return { status, body };
}

// ─── Test Runner ─────────────────────────────────────────────

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); console.log('  ✅', name); passed++; }
  catch (e) { console.error('  ❌', name, '—', e.message); failed++; }
}

(async () => {
  console.log('\nOHTTP Round-Trip Integration Test\n');

  const { CipherSuite, KEM_DHKEM_X25519_HKDF_SHA256, KDF_HKDF_SHA256, AEAD_AES_256_GCM } = await import('hpke');
  const cs = new CipherSuite(KEM_DHKEM_X25519_HKDF_SHA256, KDF_HKDF_SHA256, AEAD_AES_256_GCM);

  // Server: initialize the gateway HPKE keypair and read its public config.
  const { publicKey: gatewayPublicKeyRaw, keyId } = await gateway.initGatewayKeys();

  await test('request encapsulation decrypts + parses on the gateway', async () => {
    const binary = buildBinaryHTTPRequest('POST', '/api/echo', { 'content-type': 'application/json' }, '{"hi":1}');
    const recipientPk = await cs.DeserializePublicKey(gatewayPublicKeyRaw);
    const { encapsulatedSecret, ciphertext } = await cs.Seal(recipientPk, binary);
    const encReq = buildEncapsulatedRequest(keyId, new Uint8Array(encapsulatedSecret), new Uint8Array(ciphertext));

    const inner = await gateway.decapsulateRequest(Buffer.from(encReq));
    assert.strictEqual(inner.method, 'POST', 'method parsed');
    assert.strictEqual(inner.path, '/api/echo', 'path parsed');
    assert.strictEqual(inner.body.toString('utf8'), '{"hi":1}', 'body parsed');
    assert.ok(Buffer.isBuffer(inner.responseKey) && inner.responseKey.length === 32, 'response key derived');
  });

  await test('response round-trips: gateway encrypt → client decrypt recovers status + JSON', async () => {
    // Reproduce a request so we share the same enc/responseKey the client would hold.
    const binary = buildBinaryHTTPRequest('GET', '/api/server-key', {}, null);
    const recipientPk = await cs.DeserializePublicKey(gatewayPublicKeyRaw);
    const { encapsulatedSecret, ciphertext } = await cs.Seal(recipientPk, binary);
    const enc = new Uint8Array(encapsulatedSecret);
    const encReq = buildEncapsulatedRequest(keyId, enc, new Uint8Array(ciphertext));

    const inner = await gateway.decapsulateRequest(Buffer.from(encReq));

    // Gateway encrypts the route's JSON string exactly as the middleware does.
    const routeJson = JSON.stringify({ publicKey: 'abc123', algorithm: 'Ed25519' });
    const encResp = gateway.encapsulateResponse(routeJson, 200, inner.responseKey);

    const { status, body } = await clientDecryptResponse(
      new Uint8Array(encResp),
      gatewayPublicKeyRaw,
      enc,
    );
    assert.strictEqual(status, 200, 'status recovered');
    const parsed = JSON.parse(body); // must parse as an OBJECT, not a quoted string
    assert.strictEqual(parsed.publicKey, 'abc123', 'body field recovered');
    assert.strictEqual(parsed.algorithm, 'Ed25519', 'body field recovered');
  });

  await test('FULL stack: /api route over OHTTP survives padResponseMiddleware', async () => {
    // This is the realistic path: a live Express app with the response-padding
    // middleware on /api, reached over OHTTP through the actual gateway. The
    // gateway's inner-router drops headers, so if padding were applied the
    // X-Padded envelope would leak through and JSON.parse below would throw.
    const express = require('express');
    const http = require('http');
    const { padResponseMiddleware } = require('../traffic-padding');
    const relayAuth = require('../config/relay-auth');

    const app = express();
    app.use(express.json());
    app.use('/api', padResponseMiddleware);
    app.get('/api/server-key', (_req, res) => res.json({ publicKey: 'abc123', algorithm: 'Ed25519' }));
    gateway.ohttpGatewayMiddleware(app); // mounts POST /ohttp/request

    const server = app.listen(0);
    await new Promise((r) => server.once('listening', r));
    const port = server.address().port;

    try {
      // Client encapsulates GET /api/server-key
      const binary = buildBinaryHTTPRequest('GET', '/api/server-key', {}, null);
      const recipientPk = await cs.DeserializePublicKey(gatewayPublicKeyRaw);
      const { encapsulatedSecret, ciphertext } = await cs.Seal(recipientPk, binary);
      const enc = new Uint8Array(encapsulatedSecret);
      const encReqBuf = Buffer.from(buildEncapsulatedRequest(keyId, enc, new Uint8Array(ciphertext)));

      // Relay signs the forwarded body, then POSTs to the gateway
      const { signature, timestamp } = relayAuth.signRequest(encReqBuf);
      const encResp = await new Promise((resolve, reject) => {
        const req = http.request(
          {
            hostname: '127.0.0.1', port, path: '/ohttp/request', method: 'POST',
            headers: {
              'content-type': 'message/ohttp-req',
              'content-length': encReqBuf.length,
              'x-relay-auth': signature,
              'x-relay-timestamp': String(timestamp),
            },
          },
          (res) => {
            if (res.statusCode !== 200) { reject(new Error('gateway HTTP ' + res.statusCode)); return; }
            const parts = [];
            res.on('data', (c) => parts.push(c));
            res.on('end', () => resolve(Buffer.concat(parts)));
          },
        );
        req.on('error', reject);
        req.write(encReqBuf);
        req.end();
      });

      const { status, body } = await clientDecryptResponse(new Uint8Array(encResp), gatewayPublicKeyRaw, enc);
      assert.strictEqual(status, 200, 'status recovered through full stack');
      const parsed = JSON.parse(body); // throws if the padding envelope leaked through
      assert.strictEqual(parsed.publicKey, 'abc123', 'JSON body recovered un-padded over OHTTP');
    } finally {
      server.close();
    }
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
})();
