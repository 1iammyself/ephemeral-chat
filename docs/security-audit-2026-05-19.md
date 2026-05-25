# Security Feature Audit — Ephemeral Chat

**Audit date:** 2026-05-19
**Remediation completed:** 2026-05-25
**Scope:** Full codebase — client, server, configs
**Purpose:** Baseline inventory + systematic hardening tracker

---

> **REMEDIATION STATUS (2026-05-25):** All critical gaps from the original audit have been resolved. See the tracker at the bottom of each section and the summary in Section 5.

---

## SECTION 1: FULLY IMPLEMENTED (production-grade)

### End-to-End Encryption

| Feature | Files | Notes |
|---|---|---|
| **PQXDH** (Post-Quantum X3DH) | `client/src/crypto/pqxdh.js`, `ml-kem.js`, `x25519.js` | Hybrid X25519 + ML-KEM-768; both must be broken to compromise session |
| **Double Ratchet** (1:1) | `client/src/crypto/double-ratchet.js` | Per-message keys, forward secrecy + break-in recovery, max 256 skipped keys |
| **Megolm-style Sender Keys** (group) | `client/src/crypto/sender-key.js` | Efficient O(n) group encryption, epoch barriers prevent replay post-rotation |
| **HKDF-SHA-256 key derivation** | `client/src/crypto/hkdf.js` | RFC 5869, extract-then-expand |
| **AES-256-GCM** symmetric encryption | `client/src/utils/aesEncryption.js`, `crypto/e2ee-manager.js` | SubtleCrypto-backed, per-message random IVs, authenticated |
| **Key Transparency** (RFC 6962) | `server/key-registry.js`, `client/src/crypto/key-transparency-client.js`, `client/src/crypto/e2ee-manager.js` | **(Added 2026-05-25)** RFC 6962 Merkle tree on server; client verifies inclusion proof before accepting any peer key bundle; dual TOFU store (IndexedDB + KTTOFUStore) |
| **Secure key zeroization** (WASM) | `client/src/crypto/secure-zero.js`, `pkg/secure-memory/` | **(Added 2026-05-25)** Rust `zeroize` crate compiled to WASM; volatile writes prevent JIT optimization; wraps all `.fill(0)` calls in double-ratchet, sender-key, key-store, pqxdh |
| **Offline Proximity E2EE** | `client/src/nearby/offline-p2p-manager.js` | **(Added 2026-05-25)** X25519 ECDH piggybacked on WebRTC SDP handshake; AES-GCM-256 per-peer key via HKDF; `encryptForPeer` / `decryptFromPeer` API; `p2p-key-ready` event |

### Authentication & Authorization

| Feature | Files | Notes |
|---|---|---|
| **bcryptjs** password hashing | `server/auth-utils.js`, `server/rooms.js` | saltRounds=12, timing-safe comparison |
| **JWT** (WebAuthn sessions) | `server/webauthn.js` | HS256, 8-hour expiry, requires WEBAUTHN_JWT_SECRET |
| **WebAuthn / FIDO2 / Passkeys** | `server/webauthn.js` | P-256/ES256, 5-minute challenge TTL, verifies user-present + user-verified flags |
| **Session management + inactivity** | `server/security.js` | 60-min timeout, 5-min mobile grace, 10-attempt lockout → 15-min ban |
| **HMAC-SHA-256 room code checksums** | `server/security.js`, `server/auth-utils.js` | 128-bit, timing-safe, no plaintext stored |
| **Challenge-response auth** | `server/auth-utils.js` | 32-byte crypto.randomBytes challenges |
| **Signed invite tokens** | `server/auth-utils.js` | HMAC-SHA-256, base64url, 24h expiry, random nonce |
| **Room verification tokens** | `server/auth-utils.js` | HMAC-SHA256, 5-minute max age, timing-safe verify |

### Traffic Analysis Resistance

| Feature | Files | Notes |
|---|---|---|
| **Traffic padding** | `client/src/crypto/traffic-padding.js`, `server/traffic-padding.js` | Fixed bucket sizes: 256B/1KB/1.5KB/4KB/16KB/64KB |
| **Chaff messages** | same files | Random encrypted dummy packets every 2–30s; server silently drops (FLAG_CHAFF 0x01) |
| **Timing jitter** | `client/src/crypto/traffic-padding.js` | 50–500ms random delay before sending |

### Metadata Privacy

| Feature | Files | Notes |
|---|---|---|
| **OHTTP** (RFC 9458) | `server/ohttp-gateway.js`, `server/ohttp-relay-server.js`, `client/src/crypto/ohttp.js` | HPKE (DHKEM X25519, HKDF-SHA256, AES-256-GCM); separates who (relay) from what (gateway); 24h key rotation |
| **Privacy Pass** (RFC 9497/9578) | `server/privacy-pass-issuer.js`, `client/src/crypto/privacy-pass.js` | Ristretto255 VOPRF, DLEQ zero-knowledge proof |

