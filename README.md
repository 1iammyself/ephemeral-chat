# 👻 Ephemeral Chat

**The Gold Standard for Private, Zero-Knowledge Communication.**

Ephemeral Chat is a cutting-edge messaging platform engineered for users who treat privacy as a fundamental right. Built on a **RAM-only, Zero-Persistence** server model, it delivers military-grade, verifiable end-to-end security without compromising on modern collaborative features.

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0"></a>
  <a href="https://github.com/cLLeB/ephemeral-chat/issues"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
  <a href="https://ephchat.kyere.me/"><img src="https://img.shields.io/badge/🌐-Live_Demo-2ea44f" alt="Live Demo"></a>
  <img src="https://img.shields.io/badge/Stack-React_|_Node_|_Rust-ff69b4" alt="Stack">
</p>

---

## 🔐 Uncompromising Security Architecture

Unlike other encrypted messengers that rely on simple symmetric keys, Ephemeral Chat utilizes a deeply layered, defense-in-depth cryptographic architecture. 

*(Note: In the codebase, you may see older variables named `MLS`. This is a legacy facade pattern. All `MLS` functions act as transparent routers to our modern `v5` and `v4` engines to maintain UI parity and prevent frontend breakage.)*

### 🛡️ The Cryptographic Core (v5)
*   **Hybrid Key Exchange (PQXDH):** Combines proven classical **X25519** Diffie-Hellman with Post-Quantum **ML-KEM-768**. Even if a quantum computer breaks standard elliptic curves tomorrow, the initial key exchange remains secure.
*   **Double Ratchet Algorithm (For 1:1 sessions):** True Signal-style ratcheting. Every single message is encrypted with a unique, non-reusable key. Provides perfect forward secrecy and break-in recovery.
*   **Megolm-style Sender Keys (For group chats):** When a room exceeds 2 users, the protocol seamlessly transitions to scalable per-sender chains, allowing efficient group encryption while maintaining forward secrecy.
*   **SubtleCrypto Fallback (v4 AES-256-GCM):** For bulk media or fallback scenarios, keys derived securely via HKDF-SHA-256 ensure 100% encrypted payloads.

### 🕵️ Anti-Traffic Analysis
*   **Traffic Padding & Chaffing:** Ephemeral Chat pads *all* messages to fixed bucket sizes (e.g., 1024 bytes, 4KB, 16KB). It injects random **timing jitter** and fires fake encrypted "chaff" messages at random intervals. ISPs or passive interceptors cannot distinguish between an empty chat room, file transfers, or text messages.
*   **Oblivious HTTP (OHTTP) [RFC 9458]:** Encapsulates HTTP payloads using **HPKE**. Traffic is routed through a third-party relay. The Gateway sees the payload but not the IP; the Relay sees the IP but not the payload.
*   **Privacy Pass [RFC 9497 / 9578]:** Validates users to prevent DDoS without tracking their connection. Uses blind VOPRFs on the **Ristretto255** curve (via `@noble/curves`), with strict server-side **DLEQ** zero-knowledge proofs before token ingestion.

### 📸 Anti-Surveillance Suite
*   **Stealth Mode / Panic Burn:** Wipe all device-local traces in milliseconds.
*   **Ghost Watermarking:** Drifting screen watermarks built to defeat optical character recognition (OCR) and bad actors capturing the screen.
*   **Privacy Blur:** Content obfuscates hardware-level screenshots and screen-recordings (via OS APIs in native apps) and blurs identically on Web when the window loses focus.

---

## ✨ Features (The Fun Stuff)

Privacy doesn’t have to mean compromising on usability:

*   **Slash Commands:** Effortlessly trigger features via chat: `/camera`, `/poll`, `/timer`, `/vibe`, and `/pulse`. 
*   **Watch Party 2.0:** Use `/media <youtube/soundcloud url>` to sync playback for the entire room instantly. Works collaboratively.
*   **Offline Proximity Mesh:** Powered by **mDNS-SD and a Native Capacitor Plugin**, allowing local device-to-device file transfers when the internet drops.
*   **Polls:** Fully synchronized client-side without permanent server storage.
*   **Rich File Transfers:** P2P file transfers powered by WebRTC for large files, gracefully falling back to heavily-encrypted Socket.IO chunking if NAT traversal fails.

---

## 🚀 The Multi-Platform Ecosystem

One codebase, everywhere:
*   **🌐 Web & PWA**: Accessible instantly from any browser with full offline caching.
*   **📱 Android Native**: Packaged via Capacitor for direct hardware integration (Bluetooth proximity, OS-level secure screen guards).
*   **💻 Desktop (Win/Mac/Linux)**: Electron-hardened shell blocking injection and sniffing at the OS memory level.

---

## 🛠️ Technology Stack

| Component | technologies |
| :--- | :--- |
| **Frontend UI** | React, Vite, Tailwind CSS, Lucide |
| **Backend & Socket** | Node.js, Express, Socket.io |
| **Cryptography** | Web Crypto API, `@noble/curves` (Ristretto255), `hpke` |
| **P2P Transport** | WebRTC, TCP/UDP bridging, mDNS |
| **Desktop Shell** | Electron |
| **Mobile Shell** | Capacitor (Java/Kotlin custom plugins) |

---

## 🚀 Quick Start (Development)

### 1. Prerequisites
- **Node.js** (v18+)
- **npm** (v9+)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/cLLeB/ephemeral-chat.git
cd ephemeral-chat


---
<div align="center">
  <i>Maintained with ❤️ by <a href="https://portfolio.kyere.me/">Caleb Kyere-Boateng</a></i>
</div>
