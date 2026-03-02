# 🛡️ Ephemeral Chat — Security Hardening Master Plan

> **Codename:** Project Ghost  
> **Date:** March 2026  
> **Status:** ✅ Phase 1–7 Implemented (MASQUE active, Ristretto255 VOPRF, downgrade hardened)  
> **References:** RFC 9458 (OHTTP), RFC 9578 (Privacy Pass), IETF MASQUE, Signal PQXDH

---

## 📋 Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Assessment](#2-current-architecture-assessment)
3. [Threat Model](#3-threat-model)
4. [Phase 1 — Double Ratchet Protocol](#4-phase-1--double-ratchet-protocol)
5. [Phase 2 — Post-Quantum Key Exchange (PQXDH)](#5-phase-2--post-quantum-key-exchange-pqxdh)
6. [Phase 3 — Oblivious HTTP (RFC 9458)](#6-phase-3--oblivious-http-rfc-9458)
7. [Phase 4 — Privacy Pass Tokens (RFC 9578)](#7-phase-4--privacy-pass-tokens-rfc-9578)
8. [Phase 5 — Traffic Padding & Anti-Analysis](#8-phase-5--traffic-padding--anti-analysis)
9. [Phase 6 — P2P Hole Punching with Relay Fallback](#9-phase-6--p2p-hole-punching-with-relay-fallback)
10. [Phase 7 — MASQUE Dual-Proxy Architecture](#10-phase-7--masque-dual-proxy-architecture)
11. [Implementation File Map](#11-implementation-file-map)
12. [Migration Strategy](#12-migration-strategy)
13. [Security Guarantees Matrix](#13-security-guarantees-matrix)

---

## 1. Executive Summary

Ephemeral Chat currently provides **AES-256-GCM end-to-end encryption** with a static session key, **ephemeral rooms** (forward secrecy via deletion), and a **central relay** (e2ecp) for file transfers. This plan addresses **7 identified security shortfalls** by implementing industry-standard and next-generation protocols.

### What We're Building

| # | Feature | Protocol/Standard | Addresses |
|---|---------|-------------------|-----------|
| 1 | Per-message key ratcheting | Double Ratchet Algorithm | Session key compromise → all messages exposed |
| 2 | Post-quantum key exchange | PQXDH (X25519 + ML-KEM-768) | "Harvest Now, Decrypt Later" quantum attacks |
| 3 | Metadata-blind relay | Oblivious HTTP (RFC 9458) | Server sees who talks to whom and when |
| 4 | Anonymous authentication | Privacy Pass (RFC 9578) | Server can track users across sessions |
| 5 | Traffic analysis resistance | Chaff/Padding | ISP/state actor traffic fingerprinting |
| 6 | Direct P2P transfers | ICE/STUN hole punching | Central relay as single point of failure |
| 7 | Dual-proxy architecture | MASQUE (QUIC proxying) | Single proxy sees full metadata picture |

### What We're Keeping

- ✅ **e2ecp relay** — remains as fallback when P2P fails
- ✅ **Ephemeral rooms** — still the core UX (join → chat → vanish)
- ✅ **AES-256-GCM** — still the symmetric cipher, now per-message keys
- ✅ **Socket.IO signaling** — still coordinates rooms and presence
- ✅ **Proximity Transfer (QUIC/Quinn)** — enhanced with security layers

---

## 2. Current Architecture Assessment

### What's Good ✅
- AES-256-GCM is a strong symmetric cipher
- Room keys derived from URL hash (never sent to server)
- Messages not persisted on server
- Ephemeral TLS certs in proximity-core (good MITM defense)
- Pairing codes from certificate fingerprints

### What Needs Fixing ❌
| Issue | Current State | Target State |
|-------|--------------|--------------|
| Key rotation | Same AES key for entire session | New key per message (Double Ratchet) |
| Key exchange | SHA-256(keyString) → AES key | X25519 ECDH + ML-KEM-768 hybrid |
| Metadata | Server sees IP ↔ room mapping | OHTTP: relay sees IP, gateway sees room, neither sees both |
| Auth tracking | Session tokens linkable | Privacy Pass: unlinkable anonymous tokens |
| Traffic shape | Messages have distinct patterns | Padded to uniform sizes + chaff traffic |
| Transport | Always through relay | P2P first, relay fallback |
| Proxy model | Single relay server | Dual-proxy (MASQUE-style) |

---

## 3. Threat Model

### Adversaries
1. **Passive Network Observer** (ISP, coffee shop WiFi) — sees traffic patterns
2. **Compromised Server Operator** — has access to server logs/memory
3. **Active MITM Attacker** — intercepts room links before recipient
4. **State-Level Adversary** — can compel server cooperation + has traffic analysis
5. **Future Quantum Computer** — can break ECDH/RSA retroactively

### Security Goals (Post-Upgrade)
- **Confidentiality:** Only room participants can read messages
- **Forward Secrecy:** Past messages safe if future keys leak
- **Post-Compromise Security:** Session self-heals after key compromise
- **Metadata Privacy:** Server cannot link IP → room → messages
- **Unlinkability:** Server cannot tell if two sessions are the same user
- **Traffic Analysis Resistance:** Observers cannot determine communication patterns
- **Quantum Resistance:** Safe against "harvest now, decrypt later"

---

## 4. Phase 1 — Double Ratchet Protocol

### Problem
Currently, `encryptMessage()` in `client/src/utils/security.js` uses a single AES-256-GCM key (derived from `SHA-256(roomKeyString)`) for ALL messages in a session. If this key is compromised, every message is readable.

### Solution
Implement the **Double Ratchet Algorithm** (as used by Signal):
- **Symmetric Ratchet:** Each message uses `HKDF(chainKey)` to derive a new message key
- **DH Ratchet:** Periodically rotate the root key via new ECDH exchanges
- Every message encrypted with a unique key
- Old keys are deleted after use
- Compromise of one key reveals only that one message

### Architecture

```
Room Join:
  1. Generate ephemeral X25519 keypair
  2. Exchange public keys via Socket.IO signaling
  3. ECDH → shared secret → root key
  4. Root key → chain keys (send + receive)

Each Message:
  1. chain_key = HKDF(chain_key, "chain")
  2. message_key = HKDF(chain_key, "message") 
  3. Encrypt with AES-256-GCM using message_key
  4. Delete message_key after encrypt/decrypt
  5. Attach message counter + public key (for DH ratchet)

DH Ratchet (every N messages or on reply):
  1. Generate new X25519 keypair
  2. ECDH with peer's latest public key
  3. New root_key = HKDF(old_root_key || ECDH_output)
  4. Derive new chain keys from root_key
```

### Files
- `client/src/crypto/double-ratchet.js` — Core ratchet implementation
- `client/src/crypto/hkdf.js` — HKDF key derivation
- `client/src/crypto/x25519.js` — X25519 ECDH operations

---

## 5. Phase 2 — Post-Quantum Key Exchange (PQXDH)

### Problem
A quantum computer running Shor's algorithm can break X25519 ECDH. Adversaries may record encrypted traffic today to decrypt it when quantum computers mature ("Harvest Now, Decrypt Later").

### Solution
Implement **PQXDH** (Post-Quantum Extended Diffie-Hellman), the same approach Signal adopted:
- **Hybrid key exchange:** X25519 (classical) + ML-KEM-768 (post-quantum)
- Both must be broken to compromise the session
- ML-KEM (formerly Kyber) is NIST's selected post-quantum KEM standard

### Architecture

```
Key Exchange:
  1. Alice generates: X25519_keypair + ML-KEM-768_keypair
  2. Bob generates: X25519_keypair + ML-KEM-768_keypair  
  3. Exchange public keys via signaling
  4. Classical: ECDH(Alice_X25519_priv, Bob_X25519_pub) → shared_secret_1
  5. Post-Quantum: ML-KEM.Encaps(Bob_MLKEM_pub) → (ciphertext, shared_secret_2)
  6. Combined: root_key = HKDF(shared_secret_1 || shared_secret_2)
  7. This root_key feeds into the Double Ratchet (Phase 1)
```

### Files
- `client/src/crypto/pqxdh.js` — Hybrid key exchange orchestrator
- `client/src/crypto/ml-kem.js` — ML-KEM-768 wrapper (uses crystals-kyber WASM)

---

## 6. Phase 3 — Oblivious HTTP (RFC 9458)

### Problem  
The e2ecp relay and Socket.IO server see the client's IP address AND which room they're in. Even if message content is encrypted, the **metadata** (who talks to whom, when, how often) is exposed.

### Solution
Implement **Oblivious HTTP** (OHTTP) per RFC 9458:

```
Current:  Client ──────────────────→ Ephchat Server
          (Server sees: IP + Room + Encrypted content)

OHTTP:    Client → Relay → Gateway → Ephchat Server
          Relay sees:  IP address (but NOT the room/content)
          Gateway sees: Room + encrypted content (but NOT the IP)  
          Neither has the full picture
```

### How It Works (Per RFC 9458)
1. Client obtains Gateway's **HPKE public key** (out-of-band or via config endpoint)
2. Client **encapsulates** the HTTP request using HPKE encryption with the Gateway's key
3. Client sends the encapsulated request to the **Relay** (a regular HTTP POST)
4. Relay strips the client's IP and forwards the opaque blob to the **Gateway**
5. Gateway **decapsulates** using its HPKE private key, sees the original request
6. Gateway forwards to the **Target** (Ephchat server) or processes it directly
7. Response follows the reverse path

### Architecture

```
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│  Client   │  HTTPS  │  OHTTP Relay │  HTTPS  │ OHTTP Gateway│
│  (Browser)│────────→│  (Cloudflare │────────→│  (Ephchat    │
│           │         │   or Akamai) │         │   Server)    │
└──────────┘         └──────────────┘         └──────────────┘
 Knows: Gateway       Knows: Client IP         Knows: Request
 public key           Cannot read request      Cannot see IP
```

### Implementation
- **Relay:** Use Cloudflare's Oblivious HTTP relay service (free tier available), or deploy a lightweight relay on a separate provider
- **Gateway:** Built into the Ephchat server — decapsulates OHTTP requests
- **Client:** Encapsulates all API/Socket.IO requests through OHTTP

### Files
- `client/src/crypto/ohttp.js` — Client-side HPKE encapsulation
- `server/ohttp-gateway.js` — Server-side HPKE decapsulation
- `server/ohttp-keys.js` — HPKE key management and rotation

---

## 7. Phase 4 — Privacy Pass Tokens (RFC 9578)

### Problem
Even with OHTTP hiding the IP, the server can track users across sessions via session tokens, cookies, or behavioral patterns. The current `SecurityManager.createSession()` generates linkable tokens.

### Solution
Implement **Privacy Pass** (RFC 9578) for anonymous, unlinkable authentication:

```
Traditional Auth:
  Server issues token → Server can track that token across requests

Privacy Pass:
  1. Client sends blinded token to Issuer
  2. Issuer signs the blinded token (cannot see the actual token)
  3. Client unblinds → gets a valid signed token
  4. Client presents token to Server  
  5. Server verifies signature → valid! But cannot link to issuance
```

### Architecture (Privately Verifiable Tokens — Type 1)
1. **Issuer** generates a keypair (can be Ephchat server or 3rd party)
2. Client creates a random `nonce` and `blinds` it using the Issuer's public key
3. Client sends the `blind` to the Issuer
4. Issuer signs the `blind` using VOPRF (Verifiable Oblivious PRF)
5. Client `unblinds` the signature → has a valid token the Issuer can't link
6. Client attaches token to future requests
7. Server verifies token is validly signed → allows access
8. Token is single-use (prevents replay) but **unlinkable** to issuance

### What This Means for Ephchat
- Room joins are authenticated but anonymous
- Bot protection without tracking (replaces/augments Cap.js PoW)
- No cookies, no session IDs that persist across rooms
- Rate limiting possible via token buckets without identifying users

### Files
- `client/src/crypto/privacy-pass.js` — Token blinding/unblinding
- `server/privacy-pass-issuer.js` — Token issuance (VOPRF)
- `server/privacy-pass-verifier.js` — Token verification

---

## 8. Phase 5 — Traffic Padding & Anti-Analysis

### Problem
Even with E2EE and OHTTP, a network observer (ISP, state actor) can analyze:
- **Packet sizes** — distinguish text messages from file transfers
- **Timing patterns** — detect conversation cadence
- **Volume** — determine when users are active
- **Handshake fingerprints** — identify Ephchat protocol

### Solution
Implement **traffic padding** (chaff) and **timing obfuscation**:

### Techniques

#### 1. Message Padding
```
Before: "hi"        → 2 bytes encrypted → ~50 byte packet
Before: "long msg"  → 200 bytes encrypted → ~248 byte packet
After:  "hi"        → padded to 1024 bytes → ~1072 byte packet  
After:  "long msg"  → padded to 1024 bytes → ~1072 byte packet
```
All messages padded to fixed bucket sizes: 256, 1024, 4096, 16384, 65536 bytes.

#### 2. Chaff Messages (Dummy Traffic)
```
- Client sends fake encrypted "messages" at random intervals (2-15 seconds)
- Server identifies chaff by a flag in the encrypted header
- Server does NOT forward chaff to other clients
- Network observer cannot distinguish real from chaff
```

#### 3. Timing Jitter
```
- Real messages delayed by random 50-500ms before sending
- Prevents timing correlation between sender and receiver
- Configurable: "low latency" vs "high privacy" mode
```

#### 4. Connection Padding
```
- Periodic keepalive packets are padded to look like real messages
- WebSocket frames include random-length padding
```

### Files
- `client/src/crypto/traffic-padding.js` — Message padding + chaff generation
- `server/traffic-padding.js` — Server-side chaff handling

---

## 9. Phase 6 — P2P Hole Punching with Relay Fallback

### Problem
All file transfers go through the e2ecp relay server. This is a single point of failure and the server can see transfer metadata (who sends to whom, file sizes, timing).

### Solution
Implement **ICE/STUN/TURN hole punching** as primary transport, with relay fallback:

```
Attempt Order:
  1. Direct LAN (mDNS) — already in proximity-core
  2. ICE hole punching via STUN (works ~80% of the time)
  3. TURN relay (encrypted, but through a server)  
  4. e2ecp relay (existing fallback)
```

### Architecture
```
Step 1: Both peers gather ICE candidates
  - Host candidates (local IPs)
  - Server-reflexive candidates (public IP via STUN)
  - Relay candidates (TURN server, if configured)

Step 2: Exchange candidates via Socket.IO signaling

Step 3: ICE connectivity checks
  - Try all candidate pairs
  - Select the best working path

Step 4: Establish data channel
  - If direct path found → P2P (no server sees data)
  - If only TURN works → TURN relay (encrypted, server sees metadata)
  - If nothing works → fall back to e2ecp relay
```

### Files
- `client/src/transport/ice-transport.js` — ICE candidate gathering + connectivity
- `client/src/transport/transport-manager.js` — Orchestrates P2P vs relay selection
- `server/ice-signaling.js` — ICE candidate exchange via Socket.IO

---

## 10. Phase 7 — MASQUE Dual-Proxy Architecture

### Problem
Even with OHTTP, we need a longer-term solution for proxying all traffic (not just HTTP requests, but WebSocket connections too) through a privacy-preserving proxy chain.

### Solution
Implement **MASQUE**-style QUIC proxying (per the IETF MASQUE WG draft):

```
Current:    Client ───WebSocket──→ Server
            (Server sees everything)

MASQUE:     Client ───QUIC──→ Proxy1 ───QUIC──→ Proxy2 ───QUIC──→ Server
            Proxy1: Knows client IP, NOT destination
            Proxy2: Knows destination, NOT client IP
```

### Why MASQUE Over Tor
- **Speed:** QUIC is UDP-based, avoids TCP-over-TCP penalty of Tor
- **Reliability:** Built-in connection migration and 0-RTT resumption  
- **Deployment:** Uses HTTP/3 CONNECT, works with CDN infrastructure
- **Latency:** 2 hops (vs Tor's 3+), using professional infrastructure

### Architecture (Future Phase)
This is the most complex upgrade and should be implemented last. It involves:
1. Deploying a QUIC proxy (or using Cloudflare WARP/iCloud Private Relay-style service)
2. Client establishes HTTP/3 CONNECT-UDP to Proxy1
3. Proxy1 forwards UDP payloads to Proxy2
4. Proxy2 decapsulates and connects to the Ephchat server
5. QUIC's inherent encryption means each hop only sees its adjacent connections

### Files
- `client/src/transport/masque-client.js` — QUIC proxy client (HTTP/3 CONNECT-UDP)
- Infrastructure: separate MASQUE proxy deployment (Cloudflare Workers, etc.)

---

## 11. Implementation File Map

### New Files Created ✅

```
client/src/crypto/
├── double-ratchet.js       ✅ Phase 1: Per-message key ratcheting
├── hkdf.js                 ✅ Phase 1: HMAC-based Key Derivation
├── x25519.js               ✅ Phase 1: Elliptic curve DH
├── pqxdh.js                ✅ Phase 2: Hybrid post-quantum key exchange
├── ml-kem.js               ✅ Phase 2: ML-KEM-768 (Kyber) wrapper
├── ohttp.js                ✅ Phase 3: OHTTP client encapsulation
├── privacy-pass.js         ✅ Phase 4: Anonymous token client
└── traffic-padding.js      ✅ Phase 5: Padding + chaff generation

client/src/transport/
├── ice-transport.js         ✅ Phase 6: ICE/STUN hole punching
├── transport-manager.js     ✅ Phase 6: P2P vs relay orchestration
└── masque-client.js         ✅ Phase 7: MASQUE CONNECT-UDP tunnel (RFC 9297/9298 — WebTransport + native quinn bridge)

server/
├── ohttp-gateway.js         ✅ Phase 3: OHTTP decapsulation gateway + key rotation
├── privacy-pass-issuer.js   ✅ Phase 4: Ristretto255 VOPRF token issuance + DLEQ proofs + verification middleware
├── traffic-padding.js       ✅ Phase 5: Server-side chaff handling + response padding (1536B ML-KEM bucket)
└── ice-signaling.js         ✅ Phase 6: ICE candidate relay (offer/answer/candidate forwarding)
```

### Modified Files ✅
```
client/src/utils/security.js      ✅ Updated: ratchet session API, PQXDH key exchange, 
                                      encryptMessageSecure/decryptMessageSecure wrappers,
                                      traffic padding integration, DOWNGRADE ATTACK BLOCKED —
                                      v1 legacy fallback REMOVED from encrypt path; v1 payloads
                                      REJECTED in rooms with active v2 ratchet sessions
server/index.js                    ✅ Updated: OHTTP gateway init, Privacy Pass routes,
                                      ICE signaling attachment, CORS headers, graceful shutdown
```

---

## 12. Migration Strategy

### Backward Compatibility
- **v1 rooms** (current): Continue working with static AES-256-GCM key **only if
  no v2 ratchet session has ever been created for the room**.
- **v2 rooms** (upgraded): Use Double Ratchet + PQXDH exclusively.
- Room version pinned at creation; v2 rooms **refuse** v1 payloads.
- `encryptMessageSecure()` **throws** if the ratchet is not ready
  (no silent downgrade to v1 — this was a MITM attack surface).
- `decryptMessageSecure()` **rejects** any v1 payload received in a room
  that has an active v2 session, logging a `DOWNGRADE_BLOCKED` error.

### Rollout Order
1. **Phase 1 + 2** (Double Ratchet + PQXDH) — Core crypto upgrade, client-only change
2. **Phase 5** (Traffic Padding) — Client + server, low risk
3. **Phase 3** (OHTTP) — Server infrastructure change
4. **Phase 4** (Privacy Pass) — Auth system change
5. **Phase 6** (P2P Hole Punching) — Transport layer addition
6. **Phase 7** (MASQUE) — Future infrastructure, requires proxy deployment

---

## 13. Security Guarantees Matrix

| Property | Before | After Phase 1-2 | After Phase 3-5 | After Phase 6-7 |
|----------|--------|------------------|------------------|------------------|
| Message Confidentiality | ✅ AES-256-GCM | ✅ AES-256-GCM | ✅ AES-256-GCM | ✅ AES-256-GCM |
| Forward Secrecy | ⚠️ Via deletion only | ✅ Per-message keys | ✅ Per-message keys | ✅ Per-message keys |
| Post-Compromise Security | ❌ None | ✅ DH Ratchet | ✅ DH Ratchet | ✅ DH Ratchet |
| Quantum Resistance | ❌ None | ✅ ML-KEM-768 hybrid | ✅ ML-KEM-768 hybrid | ✅ ML-KEM-768 hybrid |
| Metadata Privacy | ❌ Server sees all | ❌ Server sees all | ✅ OHTTP split | ✅ MASQUE dual-proxy |
| Auth Unlinkability | ❌ Trackable tokens | ❌ Trackable tokens | ✅ Privacy Pass | ✅ Privacy Pass |
| Traffic Analysis Resistance | ❌ None | ❌ None | ✅ Padding + chaff | ✅ Padding + chaff |
| P2P Capability | ⚠️ Proximity only | ⚠️ Proximity only | ⚠️ Proximity only | ✅ ICE + relay fallback |
| MITM Resistance | ⚠️ Room link trust | ✅ ECDH verification | ✅ ECDH verification | ✅ ECDH verification |

---

*This plan is a living document. Each phase has its own implementation details in the corresponding source files.*

---

## 14. Post-Audit Hardening (March 2026)

Three critical gaps identified after the initial Phase 1–7 implementation:

### 14.1 MASQUE — Stub → Real CONNECT-UDP

| Before | After |
|--------|-------|
| `masque-client.js` was dead code — all methods returned `false`/`null` | RFC 9297 capsule protocol (DATAGRAM 0x00, CLOSE 0x01, PADDING 0xFF) |
| No transport binding | Three transport paths: **native quinn bridge** (`window.__quinnBridge`, Electron), **WebTransport datagrams** (Chromium 113+), **stream-based capsule framing** (fallback) |
| — | Anti-traffic-analysis padding injection on idle tunnel |
| — | `tryMASQUETransport()` helper for transport-manager.js integration |

### 14.2 Privacy Pass VOPRF — HMAC Stand-in → Ristretto255

| Before | After |
|--------|-------|
| Server `issueTokens()` used `HMAC-SHA256(key, blindedToken)` — server could link issuance to redemption (NOT blind) | Real Ristretto255 VOPRF: `Z = k · B` with per-element DLEQ proofs |
| Client `generateBlindedToken()` used XOR blinding | Client uses `B = r · H_to_group(t)`, unblind via `W = r⁻¹ · Z` |
| No DLEQ proof verification | Server returns `{ signedElements, proofs: [{c, s}...] }` for each evaluation |
| — | Production: `@noble/curves/ed25519` (audited, constant-time Ristretto255) |
| — | Dev fallback: Ed25519 approximation with **loud** console warnings |

**Dependency:** `npm install @noble/curves`

### 14.3 Downgrade Attack — Silent Fallback Killed

| Before | After |
|--------|-------|
| `encryptMessageSecure()` silently fell through to legacy `encryptMessage()` if ratchet not ready | **Throws** `DOWNGRADE_BLOCKED` error — forces caller to wait for PQXDH handshake |
| `decryptMessageSecure()` happily decrypted v1 blobs in v2 rooms | **Rejects** v1 payloads in rooms with active v2 sessions; logs `🛑 DOWNGRADE BLOCKED` |
| MITM could strip key-exchange handshake → both peers use shared room-code key | Impossible: encrypt path hard-fails without ratchet, decrypt path refuses v1 in v2 context |

### 14.4 ML-KEM-768 Bucket Sizing — Traffic Fingerprint Fixed

| ML-KEM-768 Payload | Wire Size | Old Smallest Fit | New Bucket |
|---------------------|-----------|-------------------|------------|
| Public key (1184 B) + 5 B header | 1189 B | 4096 B (3× waste) or split 256+1024 (unique shape) | **1536 B** |
| Ciphertext (1088 B) + 5 B header | 1093 B | 4096 B | **1536 B** |
| PQXDH init bundle (~1248 B) + 5 B | 1253 B | 4096 B | **1536 B** |

All `PRIVACY_PRESETS` (low, medium, high) now include a **1536-byte bucket**.
Server `padResponse()` and `generateChaff()` also include 1536 B so that
server-originated chaff is indistinguishable from ML-KEM key-exchange traffic.
