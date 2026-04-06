# Watch Party Security Strategy — Keeping the Feature, Maximizing Security

**Status:** Strategic Analysis (before Phase 1 execution)
**Goal:** Preserve watch party as a differentiator while meeting Signal-level E2EE standards

---

## Current Implementation Analysis

### What Watch Party Does
- Embeds YouTube IFrame API (`https://www.youtube.com/iframe_api`)
- Embeds SoundCloud Widget API
- Supports Figma, Google Drive, Google Docs (embedded via iframe)
- Synchronizes playback state (play, pause, seek) across room via Socket.IO
- URL validated via whitelist regex before embedding

### Current Security Posture

| Layer | Status | Risk |
|-------|--------|------|
| **Transport** | TLS (wss://) | ✅ LOW — HTTPS enforced |
| **Media URL validation** | Whitelist regex + origin check | ✅ LOW — prevents javascript: / data: injection |
| **API source** | First-party (youtube.com, soundcloud.com) | ⚠️ MEDIUM — relies on their security |
| **Playback state sync** | Socket.IO unencrypted | 🔴 HIGH — server can see what you're watching |
| **E2EE messaging** | Encrypted | ✅ LOW — watch party metadata encrypted separately |
| **JS bridge risk** | Third-party APIs execute in page context | ⚠️ MEDIUM — potential XSS if API breached |

---

## Why Custom Browser Is NOT the Answer

A custom in-built browser (Tauri webview, Electron BrowserWindow, etc.) doesn't solve the core problems:

| Problem | Custom Browser | Better Solution |
|---------|---|---|
| Third-party API trust | Still loads youtube.com API | Isolate via Service Worker + CSP |
| XSS from API breach | Still vulnerable (now harder to debug) | Strict Content Security Policy |
| Playback state leakage | Server still sees sync messages | Encrypt all watch party metadata |
| Complexity | High overhead (Tauri/Electron deps) | Use existing browser + hardening |
| Portability | Platform-specific (Kotlin, Swift needed) | Works on web, electron, mobile via webview |

**Verdict:** A custom browser adds attack surface without solving the fundamental issue.

---

## The Better Approach: Defense in Depth

### Layer 1: Encrypt Watch Party Metadata (NEW)

**Problem:** Currently, the server sees:
- Which media URL you're sharing
- Who clicked "watch party"
- Real-time playback sync (play, pause, seek)
- Duration watched

**Solution:** Encrypt all watch party messages via the same E2EE channel as chat.

**Implementation (fits into Phase 2):**

```javascript
// Instead of:
socket.emit('watchParty:sync', { 
  roomCode, 
  isPlaying: true, 
  currentTime: 45.5,
  mediaId: 'abc123'
})

// Do this (E2EE encrypted):
const watchPartyPayload = {
  isPlaying: true,
  currentTime: 45.5,
  mediaId: 'abc123',
  timestamp: Date.now()
}

const encrypted = await encryptE2EE(watchPartyPayload, roomSharedSecret)

socket.emit('watchParty:sync', { 
  roomCode,
  ciphertext: encrypted.ciphertext,
  nonce: encrypted.nonce
})
```

**Impact:**
- ✅ Server never sees media URLs or playback state
- ✅ Passive observer (ISP, network) sees encrypted traffic only
- ✅ Reuses existing E2EE infrastructure (Phase 2 deliverable)

---

### Layer 2: Strict Content Security Policy (NEW)

**Problem:** YouTube / SoundCloud APIs are loaded from external origins. If either is breached, attacker can inject arbitrary JS.

**Solution:** Add strict CSP headers + subresource integrity (SRI) on script loads.

**Implementation (server-side):**

```javascript
// server/index.js
const cspHeader = `
  default-src 'self';
  script-src 'self' 'wasm-unsafe-eval' https://www.youtube.com/iframe_api https://www.soundcloud.com/embed.js;
  frame-src https://www.youtube.com https://www.soundcloud.com https://www.figma.com https://drive.google.com https://docs.google.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https:;
  media-src 'self' https:;
  connect-src 'self' ${process.env.API_URL || 'http://localhost:3000'} wss:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.replace(/\n/g, ' ').trim();

app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy', cspHeader);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});
```

**Client-side SRI (Subresource Integrity):**

```javascript
// client/src/components/SharedMediaPlayer.jsx
function loadYouTubeApi() {
  return new Promise((resolve) => {
    if (ytApiLoaded && window.YT?.Player) { resolve(); return; }
    
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    // SRI hash (verify this before using in production)
    tag.integrity = 'sha384-[compute-and-pin-hash]';
    tag.crossOrigin = 'anonymous';
    tag.onload = () => {
      ytApiLoaded = true;
      // ... callbacks
    };
    tag.onerror = () => {
      console.error('YouTube API failed to load');
      // Fail securely: don't continue if external JS fails
    };
    document.head.appendChild(tag);
  });
}
```

**Impact:**
- ✅ XSS from third-party API breaches is blocked
- ✅ Integrity hashes prevent MITM manipulation
- ✅ Iframe sandbox isolation limits blast radius

---

### Layer 3: Isolated Service Worker (OPTIONAL, HIGH-SECURITY)

**For maximum paranoia:** Proxy all youtube.com / soundcloud.com requests through a Service Worker that:
1. Validates HTTPS
2. Logs suspicious requests
3. Can revoke access if detect compromise
4. Enforces CORS to prevent credential leakage

```javascript
// client/src/service-worker.js
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  // Only proxy media sources
  if (!['youtube.com', 'youtu.be', 'soundcloud.com'].some(d => url.hostname.includes(d))) {
    return;
  }
  
  // Must be HTTPS
  if (url.protocol !== 'https:') {
    event.respondWith(new Response('Blocked: insecure media source', { status: 403 }));
    return;
  }
  
  // Log access (for audit trail)
  console.log('[WatchParty] Fetching:', url.href);
  
  // Fetch with security headers
  event.respondWith(
    fetch(event.request).then(response => {
      // Validate content-type
      const ct = response.headers.get('content-type');
      if (event.request.destination === 'frame' && !ct.includes('text/html')) {
        return new Response('Invalid content type', { status: 415 });
      }
      return response;
    }).catch(err => {
      console.error('[WatchParty] Fetch failed:', err);
      return new Response('Media source unavailable', { status: 503 });
    })
  );
});
```

**Impact:**
- ✅ Centralized monitoring of all media API calls
- ✅ Revocation capability without app update
- ✅ Audit trail of what content accessed when

---

### Layer 4: Device Attestation on Mobile (TAURI / ANDROID)

**Problem on mobile:** Kotlin WebView can be hijacked by malware on the device.

**Solution:** Require device integrity check before enabling watch party on Android/Tauri.

**Implementation:**

```kotlin
// mobile/android/app/src/main/kotlin/WatchPartyManager.kt
object WatchPartyManager {
    fun isAllowedOnDevice(context: Context): Boolean {
        // Check device attestation (PlayIntegrity / App Attest)
        val attestation = PlayIntegrityManager.verify(context)
        
        // Block if:
        // - Device is rooted/jailbroken
        // - App is modified
        // - Device security patch is too old
        if (!attestation.meetsMinimumSecurityRequirements()) {
            logSecurityEvent("WatchParty blocked due to device integrity failure")
            return false
        }
        
        return true
    }
}
```

**Impact on clients:**
- ✅ Android: YouTube API only loads on verified device
- ✅ Tauri: Desktop attestation (Windows Secure Boot, macOS notarization)
- ✅ Web: No change (relies on browser security model)

---

## Amended Plan: Integrating Watch Party into Security Upgrade

### Phase 1 (UNCHANGED)
- Build Rust crypto layer (PQXDH, Double Ratchet, etc.)
- No watch party changes

### Phase 2 (UPDATED)
- Client E2EE integration
- **NEW:** Encrypt all watch party sync messages (playback state, metadata)
- Implement playback state routing via delivery tags (anonymous)

### Phase 3 (UPDATED)
- Server hardening
- **NEW:** Deploy CSP headers + SRI validation
- **NEW:** Add rate limiting on `/api/watchparty/sync` endpoint

### Phase 3.5 (NEW SUB-PHASE)
- **Desktop (Tauri):** Add CSP enforcement, Service Worker proxy
- **Mobile (Android/iOS):** Add device attestation gate before watch party UI loads

### Phase 4
- Protocol completion (groups, key transparency, etc.)
- Watch party group sync (O(1) broadcast via Megolm sender keys)

### Phase 5
- E2E validation
- Test watch party across platforms with encrypted metadata

---

## Risk Mitigation Matrix

| Risk | Current | With Changes | Residual |
|------|---------|---|---|
| Server observes what you watch | HIGH | NONE (encrypted) | NONE |
| Network observer sees media URLs | HIGH | NONE (HTTPS + E2EE) | NONE |
| XSS from YouTube API breach | MEDIUM | LOW (CSP + SRI + isolation) | LOW |
| Malware on client plays videos | MEDIUM | LOW (attestation on mobile) | LOW |
| API unavailability kills app | MEDIUM | LOW (graceful fallback) | LOW |

---

## Implementation Priority for Watch Party

**Must-Have (before E2EE launch):**
1. ✅ Encrypt all watch party metadata (Phase 2)
2. ✅ Deploy CSP + SRI headers (Phase 3)
3. ✅ Rate limiting on sync endpoint (Phase 3)

**Should-Have (within 2 weeks):**
4. Service Worker proxy + audit logging (Phase 3.5)
5. Device attestation gate on mobile (Phase 3.5)

**Nice-to-Have (future):**
6. Watch party analytics dashboard (see who watched what, when, for how long — all E2EE)
7. Encrypted watch party history (indexed by room, searchable without server knowing)

---

## Code Changes Required

### Smallest viable security patch (1-2 days):

**File 1: `server/index.js`**
- Add CSP headers (15 lines)
- Add SRI hash validation (20 lines)

**File 2: `client/src/components/SharedMediaPlayer.jsx`**
- Wrap watch party sync in E2EE encrypt/decrypt (30 lines)
- Add error handler for API load failure (10 lines)

**File 3: `server/middleware/watchParty.js` (new)**
- Rate limit watch party messages (25 lines)
- Log access attempts (10 lines)

**Total: ~110 lines across 3 files**

---

## Verdict

**Don't build a custom browser.** Instead:

1. **Keep YouTube/SoundCloud embeds** — they're battle-hardened, widely used, and regularly audited
2. **Add E2EE encryption** — metadata becomes unreadable to server and observers
3. **Lock down with CSP + SRI** — prevent API-level XSS injection
4. **Require device attestation** — on mobile, verify device hasn't been compromised
5. **Monitor with Service Worker** — centralized audit trail of all media access

This approach:
- ✅ Preserves watch party as differentiator
- ✅ Achieves Signal-level E2EE for metadata
- ✅ Requires minimal additional code (~110 lines)
- ✅ Works across web, desktop, and mobile
- ✅ Easier to audit than custom browser

---

## Security checklist for Phase 2 watch party integration

- [ ] All watch party sync messages encrypted via session shared secret
- [ ] Playback state routed via delivery tags (no session ID linkage)
- [ ] CSP headers deployed with YouTube/SoundCloud frame-src whitelisting
- [ ] SRI hashes pinned for iframe_api.js
- [ ] Rate limiting: max 100 sync messages/min per room
- [ ] Error handling: graceful degradation if API fails to load
- [ ] Device attestation: PlayIntegrity check on Android before showing watch party
- [ ] Audit logging: all watch party API access logged with timestamp, room, user
- [ ] Penetration test: attempt XSS via crafted YouTube/SoundCloud URLs (must fail)

