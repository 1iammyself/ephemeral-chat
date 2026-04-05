# Baseline Inventory: Crypto & Security Infrastructure

**Date:** 2026-04-05
**Branch:** security-upgrade
**Purpose:** Snapshot of existing crypto infrastructure before security hardening work begins

---

## Executive Summary

The ephemeral-chat codebase has a substantial JavaScript-based crypto layer in `client/src/crypto/` implementing PQXDH + Double Ratchet + Megolm-style group encryption. The server has corresponding security utilities and OHTTP/Privacy Pass infrastructure. Mobile is delivered via Capacitor (WebView) and desktop via Electron — there is no native binary crypto path today. A `native-crypto/` Rust crate does not exist and must be built from scratch. Several correctness and trust-boundary issues (C1–M7) have been identified and must be resolved as part of this upgrade.

---

## Crypto Infrastructure (What Exists)

### `client/src/crypto/` — JavaScript

All files are pure JS (Web Crypto API + noble/hpke/mlkem npm packages). No WASM module is compiled from source; the WASM reference is in `secure-memory.js` for zeroization only.

| File | Lines | Role |
|---|---|---|
| `e2ee-manager.js` | 406 | Top-level orchestrator: PQXDH handshake, Double Ratchet lifecycle, Megolm group sessions |
| `double-ratchet.js` | 358 | Signal Double Ratchet; `MAX_SKIP=256` skipped-message window |
| `pqxdh.js` | 291 | Hybrid key exchange — X25519 + ML-KEM-768 combined via HKDF |
| `sender-key.js` | 189 | Megolm-style group encryption (sender key distribution + AES-GCM) |
| `hkdf.js` | 148 | HKDF-SHA-256 wrapper over Web Crypto |
| `x25519.js` | 174 | X25519 with P-256 fallback when `SubtleCrypto.deriveKey` is unavailable |
| `ml-kem.js` | 140 | ML-KEM-768 via `mlkem` npm; graceful fallback to X25519-only if unavailable |
| `ohttp.js` | 475 | RFC 9458 OHTTP client (encapsulated HTTP requests) |
| `privacy-pass.js` | 383 | Ristretto255 VOPRF — Privacy Pass token issuance/redemption |
| `traffic-padding.js` | 366 | Message padding, chaff traffic generation, jitter scheduling |
| `key-store.js` | 46 | Ephemeral in-memory key store only — no persistence |
| `secure-memory.js` | 185 | WASM-backed zeroization for key material |

**Total crypto surface (client):** ~3,161 lines of JS across 12 files.

### `server/` — Node.js

| File | Role |
|---|---|
| `auth-utils.js` | JWT signing/verification, bcrypt password hashing |
| `security.js` | Helmet config, rate limiting, input sanitization middleware |
| `drops.js` | Ephemeral drop (message) lifecycle |
| `ohttp-gateway.js` | Server-side OHTTP gateway — decapsulates client requests |
| `ohttp-relay-server.js` | OHTTP relay process |
| `privacy-pass-issuer.js` | Server-side Privacy Pass token issuance |
| `rooms.js` | Room lifecycle, key registry interactions |
| `key-registry.js` | Public key distribution endpoint |

---

## What Does NOT Exist (Needs Building)

| Missing Component | Impact |
|---|---|
| `native-crypto/` Rust crate | No native-speed, memory-safe crypto path; all crypto runs in JS heap |
| Key Transparency (KT) verification | C1: No log-backed key consistency check; TOFU only |
| CBOR parsing (complete) | C2: Incomplete CBOR codec — malformed inputs not fully rejected |
| OHTTP trust separation | C3: Gateway/relay trust boundary not enforced at the code level |
| Persistent TOFU store | C4: Trust-on-first-use is session-only; resets on reload |
| FFI pointer safety layer | C5: No bounds-checked FFI wrapper (relevant once Rust crate is added) |

---

## Platform Architecture

### Mobile: Capacitor (WebView)

- Configuration: `capacitor.config.ts` at project root
- Delivery: iOS and Android ship the web app inside a Capacitor WebView — no native Kotlin/Swift crypto modules
- Implication: `client/src/crypto/` JS code runs inside WKWebView (iOS) and the Android System WebView. Web Crypto API availability depends on the platform WebView version. ML-KEM and OHTTP fallbacks matter here.
- A future native-crypto Capacitor plugin could expose Rust via JNI/FFI, but this does not exist today.

### Desktop: Electron

- Entry point: `electron-app/main.js` (56 KB)
- Preload bridge: `electron-app/preload.js`
- Delivery: The same web bundle runs in Chromium (Electron). Node.js integration is available in the main process.
- A future native-crypto Node addon (NAPI) from the Rust crate could be loaded here, but this does not exist today.

