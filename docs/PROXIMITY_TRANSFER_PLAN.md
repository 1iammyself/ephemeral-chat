# 🚀 Proximity Transfer & Dead Drop — Full Integration Plan

> **Feature Name:** Ephemeral Drops + Proximity Transfer  
> **Platforms:** Electron (Windows/Mac/Linux), Capacitor (Android), Web (PWA)  
> **Date:** March 2026  
> **Author:** Auto-generated integration plan for Ephemeral Chat

---

## 📋 Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Feature Overview — Two Pillars](#2-feature-overview)
3. [Architecture Overview](#3-architecture-overview)
4. [Pillar 1 — Dead Drops (Ephemeral Drops)](#4-pillar-1--dead-drops-ephemeral-drops)
5. [Pillar 2 — Proximity Transfer (QUIC P2P)](#5-pillar-2--proximity-transfer-quic-p2p)
6. [Rust Core Engine](#6-rust-core-engine)
7. [Electron Integration](#7-electron-integration)
8. [Android/Capacitor Integration](#8-androidcapacitor-integration)
9. [Web/PWA Fallback](#9-webpwa-fallback)
10. [UI/UX Design](#10-uiux-design)
11. [Security Model](#11-security-model)
12. [Android Permissions & Manifest](#12-android-permissions--manifest)
13. [File Structure & New Files](#13-file-structure--new-files)
14. [Implementation Phases](#14-implementation-phases)
15. [Dependency Summary](#15-dependency-summary)
16. [Risk Assessment](#16-risk-assessment)
17. [Open Questions](#17-open-questions)

---

## 1. Executive Summary

This plan adds two interconnected features to Ephemeral Chat:

1. **Ephemeral Drops ("Dead Drops")** — Leave encrypted messages (text, images, audio, files) in a temporary vault. The creator leaves, and one or more recipients can retrieve the content using their username as an access key. After viewing, the content self-destructs. No room required.

2. **Proximity Transfer** — Ultra-fast, serverless, offline file/data transfer between nearby devices using a Rust QUIC core (Quinn). Supports LAN, Wi-Fi Direct, and hotspot modes. No internet required.

Both features integrate with the existing room system, invite flow, and share sheet — but can also operate independently.

---

## 2. Feature Overview

### 2A. Ephemeral Drops (Dead Drops)

**Problem:** Users want to leave a message for someone without both being online simultaneously. Creating a full room just to drop a single message is friction.

**Solution:** A lightweight "drop" — an encrypted payload stored temporarily on the server (or locally for proximity mode), accessible only by designated usernames, auto-deleted after viewing or TTL expiry.

| Property | Value |
|---|---|
| Content types | Text, Image, Audio, File (any) |
| Max size | 25MB per drop (server), unlimited (proximity) |
| TTL | 5 min → 24 hours (creator chooses) |
| Access control | Username-based (acts as password) |
| Encryption | AES-256-GCM, key derived from username + drop ID |
| View-once | Default ON, optional multi-view |
| Delivery method | Link, QR code, verbal code, proximity share |

### 2B. Proximity Transfer

**Problem:** File transfers through the server are limited by upload bandwidth, server costs, and require internet. Users in the same room/building want instant transfer.

**Solution:** Direct device-to-device QUIC transfer over local network, with mDNS discovery and optional hotspot creation.

| Property | Value |
|---|---|
| Protocol | QUIC (via Quinn) over UDP |
| Encryption | TLS 1.3 (built into QUIC) |
| Discovery | mDNS / UDP multicast |
| Speed | Up to Wi-Fi hardware limit (300 Mbps–1.5 Gbps) |
| Internet required | ❌ No |
| Server required | ❌ No |
| Size limit | None (hardware-limited only) |
| Platforms | Electron (native), Android (JNI), Web (fallback to WebRTC) |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Ephemeral Chat App                         │
│                                                               │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐    │
│  │   Home   │  │  Chat Room   │  │   Ephemeral Drops   │    │
│  │          │  │              │  │   (New Feature)      │    │
│  └────┬─────┘  └──────┬───────┘  └──────────┬──────────┘    │
│       │               │                      │               │
│  ┌────┴───────────────┴──────────────────────┴─────────┐    │
│  │              Proximity Transfer Layer                 │    │
│  │         (New — LAN / Hotspot / Wi-Fi Direct)         │    │
│  └─────────────────────┬────────────────────────────────┘    │
│                        │                                      │
│  ┌─────────────────────┴────────────────────────────────┐    │
│  │              Rust Core (Quinn QUIC + mDNS)            │    │
│  │                                                       │    │
│  │  ┌──────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐  │    │
│  │  │ Discovery│ │  QUIC    │ │ Crypto │ │  File    │  │    │
│  │  │  (mDNS)  │ │ Transport│ │ (TLS)  │ │ Chunking │  │    │
│  │  └──────────┘ └──────────┘ └────────┘ └──────────┘  │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  Platform Bridges:                                            │
│  ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐    │
│  │  Electron   │  │  Android    │  │   Web/PWA         │    │
│  │  (napi-rs)  │  │  (JNI/.so) │  │  (WebRTC fallback)│    │
│  └─────────────┘  └─────────────┘  └───────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Pillar 1 — Dead Drops (Ephemeral Drops)

### 4.1 How It Works

```
Creator Flow:
1. User opens "Create Drop" from Home screen or Chat Room
2. Adds content (text/image/audio/file)
3. Sets recipient username(s) — these act as access keys
4. Sets TTL (default: 1 hour)
5. Sets view-once or multi-view
6. Drop is encrypted client-side (AES-256-GCM)
7. Encrypted payload uploaded to server
8. Creator receives: Drop ID + QR code + verbal code + link
9. Creator shares the Drop ID via:
   - Copy/paste
   - QR code (nearby person scans)
   - Share sheet (WhatsApp, Telegram, Email)
   - Proximity Transfer (Bluetooth/NFC intent → opens app with Drop ID)
   - Verbal code (4 words, like room join)
10. Creator can leave — drop persists on server

Receiver Flow:
1. Receiver opens app (or clicks link / scans QR)
2. Enters Drop ID + their username
3. Server validates username is in allowed list
4. Encrypted payload downloaded
5. Client-side decryption using username-derived key
6. Content displayed (with countdown if view-once)
7. After viewing: server deletes drop (if view-once)
   OR: after TTL expires, server deletes drop regardless
```

### 4.2 Server-Side: Drop Storage

**New file:** `server/drops.js`

```
class DropManager {
  // In-memory Map (like RoomManager)
  // drops: Map<dropId, {
  //   encryptedPayload: string (base64),
  //   contentType: 'text' | 'image' | 'audio' | 'file',
  //   allowedUsernames: string[] (hashed),
  //   creatorId: string,
  //   createdAt: timestamp,
  //   expiresAt: timestamp,
  //   viewOnce: boolean,
  //   viewedBy: Set<username>,
  //   maxViews: number,  // -1 = unlimited until TTL
  //   fileName?: string,
  //   mimeType?: string,
  //   fileSize?: number
  // }>
}
```

**New API endpoints** (in `server/index.js`):

| Method | Path | Description |
|---|---|---|
| POST | `/api/drops` | Create a drop |
| GET | `/api/drops/:dropId` | Get drop metadata (requires username) |
| POST | `/api/drops/:dropId/claim` | Claim & download drop content |
| DELETE | `/api/drops/:dropId` | Creator deletes own drop |
| GET | `/api/drops/mine` | List drops I created (by creatorId) |

### 4.3 Client-Side Encryption for Drops

The encryption key is derived from: `SHA-256(dropId + username + salt)`

This means:
- Only the correct username can decrypt
- Even the server cannot read the content
- Multiple usernames = multiple encrypted copies (or shared key via all usernames concatenated)

**Simpler approach for multi-user:** Use a random AES key, encrypt the content once. Then for each allowed username, encrypt the AES key with `SHA-256(username + dropId)`. Store the wrapped keys alongside the payload. Each recipient unwraps with their own username.

### 4.4 Drop Delivery Methods

1. **Link:** `https://chat.kyere.me/drop/<dropId>` (new route)
2. **QR Code:** Encodes the link (generated client-side)
3. **Verbal Code:** 4-word mnemonic (reuse existing wordlist system)
4. **Proximity Share:** Via Android Nearby Share intent / Bluetooth share (sends the link or a tiny `.eph` auth packet file)
5. **In-Chat:** Drop a "drop card" message in an existing room

### 4.5 The `.eph` Auth Packet (for Bluetooth/NFC/AirDrop/Nearby Share)

A tiny encrypted file (< 1KB) that can be shared via ANY sharing mechanism:

```json
{
  "v": 1,
  "type": "ephemeral-drop",
  "dropId": "abc123def456",
  "server": "https://chat.kyere.me",
  "hint": "From Alice",
  "ts": 1709312400,
  "sig": "<HMAC of above fields>"
}
```

- File extension: `.eph`
- MIME type: `application/x-ephemeral-drop`
- Size: ~200 bytes
- Can be sent via: Bluetooth, Nearby Share, AirDrop, Email, any file sharing
- When received, the app opens and auto-navigates to the drop claim screen
- On Android: register as handler for `.eph` files via intent-filter
- On Electron: register as handler for `ephemeral-chat://drop/` protocol + `.eph` file association

---

## 5. Pillar 2 — Proximity Transfer (QUIC P2P)

### 5.1 Transfer Modes

| Mode | Requirement | Speed | Setup |
|---|---|---|---|
| **LAN Direct** | Same Wi-Fi | 300–1500 Mbps | Automatic |
| **Hotspot** | One device creates AP | 300–800 Mbps | Semi-auto |
| **Wi-Fi Direct** | Android P2P | 300–600 Mbps | Automatic |
| **Fallback: WebRTC** | Any network | Variable | Automatic |

### 5.2 Discovery Flow

```
1. User activates "Nearby" mode
2. App starts mDNS advertisement:
   Service: _ephchat._udp.local
   TXT record: { nickname, deviceId (short hash), version }
3. Other nearby apps running "Nearby" mode discover it
4. Devices appear in a list
5. User selects a peer
6. QUIC handshake begins
7. Short pairing code displayed on both devices (6 digits)
8. Users confirm match → trusted session
9. Transfer begins
```

### 5.3 Transfer Protocol

```
QUIC Connection (Quinn)
├── Control Stream (bidirectional)
│   ├── Handshake: { type, nickname, deviceFingerprint }
│   ├── File metadata: { name, size, type, chunkSize, totalChunks }
│   ├── Progress ACKs: { chunkIndex, received }
│   └── Complete / Cancel signals
│
├── Data Stream (unidirectional, sender → receiver)
│   ├── Chunk 0: [1-4MB raw bytes]
│   ├── Chunk 1: [1-4MB raw bytes]
│   └── ...
│
└── Optional: Reverse stream for bidirectional transfer
```

### 5.4 Multi-Peer (3+ devices)

When 3+ devices are connected:

**Star mode (simple, default):**
- Host sends to all receivers
- Host bandwidth is bottleneck
- Simpler to implement

**Swarm mode (advanced, future):**
- File split into chunks
- Peers exchange chunks between each other
- Upload load distributed
- Like mini-BitTorrent on LAN
- Complex but scales much better

**Recommendation:** Start with Star mode. Add Swarm as Phase 3+.

### 5.5 Hotspot Mode (No Shared Wi-Fi)

When devices are NOT on the same network:

**Android:**
1. One device creates Wi-Fi hotspot programmatically
   - Use `WifiManager.startLocalOnlyHotspot()` (no internet, just LAN)
   - Or guide user to Settings
2. Display SSID + password as QR code
3. Other devices scan QR → join hotspot
4. Now on same LAN → mDNS works → QUIC transfer begins

**Electron (Desktop):**
- Desktop cannot easily create hotspots programmatically
- Show instructions: "Please connect to the same Wi-Fi network"
- Or: "Ask the Android device to create a hotspot and connect to it"
- Future: Use system commands on Windows (`netsh wlan set hostednetwork`)

---

## 6. Rust Core Engine

### 6.1 Project Structure

```
proximity-core/          (new Rust workspace)
├── Cargo.toml
├── src/
│   ├── lib.rs           # Main library exports
│   ├── discovery.rs     # mDNS peer discovery
│   ├── transport.rs     # QUIC connection management (Quinn)
│   ├── transfer.rs      # File chunking, streaming, progress
│   ├── crypto.rs        # Certificate generation, fingerprints
│   ├── protocol.rs      # Control message types (serde)
│   └── ffi.rs           # C ABI exports for FFI
├── bindings/
│   ├── node/            # napi-rs bindings for Electron
│   │   ├── Cargo.toml
│   │   ├── src/lib.rs
│   │   └── package.json
│   └── android/         # JNI bindings for Capacitor
│       ├── Cargo.toml
│       └── src/lib.rs
└── tests/
    └── integration.rs
```

### 6.2 Rust Crates

| Crate | Purpose | License |
|---|---|---|
| `quinn` | QUIC transport | MIT/Apache-2.0 |
| `tokio` | Async runtime | MIT |
| `rustls` | TLS 1.3 | MIT/Apache-2.0 |
| `mdns-sd` | mDNS discovery | MIT/Apache-2.0 |
| `serde` / `serde_json` | Serialization | MIT/Apache-2.0 |
| `napi` / `napi-derive` | Node.js bindings | MIT |
| `jni` | Android JNI | MIT/Apache-2.0 |
| `rcgen` | Self-signed cert generation | MIT/Apache-2.0 |
| `ring` | Cryptographic primitives | ISC |
| `base64` | Encoding | MIT/Apache-2.0 |

### 6.3 Core API Surface

```rust
// Discovery
pub fn start_discovery(service_name: &str, nickname: &str) -> Result<DiscoveryHandle>
pub fn stop_discovery(handle: DiscoveryHandle)
pub fn get_discovered_peers() -> Vec<PeerInfo>

// Connection
pub fn connect_to_peer(peer: &PeerInfo) -> Result<ConnectionHandle>
pub fn accept_connections(port: u16) -> Result<ListenerHandle>
pub fn get_pairing_code(conn: &ConnectionHandle) -> String  // 6-digit visual confirm

// Transfer
pub fn send_file(conn: &ConnectionHandle, path: &str, progress_cb: fn(f64)) -> Result<()>
pub fn send_bytes(conn: &ConnectionHandle, data: &[u8], metadata: &Metadata) -> Result<()>
pub fn receive_file(conn: &ConnectionHandle, save_dir: &str, progress_cb: fn(f64)) -> Result<String>

// Lifecycle
pub fn shutdown()
```

---

## 7. Electron Integration

### 7.1 Approach: napi-rs Node Addon

The Rust core compiles to a native `.node` addon via `napi-rs`.

**Why napi-rs over child process:**
- Direct function calls (no IPC overhead)
- Shared memory
- Better error handling
- Easier async integration
- No separate binary to manage

### 7.2 New Files

```
electron-app/
├── native/                    # Compiled .node addon (per platform)
│   ├── proximity-core.win32-x64.node
│   ├── proximity-core.darwin-x64.node
│   └── proximity-core.linux-x64.node
├── proximity-bridge.js        # JS wrapper around native addon
└── main.js                    # Updated: new IPC handlers
```

### 7.3 IPC Channels (preload.js additions)

```javascript
// New IPC channels exposed to renderer
proximity: {
  startDiscovery: (nickname) => ipcRenderer.invoke('proximity-start-discovery', nickname),
  stopDiscovery: () => ipcRenderer.invoke('proximity-stop-discovery'),
  getPeers: () => ipcRenderer.invoke('proximity-get-peers'),
  connectToPeer: (peerId) => ipcRenderer.invoke('proximity-connect', peerId),
  sendFile: (connId, filePath) => ipcRenderer.invoke('proximity-send-file', connId, filePath),
  sendData: (connId, data, metadata) => ipcRenderer.invoke('proximity-send-data', connId, data, metadata),
  onPeerDiscovered: (cb) => ipcRenderer.on('proximity-peer-discovered', (_, peer) => cb(peer)),
  onPeerLost: (cb) => ipcRenderer.on('proximity-peer-lost', (_, peerId) => cb(peerId)),
  onTransferProgress: (cb) => ipcRenderer.on('proximity-progress', (_, progress) => cb(progress)),
  onTransferComplete: (cb) => ipcRenderer.on('proximity-complete', (_, result) => cb(result)),
  onIncomingTransfer: (cb) => ipcRenderer.on('proximity-incoming', (_, metadata) => cb(metadata)),
  acceptTransfer: (connId, savePath) => ipcRenderer.invoke('proximity-accept', connId, savePath),
  rejectTransfer: (connId) => ipcRenderer.invoke('proximity-reject', connId),
}
```

### 7.4 `.eph` File Association (Electron)

In `electron-app/package.json` build config, add:

```json
{
  "fileAssociations": [{
    "ext": "eph",
    "name": "Ephemeral Drop",
    "description": "Ephemeral Chat Drop File",
    "mimeType": "application/x-ephemeral-drop",
    "role": "Viewer"
  }]
}
```

Handle in `main.js`:
```javascript
app.on('open-file', (event, filePath) => {
  if (filePath.endsWith('.eph')) {
    // Parse .eph file → navigate to drop claim screen
  }
});
```

---

## 8. Android/Capacitor Integration

### 8.1 Approach: Capacitor Plugin + Rust .so

```
client/
├── android/
│   └── app/
│       └── src/main/
│           ├── java/me/kyere/chat/
│           │   ├── MainActivity.java      (existing)
│           │   └── ProximityPlugin.java   (NEW — Capacitor plugin)
│           ├── jniLibs/
│           │   ├── arm64-v8a/
│           │   │   └── libproximity_core.so
│           │   ├── armeabi-v7a/
│           │   │   └── libproximity_core.so
│           │   └── x86_64/
│           │       └── libproximity_core.so
│           └── AndroidManifest.xml        (updated)
```

### 8.2 Capacitor Plugin Bridge

**`ProximityPlugin.java`** — Java Capacitor plugin that:
1. Loads `libproximity_core.so` via `System.loadLibrary()`
2. Calls JNI functions (discovery, connect, transfer)
3. Bridges events back to JavaScript via Capacitor's plugin event system

**`client/src/plugins/proximity.js`** — JS side of the plugin:
```javascript
import { registerPlugin } from '@capacitor/core';
const Proximity = registerPlugin('Proximity');
export default Proximity;
```

### 8.3 Wi-Fi Hotspot (Android)

Use `WifiManager.startLocalOnlyHotspot()` (API 26+):
- Creates a local-only hotspot (no internet sharing)
- System generates SSID + password
- We display as QR code for other devices to scan
- Requires `android.permission.CHANGE_WIFI_STATE`

### 8.4 Nearby Share / Bluetooth Intent for .eph Files

Instead of building raw Bluetooth, leverage Android's built-in sharing:

```java
// Send .eph file via system share sheet (which includes Nearby Share, Bluetooth, etc.)
Intent shareIntent = new Intent(Intent.ACTION_SEND);
shareIntent.setType("application/x-ephemeral-drop");
shareIntent.putExtra(Intent.EXTRA_STREAM, ephFileUri);
startActivity(Intent.createChooser(shareIntent, "Share Drop Access"));
```

To RECEIVE .eph files, register in AndroidManifest.xml:
```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <data android:mimeType="application/x-ephemeral-drop" />
  <data android:pathPattern=".*\\.eph" />
</intent-filter>
```

This way:
- **Nearby Share** works automatically (it's just file sharing)
- **Bluetooth** file transfer works automatically
- **AirDrop** equivalent (on Samsung: Quick Share, on Google: Nearby Share)
- Any other file-sharing mechanism works
- Zero custom Bluetooth code needed!

---

## 9. Web/PWA Fallback

For the web version (no native access):

| Feature | Web Fallback |
|---|---|
| Proximity discovery | Not available — show "Use the app for nearby transfer" |
| File transfer | Use existing e2ecp WebSocket relay OR WebRTC data channels |
| Dead Drops | Full support (server-side storage + client encryption) |
| .eph file receive | Via URL: `https://chat.kyere.me/drop/<id>` |
| QR code scan | Use camera API (exists in modern browsers) |
| Share | Web Share API (already partially implemented) |

---

## 10. UI/UX Design

### 10.1 Home Screen Changes

Add a new card/button on the Home screen:

```
┌─────────────────────────────────┐
│  [+] Create Room                │  ← existing
│  [🔗] Join Room                 │  ← existing
│  [📦] Ephemeral Drop  ← NEW    │
│  [📡] Nearby Transfer ← NEW    │
│  [🏠] My Rooms                 │  ← existing
└─────────────────────────────────┘
```

### 10.2 Create Drop Screen

```
┌─────────────────────────────────┐
│  ← Back         Create Drop     │
│                                  │
│  Content Type:                   │
│  [📝 Text] [🖼️ Image] [🎤 Audio] [📎 File]  │
│                                  │
│  ┌────────────────────────────┐ │
│  │  [Enter your message...]   │ │
│  │  or drop/select file       │ │
│  └────────────────────────────┘ │
│                                  │
│  Recipients (usernames):         │
│  ┌────────────────────────────┐ │
│  │ alice, bob                 │ │
│  └────────────────────────────┘ │
│  ℹ️ Usernames act as passwords  │
│                                  │
│  Expires in:                     │
│  [5min] [30min] [1hr] [6hr] [24hr] │
│                                  │
│  ☑ View once (delete after read) │
│                                  │
│  [  Create Drop  ]              │
│                                  │
└─────────────────────────────────┘
```

### 10.3 Drop Created — Share Screen

```
┌─────────────────────────────────┐
│  ✅ Drop Created!               │
│                                  │
│  Drop ID: XKCD-HORSE-BATTERY    │
│  [Copy] [QR Code]              │
│                                  │
│  Share via:                      │
│  [WhatsApp] [Telegram] [Email]  │
│  [📡 Nearby] [Bluetooth]       │
│                                  │
│  Verbal Code: tiger lamp ocean star │
│  [Copy]                         │
│                                  │
│  ⏰ Expires in: 1 hour          │
│  👁️ View once: Yes              │
│                                  │
│  [Done]                         │
└─────────────────────────────────┘
```

### 10.4 Claim Drop Screen

```
┌─────────────────────────────────┐
│  ← Back        Claim Drop       │
│                                  │
│  Drop ID:                        │
│  ┌────────────────────────────┐ │
│  │ XKCD-HORSE-BATTERY        │ │
│  └────────────────────────────┘ │
│  — OR scan QR code —            │
│  — OR enter verbal code —       │
│                                  │
│  Your Username:                  │
│  ┌────────────────────────────┐ │
│  │ alice                      │ │
│  └────────────────────────────┘ │
│  ℹ️ Must match what the sender entered │
│                                  │
│  [  Open Drop  ]                │
│                                  │
└─────────────────────────────────┘
```

### 10.5 Nearby Transfer Screen

```
┌─────────────────────────────────┐
│  ← Back      Nearby Transfer    │
│                                  │
│  📡 Scanning for nearby devices... │
│                                  │
│  Found:                          │
│  ┌────────────────────────────┐ │
│  │ 📱 Alice's Phone    [Send] │ │
│  │ 💻 Bob's Laptop     [Send] │ │
│  │ 📱 Charlie          [Send] │ │
│  └────────────────────────────┘ │
│                                  │
│  — OR —                          │
│  Not on same Wi-Fi?              │
│  [Create Hotspot] [Scan QR]    │
│                                  │
│  ───── Transfer ─────           │
│  Drop or select files:           │
│  [📎 Choose File] [📝 Text]    │
│                                  │
│  ████████████░░░░ 67%  45 MB/s  │
│                                  │
└─────────────────────────────────┘
```

### 10.6 Integration Points with Existing UI

- **ChatRoom.jsx:** Add a "📡 Nearby" button next to the existing file transfer button
- **ShareSheet.jsx:** Add "📡 Nearby Share" and "📦 Create Drop" options
- **Home.jsx:** Add navigation cards for Drops and Nearby
- **CreateRoomModal.jsx:** Add option to "Create as Drop instead"
- **App.jsx:** New routes: `/drop/:dropId`, `/drops`, `/nearby`

---

## 11. Security Model

### 11.1 Dead Drop Encryption

```
Key Derivation:
  masterKey = random(32 bytes)
  encryptedContent = AES-256-GCM(masterKey, content)
  
  For each recipient username:
    wrappedKey[i] = AES-256-GCM(
      SHA-256(username[i] + dropId + serverSalt),
      masterKey
    )
  
  Store on server: { encryptedContent, wrappedKeys[], iv, salt }
  
  On claim:
    derivedKey = SHA-256(username + dropId + serverSalt)
    masterKey = decrypt(wrappedKey, derivedKey)
    content = decrypt(encryptedContent, masterKey)
```

**Security properties:**
- Server never sees plaintext content
- Server never sees plaintext usernames (hashed)
- Each recipient gets independent access
- Revoking one username doesn't affect others
- Time-limited by TTL (server-enforced deletion)

### 11.2 Proximity Transfer Security

```
1. Each device generates ephemeral self-signed cert (per session)
2. QUIC/TLS 1.3 handshake establishes encrypted channel
3. Both devices display 6-digit verification code
   (derived from: SHA-256(client_cert_fingerprint + server_cert_fingerprint)[:6])
4. Users verbally confirm codes match
5. After confirmation: transfer proceeds with full TLS encryption
6. Session keys are ephemeral — destroyed after disconnect
```

**Security properties:**
- End-to-end encrypted (TLS 1.3 in QUIC)
- Visual pairing code prevents MITM
- No persistent keys (ephemeral per session)
- No data touches any server
- Forward secrecy (new keys every session)

### 11.3 `.eph` File Integrity

```
{
  "v": 1,
  "type": "ephemeral-drop",
  "dropId": "abc123def456",
  "server": "https://chat.kyere.me",
  "hint": "From Alice",
  "ts": 1709312400,
  "sig": HMAC-SHA256(serverSecret, dropId + ts)
}
```

- `sig` prevents forged .eph files
- `ts` allows expiry checking
- Server validates `sig` on claim
- `.eph` file contains NO content — only a pointer

---

## 12. Android Permissions & Manifest

### New permissions needed in `AndroidManifest.xml`:

```xml
<!-- Proximity Transfer: Wi-Fi discovery and hotspot -->
<uses-permission android:name="android.permission.ACCESS_WIFI_STATE" />
<uses-permission android:name="android.permission.CHANGE_WIFI_STATE" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />  <!-- For Wi-Fi Direct -->
<uses-permission android:name="android.permission.NEARBY_WIFI_DEVICES"
    android:usesPermissionFlags="neverForLocation"
    android:minSdkVersion="33" />

<!-- mDNS / Network Service Discovery -->
<uses-permission android:name="android.permission.INTERNET" />  <!-- Already present -->
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Wi-Fi Direct -->
<uses-permission android:name="android.permission.CHANGE_NETWORK_STATE" />

<!-- .eph file handling -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="content" />
    <data android:mimeType="application/x-ephemeral-drop" />
</intent-filter>

<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:scheme="file" />
    <data android:host="*" />
    <data android:pathPattern=".*\\.eph" />
</intent-filter>
```

### Runtime Permission Flow:
1. First time user opens "Nearby" → request Location permission (for Wi-Fi Direct)
2. On Android 13+ → request `NEARBY_WIFI_DEVICES` instead
3. Show rationale: "Ephemeral Chat needs this to find nearby devices for direct transfer"

---

## 13. File Structure & New Files

### Server-side (Node.js)

```
server/
├── drops.js              NEW — DropManager class
├── drops-routes.js       NEW — Express routes for /api/drops/*
├── index.js              MODIFIED — mount drop routes + .eph generation
└── utils/
    └── eph-file.js       NEW — .eph file generation & validation
```

### Client-side (React)

```
client/src/
├── components/
│   ├── CreateDropModal.jsx       NEW — Create drop UI
│   ├── ClaimDropModal.jsx        NEW — Claim/view drop UI
│   ├── DropViewer.jsx            NEW — Display drop content (self-destructs)
│   ├── MyDrops.jsx               NEW — List of drops I created
│   ├── NearbyTransfer.jsx        NEW — Nearby peer discovery + transfer UI
│   ├── NearbyPeerList.jsx        NEW — List discovered peers
│   ├── HotspotSetup.jsx          NEW — Hotspot creation guide/QR
│   ├── QRScanner.jsx             NEW — QR code scanner component
│   ├── QRGenerator.jsx           NEW — QR code generator component
│   ├── PairingCodeModal.jsx      NEW — 6-digit verification display
│   ├── TransferProgress.jsx      NEW — File transfer progress bar
│   ├── Home.jsx                  MODIFIED — add Drop + Nearby buttons
│   ├── ShareSheet.jsx            MODIFIED — add Nearby + Drop options
│   ├── ChatRoom.jsx              MODIFIED — add Nearby button
│   └── App.jsx                   MODIFIED — new routes
├── utils/
│   ├── drops.js                  NEW — Drop encryption/decryption
│   ├── proximity.js              NEW — Proximity transfer service
│   ├── qrcode.js                 NEW — QR generation/scanning utilities
│   └── eph-file.js               NEW — .eph file parsing
├── plugins/
│   └── proximity.js              NEW — Capacitor proximity plugin bridge
└── hooks/
    ├── useNearbyPeers.js         NEW — React hook for peer discovery
    └── useProximityTransfer.js   NEW — React hook for transfer state
```

### Rust Core

```
proximity-core/                   NEW — entire Rust workspace
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── discovery.rs
│   ├── transport.rs
│   ├── transfer.rs
│   ├── crypto.rs
│   ├── protocol.rs
│   └── ffi.rs
├── bindings/
│   ├── node/                     napi-rs for Electron
│   └── android/                  JNI for Capacitor
└── tests/
```

### Electron

```
electron-app/
├── proximity-bridge.js           NEW — wrapper for native Rust addon
├── preload.js                    MODIFIED — add proximity IPC
├── main.js                       MODIFIED — add proximity IPC handlers + .eph handling
└── native/                       NEW — compiled platform binaries
```

### Android

```
client/android/app/src/main/
├── java/me/kyere/chat/
│   └── ProximityPlugin.java      NEW — Capacitor plugin
├── jniLibs/                      NEW — Rust .so files
│   ├── arm64-v8a/
│   ├── armeabi-v7a/
│   └── x86_64/
└── AndroidManifest.xml           MODIFIED — new permissions + intent-filters
```

---

## 14. Implementation Phases

### Phase 1 — Dead Drops (Server + Client) ⏱️ ~2-3 weeks

**No Rust needed yet. Pure JavaScript.**

1. Build `DropManager` server class (like `RoomManager`)
2. Add API routes for drops
3. Build client encryption/decryption for drops
4. Build `CreateDropModal` UI
5. Build `ClaimDropModal` UI
6. Build `DropViewer` with self-destruct timer
7. Add routes in `App.jsx`
8. Generate QR codes (use `qrcode` npm package)
9. Add `.eph` file generation
10. Integrate with existing `ShareSheet`
11. Add verbal code support (reuse existing wordlist system)

**Result:** Fully working Dead Drops via server, shareable via link/QR/verbal code.

### Phase 2 — .eph File Handling ⏱️ ~1 week

1. Register `.eph` file association in Electron
2. Register `.eph` intent-filter in Android Manifest
3. Handle `.eph` file opening → navigate to claim screen
4. Add Nearby Share / Bluetooth share of `.eph` files (Android system intent)
5. Test cross-platform `.eph` file sharing

**Result:** Users can share drop access via Bluetooth, Nearby Share, AirDrop, email.

### Phase 3 — Rust Core (Quinn QUIC + mDNS) ⏱️ ~3-4 weeks

1. Set up Rust workspace with Quinn + mdns-sd
2. Implement mDNS discovery (advertise + browse)
3. Implement QUIC connection with self-signed certs
4. Implement pairing code verification
5. Implement chunked file streaming
6. Implement progress reporting
7. Write integration tests
8. Cross-compile for all target platforms

**Result:** Working Rust core that can discover peers and transfer files.

### Phase 4 — Electron Integration ⏱️ ~1-2 weeks

1. Build napi-rs bindings
2. Compile for Windows/Mac/Linux
3. Add IPC handlers in `main.js`
4. Add preload exposure
5. Build `NearbyTransfer.jsx` UI
6. Test on Windows + Mac

**Result:** Desktop app can discover nearby peers and transfer files.

### Phase 5 — Android Integration ⏱️ ~2-3 weeks

1. Cross-compile Rust for ARM64/ARM/x86_64
2. Build JNI bindings
3. Create `ProximityPlugin.java` Capacitor plugin
4. Add Wi-Fi state permissions
5. Implement hotspot mode (QR code for joining)
6. Build Android-specific UI adjustments
7. Test on physical devices

**Result:** Android app can discover nearby peers and transfer files.

### Phase 6 — Polish & Advanced Features ⏱️ ~2 weeks

1. Resume support for interrupted transfers
2. Multi-file transfer (batch)
3. Transfer history (ephemeral, auto-clears)
4. Auto-detect LAN vs need-hotspot
5. Optimize QUIC parameters for LAN
6. Battery optimization (stop mDNS when not in use)
7. Swarm mode prototype (3+ peers)

---

## 15. Dependency Summary

### New Server Dependencies

```json
{
  "qrcode": "^1.5.3"  // QR code generation (for drop sharing)
}
```

### New Client Dependencies

```json
{
  "qrcode.react": "^3.1.0",        // QR code React component
  "html5-qrcode": "^2.3.8",        // QR code scanner (camera)
  "@anthropic-ai/sdk": "N/A"        // None needed — all crypto is Web Crypto API
}
```

### New Rust Dependencies (Cargo.toml)

```toml
[dependencies]
quinn = "0.11"
tokio = { version = "1", features = ["full"] }
rustls = "0.23"
mdns-sd = "0.11"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rcgen = "0.13"
ring = "0.17"
base64 = "0.22"
tracing = "0.1"

[target.'cfg(not(target_os = "android"))'.dependencies]
napi = "2"
napi-derive = "2"

[target.'cfg(target_os = "android")'.dependencies]
jni = "0.21"
```

### Build Tools Required

- **Rust toolchain** (rustup + cargo)
- **Android NDK** (for cross-compiling to ARM)
- **cargo-ndk** (Android .so builds)
- **napi-rs CLI** (Node addon builds)

---

## 16. Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Rust compilation complexity | High | Start with Phase 1 (pure JS). Rust phases can be deferred. |
| Android cross-compilation | Medium | Use cargo-ndk with well-documented steps |
| mDNS blocked on some networks | Low | Fallback to manual IP entry or QR code with IP |
| Wi-Fi Direct permission complexity | Medium | Use hotspot mode as simpler alternative |
| Large binary size from Rust | Low | Strip symbols, use LTO, ~2-4MB overhead |
| Battery drain from mDNS | Low | Only active when "Nearby" mode is open |
| QUIC blocked by firewall | Very Low | Only applies to LAN; firewalls don't typically block LAN UDP |

---

## 17. Open Questions

1. **Drop size limit?** 25MB seems reasonable for server-stored drops. Proximity transfers have no limit.

2. **Drop storage:** In-memory (like rooms) or persist to disk? For MVP, in-memory with TTL is sufficient. Redis support can be added later.

3. **Multi-platform Rust builds in CI?** You'll need GitHub Actions runners for:
   - Windows x64/ARM64
   - macOS x64/ARM64
   - Linux x64
   - Android ARM64/ARMv7/x86_64

4. **Should Nearby Transfer be available in web PWA?** Probably not — direct it to install the native app. WebRTC can serve as a degraded fallback.

5. **Should drops integrate with the existing e2ecp file transfer system?** Potentially — e2ecp already handles file relay. Drops could use e2ecp for the actual file storage/relay while adding the username-gating and TTL layer on top.

6. **Swarm mode priority?** For 2-3 people, star mode is fine. Swarm adds significant complexity. Recommend deferring to Phase 6+.

---

## 🏁 Summary

| Feature | Server Needed | Internet Needed | Native Code | Complexity |
|---|---|---|---|---|
| Dead Drops (text) | ✅ Yes | ✅ Yes | ❌ No | Low |
| Dead Drops (file) | ✅ Yes | ✅ Yes | ❌ No | Low-Medium |
| .eph File Sharing | ❌ No | ❌ No | Minimal | Low |
| Proximity Transfer | ❌ No | ❌ No | ✅ Rust | High |
| Hotspot Mode | ❌ No | ❌ No | ✅ Native | Medium |
| Swarm Mode | ❌ No | ❌ No | ✅ Rust | Very High |

**Recommended starting point:** Phase 1 (Dead Drops) — delivers immediate user value with zero native code changes. Then incrementally add proximity features.

---

*This plan was designed to integrate with the existing Ephemeral Chat architecture — its Socket.IO server, React client, Electron desktop app, Capacitor Android app, e2ecp file transfer system, room/invite flows, and security model.*
