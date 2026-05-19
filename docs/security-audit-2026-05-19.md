# Security Feature Audit — Ephemeral Chat
**Date:** 2026-05-19  
**Scope:** Full codebase — client, server, docs, configs, design specs  
**Purpose:** Baseline inventory before systematic hardening

---

## SECTION 1: FULLY IMPLEMENTED (production-grade)

### End-to-End Encryption

| Feature | Files | Notes |
|---|---|---|
| **PQXDH** (Post-Quantum X3DH) | `client/src/crypto/pqxdh.js`, `ml-kem.js`, `x25519.js` | Hybrid X25519 + ML-KEM-768; both must be broken to compromise session |
| **Double Ratchet** (1:1 messages) | `client/src/crypto/double-ratchet.js` | Per-message keys, forward secrecy + break-in recovery, max 256 skipped keys |
| **Megolm-style Sender Keys** (group) | `client/src/crypto/sender-key.js`, `utils/mlsEncryption.js` | Efficient O(n) group encryption, epoch barriers prevent replay post-rotation |
| **HKDF-SHA-256 key derivation** | `client/src/crypto/hkdf.js` | RFC 5869, extract-then-expand pattern |
| **AES-256-GCM** symmetric encryption | `client/src/utils/aesEncryption.js`, `crypto/e2ee-manager.js` | SubtleCrypto-backed, per-message random IVs, authenticated |

### Authentication & Authorization

| Feature | Files | Notes |
|---|---|---|
| **bcryptjs** password hashing | `server/auth-utils.js`, `server/rooms.js` | saltRounds=12, timing-safe comparison |
| **JWT** (WebAuthn sessions) | `server/webauthn.js` | HS256, 8-hour expiry, requires WEBAUTHN_JWT_SECRET env var |
| **WebAuthn / FIDO2 / Passkeys** | `server/webauthn.js`, `client/src/capacitor/attestation-provider.ts` | P-256/ES256, 5-minute challenge TTL, verifies user-present + user-verified flags |
| **Session management + inactivity** | `server/security.js` | 60-min timeout, 5-min mobile grace, 10-attempt lockout → 15-min ban |
| **HMAC-SHA-256 room code checksums** | `server/security.js`, `server/auth-utils.js` | 128-bit, timing-safe, no plaintext stored |
| **Challenge-response auth** | `server/auth-utils.js` | 32-byte crypto.randomBytes challenges |
| **Signed invite tokens** | `server/auth-utils.js` | HMAC-SHA-256, base64url, 24h expiry, random nonce |
| **Room verification tokens** | `server/auth-utils.js` | HMAC-SHA256, 5-minute max age, timing-safe verify |

### Traffic Analysis Resistance

| Feature | Files | Notes |
|---|---|---|
| **Traffic padding** (fixed bucket sizes) | `client/src/crypto/traffic-padding.js`, `server/traffic-padding.js` | Pads to 256B/1KB/1.5KB/4KB/16KB/64KB depending on privacy level |
| **Chaff messages** (fake traffic) | same files | Random encrypted dummy packets injected every 2–30s; server silently drops (FLAG_CHAFF 0x01) |
| **Timing jitter** | `client/src/crypto/traffic-padding.js` | 50–500ms random delay before sending; breaks timing correlation |

### Metadata Privacy

| Feature | Files | Notes |
|---|---|---|
| **OHTTP** (Oblivious HTTP, RFC 9458) | `server/ohttp-gateway.js`, `server/ohttp-relay-server.js`, `client/src/crypto/ohttp.js` | HPKE (DHKEM X25519, HKDF-SHA256, AES-256-GCM); separates who (relay) from what (gateway); 24-hour key rotation |
| **Privacy Pass** (RFC 9497/9578) | `server/privacy-pass-issuer.js`, `client/src/crypto/privacy-pass.js` | Ristretto255 VOPRF, DLEQ zero-knowledge proof, issuer never sees unblinded token; dev fallback to non-blind P-256 if @noble/curves unavailable |

### Server-Side Hardening