### Server-Side Hardening

| Feature | Files | Notes |
|---|---|---|
| **Helmet.js** security headers | `server/index.js` | HSTS 1yr+preload, X-Frame-Options DENY, nosniff, no-referrer, Permissions-Policy |
| **Content Security Policy** | `server/index.js` | default-src 'self', object-src 'none', base-uri 'none', frame-ancestors 'self' |
| **CORS whitelist** | `server/index.js` | Configurable via ALLOWED_ORIGINS env var |
| **Rate limiting** | `server/index.js`, `server/drops-routes.js`, `server/privacy-pass-issuer.js` | Creator token: 100/15min; drops: 10 create/30 claim per 10min; socket: 30 msg/60s |
| **Input validation & HTML sanitization** | `server/utils.js`, `server/auth-utils.js` | sanitize-html (no tags), regex for room codes/nicknames, 500-char limits |
| **Timing-safe comparisons** | `server/security.js`, `server/auth-utils.js` | crypto.timingSafeEqual throughout |
| **Zero log policy** | `server/utils.js` | All output suppressed in production |
| **Proof-of-Work CAPTCHA** (Cap.js) | `server/index.js` | Anti-DDoS for room creation; requires CAP_SECRET |
| **Trust proxy** | `server/index.js` | Correct client IP from X-Forwarded-For for rate limiting |

### Signing & MITM Prevention

| Feature | Files | Notes |
|---|---|---|
| **Ed25519 response signing** | `server/middleware/response-signing.js`, `client/src/crypto/server-signing.js` | Signs key-bundle socket events; client verifies before accepting |
| **TOFU key pinning** (IndexedDB) | `client/src/crypto/server-signing.js` | First-seen server key pinned; mismatch on reload = hard error |
| **Key Transparency dual TOFU** | `client/src/crypto/server-signing.js`, `client/src/crypto/key-transparency-client.js` | **(Added 2026-05-25)** Ed25519 raw key also pinned via KTTOFUStore; belt-and-suspenders against MITM |

### Mobile / Platform Security

| Feature | Files | Notes |
|---|---|---|
| **Root & tamper detection** | `client/android/app/src/main/java/me/kyere/chat/RootTamperCheck.java`, `RootDetectionPlugin.java`, `client/src/hooks/useRootDetection.js` | **(Added 2026-05-25)** 7 independent checks; any positive = `finishAndRemoveTask()` + `killProcess()`; runs at launch (before WebView) and on every resume. Works with sideloaded release APKs. Play Integrity removed (see below). |
| **Android Keystore plugin** | `client/src/capacitor/security-plugins.js`, `client/src/crypto/key-store.js` | AES-256-GCM in TEE/StrongBox; private keys never exposed to JS |
| **Biometric lock** | `client/android/app/src/main/java/me/kyere/chat/BiometricPlugin.java` | BiometricPrompt; re-prompts on every resume |
| **Screenshot blocking** | `client/android/app/src/main/java/me/kyere/chat/MainActivity.java` | `FLAG_SECURE` set in `onCreate` |

### Data Retention & Ephemeral Properties

| Feature | Files | Notes |
|---|---|---|
| **Message TTL** | `server/index.js`, `server/rooms.js` | 30s/1m/5m/30m/1h/none; GC every 60s |
| **Room expiry** | `server/rooms.js` | 10-min inactivity default; 2-hour persistent; cleanup every 5 min |
| **Key material zeroization** | `client/src/crypto/secure-zero.js` (WASM) | **(Updated 2026-05-25)** All `.fill(0)` replaced with `secureZero()` (Rust volatile writes + JS fill fallback); covers double-ratchet, sender-key, key-store, pqxdh intermediate values |

### Replay & Ordering Protection

| Feature | Files | Notes |
|---|---|---|
| **Message sequence counters** | `client/src/crypto/double-ratchet.js`, `client/src/crypto/sender-key.js` | sendCounter, recvCounter, prevSendCounter; out-of-order reconstruction |
| **Epoch barriers** | `client/src/crypto/sender-key.js` | Prevents decryption of pre-rotation messages after member leave |

---

## SECTION 2: PARTIAL / IN PROGRESS

| Feature | Files | Gap | Status |
|---|---|---|---|
| **Ed25519 signing — full coverage** | `server/middleware/response-signing.js` | Currently covers key-bundle events only; design calls for all HTTP responses | Open |
| **Relay HMAC auth** | `server/config/relay-auth.js` | Relay-to-gateway auth designed; not enforced | Open |
| **WebRTC P2P security** | `client/src/webrtc.js`, `server/ice-signaling.js` | Signaling + ICE relay in place; DTLS-SRTP property not independently verified | Open |
| **Geofencing enforcement** | `client/src/hooks/useGeofence.js` | Hook exists; server does not enforce geofence bounds | Open |

---

## SECTION 3: RESOLVED / REMOVED

