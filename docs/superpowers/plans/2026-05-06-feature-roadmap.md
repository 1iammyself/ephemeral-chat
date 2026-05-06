# Ephemeral Chat — Feature Roadmap
**Date:** 2026-05-06  
**Phases:** Easy → Moderate → Hard → Extremely Hard  
**Total features:** 23

---

## PHASE 1 — EASY
*Target: hours per feature, pure frontend or trivial socket events, no data-model surgery*

---

### F-E1: Confetti Bombs
**What:** Any user triggers a fullscreen confetti explosion visible to all room members simultaneously.  
**Slash command:** `/confetti` or a dedicated toolbar button.

**Implementation:**
- Install `canvas-confetti` (npm, ~3kb gzipped).
- New file: `src/components/ConfettiBomb.jsx` — mounts a full-viewport canvas overlay, fires confetti, unmounts after 3 seconds.
- Socket event (client → server → all clients): `confetti-bomb { roomCode, senderNickname }`.
- Server: pure broadcast in `server/index.js`, no state stored.
- Wire into `App.jsx`: listen for `confetti-bomb`, call `ConfettiBomb.trigger()`.

**Files touched:** `src/components/ConfettiBomb.jsx` (new), `src/App.jsx`, `server/index.js`  
**Effort:** ~2–3 hours

---

### F-E2: Reactions with Physics
**What:** Click a reaction button on any message; the emoji launches across the screen with real physics (gravity, bounce, spin) visible to all room members.

**Implementation:**
- Use CSS keyframe animations with randomised trajectory (no heavy physics lib needed — pure CSS transform + random angle/speed).
- New file: `src/components/ReactionOverlay.jsx` — fixed-position overlay, renders flying emoji sprites, removes them after animation ends.
- Socket event: `message-reaction { messageId, emoji, fromNickname }` → broadcast to room.
- Each message renders a small reaction tray (👍❤️😂🔥) below it. Existing reaction count shown as a badge.
- Wire into `src/components/MessageList.jsx`.

**Files touched:** `src/components/ReactionOverlay.jsx` (new), `src/components/MessageList.jsx`, `src/App.jsx`, `server/index.js`  
**Effort:** ~4–6 hours

---

### F-E3: Typing Sound FX
**What:** Optional subtle audio feedback — a soft pop/tick plays locally when a new message arrives from another user. Togglable per-device.

**Implementation:**
- New file: `src/hooks/useSoundFX.js` — uses Web Audio API to synthesise a short 80ms click sound (no audio file needed, pure oscillator).
- Setting persisted in `localStorage` key `soundFX_enabled` (default: off).
- Settings toggle added to room toolbar (speaker icon).
- Hook fires on each incoming `new-message` event when the sender is not the local user.
- No server changes needed.

**Files touched:** `src/hooks/useSoundFX.js` (new), `src/App.jsx`, room toolbar UI  
**Effort:** ~2–3 hours

---

### F-E4: Read Receipts
**What:** Small avatar initials appear under each message to indicate who has seen it. Disappear when the room closes.

**Implementation:**
- Use `IntersectionObserver` in `MessageList.jsx` — when a message scrolls into view, emit `message-seen { messageId, nickname }`.
- Server broadcasts `message-seen` to all room members (no persistence).
- Each message tracks a `seenBy: Set<nickname>` in local React state.
- Render up to 3 small coloured initials bubbles below each message; overflow shown as "+N".
- E2EE scope: this is metadata only (seen acknowledgement), not encrypted content — acceptable.

**Files touched:** `src/components/MessageList.jsx`, `src/App.jsx`, `server/index.js`  
**Effort:** ~4–6 hours

---

### F-E5: Message Pinning
**What:** The host can pin any message to a persistent banner at the top of the chat, visible to all. One pinned message at a time.

**Implementation:**
- Long-press (mobile) / right-click (desktop) on a message shows a context menu with "Pin" option — visible to host only (use existing `roles.js`).
- Socket event: `message-pinned { messageId, text, senderNickname }` → broadcast to room.
- Server stores `room.pinnedMessage` in room state, sends to new joiners.
- New file: `src/components/PinnedMessageBanner.jsx` — dismissible top banner showing pinned text with "📌" icon.
- "Unpin" emits `message-unpinned {}` and clears the banner.

