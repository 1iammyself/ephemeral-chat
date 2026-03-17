/**
 * OHTTP Client — Oblivious HTTP Encapsulation (RFC 9458)
 * 
 * Implements the client-side of Oblivious HTTP:
 * 1. Fetches the Gateway's HPKE public key
 * 2. Encapsulates HTTP requests using HPKE
 * 3. Sends encapsulated requests through the Relay
 * 4. Decapsulates responses
 * 
 * Architecture:
 *   Client → Relay (sees IP, not content) → Gateway (sees content, not IP)
 * 
 * The Relay cannot read the request (it's HPKE-encrypted for the Gateway).
 * The Gateway cannot see the client's IP (the Relay stripped it).
 * 
 * @module crypto/ohttp
 */

// ─── Configuration ─────────────────────────────────────────

/**
 * @typedef {Object} OHTTPConfig
 * @property {string} relayUrl - URL of the OHTTP relay service
 * @property {string} gatewayUrl - URL of the OHTTP gateway (Ephchat server)
 * @property {string} configUrl - URL to fetch Gateway's HPKE public key config
 * @property {boolean} enabled - Whether OHTTP is enabled
 */

const DEFAULT_CONFIG = {
  relayUrl: '', // Set via environment or config
  gatewayUrl: '', // The Ephchat server acting as gateway
  configUrl: '', // Gateway's key configuration endpoint
  enabled: false
};

let ohttpConfig = { ...DEFAULT_CONFIG };
let gatewayPublicKey = null;
let gatewayKeyId = null;

// ─── Initialization ────────────────────────────────────────

/**
 * Initialize the OHTTP client with configuration.
 * 
 * @param {Partial<OHTTPConfig>} config 
 */
export function initOHTTP(config) {
  ohttpConfig = { ...ohttpConfig, ...config };

  if (ohttpConfig.enabled) {
    // Same-origin guard: relay and gateway must be different origins.
    // If they're the same server the privacy guarantee is void — the
    // gateway can correlate IP from the relay connection.
    try {
      const relayOrigin = new URL(ohttpConfig.relayUrl).origin;
      const gatewayOrigin = new URL(ohttpConfig.gatewayUrl).origin;
      if (relayOrigin === gatewayOrigin) {
        console.error(
          '[OHTTP] ❌ Relay and Gateway have the same origin (' + relayOrigin + '). ' +
          'OHTTP provides no privacy benefit when relay === gateway. ' +
          'Set VITE_OHTTP_RELAY_URL to a distinct origin (Cloudflare Worker, Fastly relay, etc.). ' +
          'Disabling OHTTP.'
        );
        ohttpConfig.enabled = false;
        return;
      }
    } catch (_) {
      // URL parse error — likely empty/relative URLs, disable silently
      ohttpConfig.enabled = false;
      return;
    }

    console.log('🔒 OHTTP enabled');
    console.log(`   Relay: ${ohttpConfig.relayUrl}`);
    console.log(`   Gateway: ${ohttpConfig.gatewayUrl}`);

    // Fetch gateway key asynchronously
    fetchGatewayConfig().catch(e => {
      console.warn('Failed to fetch OHTTP gateway config:', e.message);
    });
  }
}

/**
 * Check if OHTTP is ready (configured + gateway key fetched)
 * @returns {boolean}
 */
export function isOHTTPReady() {
  return ohttpConfig.enabled && gatewayPublicKey !== null;
}

// ─── Gateway Key Fetching (Section 3 of RFC 9458) ──────────

/**
 * Fetch the Gateway's HPKE key configuration.
 * The config contains the Gateway's public key for encapsulation.
 * 
 * Per RFC 9458 Section 3:
 *   The key config is a serialized KeyConfig structure containing:
 *   - Key ID (1 byte)
 *   - KEM ID (2 bytes) 
 *   - Public Key (variable)
 *   - Symmetric algorithms (list of AEAD + KDF pairs)
 */