| Feature | Files | Notes |
|---|---|---|
| **Helmet.js** security headers | `server/index.js` | HSTS 1yr+preload, X-Frame-Options DENY, nosniff, no-referrer, Permissions-Policy |
| **Content Security Policy** | `server/index.js` | default-src 'self', object-src 'none', base-uri 'none', frame-ancestors 'self', configurable report-uri |
| **CORS whitelist** | `server/index.js` | Configurable via ALLOWED_ORIGINS env var, credentials support |
| **Rate limiting** | `server/index.js`, `server/drops-routes.js`, `server/privacy-pass-issuer.js` | Creator token: 100/15min; integrity nonce: 30/10min; drops: 10 create/30 claim per 10min; socket: 30 msg/60s |
| **Input validation & HTML sanitization** | `server/utils.js`, `server/auth-utils.js` | sanitize-html (no tags allowed), regex for room codes/nicknames, 500-char limits |
| **Timing-safe comparisons** | `server/security.js`, `server/auth-utils.js` | crypto.timingSafeEqual throughout |
| **Zero log policy** | `server/utils.js:104-127` | Logs suppressed in production unless DEBUG env set |
| **Proof-of-Work CAPTCHA** (Cap.js) | `server/index.js` | Anti-DDoS for room creation/drops; requires CAP_SECRET env var |
| **Trust proxy** | `server/index.js` | Correct client IP from X-Forwarded-For for rate limiting |

### Signing & MITM Prevention

| Feature | Files | Notes |
|---|---|---|
| **Ed25519 response signing** | `server/middleware/response-signing.js`, `client/src/crypto/server-signing.js` | Server signs key-bundle socket events; client verifies to detect relay tampering |
| **TOFU key pinning** (client) | `client/src/crypto/server-signing.js` | First-seen Ed25519 public key pinned to IndexedDB; mismatch on reload = alert |

### Mobile / Platform Security

| Feature | Files | Notes |
|---|---|---|
| **Device attestation** | `server/device-attestation-verifier.js` | Android Play Integrity (JWE+JWT, device verdicts) + iOS App Attest; flags rooted devices |
| **Android Keystore plugin** | `client/src/capacitor/security-plugins.js`, `client/src/crypto/key-store.js` | AES-256-GCM in TEE/StrongBox; private keys never exposed to JS |

### Data Retention & Ephemeral Properties

| Feature | Files | Notes |
|---|---|---|
| **Message TTL** | `server/index.js`, `server/rooms.js`, `server/utils.js` | Options: 30s/1m/5m/30m/1h/none; GC every 60s |
| **Room expiry** | `server/rooms.js` | 10-min inactivity default; 2-hour persistent; cleanup every 5 min |
| **Key material zeroization** | `client/src/crypto/key-store.js`, `client/src/crypto/sender-key.js` | Uint8Array.fill(0) on room leave; prevents heap dump exposure |

### Replay & Ordering Protection

| Feature | Files | Notes |
|---|---|---|
| **Message sequence counters** | `client/src/crypto/double-ratchet.js`, `client/src/crypto/sender-key.js` | sendCounter, recvCounter, prevSendCounter; out-of-order reconstruction |
| **Epoch barriers** (sender key) | `client/src/crypto/sender-key.js` | Prevents decryption of pre-rotation messages after member leave |

### API & Token Security

| Feature | Files | Notes |
|---|---|---|
| **Cryptographic randomness** | throughout | Server: crypto.randomBytes; Client: crypto.getRandomValues; no PRNG |
| **Secure room code generation** | `server/utils.js` | 10-char A-Z0-9, crypto.randomBytes; optional custom phrases |
| **Socket.IO transport** | `server/index.js`, `client/src/socket.js` | HTTPS/WSS in production, CORS per origin whitelist |

---

## SECTION 2: PARTIAL / STUBS (code exists, not complete)

| Feature | Files | Gap |
|---|---|---|
| **Key Transparency** (Merkle proofs) | `client/src/crypto/key-transparency-client.js`, `client/src/db/kt-store.js`, `server/key-registry.js` | Structure present; Merkle-proof verification not operational |
| **Secure memory WASM** (Rust) | `client/src/crypto/pkg/secure-memory/` | WASM binary + TS bindings exist; Rust source not in repo; integration coverage unknown |
| **Ed25519 signing — full coverage** | `server/middleware/response-signing.js`, `client/src/crypto/server-signing.js` | Currently covers key-bundle events only; design calls for all responses |
| **Relay HMAC auth** | `server/config/relay-auth.js` | Relay-to-gateway auth designed; implementation level unclear |
| **Hardware biometric auth** | `client/src/capacitor/security-plugins.js` | BiometricPlugin registered; full BiometricPrompt + Keystore integration unclear |
| **Offline proximity mesh** (mDNS-SD/BLE) | `server/nearby.js`, `client/src/nearby/offline-p2p-manager.js`, `client/src/plugins/proximity.js` | Plugin structure + Capacitor bridge exist; E2EE over local mesh unclear |
| **WebRTC P2P** | `client/src/webrtc.js`, `server/ice-signaling.js` | Signaling + ICE relay in place; full secure mesh completeness unclear |
| **Geofencing** | `client/src/hooks/useGeofence.js` | Hook exists; enforcement logic minimal |
| **MLS (RFC 9420)** | `client/src/utils/mlsEncryption.js`, `client/src/utils/mlsHelper.js` | Labeled "legacy facade" — MLS function calls route to Double Ratchet/Sender Key backend; openmls-wasm integrated but actual MLS group management protocol not enforced |

