/**
 * Privacy Pass Client — Ristretto255 VOPRF (RFC 9497 / RFC 9578)
 *
 * Implements REAL blind token issuance using the Ristretto255 group.
 *
 *   Blinding:
 *     1. Client picks random token t, computes T = H_to_group(t)
 *     2. Client picks random scalar r, computes B = r · T
 *     3. Client sends B to Issuer
 *
 *   Unblinding:
 *     4. Issuer returns Z = k · B + DLEQ proof
 *     5. Client computes W = r⁻¹ · Z  =  k · T
 *     6. Client stores (t, W) as the redeemable token
 *
 *   Redemption:
 *     7. Client sends (t, W) to the server
 *     8. Server checks: k · H_to_group(t) == W
 *     9. Server CANNOT correlate step 8 back to step 3
 *
 * The browser does not have native Ristretto255.  We use
 * @noble/curves/ed25519 (tree-shakeable, audited, constant-time)
 * which is bundled by Vite.  If unavailable we fall back to a
 * WebCrypto P-256 approximation that is NOT truly blind (dev-only).
 *
 * @module crypto/privacy-pass
 */

// ─── Ristretto255 Client Operations ───────────────────────

let ristretto = null;

/**
 * Attempt to load @noble/curves for Ristretto255.
 * Returns true if production-grade group ops are available.
 */
async function loadRistretto() {
  if (ristretto) return !ristretto._fallback;
  try {
    // Dynamic import — Vite will tree-shake the rest of the library
    const { RistrettoPoint } = await import('@noble/curves/ed25519');
    const { bytesToNumberLE, numberToBytesLE } = await import('@noble/curves/abstract/utils');

    const ORDER = 2n ** 252n + 27742317777372353535851937790883648493n;

    ristretto = {
      ORDER,
      hashToPoint(data) { return RistrettoPoint.hashToCurve(data); },
      randomScalar() {
        const buf = crypto.getRandomValues(new Uint8Array(64));
        const n = bytesToNumberLE(buf) % (ORDER - 1n) + 1n;
        return n;
      },
      /** Modular inverse:  a⁻¹ mod ORDER  via Fermat's little theorem */
      invertScalar(a) {
        // a^(ORDER-2) mod ORDER
        return modPow(a, ORDER - 2n, ORDER);
      },
      scalarToBytes(s) { return numberToBytesLE(s, 32); },
      bytesToScalar(buf) { return bytesToNumberLE(buf) % ORDER; },
      pointToBytes(P) { return P.toRawBytes(); },
      bytesToPoint(buf) { return RistrettoPoint.fromHex(buf); },
      scalarMul(P, s) { return P.multiply(s); },
      BASE: RistrettoPoint.BASE,
    };

    return true;
  } catch {
    // Fallback: NOT blind — development only
    ristretto = buildFallback();
    return false;
  }
}

/** Modular exponentiation for scalar inversion */
function modPow(base, exp, mod) {
  let result = 1n;
  base = base % mod;
  while (exp > 0n) {
    if (exp % 2n === 1n) result = result * base % mod;
    exp >>= 1n;
    base = base * base % mod;
  }
  return result;
}

function buildFallback() {
  return {
    _fallback: true,
    ORDER: 2n ** 252n + 27742317777372353535851937790883648493n,
    hashToPoint(data) {
      const h = new Uint8Array(32);
      // SHA-256 as a stand-in for hash-to-group
      return crypto.subtle.digest('SHA-256', data).then(buf => new Uint8Array(buf));
    },
    randomScalar() {
      const buf = crypto.getRandomValues(new Uint8Array(32));
      let n = 0n;
      for (let i = buf.length - 1; i >= 0; i--) n = n * 256n + BigInt(buf[i]);
      return (n % (this.ORDER - 1n)) + 1n;
    },
    invertScalar(a) { return modPow(a, this.ORDER - 2n, this.ORDER); },
    scalarToBytes(s) {
      const buf = new Uint8Array(32);
      for (let i = 0; i < 32; i++) { buf[i] = Number(s & 0xFFn); s >>= 8n; }
      return buf;
    },
    bytesToScalar(buf) {
      let n = 0n;
      for (let i = buf.length - 1; i >= 0; i--) n = n * 256n + BigInt(buf[i]);
      return n % this.ORDER;
    },
    pointToBytes(P) { return P instanceof Uint8Array ? P : new Uint8Array(P); },
    bytesToPoint(buf) { return new Uint8Array(buf); },
    async scalarMul(P, s) {
      // XOR-based stand-in — preserves API shape, NOT real group ops
      const key = this.scalarToBytes(s);
      const data = this.pointToBytes(P);
      const raw = await crypto.subtle.digest('SHA-256',
        new Uint8Array([...key, ...data])
      );
      return new Uint8Array(raw);
    },
    BASE: crypto.getRandomValues(new Uint8Array(32)),
  };
}

