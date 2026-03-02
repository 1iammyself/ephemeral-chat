/**
 * OHTTP Gateway — Server-side Oblivious HTTP (RFC 9458)
 * 
 * Acts as the "relay" that decapsulates OHTTP requests and forwards
 * them to the target resource (our own API). The gateway holds the
 * HPKE keypair; clients encrypt to it so intermediate proxies can't
 * see request content.
 * 
 * Uses the `hpke` npm package (RFC 9180) for real DHKEM(X25519) +
 * HKDF-SHA256 + AES-256-GCM encryption.
 * 
 * @module ohttp-gateway
 */

const nodeCrypto = require('crypto');

// ─── HPKE Setup ────────────────────────────────────────────

let hpkeMod = null;
let hpkeSuite = null;

async function ensureHPKE() {
  if (hpkeSuite) return hpkeSuite;
  hpkeMod = await import('hpke');
  hpkeSuite = new hpkeMod.CipherSuite(
    hpkeMod.KEM_DHKEM_X25519_HKDF_SHA256,
    hpkeMod.KDF_HKDF_SHA256,
    hpkeMod.AEAD_AES_256_GCM,
  );
  return hpkeSuite;
}

// ─── Gateway HPKE Keypair ──────────────────────────────────

let gatewayKeyPair = null;   // { publicKey, privateKey } CryptoKey objects
let gatewayKeyId = null;
let gatewayPublicKeyRaw = null;  // serialised 32-byte X25519 pk

/**
 * Initialize or rotate the gateway HPKE keypair.
 * DHKEM(X25519, HKDF-SHA256) — real RFC 9180 keys.
 */
async function initGatewayKeys() {
  const cs = await ensureHPKE();
  gatewayKeyPair = await cs.GenerateKeyPair();
  gatewayPublicKeyRaw = new Uint8Array(
    await cs.SerializePublicKey(gatewayKeyPair.publicKey)
  );
  gatewayKeyId = nodeCrypto.randomBytes(1)[0]; // 1-byte key ID per RFC 9458
  console.log(`[OHTTP] Gateway HPKE key initialized (X25519, keyId: ${gatewayKeyId})`);
  return { publicKey: gatewayPublicKeyRaw, keyId: gatewayKeyId };
}

/**
 * Get the gateway's public key config (served to clients at /ohttp/config).
 * Returns a serialised OHTTP KeyConfig (RFC 9458 §3.1).
 */
function getGatewayConfig() {
  if (!gatewayKeyPair) {
    throw new Error('OHTTP gateway keys not initialized');
  }

  // Build the wire-format KeyConfig:
  //   key_id (1)  kem_id (2)  pk_len (2)  pk (32)  symm_len (2)  [kdf(2) aead(2)]
  const kemId = 0x0020; // DHKEM(X25519, HKDF-SHA256)
  const kdfId = 0x0001; // HKDF-SHA256
  const aeadId = 0x0002; // AES-256-GCM
  const pk = gatewayPublicKeyRaw;
  const inner = Buffer.alloc(1 + 2 + 2 + pk.length + 2 + 4);
  let off = 0;
  inner[off++] = gatewayKeyId;
  inner.writeUInt16BE(kemId, off); off += 2;
  inner.writeUInt16BE(pk.length, off); off += 2;
  Buffer.from(pk).copy(inner, off); off += pk.length;
  inner.writeUInt16BE(4, off); off += 2; // symmetric alg length = 4
  inner.writeUInt16BE(kdfId, off); off += 2;
  inner.writeUInt16BE(aeadId, off); off += 2;

  // Outer length-prefixed envelope
  const wire = Buffer.alloc(2 + inner.length);
  wire.writeUInt16BE(inner.length, 0);
  inner.copy(wire, 2);

  return {
    keyId: gatewayKeyId,
    kem: kemId,
    kdf: kdfId,
    aead: aeadId,
    publicKey: pk.toString ? Buffer.from(pk).toString('base64') : Buffer.from(pk).toString('base64'),
    wireConfig: wire.toString('base64'),
  };
}