**Files touched:** `src/components/PinnedMessageBanner.jsx` (new), `src/components/MessageList.jsx`, `src/App.jsx`, `server/rooms.js`, `server/index.js`  
**Effort:** ~4–6 hours

---

### F-E6: Timed Self-Destruct per Message
**What:** When composing a message, the sender can set an individual countdown timer (5s / 30s / 1m / 5m / custom). The message auto-deletes from all screens when the timer expires.

**Implementation:**
- `TimerModal.jsx` already exists — reuse or extend it for message-level timer selection.
- Message payload gains an optional `expiresAt: ISO timestamp` field.
- `MessageList.jsx` tracks a countdown per message and removes it from local state on expiry.
- Socket event: `message-expired { messageId }` — sender's client broadcasts when timer fires; all peers purge the message.
- Visual: a small circular countdown ring animates around the message timestamp area.
- The message is never stored server-side (room is RAM-only), so "deletion" is purely client-side broadcast.

**Files touched:** `src/components/MessageList.jsx`, `src/components/MessageComposer.jsx` (or equivalent input area), `src/components/TimerModal.jsx`, `src/App.jsx`, `server/index.js`  
**Effort:** ~4–6 hours

---

## PHASE 2 — MODERATE
*Target: 1–2 days per feature, involves new subsystems, data model changes, or coordination logic*

---

### F-M1: Message Search
**What:** A search bar in the room header lets users search through all messages in the current session. Fully client-side — no query ever reaches the server.

**Implementation:**
- New file: `src/hooks/useMessageSearch.js` — takes the decrypted message array from local state, filters by substring match (case-insensitive), returns matching messageIds with highlighted ranges.
- New file: `src/components/MessageSearch.jsx` — a slide-down search bar in the room header (toggle via 🔍 icon).
- `MessageList.jsx` receives `highlightedIds` prop; matching messages show yellow highlight on the matching text fragment using a `<mark>` span.
- Navigation: up/down arrows cycle through matches, auto-scrolls to the focused result.
- No server changes.

**Files touched:** `src/hooks/useMessageSearch.js` (new), `src/components/MessageSearch.jsx` (new), `src/components/MessageList.jsx`, room header component  
**Effort:** ~1 day

---

### F-M2: Scheduled Rooms
**What:** When creating a room, the host can set a future "open time". The room link is immediately shareable but the room is locked until the scheduled time. All invitees see a live countdown.

**Implementation:**
- `CreateRoomModal.jsx` gains a datetime picker — "Schedule for later" toggle.
- Room payload to server: `{ ..., scheduledFor: ISO timestamp }`.
- Server: room state gains `scheduledFor`. Join attempts before `scheduledFor` get a `room-not-open-yet { opensAt }` response instead of `room-joined`.
- Server fires a `room-opening` broadcast to all connected waiters exactly at `scheduledFor` using `setTimeout`.
- New file: `src/components/RoomCountdown.jsx` — shows "Room opens in HH:MM:SS", renders in place of the chat UI until the room opens, then transitions in.
- Invite link mechanics unchanged (same `/room/:code` route).

**Files touched:** `src/components/CreateRoomModal.jsx`, `src/components/RoomCountdown.jsx` (new), `src/App.jsx`, `server/rooms.js`, `server/index.js`  
**Effort:** ~1–2 days

---

### F-M3: Room Forking
**What:** The host selects a subset of current participants from the user list, clicks "Fork Room", and a new private room is instantly created and pushed to those members only.

**Implementation:**
- `UserList.jsx` gains multi-select checkboxes in host view.
- "Fork Room" button appears when 1+ users are selected.
- Socket event: `fork-room { targetSocketIds: [] }` → server creates a new room using existing room-creation logic, generates a new `roomCode`, adds selected sockets + host to it.
- Server emits `room-fork-invite { newRoomCode, fromNickname }` to each target socket.
- Client: on receiving `room-fork-invite`, show a toast with "Join forked room?" button that opens the new room.
- The forked room inherits the password policy of the parent (or generates a new one-time link).

**Files touched:** `src/components/UserList.jsx`, `src/App.jsx`, `server/rooms.js`, `server/index.js`  
**Effort:** ~1 day

---

### F-M4: Message Threads
**What:** Reply to any message to start an inline thread. Thread messages collapse under the parent; a "N replies" button expands them in a side panel.

**Note:** `ThreadView.jsx` already exists — audit it first; this may be partially scaffolded.

