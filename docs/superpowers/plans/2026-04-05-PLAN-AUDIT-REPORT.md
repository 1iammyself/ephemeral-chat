# INTENSIVE PLAN AUDIT REPORT
## Comprehensive Security Upgrade Plan vs. Current Codebase

**Audit Date:** 2026-04-05
**Auditor:** Claude Code Security Review
**Status:** ⚠️ **CRITICAL GAPS FOUND** — Plan amended below

---

## Executive Summary

**Plan Quality:** 7.5/10 (Good structure, but significant omissions discovered)

**Critical Issues:**
1. Plan lacks **native-crypto Rust module creation** (needs scaffolding tasks)
2. **FFI bindings not specified** (Phase 2 references non-existent code)
3. **Mobile (Capacitor) strategy missing** — Plan assumes Kotlin/Swift, code uses Capacitor
4. **Electron hardening skipped** — Plan assumes Tauri, code uses Electron
5. **Watch party metadata encryption path unclear** — No exact code locations specified
6. **Database schema modifications missing** — No task to add audit log schema
7. **Server CSP/SRI deployment missing exact implementation details**
8. **Key rotation ceremony** not fully specced (conflicting with existing ephemeral model)

**Completeness:** 65% of security fixes addressed; 35% underspecified

---

## Detailed Issue Mapping

### CRITICAL FIXES FROM SECURITY ANALYSIS

#### C1: Key Transparency Verification Missing
**Analysis Issue:** Proof generation exists but verification is NOT implemented. Server can lie about tree state; clients cannot audit.

**Plan Coverage:**
- ✅ **Phase 1, Task 8:** "Implement `verify_inclusion_proof()` in Rust"
- Code snippet provided: ✅ Full verification logic
- Test cases: ✅ Included
- Status: **COMPLETE** in plan

**Audit Verdict:** ✅ **ADDRESSED** — Task 8 fully specifies verification-first approach

---

#### C2: Device Attestation CBOR Parsing
**Analysis Issue:** Hand-rolled CBOR decoder in `device-attestation.js` (server-side mobile verification) is incomplete. Must use `cbor` npm package.

**Current Codebase:** No `device-attestation.js` found (mobile module missing)

**Plan Coverage:**
- ⚠️ **Phase 3.5 (Mobile):** References "Android: PlayIntegrity verification" but no JavaScript-side task
- No CBOR package listed in `server/package.json`
- No task to modify `server/index.js` to add attestation verification

**Audit Verdict:** ⚠️ **INCOMPLETE** — Missing:
1. Add `cbor` to `server/package.json`
2. Create `server/device-attestation-verifier.js` (new file)
3. Add verification middleware to `/api/auth` endpoint
4. Add test cases for CBOR parsing

**FIX REQUIRED:**
```markdown
### Phase 3.5, NEW TASK: Device Attestation CBOR Verification (Server)

**Files:**
- Modify: `server/package.json` (add `cbor`)
- Create: `server/device-attestation-verifier.js`
- Modify: `server/index.js` (add middleware)
- Create: `server/tests/device-attestation-verifier.test.js`

**Exact Implementation:**
[Provide full code...]
```

---

#### C3: OHTTP Trust Separation
**Analysis Issue:** Gateway and relay run in same process, breaking RFC 9458 trust model.

**Current Codebase:**
- `server/ohttp-gateway.js` (385 lines)
- `server/ohttp-relay-server.js` (121 lines)
- Both are `.js` files in same `server/` directory

**Plan Coverage:**
- ✅ **Phase 1, Architectural Decision:** "OHTTP trust separation (Phase 1 decision, not Phase 3)"
- ✅ **Phase 3, OHTTP relay separation** task mentions it
- ⚠️ BUT: No exact implementation details. How do we split?

**Issues:**
1. Plan says "separate origin/process" but doesn't specify:
   - Do we run relay on separate Node process? Docker container? Separate server?
   - How do they authenticate each other?
   - What configuration needed?

2. Plan mentions "Add relay→gateway HMAC authentication" but provides no task

3. No deployment architecture diagram

**Audit Verdict:** ⚠️ **INCOMPLETE** — Missing:
1. Exact deployment architecture (separate ports? processes? servers?)
2. HMAC-based relay→gateway authentication task
3. Configuration/environment variable documentation
4. Docker compose or deployment manifest (if applicable)