async function fetchGatewayConfig() {
  if (!ohttpConfig.configUrl) {
    throw new Error('OHTTP config URL not set');
  }
  
  const response = await fetch(ohttpConfig.configUrl, {
    method: 'GET',
    headers: { 'Accept': 'application/ohttp-keys' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch OHTTP key config: ${response.status}`);
  }
  
  const configBytes = new Uint8Array(await response.arrayBuffer());
  const parsed = parseKeyConfig(configBytes);
  
  gatewayKeyId = parsed.keyId;
  gatewayPublicKey = parsed.publicKey;
  
  console.log(`🔑 OHTTP Gateway key fetched (ID: ${gatewayKeyId})`);
}

/**
 * Parse a serialized OHTTP KeyConfig
 * 
 * Format (per RFC 9458 Section 3.1):
 *   KeyConfig = {
 *     uint8 key_id;
 *     uint16 kem_id;
 *     opaque public_key<1..2^16-1>;
 *     CipherSuite symmetric_algorithms<4..2^16-4>;
 *   }
 * 
 * @param {Uint8Array} data - Serialized key config
 * @returns {Object} Parsed config
 */
function parseKeyConfig(data) {
  let offset = 0;
  
  // Skip outer length prefix (2 bytes)
  const outerLength = (data[offset] << 8) | data[offset + 1];
  offset += 2;
  
  const keyId = data[offset];
  offset += 1;
  
  const kemId = (data[offset] << 8) | data[offset + 1];
  offset += 2;
  
  const pubKeyLength = (data[offset] << 8) | data[offset + 1];
  offset += 2;
  
  const publicKey = data.slice(offset, offset + pubKeyLength);
  offset += pubKeyLength;
  
  // Symmetric algorithms
  const symmLength = (data[offset] << 8) | data[offset + 1];
  offset += 2;
  
  const symmetricAlgorithms = [];
  const symmEnd = offset + symmLength;
  while (offset < symmEnd) {
    const kdfId = (data[offset] << 8) | data[offset + 1];
    offset += 2;
    const aeadId = (data[offset] << 8) | data[offset + 1];
    offset += 2;
    symmetricAlgorithms.push({ kdfId, aeadId });
  }
  
  return { keyId, kemId, publicKey, symmetricAlgorithms };
}

// ─── Request Encapsulation (Section 4.3 of RFC 9458) ───────

/**
 * Encapsulate an HTTP request for OHTTP transmission.
 * 
 * The request is encrypted with HPKE using the Gateway's public key.
 * The Relay forwards this opaque blob without being able to read it.
 * 
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} targetUrl - Target URL path (on the Ephchat server)
 * @param {Object} headers - Request headers
 * @param {string|ArrayBuffer|null} body - Request body
 * @returns {Promise<{encapsulatedRequest: Uint8Array, responseContext: Object}>}
 */
export async function encapsulateRequest(method, targetUrl, headers = {}, body = null) {
  if (!gatewayPublicKey) {
    throw new Error('OHTTP not ready: gateway key not fetched');
  }
  
  // Build the Binary HTTP request (RFC 9292)
  const binaryRequest = buildBinaryHTTPRequest(method, targetUrl, headers, body);
  
  // Encrypt with HPKE (RFC 9180) using the Gateway's public key
  // Uses DHKEM(X25519, HKDF-SHA256) + AES-256-GCM via the `hpke` package
  const { encrypted, encapKey, nonce, responseContext } = await hpkeEncrypt(
    binaryRequest,
    gatewayPublicKey,
    gatewayKeyId
  );
  
  // Build encapsulated request:
  // Header: key_id (1) + kem_id (2) + enc (variable) + ct (variable)
  const encapsulatedRequest = buildEncapsulatedRequest(
    gatewayKeyId,
    encapKey,
    encrypted,
    nonce
  );
  
  return { encapsulatedRequest, responseContext };
}

/**
 * Decapsulate an OHTTP response.
 * 
 * @param {Uint8Array} encapsulatedResponse - The encrypted response from the Gateway
 * @param {Object} responseContext - Context from the encapsulation step
 * @returns {Promise<{status: number, headers: Object, body: Uint8Array}>}
 */
export async function decapsulateResponse(encapsulatedResponse, responseContext) {
  // Decrypt the response using the response key from HPKE context
  const decrypted = await hpkeDecryptResponse(encapsulatedResponse, responseContext);
  
  // Parse Binary HTTP response
  return parseBinaryHTTPResponse(decrypted);
}

// ─── Send via OHTTP ────────────────────────────────────────

/**
 * Send an HTTP request through OHTTP (relay → gateway → target).
 * This is the main API for making privacy-preserving requests.
 * 
 * If OHTTP is not ready, falls back to direct request.
 * 
 * @param {string} method - HTTP method
 * @param {string} url - Target URL
 * @param {Object} options - fetch() options (headers, body, etc.)
 * @returns {Promise<Response>} The response (unwrapped from OHTTP)
 */
export async function ohttpFetch(method, url, options = {}) {
  // Callers must check isOHTTPReady() before calling.
  // Refusing to silently fall back to a direct request preserves the
  // privacy contract — a direct request exposes the client IP to the server.
  if (!isOHTTPReady()) {
    throw new Error(
      '[OHTTP] Not ready — requires a distinct relay server configured via VITE_OHTTP_RELAY_URL'
    );
  }

  // Encapsulate the request
  const { encapsulatedRequest, responseContext } = await encapsulateRequest(
    method,
    url,
    options.headers || {},
    options.body || null
  );

  // Send to Relay
  const relayResponse = await fetch(ohttpConfig.relayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'message/ohttp-req'
    },
    body: encapsulatedRequest
  });

  if (!relayResponse.ok) {
    throw new Error(`OHTTP relay error: ${relayResponse.status}`);
  }

  // Decapsulate the response
  const encapsulatedResponse = new Uint8Array(await relayResponse.arrayBuffer());
  const { status, headers, body } = await decapsulateResponse(
    encapsulatedResponse,
    responseContext
  );

  // Wrap in a Response-like object
  return new Response(body, { status, headers });
}

// ─── Binary HTTP (RFC 9292) ────────────────────────────────

/**
 * Build a Binary HTTP request message
 */
function buildBinaryHTTPRequest(method, url, headers, body) {
  const encoder = new TextEncoder();
  
  // Binary HTTP request framing (subset of RFC 9292)
  const parts = [
    encoder.encode(method),
    new Uint8Array([0x20]), // space
    encoder.encode(url),
    new Uint8Array([0x0D, 0x0A]) // CRLF
  ];
  
  // Headers
  for (const [key, value] of Object.entries(headers)) {
    parts.push(encoder.encode(`${key}: ${value}`));
    parts.push(new Uint8Array([0x0D, 0x0A]));
  }
  
  parts.push(new Uint8Array([0x0D, 0x0A])); // End of headers
  
  // Body
  if (body) {
    if (typeof body === 'string') {
      parts.push(encoder.encode(body));
    } else if (body instanceof ArrayBuffer || body instanceof Uint8Array) {
      parts.push(new Uint8Array(body));
    }
  }
  
  // Concatenate all parts
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  
  return result;
}

/**
 * Parse a Binary HTTP response
 */
function parseBinaryHTTPResponse(data) {
  // Parse Binary HTTP response (RFC 9292 subset)
  const decoder = new TextDecoder();
  const text = decoder.decode(data);
  
  const headerEnd = text.indexOf('\r\n\r\n');
  const headerText = headerEnd > 0 ? text.substring(0, headerEnd) : text;
  const bodyText = headerEnd > 0 ? text.substring(headerEnd + 4) : '';
  
  const lines = headerText.split('\r\n');
  const statusLine = lines[0] || '';
  const statusMatch = statusLine.match(/(\d{3})/);
  const status = statusMatch ? parseInt(statusMatch[1]) : 200;
  
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const colonIdx = lines[i].indexOf(':');
    if (colonIdx > 0) {
      const key = lines[i].substring(0, colonIdx).trim();
      const value = lines[i].substring(colonIdx + 1).trim();
      headers[key] = value;
    }
  }
  
  return {
    status,
    headers,
    body: new TextEncoder().encode(bodyText)
  };
}

// ─── HPKE Operations (RFC 9180 via `hpke` package) ─────────

let hpkeSuite = null;

/**
 * Lazily initialise the HPKE cipher suite.
 * Uses DHKEM(X25519, HKDF-SHA256) + HKDF-SHA256 + AES-256-GCM.
 */
async function getHPKESuite() {
  if (hpkeSuite) return hpkeSuite;
  const {
    CipherSuite,
    KEM_DHKEM_X25519_HKDF_SHA256,
    KDF_HKDF_SHA256,
    AEAD_AES_256_GCM,
  } = await import('hpke');
  hpkeSuite = new CipherSuite(
    KEM_DHKEM_X25519_HKDF_SHA256,
    KDF_HKDF_SHA256,
    AEAD_AES_256_GCM,
  );
  return hpkeSuite;
}

async function hpkeEncrypt(plaintext, gatewayPublicKeyRaw, keyId) {
  const cs = await getHPKESuite();
  const recipientPublicKey = await cs.DeserializePublicKey(gatewayPublicKeyRaw);

  // Single-shot Seal: HPKE base mode — generates ephemeral key, encrypts
  const { encapsulatedSecret, ciphertext } = await cs.Seal(
    recipientPublicKey,
    plaintext,
  );

  // The recipient will use (enc, ct) to Open
  // We also return the enc so we can build the encapsulated request
  // and the response context (sender context isn't needed for single-shot)
  const responseContext = {
    enc: new Uint8Array(encapsulatedSecret),
    gatewayPublicKeyRaw: new Uint8Array(gatewayPublicKeyRaw),
  };

  return {
    encrypted: new Uint8Array(ciphertext),
    encapKey: new Uint8Array(encapsulatedSecret),
    nonce: new Uint8Array(0), // nonce is internal to HPKE
    responseContext,
  };
}

async function hpkeDecryptResponse(encryptedResponse, context) {
  // Derive response key via HMAC-SHA256 matching the server's derivation:
  // HMAC-SHA256(key=gatewayPublicKey, data=enc || "ohttp-response")
  const gatewayKey = await crypto.subtle.importKey(
    'raw', context.gatewayPublicKeyRaw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const data = new Uint8Array(context.enc.length + 14); // 14 = "ohttp-response".length
  data.set(context.enc, 0);
  data.set(new TextEncoder().encode('ohttp-response'), context.enc.length);
  const hash = await crypto.subtle.sign('HMAC', gatewayKey, data);
  const aesKey = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['decrypt']);

  // Extract nonce (12 bytes) + ciphertext from response
  const responseNonce = encryptedResponse.slice(0, 12);
  const ciphertext = encryptedResponse.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: responseNonce },
    aesKey,
    ciphertext,
  );
  return new Uint8Array(decrypted);
}

function buildEncapsulatedRequest(keyId, encapKey, encrypted, nonce) {
  // key_id (1) + kem_id (2) + enc_len (2) + enc + nonce (12) + ct
  const kemId = 0x0020; // DHKEM(X25519, HKDF-SHA256) 
  const result = new Uint8Array(1 + 2 + 2 + encapKey.length + nonce.length + encrypted.length);
  
  let offset = 0;
  result[offset] = keyId;
  offset += 1;
  
  result[offset] = (kemId >> 8) & 0xFF;
  result[offset + 1] = kemId & 0xFF;
  offset += 2;
  
  result[offset] = (encapKey.length >> 8) & 0xFF;
  result[offset + 1] = encapKey.length & 0xFF;
  offset += 2;
  
  result.set(encapKey, offset);
  offset += encapKey.length;
  
  result.set(nonce, offset);
  offset += nonce.length;
  
  result.set(encrypted, offset);
  
  return result;
}