**Implementation:**
- Message data model gains `parentId?: string` field (optional, for thread replies).
- `MessageList.jsx`: messages with no `parentId` render normally. Messages with `parentId` are grouped under their parent.
- Thread reply UI: swipe-left / long-press → "Reply in thread" action.
- `ThreadView.jsx`: side panel (slide-in from right) showing the parent message + all `parentId` replies in chronological order.
- Socket event: `thread-reply { parentId, content, ... }` — same E2EE flow as regular messages; server broadcasts to all room members.
- Thread count badge shown on parent message: "3 replies".

**Files touched:** `src/components/ThreadView.jsx` (extend), `src/components/MessageList.jsx`, `src/App.jsx`, `server/index.js`  
**Effort:** ~2 days

---

### F-M5: Hot Seat
**What:** The host puts one participant in the "Hot Seat". All other members submit anonymous questions to a queue. The spotlighted person sees questions appear one at a time and answers publicly.

**Implementation:**
- New file: `src/components/HotSeat.jsx` — modal/overlay with two views:
  - **Audience view:** text input to submit a question anonymously, read-only queue of past questions.
  - **Hot seat view:** large display of the current question, "Next question" button.
- Socket events:
  - `hotSeat-start { targetNickname }` → host activates, server stores `room.hotSeatTarget`.
  - `hotSeat-question { text }` → server strips socket identity and broadcasts `hotSeat-question-received { text }` to all (anonymisation happens server-side).
  - `hotSeat-next {}` → hot-seat user requests next question.
  - `hotSeat-end {}` → host deactivates.
- Server: maintains a `questionQueue: string[]` per room while hot seat is active.
- Room header shows "🎤 [Nickname] is in the Hot Seat!" banner to all members.

**Files touched:** `src/components/HotSeat.jsx` (new), `src/App.jsx`, `server/rooms.js`, `server/index.js`  
**Effort:** ~1.5 days

---

### F-M6: Live Typing Preview
**What:** While you type, other participants see a live ghost-text preview of your message updating in near real-time (like Google Docs cursors). Opt-in per user.

**Implementation:**
- Message composer debounces keystroke broadcasts every 200ms.
- Socket event: `typing-preview { partial: string, nickname }` → server broadcasts to room (not stored).
- New file: `src/components/TypingPreview.jsx` — shows a dim italic preview bubble labelled with the sender's nickname, below the typing indicator. Disappears 2s after last update or when the message is sent.
- Privacy: opt-in toggle in room settings (`previewEnabled` localStorage key). If off, no `typing-preview` events are emitted.
- Each sender's preview overwrites the previous one (only one ghost bubble per sender at a time).

**Files touched:** `src/components/TypingPreview.jsx` (new), message composer component, `src/App.jsx`, `server/index.js`  
**Effort:** ~1.5 days

---

### F-M7: Collaborative Playlist
**What:** Any room member can add a YouTube or audio URL to a shared queue. The queue plays in order simultaneously for everyone; a sync master keeps all clients within 2 seconds of each other.

**Implementation:**
- New file: `src/components/CollabPlaylist.jsx` — slide-up drawer showing queue list, add URL input, now-playing display.
- Socket events:
  - `playlist-add { url, addedBy }` → server appends to `room.playlist[]`.
  - `playlist-next {}` → host/sync master advances; server broadcasts `playlist-playing { url, startedAt: timestamp }`.
  - `playlist-sync { url, timestamp, serverTime }` → periodic broadcast every 5s so latecomers catch up.
- Client sync: on `playlist-playing`, all clients seek the YouTube iframe (or `<audio>`) to `(Date.now() - startedAt) / 1000` seconds.
- Reuse `SharedMediaPlayer.jsx` for the YouTube iframe embed (already exists).
- `NowPlayingBadge.jsx` already exists — extend it to show playlist position "2/5".

**Files touched:** `src/components/CollabPlaylist.jsx` (new), `src/components/SharedMediaPlayer.jsx`, `src/components/NowPlayingBadge.jsx`, `src/App.jsx`, `server/rooms.js`, `server/index.js`  
**Effort:** ~2 days

---

## PHASE 3 — HARD
*Target: 1–2 weeks per feature, new crypto subsystems, native APIs, or complex synchronisation*

---

### F-H1: Steganographic Messages
**What:** A user embeds a hidden text message invisibly inside an ordinary image. The image looks completely normal. The recipient extracts the secret using a shared passphrase.