/**
 * Decapsulate an OHTTP request using real HPKE Open.
 * 
 * Wire format from the client:
 *   [key_id (1)] [kem_id (2)] [enc_len (2)] [enc (32)] [ciphertext ...]
 * 
 * @param {Buffer} encapsulatedRequest - The OHTTP-encapsulated body
 * @returns {Promise<{method: string, path: string, headers: Object, body: Buffer, responseKey: Buffer}>}
 */
async function decapsulateRequest(encapsulatedRequest) {
  if (!gatewayKeyPair) {
    throw new Error('OHTTP gateway not initialized');
  }

  const cs = await ensureHPKE();

  try {
    const buf = Buffer.from(encapsulatedRequest);
    let offset = 0;

    // Read key_id (1 byte)
    const reqKeyId = buf[offset];
    offset += 1;
    if (reqKeyId !== gatewayKeyId) throw new Error('Unknown key ID');

    // Read kem_id (2 bytes)
    const kemId = buf.readUInt16BE(offset);
    offset += 2;

    // Read enc length (2 bytes)
    const encLen = buf.readUInt16BE(offset);
    offset += 2;

    // Read enc (HPKE encapsulated secret)
    const enc = buf.slice(offset, offset + encLen);
    offset += encLen;

    // Remaining bytes are the HPKE ciphertext
    const ciphertext = buf.slice(offset);

    // HPKE Open — decrypt using our gateway private key
    const plaintext = await cs.Open(gatewayKeyPair, enc, ciphertext);

    // Parse the inner Binary HTTP request
    const innerRequest = parseBinaryHTTP(Buffer.from(plaintext));

    // Derive response key from enc + gateway pk
    const combined = Buffer.concat([enc, Buffer.from(gatewayPublicKeyRaw)]);
    const info = Buffer.from('ohttp-response');
    const full = Buffer.concat([combined, info]);
    const responseKey = nodeCrypto.createHash('sha256').update(full).digest();

    return {
      ...innerRequest,
      responseKey,
      enc,
    };
  } catch (e) {
    throw new Error(`OHTTP decapsulation failed: ${e.message}`);
  }
}

/**
 * Encapsulate a response back to the client
 * @param {Buffer} responseBody - The HTTP response body
 * @param {number} statusCode - HTTP status code
 * @param {Buffer} responseKey - Key from decapsulateRequest
 * @returns {Buffer} Encrypted response
 */