---

## Dependencies Available (Already Installed)

| Package | Used For |
|---|---|
| `@noble/curves` | Ristretto255 (Privacy Pass), X25519 |
| `hpke` | HPKE (RFC 9180) — underlying OHTTP encapsulation |
| `mlkem` | ML-KEM-768 post-quantum KEM |
| `bcryptjs` | Password hashing (server) |
| `jsonwebtoken` | JWT auth (server) |
| `helmet` | HTTP security headers (server) |
| `express-rate-limit` | API rate limiting (server) |
| `sanitize-html` | Input sanitization (server) |
| `socket.io` | Real-time transport |

No Rust toolchain or WASM build pipeline is configured in `package.json` today.

---

## Issues to Fix

The following issues were identified in analysis. They are tracked as C-series (crypto/correctness) and M-series (miscellaneous/operational).

### C-Series: Crypto & Correctness

| ID | Issue | Affected File(s) |
|---|---|---|
| C1 | Key Transparency verification missing — key registry serves keys with no log-backed consistency proof; TOFU only | `key-registry.js`, `e2ee-manager.js` |
| C2 | CBOR parsing incomplete — malformed CBOR in OHTTP encapsulation not fully rejected; partial decode accepted | `ohttp.js`, `ohttp-gateway.js` |
| C3 | OHTTP trust separation broken — gateway and relay processes share trust context that should be isolated | `ohttp-gateway.js`, `ohttp-relay-server.js` |
| C4 | TOFU is session-only — first-seen key fingerprint not persisted; identity binding resets on every page load | `key-store.js`, `e2ee-manager.js` |
| C5 | FFI pointer safety — no bounds-checked wrapper exists for future Rust FFI calls from JS/Node | `native-crypto/` (to be created) |

### M-Series: Operational & Miscellaneous

| ID | Issue | Likely Location |
|---|---|---|
| M1 | Rate limiting not applied to key-registry endpoint | `key-registry.js`, `security.js` |
| M2 | No replay protection on OHTTP tokens | `ohttp.js`, `privacy-pass-issuer.js` |
| M3 | `MAX_SKIP=256` in Double Ratchet not justified/documented; may allow denial-of-service via skipped message accumulation | `double-ratchet.js` |
| M4 | Chaff traffic volume not configurable at runtime; hardcoded parameters | `traffic-padding.js` |
| M5 | `secure-memory.js` WASM zeroization not called on all key disposal paths | `e2ee-manager.js`, `double-ratchet.js` |
| M6 | Server JWT secret loaded from env but not validated at startup (missing presence check) | `auth-utils.js` |
| M7 | `sanitize-html` allowlist not audited — may permit tags useful for XSS in certain renderers | `security.js` |

---

## Recommendation

**Build `native-crypto/` as a new Rust crate from scratch.**

Rationale:

1. The JS crypto layer is functionally complete but runs in the JS heap with no memory isolation. Key material lives in GC-managed `ArrayBuffer` objects that cannot be reliably zeroized without the WASM shim already in `secure-memory.js`.
2. Capacitor and Electron both support native binary extensions (Capacitor plugin via JNI/FFI; Electron via Node-API). A Rust crate can target both, plus produce a WASM output for the web fallback.
3. C5 (FFI pointer safety) must be designed in from the start — a greenfield crate allows proper `unsafe` boundary design with Miri-tested wrappers.
4. Existing JS files in `client/src/crypto/` remain in place as the web/fallback path. The native crate supplements rather than replaces them, keeping the existing test surface intact.

**Suggested crate structure:**

```
native-crypto/
  Cargo.toml
  src/
    lib.rs          # public API surface + FFI exports
    pqxdh.rs        # X25519 + ML-KEM-768 hybrid KEM
    double_ratchet.rs
    sender_key.rs
    hkdf.rs
    ohttp.rs        # RFC 9458 encapsulation
    privacy_pass.rs # Ristretto255 VOPRF
    memory.rs       # secure zeroization (zeroize crate)
    ffi/
      node_api.rs   # NAPI bindings for Electron
      jni.rs        # JNI bindings for Capacitor Android
      wasm.rs       # wasm-bindgen for web fallback
```

Key Rust crates to evaluate: `x25519-dalek`, `ml-kem` (FIPS 203), `hkdf`, `sha2`, `aes-gcm`, `zeroize`, `wasm-bindgen`, `napi`, `jni`.

C1 (Key Transparency) and C4 (persistent TOFU) should be addressed in parallel as protocol-level changes independent of the Rust crate, since they require server-side log infrastructure.