**Implementation:**
- New file: `src/crypto/steganography.js` — implements LSB (Least Significant Bit) steganography on PNG images using the Canvas API.
  - `embed(imageBlob, secretText, passphrase) → imageBlob` — AES-encrypts the text with the passphrase, then encodes the ciphertext bytes into the alpha/blue channel LSBs of the carrier image.
  - `extract(imageBlob, passphrase) → secretText | null` — reads LSBs, decrypts with passphrase.
- New file: `src/components/StegoModal.jsx` — two-tab UI: "Hide message" (pick carrier image, type secret, set passphrase) and "Extract" (pick image, enter passphrase).
- The output image is sent through the normal E2EE image channel — to any outside observer it is an innocent photo.
- Passphrase is shared out-of-band (not transmitted by the app).
- Constraint: only works on PNG (JPEG re-compression destroys LSBs). Automatically convert JPEG carriers to PNG before embedding.

**Files touched:** `src/crypto/steganography.js` (new), `src/components/StegoModal.jsx` (new), `src/components/CameraModal.jsx` (add "Send steganographic" option)  
**Effort:** ~3–4 days

---

### F-H2: Synchronized Music Listening
**What:** Share a music source (YouTube audio, SoundCloud, or uploaded audio file) and every member hears it at exactly the same second, with continuous drift correction.

**Implementation:**
- Reuse the watch-party sync architecture from `watch-party-crypto.js` and `WatchPartyModal.jsx` as the foundation.
- New file: `src/hooks/useSyncPlayback.js`:
  - NTP-style clock offset: client measures round-trip time to server 5 times on join, takes median, stores `clockOffset`.
  - Playback command includes `serverStartedAt` UTC ms; client seeks to `(serverNow - serverStartedAt) / 1000`.
  - Drift correction: every 10s, if local position differs by >1s from expected, silently seek to correct position.
- New file: `src/components/MusicRoom.jsx` — URL input + playback controls (play, pause, skip) for the sync master (first user or host).
- Audio sources:
  - YouTube: YouTube IFrame API in `allowSeeking` mode.
  - Audio file: encrypted upload via existing E2ECP file transfer, then `<audio>` element synced via `currentTime`.
- Socket events: `music-play { url, serverStartedAt }`, `music-pause { serverPausedAt }`, `music-sync { position, serverTime }`.

**Files touched:** `src/hooks/useSyncPlayback.js` (new), `src/components/MusicRoom.jsx` (new), `src/components/WatchPartyModal.jsx` (reference), `server/rooms.js`, `server/index.js`  
**Effort:** ~5–7 days

---

### F-H3: Whisper Chains
**What:** Build a relay chain of 2–4 participants (A→B→C→D). The message is layered-encrypted so each hop only unwraps its own layer, not knowing both ends. A social privacy mechanic — no single participant sees the full path.

**Implementation:**
- New file: `src/crypto/whisper-chain.js`:
  - `buildChain(orderedNicknames, ephemeralKeys)` — generates per-hop X25519 keypairs, layers encryption outward: encrypt for D, wrap ciphertext for C, wrap for B. Uses existing `x25519.js` and `aesEncryption.js`.
  - `unwrapHop(payload, myPrivateKey)` → `{ nextPayload, isFinalRecipient }`.
- UI: new "Chain" mode in the whisper/targeting panel (UserList) — drag to reorder participants into a chain.
- Socket routing: sender emits `whisper-chain-hop { to: nextNickname, payload: encryptedBlob }`. Server routes to `nextNickname`'s socket without inspecting the payload.
- Each intermediate node: on receiving `whisper-chain-hop`, calls `unwrapHop`. If `isFinalRecipient === false`, re-emits the next hop to the server. If `true`, displays the decrypted message.
- Key distribution: chain initiator distributes ephemeral public keys to each hop member via the existing E2EE whisper channel before sending the chain message.

**Files touched:** `src/crypto/whisper-chain.js` (new), `src/components/UserList.jsx`, `src/App.jsx`, `server/index.js`  
**Effort:** ~1 week

---

### F-H4: Geofenced Rooms
**What:** The host sets a GPS radius when creating a room (50m–5km). Only users physically inside the area can join or remain. Leaving the area triggers a grace period then auto-ejects.

