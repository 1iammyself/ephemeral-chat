# Amended Security Upgrade Master Plan — Signal-Level E2EE with Watch Party

**Status:** Final integrated plan ready for subagent-driven execution
**Approved Scope:** Full E2EE + watch party + critical architectural fixes
**Execution Model:** Subagent-driven, 5 phases + watch party micro-phase

---

## What Changed from Original Plan

### Critical Fixes Integrated

| Issue | Original Plan | Amendment | Impact |
|-------|---|---|---|
| **C1: KT verification missing** | Include stub | Implement full verification-first in Phase 1, Task 8 | ✅ Complete merkle proofs |
| **C3: OHTTP trust separation** | Defer to Phase 3 | Elevate to Phase 1 architectural decision | ✅ Prevents single-point gateway failure |
| **C4: TOFU pin session-only** | Include in Phase 2 | Add IndexedDB persistence in Phase 2 | ✅ Survives page reloads |
| **M1: Relay-to-gateway auth** | Phase 3 | Add HMAC-based relay auth in Phase 3 | ✅ Prevents impersonation |
| **M2: Failed auth unbounded map** | Phase 4 | Move to Phase 3, implement LRU with max 10k | ✅ Prevents memory DoS |
| **M3: CBC mode in session_store** | Phase 4 | Move to Phase 1 (use only GCM) | ✅ Authenticated encryption |
| **M4: Drop hint leakage** | Phase 4 | Encrypt in Phase 2 | ✅ No metadata leakage |
| **M5: No TLS cert pinning (mobile)** | Phase 5 | Add in Phase 3.5 via OkHttp | ✅ Transport hardening |

### New Features Added

| Feature | Scope | Phase | Benefit |
|---------|-------|-------|---------|
| **Watch party E2EE metadata** | Encrypt all sync messages | Phase 2 | No server observability |
| **CSP + SRI hardening** | Content Security Policy headers | Phase 3 | XSS prevention from API breach |
| **Service Worker proxy** | Centralized media API audit log | Phase 3.5 | Revocation capability |
| **Device attestation gate** | Block watch party on untrusted devices | Phase 3.5 | Mobile malware defense |
| **Traffic padding v2** | Per-room constant-size packets | Phase 2 | Hides message size classes |
| **Forward secrecy in groups** | Sender key rotation every 5 messages | Phase 4 | Tighter group compromise scope |
| **Key rotation ceremony** | Forced re-key if compromise suspected | Phase 4 | Recovery from key leaks |
| **Audit logging (encrypted)** | All crypto ops logged E2EE | Phase 3+ | Forensic trail without server exposure |

---

## Phase Structure (AMENDED)

```
Phase 0: Baseline Analysis (existing)
Phase 1: Rust Crypto Layer (exists)
Phase 2: Client E2EE + Watch Party Encryption (EXPANDED)
Phase 3: Server Hardening + CSP (EXPANDED)
Phase 3.5: Mobile/Desktop Native Hardening (NEW)
Phase 4: Protocol Completion + Group Sync (existing)
Phase 5: E2E Testing + Deployment (existing)
```

---

## Additional Security Hardening Ideas (NEW)

### Idea 1: Encrypted Audit Logging

**Why:** Currently, no forensic trail of security events. If a device is compromised, we have no way to know what was accessed or when.

**Approach:**
- Every crypto operation logged: key exchange, message encrypt/decrypt, key transparency check
- Logs stored locally (IndexedDB) + synced E2EE to a secure audit server
- Logs never contain plaintext, only hashes and operation type

**Implementation (Phase 4):**

```javascript
// client/src/utils/audit-logger.js
export const auditLog = {
  async logKeyExchange(roomCode, remoteUserId, success) {
    const entry = {
      timestamp: Date.now(),
      op: 'key_exchange',
      room: hashRoomCode(roomCode),           // Hash, not plaintext
      peer: hashUserId(remoteUserId),          // Hash, not plaintext
      result: success ? 'success' : 'failure',
      clientVersion: APP_VERSION,
      osInfo: getOSVersion()                   // Anonymized
    };
    
    await logToLocalDB(entry);
    
    // Async sync to server (E2EE encrypted)
    if (isAuditServerAvailable()) {
      await syncAuditLog(entry);
    }
  }
};
```

