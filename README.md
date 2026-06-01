# Ephemeral Chat

**Private, zero-persistence, end-to-end encrypted communication.**

Ephemeral Chat is a messaging platform engineered for users who treat privacy as a fundamental right. Built on a **RAM-only, Zero-Persistence** server model, it delivers verifiable end-to-end security without compromising on modern collaborative features.

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0"></a>
  <a href="https://github.com/cLLeB/ephemeral-chat/issues"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
  <a href="https://ephchat.kyere.me/"><img src="https://img.shields.io/badge/🌐-Live_Demo-2ea44f" alt="Live Demo"></a>
  <img src="https://img.shields.io/badge/Stack-React_|_Node_|_Rust-ff69b4" alt="Stack">
</p>

---

## Security Architecture

Unlike messengers that rely on simple symmetric keys, Ephemeral Chat uses a layered, defense-in-depth cryptographic architecture where every layer is independently verifiable.

### The Cryptographic Core

- **Hybrid Key Exchange (PQXDH):** Combines classical **X25519** Diffie-Hellman with Post-Quantum **ML-KEM-768**. Both algorithms must be broken simultaneously to compromise the initial key exchange. Quantum-safe by default.
- **Double Ratchet (1:1 sessions):** Signal-style ratcheting. Every message uses a unique, non-reusable key. Provides perfect forward secrecy and break-in recovery — past and future messages stay safe even if one key is exposed.
- **Megolm-style Sender Keys (group chats):** When a room has more than two users, the protocol transitions to scalable per-sender chains. Efficient O(n) group encryption with forward secrecy and epoch barriers that prevent replay after member rotation.
- **AES-256-GCM (fallback / bulk):** For media and fallback paths, keys derived via HKDF-SHA-256 ensure every payload is authenticated and encrypted.
- **Key Transparency (RFC 6962 Merkle proofs):** Every public key bundle registered with the server is committed to a Merkle tree. Clients independently verify their inclusion proof before establishing any session — silent key substitution is cryptographically detectable.
- **Secure Memory (Rust/WASM):** Where the Rust/WASM module is loaded, cryptographic key material is zeroed using Rust's `zeroize` crate, which emits volatile writes that the JS JIT compiler cannot optimize away; if the module is unavailable, the code falls back to best-effort JavaScript zeroing. Intermediate DH outputs and ratchet keys are wiped from RAM after use.
- **Offline Proximity E2EE:** When the internet is unavailable, the device-to-device mesh (mDNS-SD / BLE / Wi-Fi Direct) runs its own X25519 key exchange piggybacked on the WebRTC SDP handshake. Every peer gets a unique AES-GCM-256 session key derived via HKDF — offline chat is encrypted end-to-end with no server involvement.

### Anti-Traffic Analysis

- **Timing Jitter & Cover Traffic:** Outgoing messages are sent with random timing jitter (up to 500ms on the highest tier) and decoy ("chaff") events are emitted at random intervals, making it harder for a network observer to tell when — or how often — you are actively communicating. Tier-configurable; the lowest tier disables both. (A message-size bucketing primitive also ships in the client but is not currently applied on the send path.)
- **Oblivious HTTP (OHTTP) [RFC 9458]:** When an OHTTP relay is configured, payloads are encapsulated using HPKE and routed through it — the gateway sees the payload but not the IP, and the relay sees the IP but not the payload. If no relay is configured, requests fall back to a direct connection.
- **Privacy Pass [RFC 9497/9578]:** Anti-DDoS validation without tracking. Uses blind VOPRFs on the Ristretto255 curve with DLEQ zero-knowledge proofs — the server proves it issued a token without learning which one gets redeemed.

### Anti-Surveillance & Device Protection

- **Stealth Mode / Panic Burn:** Host can trigger a cryptographic kill switch that wipes local chat state on every connected device simultaneously.
- **Ghost Watermarking:** Drifting screen watermarks defeat OCR and camera-based exfiltration.
- **Privacy Blur:** Content obscures itself the moment the window loses focus, blocking screen recordings and shoulder surfing.
- **Screenshot Blocking:** `FLAG_SECURE` is set on Android, preventing OS-level screen capture by any app.
- **Root & Tamper Detection (Android):** On launch and on every resume from background, the app runs seven independent integrity checks in native code:

  - Active Frida instrumentation (TCP localhost:27042/27043)
  - Injected libraries in `/proc/self/maps` (Frida Gadget, Xposed modules)
  - Root framework artefacts (Magisk, KernelSU, APatch, SuperSU)
  - `/system` partition mounted read-write
  - Xposed/LSPosed framework class loading
  - Root management apps installed (Magisk Manager, SuperSU, LSPosed, etc.)
  - `su` binary at nine standard root paths

  The launch check runs natively in `onCreate` before the WebView loads; the resume check is triggered from JS on `appStateChange` and runs the same native code. Any positive result → `finishAndRemoveTask()` + `Process.killProcess()`. No UI shown. All checks work correctly with sideloaded release APKs on clean devices.