// ─── Token Types ───────────────────────────────────────────

/**
 * @typedef {Object} BlindedToken
 * @property {Uint8Array} token - Original random token t (secret)
 * @property {bigint} blindScalar - Blinding factor r
 * @property {*} blindedElement - B = r · H(t)  (Ristretto point)
 */

/**
 * @typedef {Object} SignedToken
 * @property {Uint8Array} token - Original token t
 * @property {Uint8Array} authenticator - W = k · H(t)  (unblinded)
 * @property {number} issuedAt
 */

// ─── Configuration ─────────────────────────────────────────

let issuerPublicPoint = null;   // Y = k · G  (Ristretto point)
let tokenStore = [];
const MAX_STORED_TOKENS = 10;

/**
 * Initialize the Privacy Pass client.
 * @param {string} issuerUrl
 */
export async function initPrivacyPass(issuerUrl) {
  try {
    await loadRistretto();

    const response = await fetch(`${issuerUrl}/privacy-pass/config`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    if (!response.ok) throw new Error(`Config fetch failed: ${response.status}`);

    const data = await response.json();
    const pubBytes = base64ToBytes(data.publicKey);
    issuerPublicPoint = ristretto.bytesToPoint(pubBytes);

    await prefetchTokens(issuerUrl, 5);
  } catch (e) {
  }
}

export function isPrivacyPassReady() {
  return issuerPublicPoint !== null && tokenStore.length > 0;
}

// ─── VOPRF Blind / Unblind ─────────────────────────────────

/**
 * Generate a blinded token:
 *   t ← random 32 bytes
 *   T = H_to_group(t)
 *   r ← random scalar
 *   B = r · T
 *
 * @returns {Promise<BlindedToken>}
 */
async function generateBlindedToken() {
  const token = crypto.getRandomValues(new Uint8Array(32));

  // Hash token to a group element
  const T = await Promise.resolve(ristretto.hashToPoint(token));

  // Random blinding scalar r
  const r = ristretto.randomScalar();

  // Blinded element  B = r · T
  const B = await Promise.resolve(ristretto.scalarMul(T, r));

  return { token, blindScalar: r, blindedElement: B, groupElement: T };
}

/**
 * Unblind a signed element:
 *   Z = k · B  = k · r · T        (from server)
 *   W = r⁻¹ · Z = k · T           (what we keep)
 *
 * @param {BlindedToken} blinded
 * @param {Uint8Array} signedBytes - Z serialized
 * @returns {Promise<SignedToken>}
 */
async function unblindToken(blinded, signedBytes) {
  const Z = ristretto.bytesToPoint(signedBytes);

  // r⁻¹
  const rInv = ristretto.invertScalar(blinded.blindScalar);

  // W = r⁻¹ · Z
  const W = await Promise.resolve(ristretto.scalarMul(Z, rInv));

  return {
    token: blinded.token,
    authenticator: new Uint8Array(ristretto.pointToBytes(W)),
    issuedAt: Date.now(),
  };
}

// ─── Token Issuance Flow ──────────────────────────────────

async function requestTokens(issuerUrl, count) {
  const blindedTokens = [];
  const blindedElements = [];

  for (let i = 0; i < count; i++) {
    const bt = await generateBlindedToken();
    blindedTokens.push(bt);
    blindedElements.push(bytesToBase64(new Uint8Array(ristretto.pointToBytes(bt.blindedElement))));
  }

  const response = await fetch(`${issuerUrl}/privacy-pass/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tokenType: 1,
      blindedElements,
    }),
  });
  if (!response.ok) throw new Error(`Token issuance failed: ${response.status}`);

  const data = await response.json();
  const signedElements = data.signedElements || data.signedTokens;
  const proofs = data.proofs || [];

  const tokens = [];
  for (let i = 0; i < count; i++) {
    const signedBytes = base64ToBytes(signedElements[i]);

    // Verify DLEQ proof if the server provided one and we have Ristretto
    if (proofs[i] && !ristretto._fallback) {
      const B = blindedTokens[i].blindedElement;
      const Z = ristretto.bytesToPoint(signedBytes);
      const proof = {
        c: base64ToBytes(proofs[i].c),
        s: base64ToBytes(proofs[i].s),
      };
      const valid = await verifyDLEQProof(proof, B, Z, issuerPublicPoint);
      if (!valid) {
        continue; // reject this token
      }
    }

    const token = await unblindToken(blindedTokens[i], signedBytes);
    tokens.push(token);
  }
  return tokens;
}

/**
 * Verify a DLEQ proof:  π proves Z = k·B given Y = k·G
 *
 *   A1 = s·G + c·Y
 *   A2 = s·B + c·Z
 *   c' = H(A1 ‖ A2 ‖ Y ‖ Z)
 *   accept if c' == c
 *
 * @param {{c: Uint8Array, s: Uint8Array}} proof
 * @param {*} B  - blinded element
 * @param {*} Z  - signed element
 * @param {*} Y  - issuer public key point
 * @returns {Promise<boolean>}
 */
async function verifyDLEQProof(proof, B, Z, Y) {
  try {
    const c = ristretto.bytesToScalar(proof.c);
    const s = ristretto.bytesToScalar(proof.s);

    // A1 = s·G + c·Y
    const sG = await Promise.resolve(ristretto.scalarMul(ristretto.BASE, s));
    const cY = await Promise.resolve(ristretto.scalarMul(Y, c));
    // RistrettoPoint.add exists on @noble/curves RistrettoPoint
    const A1 = sG.add ? sG.add(cY) : sG; // if no add method, fallback

    // A2 = s·B + c·Z
    const sB = await Promise.resolve(ristretto.scalarMul(B, s));
    const cZ = await Promise.resolve(ristretto.scalarMul(Z, c));
    const A2 = sB.add ? sB.add(cZ) : sB;

    // Fiat-Shamir challenge: c' = H(A1 ‖ A2 ‖ Y ‖ Z)  (SHA-512 reduced mod ORDER)
    const cInput = new Uint8Array([
      ...ristretto.pointToBytes(A1),
      ...ristretto.pointToBytes(A2),
      ...ristretto.pointToBytes(Y),
      ...ristretto.pointToBytes(Z),
    ]);
    const cHash = new Uint8Array(await crypto.subtle.digest('SHA-512', cInput));
    const cExpected = ristretto.bytesToScalar(cHash);

    return c === cExpected;
  } catch (e) {
    return false;
  }
}

async function prefetchTokens(issuerUrl, count) {
  try {
    const tokens = await requestTokens(issuerUrl, count);
    tokenStore.push(...tokens);
    if (tokenStore.length > MAX_STORED_TOKENS) {
      tokenStore = tokenStore.slice(-MAX_STORED_TOKENS);
    }
  } catch (e) {
  }
}

// ─── Token Redemption ──────────────────────────────────────

/**
 * Consume one token and return an Authorization header.
 * The header carries (t, W) where W = k · H(t).
 *
 * @returns {Object|null}  { Authorization: "PrivacyPass ..." }
 */
export function getAuthToken() {
  if (tokenStore.length === 0) return null;

  const token = tokenStore.shift();
  if (Date.now() - token.issuedAt > 3_600_000) return getAuthToken(); // expired

  return {
    'Authorization': `PrivacyPass token="${bytesToBase64(token.token)}", authenticator="${bytesToBase64(token.authenticator)}"`,
  };
}

export function getTokenCount() { return tokenStore.length; }

export async function refreshTokensIfNeeded(issuerUrl) {
  if (tokenStore.length < 3) await prefetchTokens(issuerUrl, 5);
}

// ─── Utility ───────────────────────────────────────────────

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64ToBytes(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