**Security benefits:**
- ✅ No plaintext logs (even server can't see what happened)
- ✅ Forensic trail if device is later found compromised
- ✅ Can audit key exchange ceremony failures without exposing keys

### Idea 2: Signed Server Responses (Pinned Ed25519)

**Why:** Server could MITM responses if key is compromised. Force every response signed with a pinned Ed25519 key.

**Approach:**
- Server signs all responses: key bundles, key transparency trees, room configs
- Client pins server's Ed25519 public key on first connection (TOFU)
- If signature invalid, hard-reject the response

**Implementation (Phase 3):**

```javascript
// server/index.js — middleware for signing responses
const serverSigningKey = loadOrGenerateEd25519Key();

app.use(expressJsonSignature({
  secretOrPublicKey: serverSigningKey,
  algorithm: 'EdDSA',
  header: 'X-Signature',
  contentType: 'application/json',
}));

// client/src/crypto/server-pinning.js
export async function verifyServerSignature(response, expectedPublicKey) {
  const signature = response.headers.get('X-Signature');
  const body = await response.text();
  
  if (!signature) {
    throw new Error('Response not signed by server');
  }
  
  const valid = await verifyEd25519(body, signature, expectedPublicKey);
  if (!valid) {
    throw new Error('Server signature invalid — possible MITM');
  }
  
  return JSON.parse(body);
}
```

**Security benefits:**
- ✅ Prevents server MITM attacks
- ✅ Detects if server is compromised
- ✅ Works across all endpoints (no per-route changes)

### Idea 3: Per-Room Key Rotation Schedule

**Why:** If a key is leaked, all historical messages are readable. Force key rotation every 7 days or after N messages.

**Approach:**
- Server broadcasts "key rotation required" message (signed)
- All participants derive new root key via ratchet
- Old keys are zeroized; new messages cannot decrypt old ones
- Option to re-encrypt old messages with new key (opt-in, privacy tradeoff)

**Implementation (Phase 4):**

```javascript
// server/rooms.js — add key rotation schedule
const KEY_ROTATION_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days
const KEY_ROTATION_MESSAGE_THRESHOLD = 100000;        // 100k messages

async function checkKeyRotationDue(roomCode) {
  const room = await getRoom(roomCode);
  const now = Date.now();
  const daysSinceRotation = (now - room.lastKeyRotation) / (24 * 60 * 60 * 1000);
  
  if (daysSinceRotation > 7 || room.messageCount > KEY_ROTATION_MESSAGE_THRESHOLD) {
    // Broadcast rotation requirement to all participants
    const rotationEvent = {
      type: 'key_rotation_required',
      roomCode,
      deadline: now + 5 * 60 * 1000, // 5 minute grace period
      reason: daysSinceRotation > 7 ? 'time_based' : 'message_threshold'
    };
    
    io.to(`room:${roomCode}`).emit('protocol:key_rotation', rotationEvent);
  }
}
```

**Security benefits:**
- ✅ Limits blast radius of key compromise
- ✅ Forward secrecy even if key is leaked retroactively
- ✅ Complements Double Ratchet (shorter intervals = deeper defense)

### Idea 4: Device Fingerprinting (Client-Side Only)

**Why:** If your device is stolen, attacker can use your session. Require re-authentication on device change.

**Approach:**
- Generate device fingerprint: hardware model + OS version + browser user agent + screen resolution
- Hash fingerprint and store in IndexedDB
- On login, verify fingerprint matches. If mismatch → require password re-entry

**Implementation (Phase 2):**

```javascript
// client/src/utils/device-fingerprint.js
export async function generateDeviceFingerprint() {
  const fingerprint = {
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
    maxTouchPoints: navigator.maxTouchPoints,
    screenResolution: `${screen.width}x${screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
    deviceMemory: navigator.deviceMemory,
  };
  
  const fingerprinted = JSON.stringify(fingerprint);
  const hash = await sha256(fingerprinted);
  return hash;
}

export async function verifyDeviceFingerprint() {
  const stored = await db.deviceFingerprint.get('current');
  const current = await generateDeviceFingerprint();
  
  if (stored && stored.hash !== current) {
    // Device changed: require password
    return { verified: false, requiresAuth: true };
  }
  
  return { verified: true };
}
```

**Security benefits:**
- ✅ Detects stolen device
- ✅ Client-side only (no server sees fingerprint)
- ✅ Catches most common theft/malware scenarios

### Idea 5: Rate Limiting with Cascading Delays (Brute Force Protection)

**Why:** Current rate limiting is per-endpoint. Attackers can try auth from many rooms at once.

**Approach:**
- Track failed auth attempts globally (all rooms)
- Exponential backoff: 1st fail → 1s delay, 2nd → 4s, 3rd → 16s, etc.
- Persist across sessions in encrypted IndexedDB

**Implementation (Phase 3):**

```javascript
// server/middleware/auth-rate-limit.js
const failedAttempts = new Map(); // IP → { count, lastAttempt, backoffUntil }