**Implementation:**
- New file: `src/hooks/useGeofence.js`:
  - Calls `navigator.geolocation.watchPosition()` with high accuracy.
  - Calculates Haversine distance from room centre to current position.
  - Emits `geofence-position { lat, lng, accuracy }` to server every 30s and on each position update.
  - Shows an in-app warning banner when within 100m of boundary.
- Server geofence validation (`server/index.js`):
  - On `knock`/`join-room`: validate submitted coordinates against room's `{ centreLat, centreLng, radiusMetres }`.
  - On periodic `geofence-position`: re-validate; if outside, emit `geofence-ejected { reason }` and disconnect the socket.
  - Haversine distance computed server-side (do not trust client fully).
- `CreateRoomModal.jsx` gains a "Geofence" toggle + radius slider + "Use my current location" button.
- Privacy: coordinates transmitted inside the existing E2EE channel to server (server decrypts only to validate, does not log).
- Android/iOS: `@capacitor/geolocation` plugin for native GPS access (already a Capacitor app).

**Files touched:** `src/hooks/useGeofence.js` (new), `src/components/CreateRoomModal.jsx`, `src/App.jsx`, `server/rooms.js`, `server/index.js`  
**Effort:** ~1 week

---

### F-H5: Live Pair Programming / Code Share
**What:** An ephemeral shared code editor opens inside the room. Multiple users edit simultaneously with live cursor positions. Disappears when the room closes.

**Implementation:**
- Library: `CodeMirror 6` (modular, lightweight) + `Yjs` (CRDT for conflict-free concurrent editing) + `y-websocket` provider tunnelled through the existing socket.
- New file: `src/components/CodeShare.jsx`:
  - Renders a full CodeMirror 6 editor with syntax highlighting (20+ languages via `@codemirror/language-data`).
  - Binds Yjs `Text` CRDT to the CodeMirror document.
  - Shows coloured remote cursors labelled with nicknames via `@codemirror/collab`.
- Yjs sync transport: instead of a separate WebSocket, proxy Yjs update messages through the existing socket as `code-update { update: Uint8Array }` events (base64 encoded). Server relays these to all room members.
- New server file: `server/code-share.js` — registers the `code-update` relay and stores the latest Yjs document state in RAM for latecomers.
- Language selector dropdown in the editor toolbar.
- "Copy to clipboard" and "Send as message" (sends the code block as a formatted message) buttons.

**Files touched:** `src/components/CodeShare.jsx` (new), `server/code-share.js` (new), `server/index.js`, `src/App.jsx`  
**Packages:** `codemirror`, `@codemirror/lang-*`, `yjs`, `y-websocket`  
**Effort:** ~1–1.5 weeks

---

### F-H6: Live E2EE Transcription
**What:** Real-time speech-to-text transcription shown as subtitles at the bottom of the room. On-device only (Web Speech API or Whisper WASM) — no audio or text leaves the device unencrypted.

**Implementation:**
- New file: `src/hooks/useTranscription.js`:
  - Uses `window.SpeechRecognition` / `window.webkitSpeechRecognition` where available (Chrome, Edge, Android WebView).
  - Fallback for Electron/Firefox: Whisper.js (`@xenova/transformers` — runs Whisper tiny model in WASM, ~40MB download, cached in service worker).
  - Emits interim and final transcript segments.
- New file: `src/components/TranscriptionBar.jsx` — fixed bottom bar showing the current speaker's live transcription. Final segments are E2EE-encrypted and sent as a `transcript-segment { text, isFinal }` socket event so all members see the subtitles.
- Toggle: mic icon in the room toolbar activates transcription for yourself only.
- Privacy: interim text never leaves the device. Only `isFinal` segments are encrypted and sent.
- Android: use `@capacitor/speech-recognition` plugin for native on-device transcription (already a Capacitor app).

**Files touched:** `src/hooks/useTranscription.js` (new), `src/components/TranscriptionBar.jsx` (new), `src/App.jsx`, `server/index.js`  
**Effort:** ~1–1.5 weeks

---

## PHASE 4 — EXTREMELY HARD
*Target: weeks to months per feature, fundamental architectural changes or research-grade cryptography*

---

### F-X1: P2P Mesh Mode
**What:** All room members form a full WebRTC mesh — every peer connects directly to every other peer. The server becomes a signaling-only relay. The room survives a server outage.

