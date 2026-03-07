# 👻 Ephemeral Chat

**The Gold Standard for Private, Zero-Knowledge Communication.**

Ephemeral Chat is a cutting-edge messaging platform engineered for users who treat privacy as a fundamental right. Built on a **RAM-only, Zero-Persistence** model, it delivers military-grade security without compromising on the modern features you love.

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg" alt="License: Apache 2.0"></a>
  <a href="https://github.com/cLLeB/ephemeral-chat/issues"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
  <a href="https://ephchat.kyere.me/"><img src="https://img.shields.io/badge/🌐-Live_Demo-2ea44f" alt="Live Demo"></a>
  <img src="https://img.shields.io/badge/Stack-React_|_Node_|_Rust-ff69b4" alt="Stack">
</p>

---

## 🚀 The Multi-Platform Ecosystem

One codebase, everywhere. Ephemeral Chat spans the entire digital landscape:

*   **🌐 Web & PWA**: High-performance React app with full offline support.
*   **📱 Android Native**: Powered by Capacitor with hardware-level Proximity integration.
*   **💻 Desktop (Win/Mac/Linux)**: Electron-hardened shell with screenshot blocking and system tray service.
*   **🧩 Browser Extension**: Quick-access widget for Chromium-based browsers.

---

## 🔐 Privacy & Security Architecture

We don't just hide your data; we ensure it never exists in a recoverable state.

### 🛡️ Core Protections
- **E2EE (AES-GCM 256-bit)**: Encryption happens locally in your browser. Keys are stored in the URL fragment (`#`), meaning they **never** leave your device.
- **OHTTP (Oblivious HTTP)**: Masks your IP address from the server using a trusted relay, decoupling your identity from your traffic.
- **Privacy Pass**: Anonymous rate-limiting that prevents spam while preserving your total anonymity.
- **RAM-Only Persistence**: All data resides in volatile server memory. Environments are scrubbed instantly once the last user leaves.

### 📸 Anti-Surveillance Suite
- **iOS & Windows Guard**: Native-level blocks on screenshots and screen recording in the App Switcher and OS level.
- **Ghost Watermarking**: A dynamic, drifting background layer designed to defeat AI-based OCR and manual photo capture.
- **Stealth Password Entry**: A zero-footprint input system for room access—no characters, no dots, no visual feedback for onlookers.
- **Privacy Blur**: Automatic UI blurring when the app window loses focus.

---

## ✨ Standout Features

### 📺 Watch Party 2.0
Collaborate and consume media together in real-time within your secure room:
- **Twitch**: Sync live streams and VODs.
- **Figma**: Real-time collaborative design viewing.
- **Google Drive & PDF**: Seamless document review with encrypted syncing.

### 📡 Proximity Mesh (Beta)
Powered by a high-performance **Rust & QUIC core**, our proximity engine allows:
- **mDNS Discovery**: Find local peers automatically without a central server.
- **Hotspot Transfer**: High-speed, offline file sharing using TCP/UDP bridging.
- **Native Android Plugin**: Low-level hardware access for device-to-device communication.

### 🎙️ Advanced Media
- **Audio Drops**: Secure voice notes with end-to-end encryption.
- **Failover Voice Engine**: Intelligent switching between **WebRTC P2P** and **Agora RTC** based on network quality.
- **FFmpeg Processing**: Server-side normalization and conversion for universal device compatibility.

---

## 🛠️ Technology Stack

| Component | technologies |
| :--- | :--- |
| **Frontend** | React, Vite, Tailwind CSS, Lucide, Workbox (PWA) |
| **Backend** | Node.js, Express, Socket.io, Redis |
| **Security Core** | Web Crypto API, OHTTP, Privacy Pass, mlkem (Kyber) |
| **Proximity Core** | **Rust**, QUIC (Quinn), mDNS-SD, Tokio |
| **Desktop** | Electron, Electron-Store, Electron-Builder |
| **Mobile** | Capacitor, Java/Kotlin Plugins, Android Studio |
| **DevOps** | Docker, GitHub Actions, CodeQL, Render |

---

## 🏗️ Project Structure

```text
ephemeral-chat/
├── client/           # React frontend (Vite + Capacitor)
├── server/           # Express + Socket.IO + OHTTP Gateway
├── electron-app/     # Desktop implementation (Hardened shell)
├── proximity-core/   # Rust-based P2P networking engine
├── chrome-extension/ # Browser quick-access tool
├── e2ecp/            # Custom End-to-End Encryption Protocol
└── docs/             # Technical specifications and API guides
```

---

## 🚀 Quick Start (Development)

### 1. Prerequisites
- **Node.js** (v18+)
- **Rust** (Latest Stable) - for `proximity-core`
- **npm** (v9+)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/cLLeB/ephemeral-chat.git
cd ephemeral-chat

# Install root & submodule dependencies
npm install
cd client && npm install
cd ../electron-app && npm install
```

### 3. Running the Stack
```bash
# Start both Server and Client concurrently
npm run dev
```

- **Chat Interface**: `http://localhost:5173`
- **Signal Server**: `http://localhost:3001`

<div align="center">
  <i>Maintained with ❤️ by <a href="https://portfolio.kyere.me/">Caleb Kyere-Boateng</a></i>
</div>