### Server-Side Hardening

- Helmet.js: HSTS (1yr + preload), X-Frame-Options DENY, no-referrer, Permissions-Policy
- Strict Content Security Policy: `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`
- Rate limiting across all sensitive endpoints
- Proof-of-Work CAPTCHA (Cap.js) on room creation
- Ed25519 response signing on all key-bundle socket events — clients verify before accepting
- TOFU key pinning in IndexedDB: first-seen server key is pinned and any change on reconnect throws
- Minimal-logging policy: message content, IP addresses, and user identifiers are never logged or written to disk (operational diagnostics such as boot/relay status may still be printed)

### A Note on These Claims

These protections are implemented as defense-in-depth on a best-effort basis. No software can guarantee absolute security or anonymity, and the availability of any individual protection depends on the platform, device, configuration, and runtime environment (for example, OHTTP requires a configured relay; secure-memory wiping requires the WASM module; root detection and screenshot blocking are Android-only). The software is provided "as is", without warranty of any kind, under the Apache-2.0 license.

---

## Features

Privacy does not mean compromising on usability:

- **Slash Commands:** `/camera`, `/poll`, `/timer`, `/vibe`, `/pulse`, `/ice`, `/media`
- **Watch Party:** `/media <url>` syncs video playback across all room members instantly
- **Offline Proximity Mesh:** mDNS-SD + BLE + Wi-Fi Direct device discovery with full E2EE — works when the internet is down
- **Polls:** Fully synchronized client-side, no permanent server storage
- **Rich File Transfers:** WebRTC P2P for large files, falling back to encrypted Socket.IO chunking

---

## Multi-Platform

| Platform              | Shell     | Notes                                                      |
| --------------------- | --------- | ---------------------------------------------------------- |
| Android / iOS         | Capacitor | Native plugins for biometric auth, proximity, Keystore TEE |
| Windows / Mac / Linux | Electron  | Hardened shell, sandboxed renderer, screen capture blocked |
| Windows / Mac / Linux | Tauri     | Lightweight Rust shell, bundles built client assets        |

---

## Technology Stack

| Component               | Technologies                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Frontend**      | React, Vite, Tailwind CSS, Lucide                                                                            |
| **Backend**       | Node.js, Express, Socket.IO                                                                                  |
| **Cryptography**  | Web Crypto API (SubtleCrypto),`@noble/curves` (Ristretto255), `hpke`, `mlkem`, Rust/WASM (`zeroize`) |
| **P2P Transport** | WebRTC, mDNS-SD, BLE, Wi-Fi Direct                                                                           |
| **Desktop Shell** | Electron, Tauri (Rust)                                                                                       |
| **Mobile Shell**  | Capacitor (Java custom plugins)                                                                              |

---

## Quick Start (Development)

### Prerequisites

- **Node.js** v18+, **npm** v9+
- **Rust** + `cargo-tauri` — Tauri desktop builds only
- **Android Studio** — Capacitor Android builds only

### Installation

```bash
git clone https://github.com/cLLeB/ephemeral-chat.git
cd ephemeral-chat
npm install
cd client && npm install
cd ../server && npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the required values (see comments in the file).

---

### Desktop — Electron

Electron wraps the hosted app at `https://chat.kyere.me`. For local dev, run the server and client first, then point Electron at them:

```bash
# Terminal 1 — server
cd server && npm start

# Terminal 2 — client dev server (http://localhost:5173)
cd client && npm run dev

# Terminal 3 — Electron shell
cd electron-app
npm install
CHAT_URL=http://localhost:5173 npm run dev

# Production build (loads https://chat.kyere.me)
npm run build:win    # Windows installer + portable + MSIX
npm run build:mac    # macOS DMG
npm run build:linux  # AppImage + deb
```

---

### Desktop — Tauri

Tauri bundles the built client assets directly into the binary.

```bash
# 1. Build the web frontend
cd client && npm run build

# 2. Build the Tauri app
cd ../tauri-app
npm run build        # release build
npm run build:debug  # debug build
```

Output is in `tauri-app/src-tauri/target/release/bundle/`.

---

### Mobile — Android (Capacitor)

```bash
# 1. Build the web frontend
cd client && npm run build

# 2. Sync assets into the Android project
npx cap sync android

# 3. Open in Android Studio to build / run on device
npx cap open android
```

> iOS follows the same steps using `npx cap sync ios` and `npx cap open ios`.

---

<div align="center">
  <i>Maintained by <a href="https://portfolio.kyere.me/">cLLeB</a></i>
</div>