**Implementation:**
- New directory: `src/p2p/`
- `src/p2p/mesh-manager.js`:
  - Maintains a `Map<socketId, RTCPeerConnection>` for all peers.
  - On `peer-joined`, initiates a new PeerConnection and completes ICE/SDP via the server's signaling socket (server only relays SDP, never sees message content).
  - On `peer-left`, closes and removes that connection.
  - Exposes `send(data)` which fans out to all open data channels.
  - Exposes `receive(handler)` which aggregates messages from all data channels.
- `src/p2p/signaling.js` — wraps the existing socket events for SDP offer/answer/ICE candidate exchange.
- `transport-manager.js` updated: when `meshMode === true`, route all messages through `mesh-manager.js` instead of the server socket. Graceful fallback to server relay if a peer channel fails.
- Server: new `mesh-signal { to, sdp/candidate }` event that routes SDP negotiation messages between peers without reading them.
- E2EE: existing Double Ratchet sessions are maintained per peer-pair on the data channel — no change to the crypto layer.
- Constraint: mesh does not scale past ~8 peers (N² connections). Above that, fall back to server relay automatically.

**Files touched:** `src/p2p/mesh-manager.js` (new), `src/p2p/signaling.js` (new), `src/transport/transport-manager.js`, `src/App.jsx`, `server/index.js`  
**Effort:** 3–6 weeks

---

### F-X2: DHT Peer Discovery
**What:** Use a Kademlia-style Distributed Hash Table so peers can find each other without a central server. Eliminates the server as a single point of failure for room discovery.

**Implementation:**
- Library: `libp2p` browser bundle with `kad-dht` module.
- New file: `src/p2p/dht-client.js`:
  - Initialises a `libp2p` node with WebSockets transport and Noise encryption.
  - Bootstrap peers: a small set of hardcoded well-known bootstrap nodes (can be run on cheap VPS or by trusted community members).
  - Room announcement: `PUT roomCode → { signalServerUrl, hostPublicKey }` into the DHT.
  - Room lookup: `GET roomCode` to retrieve current host signaling endpoint.
- Room creation flow update: after creating a room, also `PUT` it to the DHT. Server remains available as primary; DHT is the fallback.
- Room joining flow update: if server is unreachable, try DHT lookup → use retrieved `signalServerUrl` for P2P connection.
- Security: DHT entries are signed with the host's existing keypair (`x25519.js`). Clients verify the signature before using the entry.
- Constraint: DHT lookups have ~1–5s latency. Not suitable for real-time message routing — only for initial room discovery/signaling.

**Files touched:** `src/p2p/dht-client.js` (new), `src/components/JoinRoomModal.jsx`, `src/components/CreateRoomModal.jsx`, `src/App.jsx`  
**Packages:** `libp2p`, `@libp2p/kad-dht`, `@libp2p/websockets`, `@chainsafe/libp2p-noise`  
**Effort:** 4–8 weeks

---

### F-X3: Zero-Knowledge Reputation
**What:** Users can earn a trust score by participating in rooms, then prove their trust level to a new room without revealing *which* rooms they were in or any identifying information. Uses zk-SNARKs.

**Implementation:**
- Circuits written in `Circom 2`:
  - `room-membership.circom`: proves "I know a secret (roomCode + myNickname salt) that hashes to a commitment published by the server, without revealing the preimage."
  - `reputation-accumulator.circom`: proves "my total membership count across N commitments is ≥ threshold" without revealing N or the individual commitments.
- New directory: `src/crypto/zk/`:
  - `prover.js` — loads `snarkjs` WASM prover, accepts witness inputs, returns a Groth16 proof.
  - `verifier.js` — client-side proof verification (for self-check); server does authoritative verification.
  - `commitment-store.js` — stores room commitments in IndexedDB (via `db-registry.js`).
- Server changes (`server/index.js`):
  - On room join: issues a signed "membership commitment" (SHA-256 of `roomCode + serverSecret + timestamp`) to the user.
  - New endpoint `POST /zk/verify-reputation` — accepts a proof + public signals, verifies using `snarkjs` server-side.
- Trust levels: Bronze (≥3 rooms), Silver (≥10), Gold (≥25). Shown as an optional badge next to nickname.
- Privacy: the user controls whether to disclose their trust level. It is never automatic.

**New files:** `src/crypto/zk/prover.js`, `src/crypto/zk/verifier.js`, `src/crypto/zk/commitment-store.js`, `circuits/room-membership.circom`, `circuits/reputation-accumulator.circom`  
**Server files:** `server/zk-verifier.js` (new), `server/index.js`  
**Packages:** `snarkjs`, `circomlib`  
**Effort:** 6–12 weeks