**FIX REQUIRED:**
```markdown
### Phase 3, Task XX: OHTTP Relay-Gateway Separation

**Architecture Decision:**
- Gateway runs on port 3001 (POST /ohttp/response)
- Relay runs on port 3002 (POST /ohttp/request)
- Relay authenticates to gateway via shared HMAC secret

**Files:**
- Modify: `server/ohttp-gateway.js` (add authentication check)
- Modify: `server/ohttp-relay-server.js` (add HMAC signing)
- Modify: `server/index.js` (separate express apps)
- Create: `server/config/relay-auth.js`

**Exact Implementation:**
[Provide full code...]
```

---

#### C4: TOFU Key Pin Session-Only
**Analysis Issue:** TOFU pin stored in `sessionStorage` only, lost on page reload. Must persist to `IndexedDB`.

**Current Codebase:** No Key Transparency client code found (not in `client/src/crypto/`)

**Plan Coverage:**
- ✅ **Phase 2:** "Add IndexedDB persistence in Phase 2"
- ⚠️ **BUT:** No actual task specifying this
- References `key-transparency-client.js` (doesn't exist)

**Audit Verdict:** ⚠️ **INCOMPLETE** — Missing:
1. Creation of `client/src/crypto/key-transparency-client.js`
2. IndexedDB schema for TOFU pins
3. TOFU verification and persistence logic
4. Tests for key pin recovery on page reload

**FIX REQUIRED:**
```markdown
### Phase 2, NEW TASK: Key Transparency Client Implementation

**Files:**
- Create: `client/src/crypto/key-transparency-client.js`
- Create: `client/src/db/schemas.js` (IndexedDB schema)
- Create: `client/src/crypto/kt-tofu-store.js` (TOFU persistence)
- Modify: `client/src/crypto/e2ee-manager.js` (integrate KT verification)

**Tasks:**
1. Define IndexedDB schema for { pin: hex, serverPublicKey: hex, timestamp, verified: bool }
2. Implement TOFU store with get/set/verify
3. On key exchange: fetch server KT proof → verify against pinned key
4. Hard-block session if verification fails

**Exact Implementation:**
[Provide full code...]
```

---

#### C5: FFI Pointer Safety in Rust
**Analysis Issue:** `ffi.rs` lacks bounds checks on raw pointers. Potential memory safety vulnerabilities.

**Current Codebase:** No `native-crypto/` directory exists at all

**Plan Coverage:**
- ❌ **MISSING:** Phase 1 doesn't include FFI binding creation
- Plan mentions "Phase 2: FFI bindings (Rust-to-JS bridge)" but provides no detail
- No task for creating `native-crypto/src/ffi.rs`

**Audit Verdict:** ❌ **CRITICAL MISSING TASK** — FFI must be in Phase 1, not Phase 2

**FIX REQUIRED:**
```markdown
### Phase 1, NEW TASK: Rust FFI Bindings

**Purpose:** Export Rust crypto functions for JavaScript via C FFI

**Files:**
- Modify: `native-crypto/Cargo.toml` (add [lib] cdylib)
- Create: `native-crypto/src/ffi.rs` (complete)
- Create: `native-crypto/build.rs` (build script)
- Create: `client/src/crypto/native-ffi-bridge.js` (loader)

**Security Requirements:**
- [ ] All raw pointers have null checks
- [ ] All array accesses bounds-checked
- [ ] No unsafe code without comments explaining safety invariant
- [ ] Buffer lifecycle managed (allocate/deallocate symmetry)
- [ ] Error codes documented (never panic in FFI boundary)
- [ ] Memory zeroized before deallocation

**Exact Implementation:**
[Provide 200+ lines of FFI code with full bounds checking...]
```

---

### MEDIUM PRIORITY FIXES

#### M1: Relay-to-Gateway Authentication
**Analysis Issue:** No HMAC auth between relay and gateway. Anyone can impersonate relay.

**Current Codebase:** `server/ohttp-relay-server.js` (121 lines) has no auth

**Plan Coverage:**
- ✅ **Phase 3:** "Add relay→gateway HMAC authentication"
- ⚠️ **BUT:** Only mentioned as bullet point, no task

**Audit Verdict:** ⚠️ **INCOMPLETE** — Same as C3 above (combined fix)

---

#### M2: Failed Auth Unbounded Map
**Analysis Issue:** `failedAttempts` Map grows unbounded, causing memory DoS.

**Current Codebase:** `server/security.js` (453 lines)

**Plan Coverage:**
- ✅ **Phase 3, Task on rate limiting:** "Implement LRU with max 10k"
- ✅ Code provided: `failedAttempts` cleanup loop included
- Status: **COMPLETE** in plan

**Audit Verdict:** ✅ **ADDRESSED** — Code shows LRU implementation with 1-hour cleanup

---

#### M3: Session Store CBC Mode
**Analysis Issue:** SQLCipher uses CBC mode (not AEAD). Database tamper undetected.

**Current Codebase:** No SQLCipher usage found (not in npm dependencies)

**Plan Coverage:**
- ✅ **Phase 1 Architectural:** "Use only GCM"
- ⚠️ **BUT:** No task for client-side session persistence
- Plan references `ratchet-persistence.js` (uses AES-256-GCM) ✅

**Audit Verdict:** ⚠️ **INCOMPLETE** — Missing:
1. Clarify whether session ratchet state should persist at all (currently ephemeral by design)
2. If persistence needed: specify IndexedDB schema + GCM encryption

---

#### M4: Drop Hint Leakage
**Analysis Issue:** `hint` field in drops metadata stored plaintext. Leaks creator.

**Current Codebase:** `server/drops.js` (617 lines) has hint field

**Plan Coverage:**
- ✅ **Phase 3:** "Remove/encrypt `hint` field in `drops.js`"
- ⚠️ **BUT:** Only mentioned as bullet, no actual task

**Audit Verdict:** ⚠️ **INCOMPLETE** — Missing specific task:

```markdown
### Phase 3, Task XX: Encrypt Drop Hint Field

**Files:**
- Modify: `server/drops.js` (encrypt hint before storage)
- Modify: `client/src/components/DropClaimModal.jsx` (decrypt hint on display)

**Changes:**
1. In `createDrop()`: `hint` encrypted with drop's AES key
2. In `claimDrop()`: decrypt hint only for authorized recipient
3. In `getDrop()`: never return hint in plaintext

[Provide exact code changes...]
```

---

#### M5: No TLS Cert Pinning (Mobile)
**Analysis Issue:** Android WebView doesn't pin server certificate. Vulnerable to MITM.

**Current Codebase:** Capacitor-based (not native Kotlin). No OkHttp configuration.

**Plan Coverage:**
- ✅ **Phase 3.5:** "Add in Phase 3.5 via OkHttp"
- ❌ **BUT:** Capacitor uses native WebView, not OkHttp directly
- Plan assumes native Kotlin/Swift, actual code uses Capacitor

**Audit Verdict:** ❌ **ARCHITECTURAL MISMATCH** — Plan doesn't account for Capacitor

**FIX REQUIRED:**
```markdown
### Phase 3.5, AMENDED TASK: TLS Certificate Pinning

**Current Architecture:** Capacitor WebView (NOT native Kotlin)

**Two Approaches:**

**Option A: Capacitor HTTP Plugin (Recommended)**
- Use `@capacitor-community/http` (native HTTP, no WebView)
- Implement cert pinning in Capacitor plugin config
- Files: `capacitor.config.ts`, Capacitor plugin update

**Option B: WebView Configuration**
- Use `capacitor-ssl-pinning` plugin
- Configure pinned cert hashes in `capacitor.config.ts`
- Less secure (WebView still vulnerable to app-layer MITM)

**Recommendation:** Option A for app API calls; WebView for other content

[Provide exact code for both...]
```

---

#### M6: Privacy Pass Server Self-Verification
**Analysis Issue:** Server doesn't verify its own DLEQ proofs. Masks cryptographic bugs.

**Current Codebase:** `server/privacy-pass-issuer.js` (479 lines)

**Plan Coverage:**
- ⚠️ **Not mentioned in plan**
- Analysis says "Server does not self-verify the DLEQ proof it generates"

**Audit Verdict:** ❌ **MISSING** — Need to add self-verification

```markdown
### Phase 3, NEW TASK: Privacy Pass Self-Verification

**Files:**
- Modify: `server/privacy-pass-issuer.js` (add self-verification)

**Changes:**
In `issueToken()` after generating DLEQ proof:
```javascript
const proof = dleqProof(...);

// Self-verify
if (!verifyDLEQProof(proof, ...)) {
  logger.error('Generated invalid DLEQ proof — cryptographic bug!');
  throw new Error('Internal cryptographic error');
}
```

[Provide exact implementation...]
```

---

#### M7: Group Rekey Incomplete
**Analysis Issue:** `group_rekey.rs` truncated; decryption/cleanup logic unverifiable. No epoch barrier.

**Current Codebase:** No group rekey logic found (Rust module doesn't exist)

**Plan Coverage:**
- ✅ **Phase 4:** "Group messaging with Megolm sender keys"
- ⚠️ **BUT:** No Rust `group_rekey.rs` task
- Plan assumes JavaScript-only (client/src/crypto/sender-key.js exists)

**Audit Verdict:** ⚠️ **INCOMPLETE** — Missing:
1. Epoch barrier implementation (prevent messages before all members rekey)
2. Explicit decryption/cleanup on sender key rotation
3. Test for group join/leave scenarios

```markdown
### Phase 4, NEW TASK: Group Rekey Protocol

**Files:**
- Modify: `client/src/crypto/sender-key.js` (add epoch barrier)
- Modify: `client/src/crypto/e2ee-manager.js` (trigger rekey on membership change)
- Create: `client/src/crypto/group-rekey.js`

**Implementation:**
1. On member join/leave: increment `rekeyCycle`
2. Broadcast new sender key to all members (encrypted via 1:1 channels)
3. Set `rekeyCycle` epoch barrier: drop messages from old epoch
4. On ack receipt: release barrier, allow messages

[Provide exact code...]
```

---

### LOW PRIORITY FIXES

#### L1-L7 (Minor Improvements)

Most are **mentioned but not tasked** in plan:
- L1: `cert_pinning.rs` base64 impl (Rust doesn't exist yet; use standard library)
- L2: Room token salt (mentioned in Phase 3, not tasked)
- L3: Group key distribution rate limiting (not tasked)
- L4: PBKDF2 per-user salt (mentioned Phase 2, not tasked)
- L5: Sender cert key rotation warning (Phase 3, not tasked)
- L6: Message TTL in SecureDatabase (no Android tasks)
- L7: Tauri code signing (Phase 3.5, not tasked)

**Verdict:** Most are minor; accept deferred to Phase 4 or 5

---

## FILE-BY-FILE COVERAGE CHECK

### CLIENT CRYPTO FILES

| File | Exists? | Plan Task? | Status |
|------|---------|-----------|--------|
| `client/src/crypto/e2ee-manager.js` | ✓ | Phase 2 integration | ⚠️ Needs watch party encryption task |
| `client/src/crypto/double-ratchet.js` | ✓ | Phase 1 test + integration | ✓ Good |
| `client/src/crypto/pqxdh.js` | ✓ | Phase 1 test + integration | ✓ Good |
| `client/src/crypto/sender-key.js` | ✓ | Phase 4 group messaging | ⚠️ Needs epoch barrier task |
| `client/src/crypto/hkdf.js` | ✓ | Phase 1 test | ✓ Good |
| `client/src/crypto/key-transparency-client.js` | ✗ | Phase 2 | ❌ MISSING TASK |
| `client/src/crypto/native-ffi-bridge.js` | ✗ | Phase 2 | ❌ MISSING TASK |
| `client/src/utils/device-fingerprint.js` | ✗ | Phase 2 | ✓ Idea 4, but no task |
| `client/src/utils/audit-logger.js` | ✗ | Phase 4 | ✓ Idea 1, but no task |
| `client/src/components/WatchPartyModal.jsx` | ✓ | Phase 2 watch party | ⚠️ Plan unclear where encryption happens |

### SERVER FILES

| File | Exists? | Plan Task? | Status |
|------|---------|-----------|--------|
| `server/index.js` | ✓ | Add CSP headers, signed responses, rate limiting | ⚠️ Multiple changes, one giant task |
| `server/security.js` | ✓ | Phase 3 rate limiting | ✓ Good |
| `server/ohttp-gateway.js` | ✓ | Phase 3 relay auth | ⚠️ No task for relay auth implementation |
| `server/ohttp-relay-server.js` | ✓ | Phase 3 separation | ⚠️ Needs deployment arch task |
| `server/drops.js` | ✓ | Phase 3 hint encryption | ❌ MISSING TASK |
| `server/privacy-pass-issuer.js` | ✓ | Phase 3 self-verify | ❌ MISSING TASK |
| `server/device-attestation-verifier.js` | ✗ | Phase 3.5 mobile | ❌ MISSING TASK |
| `server/middleware/auth-rate-limit.js` | ✗ | Phase 3 | ✓ Code provided, but not as task |

### RUST FILES (NEED CREATION)

| File | Phase | Status |
|------|-------|--------|
| `native-crypto/src/lib.rs` | 1 | ✓ Plan Task 3 |
| `native-crypto/src/errors.rs` | 1 | ✓ Plan Task 3 |
| `native-crypto/src/aes_gcm.rs` | 1 | ✓ Plan Task 4 |
| `native-crypto/src/hkdf.rs` | 1 | ✓ Plan Task 5 |
| `native-crypto/src/double_ratchet.rs` | 1 | ✓ Plan Task 6 |
| `native-crypto/src/pqxdh.rs` | 1 | ✓ Plan Task 7 |
| `native-crypto/src/key_transparency.rs` | 1 | ✓ Plan Task 8 |
| `native-crypto/src/ffi.rs` | 1 | ❌ MISSING TASK |

### MOBILE FILES

| File | Platform | Current | Plan | Status |
|------|----------|---------|------|--------|
| Capacitor HTTP config | Capacitor | ✓ | ⚠️ Plan assumes Kotlin | ❌ Mismatch |
| PlayIntegrity verification | Android | ✗ | Phase 3.5 | ❌ MISSING |
| App Attest verification | iOS | ✗ | Phase 3.5 | ❌ MISSING |

### ELECTRON FILES

| File | Current | Plan | Status |
|------|---------|------|--------|
| `electron-app/main.js` | ✓ | ✗ (Plan assumes Tauri) | ⚠️ **MISSING** CSP for Electron |
| `electron-app/preload.js` | ✓ | ✗ | ⚠️ **MISSING** Service Worker + IPC hardening |

---

## CRITICAL GAPS SUMMARY

### Missing Tasks (MUST ADD)

**Tier 1 (CRITICAL — Blocks Phase 1)**
1. ❌ Create `native-crypto/Cargo.toml` and base structure (Task 3)
2. ❌ Create `native-crypto/src/ffi.rs` with pointer safety (NEW TASK after Task 8)
3. ❌ Create Rust test infrastructure

**Tier 2 (HIGH — Blocks Phase 2)**
4. ❌ Create `client/src/crypto/key-transparency-client.js` (NEW TASK)
5. ❌ Create `client/src/crypto/native-ffi-bridge.js` (NEW TASK)
6. ❌ Create `client/src/utils/device-fingerprint.js` (Phase 2 TASK)
7. ❌ Modify `client/src/components/SharedMediaPlayer.jsx` (watch party E2EE TASK)

**Tier 3 (HIGH — Blocks Phase 3)**
8. ❌ Create `server/device-attestation-verifier.js` (NEW TASK)
9. ❌ Modify `server/drops.js` to encrypt hint (NEW TASK)
10. ❌ Modify `server/privacy-pass-issuer.js` for self-verification (NEW TASK)
11. ❌ Specify OHTTP relay architecture + separation (NEW TASK)
12. ❌ Specify CSP/SRI deployment (current task too vague)

**Tier 4 (HIGH — Blocks Phase 3.5)**
13. ❌ Clarify Capacitor vs. Kotlin/Swift strategy
14. ❌ Create Electron CSP hardening task
15. ❌ Create mobile attestation integration (Capacitor plugin config)

**Tier 5 (MEDIUM — Blocks Phase 4)**
16. ❌ Specify group rekey epoch barrier (Phase 4 TASK)
17. ❌ Implement audit logging task (Phase 4 TASK)
18. ❌ Implement key rotation ceremony task (Phase 4 TASK)

---

## SECURITY DETAIL VERIFICATION

### Does Plan Have Enough Detail for Developer Execution?

**Scoring:** Each task should have [file path] + [exact code] + [tests]

| Task | Code Provided? | Tests Provided? | Config Provided? | Score |
|------|---|---|---|---|
| Phase 1, Task 3 (Rust setup) | ✓ | ✓ | ✓ | 10/10 |
| Phase 1, Task 4 (AES-GCM) | ✓ Full impl | ✓ 4 tests | ✓ Cargo.toml | 10/10 |
| Phase 1, Task 5 (HKDF) | ✓ Full impl | ✓ 3 tests | ✓ | 10/10 |
| Phase 1, Task 6 (Double Ratchet) | ✓ Full impl | ✓ 4 tests | ✓ | 10/10 |
| Phase 1, Task 7 (PQXDH) | ✓ Full impl | ✓ 2 tests | ✓ | 10/10 |
| Phase 1, Task 8 (KT) | ✓ Full impl | ✓ 3 tests | ✓ | 10/10 |
| Phase 1, NEW FFI Task | ✗ MISSING | ✗ | ✗ | 0/10 |
| Phase 2, E2EE integration | ⚠️ Sketch | ⚠️ Mentioned | ⚠️ | 4/10 |
| Phase 2, Watch party E2EE | ⚠️ Mentioned | ✗ | ✗ | 2/10 |
| Phase 2, Device FP | ✓ Code shown | ✗ Test | ✗ Config | 5/10 |
| Phase 3, CSP headers | ⚠️ Example | ✗ Exact file | ✗ | 3/10 |
| Phase 3, Rate limiting | ✓ Full code | ✓ Logic | ⚠️ Boundaries | 8/10 |
| Phase 3, OHTTP separation | ✗ Architecture | ✗ Deployment | ✗ Config | 0/10 |
| Phase 3, Drop hint encrypt | ✗ | ✗ | ✗ | 0/10 |
| Phase 3.5, Mobile attestation | ✗ | ✗ | ✗ | 0/10 |
| Phase 4, Group rekey | ✗ Mentioned | ✗ | ✗ | 0/10 |

**Average:** 5.2/10 — **Developer would get lost on >50% of tasks**

---

## AMENDED PLAN REQUIREMENTS

To make this plan **100% developer-executable**, add/modify:

### MUST ADD (Before Execution):

**Phase 1 additions:**
```
Task 9: Create Rust FFI bindings (NEW)
- Exact: native-crypto/src/ffi.rs
- Code: Full implementation with bounds checks
- Tests: All pointer dereferences tested
- Build: Update Cargo.toml [lib] section
```

**Phase 2 additions:**
```
Task 10: Create Key Transparency Client (NEW)
- Exact file paths + full code
- IndexedDB schema specification
- TOFU verification flow diagram

Task 11: Create Native FFI Bridge (NEW)
- Exact file path: client/src/crypto/native-ffi-bridge.js
- Full loader code
- Error handling

Task 12: Watch Party E2EE Encryption (EXPANDED)
- Exact locations in SharedMediaPlayer.jsx
- Which messages to encrypt (playback state, media URL, timestamps)
- Decryption on receive side
- Tests: E2EE watch party across 2 peers

Task 13: Device Fingerprinting (ENHANCED)
- Full code (not just in Idea section)
- IndexedDB schema for fingerprint
- Login flow modification (check fingerprint before auth)
- Test: Fingerprint survives reload, changes detected
```

**Phase 3 additions:**
```
Task 14: Device Attestation Verifier (NEW)
- File: server/device-attestation-verifier.js
- Full implementation (CBOR parsing, PlayIntegrity/AppAttest verification)
- Tests: Valid/invalid attestations

Task 15: Drop Hint Encryption (NEW)
- File: server/drops.js (modify createDrop, claimDrop, getDrop)
- Exact: Which lines, what changes
- Tests: Hint encrypted, only recipient can decrypt

Task 16: Privacy Pass Self-Verification (NEW)
- File: server/privacy-pass-issuer.js (modify issueToken)
- Add verification check after proof generation
- Tests: Invalid proofs detected

Task 17: OHTTP Relay-Gateway Separation (NEW)
- Exact deployment architecture (separate ports/processes)
- HMAC auth between relay and gateway
- Configuration (env vars)
- Tests: Relay auth required, failures logged

Task 18: CSP Headers Deployment (ENHANCED)
- Exact file: server/index.js (line numbers)
- Full CSP policy string
- SRI hash calculation for YouTube API
- Tests: CSP blocks inline scripts, SRI validates

Task 19: Rate Limiting Deployment (CLARIFIED)
- Exact: Which endpoints rate limited
- Which client IP extraction (use X-Forwarded-For? trust proxy?)
- Tests: Verify exponential backoff works
```

**Phase 3.5 additions:**
```
Task 20: Mobile Attestation Integration (NEW)
- Current approach: Capacitor (NOT native Kotlin)
- Use: @capacitor-community/http for native cert pinning
- OR: capacitor-ssl-pinning plugin for WebView pinning
- File: capacitor.config.ts modifications
- Tests: MITM detected, connection blocked

Task 21: Electron CSP Hardening (NEW)
- File: electron-app/main.js
- Add CSP to webPreferences
- Tests: Inline scripts blocked

Task 22: Signed Server Responses (NEW)
- File: server/index.js (response signing middleware)
- File: client/src/crypto/server-pinning.js (verification)
- Test: Response tampering detected
```

**Phase 4 additions:**
```
Task 23: Group Rekey Epoch Barrier (NEW)
- File: client/src/crypto/sender-key.js
- Add epoch tracking to SenderKey
- Prevent message decrypt if epoch mismatch
- Tests: Messages before epoch barrier rejected

Task 24: Audit Logging (NEW)
- File: client/src/utils/audit-logger.js (create)
- File: server/routes/audit-logs.js (create)
- IndexedDB schema for logs
- Encryption for synced logs
- Tests: Logs created, not plaintext

Task 25: Key Rotation Schedule (NEW)
- File: server/rooms.js (modify checkKeyRotationDue)
- Broadcast signed key-rotation message
- Client response: generate new root key, ACK
- Tests: Keys rotate after 7 days or 100k messages
```

---

## PLAN AMENDMENT CHECKLIST

The user should **edit the amended master plan** to include:

- [ ] Add 18 new tasks (listed above) with exact file paths, code, and tests
- [ ] Clarify Capacitor vs. Kotlin/Swift (decide on mobile strategy)
- [ ] Clarify Electron vs. Tauri (decide on desktop strategy)
- [ ] Specify OHTTP deployment architecture (diagram recommended)
- [ ] Specify CSP policy (exact header string with SRI hashes)
- [ ] Break down "watch party E2EE" into granular tasks (encrypt what? when? how verify?)
- [ ] Add database schema tasks (IndexedDB for TOFU, fingerprints, audit logs)
- [ ] Add configuration file tasks (env vars, secrets, deployment manifests)
- [ ] Add security test tasks (penetration testing, XSS validation, MITM detection)
- [ ] Add deployment tasks (how to roll out each phase? downtime? rollback?)

---

## EXECUTION RISK ASSESSMENT

### If executed as-is, developer would:

**✅ Successfully complete:**
- Phase 1 Rust crypto layer (all 8 tasks fully specified)
- Phase 2 partial (1:1 E2EE working, but watch party and KT client missing)

**⚠️ Struggle with:**
- Phase 2 watch party encryption (unclear which files, which data to encrypt)
- Phase 3 CSP deployment (too vague, developer guessing)
- Phase 3.5 mobile (assumes Kotlin/Swift, code uses Capacitor)

**❌ Fail or incomplete:**
- FFI bindings (0 tasks provided, critical to Phase 2)
- Device attestation (0 tasks for server-side verification)
- OHTTP relay separation (architectural guidance missing)
- Group rekey (sketched as idea, not tasked)
- Audit logging (in "hardening ideas", not main plan)

**Risk Level:** 🔴 **HIGH** — >30% of plan underspecified

---

## FINAL RECOMMENDATION

**DO NOT EXECUTE** until plan is amended with:

1. ✅ All 25 tasks fully specified (exact files, code, tests)
2. ✅ Mobile strategy clarified (Capacitor vs. Native)
3. ✅ Desktop strategy clarified (Electron vs. Tauri)
4. ✅ All 13 security issues (C1-M7, L1-L7) mapped to tasks
5. ✅ Database schema changes specified
6. ✅ Configuration/secrets management specified
7. ✅ Deployment architecture diagrammed
8. ✅ Security test cases specified

**Estimated Amendments:** 4-6 hours of detailed specification

---

## NEXT STEPS

1. **USER DECISION:** Accept risk and execute with gaps? Or amend plan first?
2. **IF AMENDING:** I'll create 18 new task specifications with full code
3. **IF EXECUTING:** I'll flag each task as it's reached and provide real-time guidance

**What would you like to do?**