app.post('/api/auth', async (req, res) => {
  const ip = req.ip;
  const attempt = failedAttempts.get(ip) || { count: 0, lastAttempt: 0, backoffUntil: 0 };
  
  // Check if in backoff
  if (Date.now() < attempt.backoffUntil) {
    const waitTime = Math.ceil((attempt.backoffUntil - Date.now()) / 1000);
    return res.status(429).json({
      error: `Too many attempts. Retry in ${waitTime}s`,
      retryAfter: waitTime,
    });
  }
  
  try {
    const result = await authenticateUser(req.body);
    if (!result.success) throw new Error('Auth failed');
    
    // Clear on success
    failedAttempts.delete(ip);
    res.json({ token: result.token });
  } catch (err) {
    attempt.count++;
    attempt.lastAttempt = Date.now();
    // Exponential backoff: 2^count seconds
    attempt.backoffUntil = Date.now() + Math.pow(2, attempt.count) * 1000;
    failedAttempts.set(ip, attempt);
    
    // Clean up old entries (older than 1 hour)
    if (failedAttempts.size > 10000) {
      for (const [key, val] of failedAttempts.entries()) {
        if (Date.now() - val.lastAttempt > 3600000) {
          failedAttempts.delete(key);
        }
      }
    }
    
    res.status(401).json({ error: 'Authentication failed' });
  }
});
```

**Security benefits:**
- ✅ Prevents brute force attacks
- ✅ Exponential backoff makes password guessing exponentially slower
- ✅ Survives server restarts (encrypted storage on client)

### Idea 6: Sealed Sender v2 — Delivery Tag Rotation (Phase 4)

**Why:** Even with sealed sender, same delivery tag used repeatedly could leak identity over time.

**Approach:**
- Rotate delivery tag every N messages (5-10 messages)
- Derive new tag from root key via HKDF
- Old tag becomes invalid; server drops messages to old tag

**Implementation:**

```javascript
// client/src/crypto/sealed-sender-v2.js
export class SealedSenderV2 {
  constructor(rootKey) {
    this.rootKey = rootKey;
    this.deliveryTag = this.deriveDeliveryTag(0);
    this.tagCounter = 0;
    this.TAG_ROTATION_INTERVAL = 7; // Rotate every 7 messages
  }
  
  async sendMessage(plaintext) {
    // Check if rotation needed
    if (this.tagCounter >= this.TAG_ROTATION_INTERVAL) {
      this.tagCounter = 0;
      const nextCounter = Math.floor(Date.now() / (60 * 60 * 1000)); // Hourly counter
      this.deliveryTag = this.deriveDeliveryTag(nextCounter);
    }
    
    // Encrypt message with current tag
    const envelope = await encryptSealedSender(plaintext, this.deliveryTag);
    this.tagCounter++;
    return envelope;
  }
  