---

### F-X4: Covert Channel Messaging
**What:** Encode a secret message entirely within the timing intervals between otherwise innocuous outgoing packets. The content is invisible to deep packet inspection — no ciphertext exists in any payload.

**Implementation:**
- New file: `src/crypto/covert-channel.js`:
  - Encoding: converts message bytes to binary, maps bit=0 → send next packet at T+100ms, bit=1 → send at T+200ms (or similar interval encoding).
  - Decoding: receiver measures inter-packet arrival intervals, quantises to 100ms or 200ms bins, reconstructs bits.
  - Reed-Solomon error correction to handle jitter (internet timing is never perfectly deterministic).
  - Carrier packets: uses the existing `traffic-padding.js` fake-traffic stream as the timing vessel (no new traffic pattern is introduced).
- New file: `src/crypto/covert-channel-receiver.js`:
  - Listens to `traffic-padding` packet arrival timestamps.
  - Maintains a sliding window of inter-arrival times.
  - Feeds intervals into the RS decoder.
- Constraints and reality:
  - Maximum throughput is extremely low (~5–20 bits/second with reliable error correction).
  - Requires both parties to be in the same room and explicitly activate covert mode.
  - Jitter above ~50ms will cause decoding errors — works best on LAN/low-latency connections.
  - This is a research-grade feature: expect extensive tuning and testing.

**New files:** `src/crypto/covert-channel.js`, `src/crypto/covert-channel-receiver.js`  
**Modified:** `src/crypto/traffic-padding.js`, `src/App.jsx`  
**Effort:** 8–16 weeks (research + implementation + reliability tuning)

---

## Summary Table

| Phase | # | Feature | Key files | Est. effort |
|-------|---|---------|-----------|-------------|
| Easy | E1 | Confetti Bombs | `ConfettiBomb.jsx` | 2–3h |
| Easy | E2 | Reactions with Physics | `ReactionOverlay.jsx`, `MessageList.jsx` | 4–6h |
| Easy | E3 | Typing Sound FX | `useSoundFX.js` | 2–3h |
| Easy | E4 | Read Receipts | `MessageList.jsx` | 4–6h |
| Easy | E5 | Message Pinning | `PinnedMessageBanner.jsx` | 4–6h |
| Easy | E6 | Timed Self-Destruct | `TimerModal.jsx`, `MessageList.jsx` | 4–6h |
| Moderate | M1 | Message Search | `MessageSearch.jsx`, `useMessageSearch.js` | 1 day |
| Moderate | M2 | Scheduled Rooms | `RoomCountdown.jsx`, `CreateRoomModal.jsx` | 1–2 days |
| Moderate | M3 | Room Forking | `UserList.jsx` | 1 day |
| Moderate | M4 | Message Threads | `ThreadView.jsx` (extend) | 2 days |
| Moderate | M5 | Hot Seat | `HotSeat.jsx` | 1.5 days |
| Moderate | M6 | Live Typing Preview | `TypingPreview.jsx` | 1.5 days |
| Moderate | M7 | Collaborative Playlist | `CollabPlaylist.jsx` | 2 days |
| Hard | H1 | Steganographic Messages | `steganography.js`, `StegoModal.jsx` | 3–4 days |
| Hard | H2 | Synchronized Music | `useSyncPlayback.js`, `MusicRoom.jsx` | 5–7 days |
| Hard | H3 | Whisper Chains | `whisper-chain.js` | 1 week |
| Hard | H4 | Geofenced Rooms | `useGeofence.js` | 1 week |
| Hard | H5 | Code Share / Pair Programming | `CodeShare.jsx`, `code-share.js` | 1–1.5 weeks |
| Hard | H6 | Live E2EE Transcription | `useTranscription.js`, `TranscriptionBar.jsx` | 1–1.5 weeks |
| X-Hard | X1 | P2P Mesh Mode | `mesh-manager.js`, `signaling.js` | 3–6 weeks |
| X-Hard | X2 | DHT Peer Discovery | `dht-client.js` | 4–8 weeks |
| X-Hard | X3 | Zero-Knowledge Reputation | ZK circuits, `prover.js` | 6–12 weeks |
| X-Hard | X4 | Covert Channel Messaging | `covert-channel.js` | 8–16 weeks |