function encapsulateResponse(responseBody, statusCode, responseKey) {
  const iv = nodeCrypto.randomBytes(12);
  
  // Build inner response: [status (2 bytes)] [body]
  const statusBuf = Buffer.alloc(2);
  statusBuf.writeUInt16BE(statusCode);
  const inner = Buffer.concat([statusBuf, Buffer.from(responseBody)]);
  
  // Encrypt
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', responseKey, iv);
  const encrypted = Buffer.concat([cipher.update(inner), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  return Buffer.concat([iv, encrypted, tag]);
}

/**
 * Parse a Binary HTTP request (RFC 9292 subset)
 * @param {Buffer} buf 
 * @returns {{method: string, path: string, headers: Object, body: Buffer}}
 */
function parseBinaryHTTP(buf) {
  try {
    // Simple format: JSON-encoded for now
    // Production should implement proper RFC 9292 binary HTTP framing
    const text = buf.toString('utf8');
    const parsed = JSON.parse(text);
    
    return {
      method: parsed.method || 'POST',
      path: parsed.path || '/',
      headers: parsed.headers || {},
      body: parsed.body ? Buffer.from(parsed.body, 'base64') : Buffer.alloc(0)
    };
  } catch {
    // Fallback: treat entire buffer as POST body to /api/message
    return {
      method: 'POST',
      path: '/api/message',
      headers: {},
      body: buf
    };
  }
}

// ─── Express Middleware ─────────────────────────────────────

/**
 * Express middleware that handles OHTTP-encapsulated requests.
 * Mount at POST /ohttp/request
 */
function ohttpGatewayMiddleware(app) {
  // Serve gateway config (public key)
  app.get('/ohttp/config', (req, res) => {
    try {
      const config = getGatewayConfig();
      res.json(config);
    } catch (e) {
      res.status(503).json({ error: 'OHTTP not initialized' });
    }
  });
  
  // Handle encapsulated requests
  app.post('/ohttp/request', express_raw(), async (req, res) => {
    try {
      const { method, path, headers, body, responseKey } = 
        decapsulateRequest(req.body);
      
      // Forward the decapsulated request internally via Express router
      const innerResponse = await handleInnerRequest(app, method, path, headers, body);
      
      // Encrypt and return the response
      const encResponse = encapsulateResponse(
        JSON.stringify(innerResponse.body),
        innerResponse.status,
        responseKey
      );
      
      res.set('Content-Type', 'message/ohttp-res');
      res.send(encResponse);
      
    } catch (e) {
      console.error('[OHTTP] Decapsulation error:', e.message);
      // Return generic error (don't leak information)
      res.status(400).send('Bad Request');
    }
  });
  
  console.log('[OHTTP] Gateway middleware attached');
}

/**
 * Handle the decapsulated inner request by injecting it into Express.
 * This creates a synthetic req/res and passes it through the app's router
 * so all existing REST routes are available via OHTTP.
 * @private
 */
async function handleInnerRequest(app, method, path, headers, body) {
  return new Promise((resolve) => {
    const http = require('http');

    // Build a minimal IncomingMessage-like object
    const fakeReq = new http.IncomingMessage();
    fakeReq.method = method.toUpperCase();
    fakeReq.url = path;
    fakeReq.headers = {};
    for (const [k, v] of Object.entries(headers)) {
      fakeReq.headers[k.toLowerCase()] = v;
    }
    fakeReq.headers['x-ohttp-inner'] = '1'; // mark as internally routed
    // Push body data
    if (body && body.length > 0) {
      fakeReq.push(body);
    }
    fakeReq.push(null);

    // Build a minimal ServerResponse-like collector
    const chunks = [];
    let statusCode = 200;
    const fakeRes = new http.ServerResponse(fakeReq);
    const origWrite = fakeRes.write.bind(fakeRes);
    const origEnd = fakeRes.end.bind(fakeRes);
    fakeRes.write = (chunk) => { chunks.push(Buffer.from(chunk)); return true; };
    fakeRes.end = (chunk) => {
      if (chunk) chunks.push(Buffer.from(chunk));
      statusCode = fakeRes.statusCode || 200;
      resolve({ status: statusCode, body: Buffer.concat(chunks).toString('utf8') || '{"ok":true}' });
    };

    // Let Express handle it
    app.handle(fakeReq, fakeRes);
  });
}

/**
 * Raw body parser for OHTTP requests
 */
function express_raw() {
  return (req, res, next) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      req.body = Buffer.concat(chunks);
      next();
    });
  };
}

// ─── Key Rotation ──────────────────────────────────────────

let rotationInterval = null;

/**
 * Start automatic key rotation (every 24 hours)
 */
function startKeyRotation(intervalMs = 24 * 60 * 60 * 1000) {
  rotationInterval = setInterval(async () => {
    console.log('[OHTTP] Rotating gateway keys...');
    await initGatewayKeys();
  }, intervalMs);
}

function stopKeyRotation() {
  if (rotationInterval) {
    clearInterval(rotationInterval);
    rotationInterval = null;
  }
}

module.exports = {
  initGatewayKeys,
  getGatewayConfig,
  decapsulateRequest,
  encapsulateResponse,
  ohttpGatewayMiddleware,
  startKeyRotation,
  stopKeyRotation
};