| Item | Original finding | Resolution |
|---|---|---|
| **Key Transparency (Merkle proofs)** | Structure present; not operational | **Fixed 2026-05-25** — RFC 6962 tree in `key-registry.js`; proof verified in `e2ee-manager.js` |
| **Secure memory WASM** | Binary exists; not wired | **Fixed 2026-05-25** — `secure-zero.js` wrapper; all key zeroization now uses volatile writes |
| **Offline proximity mesh E2EE** | Discovery present; no encryption | **Fixed 2026-05-25** — X25519 + AES-GCM-256 per-peer in `offline-p2p-manager.js` |
| **Root/tamper detection (native)** | Play Integrity only; native checks absent | **Fixed 2026-05-25** — `RootTamperCheck.java` (7 checks); hard-block + resume re-check |
| **Play Integrity** | Flagged sideloaded APKs as untrusted regardless of device state | **Removed 2026-05-25** — replaced by superior native checks that correctly handle sideloaded release APKs |
| **MLS facade dead code** | `mlsEncryption.js` (openmls-wasm) was dead code; real path is PQXDH+DR | **Removed 2026-05-25** — file deleted; real encryption path documented |
| **MLS naming confusion** | README implied MLS RFC 9420; actual protocol is PQXDH+DR | **Clarified** — README now accurately describes the actual protocol |

---

## SECTION 4: MENTIONED IN DOCS, NOT YET IMPLEMENTED

| Feature | Where mentioned | Status |
|---|---|---|
| **Panic burn / wipe** | README, USER_GUIDE | UI trigger exists; cryptographic kill-switch to all devices not confirmed implemented end-to-end |
| **Ghost watermarking** | README, USER_GUIDE | Listed as feature; implementation not verified in current codebase review |
| **Privacy blur** | README, USER_GUIDE | Listed as feature; implementation not verified |
| **Certificate pinning** | Design specs (deleted) | No OkHttp/NSURLSession pinning found; TLS relies on system CA + HSTS |
| **Encrypted audit logging** | Design specs (deleted) | No implementation found |
| **Service Worker media audit proxy** | Design specs (deleted) | No implementation found |

---

## SECTION 5: SECURITY PACKAGES

| Package | Version | Purpose |
|---|---|---|
| helmet | ^8.1.0 | Security headers |
| express-rate-limit | ^8.2.1 | Rate limiting |
| bcryptjs | ^2.4.3 | Password hashing |
| jsonwebtoken | ^9.0.3 | JWT for WebAuthn sessions |
| sanitize-html | ^2.17.0 | XSS prevention |
| hpke | ^1.0.4 | OHTTP encryption (RFC 9180) |
| mlkem | ^2.5.0 | ML-KEM-768 post-quantum KEM |
| @noble/curves | ^1.8.1 | Ristretto255 for Privacy Pass |
| @cap.js/server | ^4.0.5 | Proof-of-work CAPTCHA |

*Removed since audit:* `cbor` (was only used by device-attestation-verifier.js, now deleted)

---

## SECTION 6: ASSESSMENT

### Strengths (post-remediation)

- Industrial-grade hybrid cryptography: PQXDH + Double Ratchet + Sender Keys — quantum-resistant by default
- Key Transparency: Merkle inclusion proofs make silent key substitution cryptographically detectable
- Secure key erasure: Rust volatile writes via WASM — JIT-safe, verified zeroization on all intermediate key material
- Full-stack traffic analysis resistance: OHTTP + Privacy Pass + padding + chaff + timing jitter
- Native root detection: 7 independent checks (Frida ports, memory maps, root paths, Xposed, packages, su binary); hard-block before WebView loads; re-checks on every resume
- Offline E2EE: encrypted proximity mesh requires no server, no internet
- Zero-persistence server: RAM-only, no disk writes, zero log policy
- FIDO2/WebAuthn passwordless auth
- Comprehensive server hardening: Helmet, CSP, rate limiting, PoW CAPTCHA, Ed25519 signing

### Remaining open items (priority order)

1. **Panic burn / watermarking / privacy blur** — marketed in README and USER_GUIDE; implementation status unverified; should be confirmed or removed from docs if not actually implemented
2. **Ed25519 signing coverage** — currently only key-bundle socket events; ideal would be all sensitive HTTP responses
3. **Certificate pinning** — no native TLS pinning; a compromised CA can MITM the TLS layer (OHTTP partially mitigates this)
4. **WebRTC transport verification** — DTLS-SRTP is standard for WebRTC but worth an independent audit of the ICE/signaling path
5. **Geofencing enforcement** — server does not validate geofence bounds; client-only enforcement is bypassable

### Risk notes

- `unsafe-inline` and `unsafe-eval` remain in CSP `script-src` (media playback compatibility tradeoff — acceptable for this use case)
- Geofencing is a UI feature, not a security control, and should not be presented as one
- Root detection covers Android only; iOS has no equivalent native checks beyond App Attest (not implemented)