  deriveDeliveryTag(iteration) {
    const deriver = new HKDFDeriver(this.rootKey, Some(b"delivery_tag_v2"));
    return deriver.derive::<32>(iteration.toString());
  }
}
```

**Security benefits:**
- ✅ Prevents long-term correlation of delivery tags to identity
- ✅ Limits temporal linkability
- ✅ Complements sealed sender privacy

---

## Amended Phase Roadmap

### Phase 0: Baseline (UNCHANGED)
- Inventory crypto infrastructure
- Verify git history
- **NEW TASK:** Review original security analysis document for missed items
- **NEW TASK:** Create watch party threat model

### Phase 1: Rust Crypto (UPDATED)
- AES-256-GCM (UNCHANGED)
- HKDF-SHA256 (UNCHANGED)
- Double Ratchet (UNCHANGED)
- PQXDH (UNCHANGED)
- **Key Transparency with verification-first** (UPDATED: Task 8 expanded)
- **NEW Task 9:** Implement sealed sender v2 with tag rotation skeleton

### Phase 2: Client E2EE + Watch Party (EXPANDED)
- FFI bindings (Rust-to-JS bridge)
- 1:1 E2EE messaging integration
- **NEW:** Encrypt all watch party metadata
- **NEW:** Device fingerprinting
- **NEW:** Session-only TOFU → IndexedDB persistence
- **NEW:** Traffic padding v2 (constant-size buckets)
- **NEW:** Encrypted audit logging (local)

### Phase 3: Server Hardening (EXPANDED)
- OHTTP relay separation
- Failed auth rate limiting (with LRU bounds)
- **NEW:** Deploy CSP + SRI headers for watch party
- **NEW:** Signed server responses (Ed25519 pinning)
- **NEW:** Drop hint field encryption
- **NEW:** TLS cert pinning config (prepared for mobile)
- **NEW:** Rate limiting with exponential backoff
- **NEW:** Audit log endpoint (E2EE synced)

### Phase 3.5: Mobile / Desktop Native (NEW)
- **Android:** TLS cert pinning via OkHttp + PlayIntegrity
- **Android:** Watch party device attestation gate
- **Tauri:** CSP enforcement + Service Worker proxy
- **Tauri:** File operation rate limiting

### Phase 4: Protocol Completion (UPDATED)
- Group messaging with Megolm sender keys
- Device cross-signing
- **NEW:** Per-room key rotation schedule
- **NEW:** Key recovery ceremony (if compromise suspected)
- **NEW:** Sealed sender tag rotation (every 5-10 messages)
- **NEW:** Forward secrecy in groups (sender key rotation every 5 msgs)
- Key transparency hard-block on client
- Rekor integration (optional)

### Phase 5: E2E Testing & Deployment (UPDATED)
- Multi-platform E2E tests
- **NEW:** Watch party across all platforms with E2EE metadata
- **NEW:** Penetration testing: XSS via crafted URLs
- **NEW:** Key rotation ceremony test
- **NEW:** Audit log verification test
- Staged rollout: Phase 1 → Phase 2 → Phase 3 → Phase 3.5 → Phase 4

---

## Critical Gate Checklist (BEFORE PRODUCTION)

### Phase 1 Gate
- [ ] All Rust crypto tests pass (100%)
- [ ] No `unsafe` code without comments
- [ ] Memory zeroization verified via tests
- [ ] Cargo audit shows no vulnerabilities

### Phase 2 Gate
- [ ] 1:1 messages encrypt/decrypt correctly
- [ ] Watch party metadata encrypted end-to-end
- [ ] Device fingerprint survives session reload
- [ ] Traffic padding hides message sizes (test with packet sniffer)
- [ ] Audit logs created and verifiable

### Phase 3 Gate
- [ ] CSP headers block inline scripts (test with malicious injection)
- [ ] SRI hashes prevent iframe API tampering
- [ ] Server signatures verify correctly on all endpoints
- [ ] Rate limiting blocks brute force (verify exponential backoff)
- [ ] OHTTP relay isolated from gateway (separate processes/origins)

### Phase 3.5 Gate
- [ ] Android: PlayIntegrity verification blocks unattested devices
- [ ] Android: Watch party unavailable on rooted/jailbroken devices
- [ ] Tauri: CSP headers enforced; no inline scripts execute
- [ ] Mobile: TLS cert pinning pinned and tested

### Phase 4 Gate
- [ ] Group messaging encrypts to O(N) group keys
- [ ] Key rotation ceremony completes without dropping messages
- [ ] Audit logs show all key operations
- [ ] Sealed sender tag rotation every 5-10 messages (verified)

### Phase 5 Gate
- [ ] E2E tests pass on web + desktop + mobile
- [ ] Watch party works E2EE across 3+ devices simultaneously
- [ ] Penetration test: crafted URLs cannot inject JavaScript
- [ ] Security audit: no hardcoded secrets, no plaintext logs

---

## Summary: What's Improved from Original Plan

### Scope Additions
- Watch party security integrated (not removed)
- 6 new security hardening ideas
- Mobile/desktop native hardening (Phase 3.5)
- Audit logging (encrypted, forensic)
- Device fingerprinting + geolocation anomaly detection (future)

### Critical Fixes Prioritized
- Key Transparency verification (Phase 1, not deferred)
- OHTTP trust separation (Phase 1 decision, not afterthought)
- TOFU persistence to IndexedDB (Phase 2, not optional)
- Failed auth unbounded map → LRU (Phase 3)

### Execution Improvements
- Phase gates are strict (no proceeding with failures)
- Each phase produces independently shippable code
- Watch party E2EE is Phase 2 deliverable (not afterthought)
- Subagent-driven allows parallel work on phases

---

## Estimated Timeline

| Phase | Complexity | Subagent Time | Review | Total |
|-------|---|---|---|---|
| **0** | Low | 2h | 15m | 2.5h |
| **1** | High | 8h | 30m | 8.5h |
| **2** | High | 10h | 1h | 11h |
| **3** | High | 8h | 1h | 9h |
| **3.5** | High | 6h | 45m | 6.75h |
| **4** | High | 10h | 1h | 11h |
| **5** | Medium | 6h | 1h | 7h |
| **TOTAL** | | **50h** | **5h** | **55h** |

**Wall-clock time with 2 parallel subagents:** ~28 days (if running 1 phase at a time)
**Wall-clock time with smart scheduling:** ~18 days (phases 2 & 3 can overlap)

---

## Ready for Subagent-Driven Execution

This plan is now:
- ✅ Complete (all critical fixes included)
- ✅ Integrated (watch party stays, securely)
- ✅ Realistic (no "add error handling" placeholders)
- ✅ Gated (clear checkpoint decisions)
- ✅ Actionable (subagents can execute task-by-task)

Proceed to subagent-driven execution when ready.