---

## SECTION 3: MENTIONED BUT NOT IMPLEMENTED (docs, README, design specs only)

| Feature | Where Mentioned | Notes |
|---|---|---|
| **Panic burn / wipe** | README | "Wipe all device-local traces in milliseconds" — no code found |
| **Ghost watermarking** (OCR defense) | README | "Drifting screen watermarks built to defeat OCR" — no code found |
| **Privacy blur** (screenshot defense) | README | Content obfuscation on window blur — no code found |
| **Certificate pinning** (mobile TLS) | `docs/superpowers/specs/2026-05-04-android-security-hardening-design.md` | Planned via OkHttp in native Capacitor plugin; no implementation |
| **Encrypted audit logging** | Same design doc (Phase 4) | E2EE crypto operation logs, local + server sync — no code found |
| **Root/tamper detection** (native Android) | Same design doc | Frida hook prevention, native root checks — Play Integrity covers some; native not found |
| **Service Worker media audit proxy** | Same design doc (Phase 3.5) | Centralized media API audit log via Service Worker — no SW found |
| **Android R8 minification** | Same design doc | minifyEnabled in build.gradle — no build.gradle in repo to confirm |

---

## SECTION 4: SECURITY PACKAGES IN package.json

| Package | Version | Purpose |
|---|---|---|
| helmet | ^8.1.0 | Security headers (CSP, HSTS, X-Frame-Options, etc.) |
| express-rate-limit | ^8.2.1 | Rate limiting |
| bcryptjs | ^2.4.3 | Password hashing |
| jsonwebtoken | ^9.0.3 | JWT for sessions |
| sanitize-html | ^2.17.0 | XSS prevention via HTML sanitization |
| hpke | ^1.0.4 | OHTTP encryption (RFC 9180) |
| mlkem | ^2.5.0 | ML-KEM-768 post-quantum KEM |
| @noble/curves | ^1.8.1 | Ristretto255 for Privacy Pass |
| @cap.js/server | ^4.0.5 | Proof-of-work CAPTCHA |
| cbor | ^10.0.12 | CBOR encoding (device attestation payloads) |

---

## SECTION 5: KEY FINDINGS

### Strengths
- Industrial-grade cryptography: PQXDH, Double Ratchet, OHTTP, Privacy Pass
- Comprehensive server-side hardening: Helmet, CSP, rate limiting
- Zero-persistence server model with ephemeral data
- Multiple layers of traffic analysis protection
- FIDO2/WebAuthn support for passwordless auth
- Post-quantum hybrid key exchange ready

### Gaps (priority order for remediation)
1. **Key Transparency** — Merkle-proof audit trail not operational; silent key substitution undetectable
2. **Panic burn / watermarking / blur** — marketed in README, no code exists
3. **Certificate pinning** — mobile app has no TLS pinning beyond HSTS; compromised CA can MITM
4. **Encrypted audit logging** — no structured log of cryptographic operations
5. **MLS facade** — README implies MLS but it is a routing shim; actual group management proofs not enforced
6. **CSP allows unsafe-inline** — weakens XSS protection (needed for media players)
7. **Root/tamper detection** — native Android detection missing; Play Integrity only covers app integrity

### Risk Notes
- `unsafe-inline` and `unsafe-eval` in CSP script-src (media playback compatibility tradeoff)
- Mobile app minification status unconfirmed (no build.gradle in repo)
- Geofencing implementation minimal — listed as security feature but not enforced
- WebRTC and proximity mesh security properties of encrypted transport unverified
