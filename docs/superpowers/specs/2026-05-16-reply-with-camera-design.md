# Reply With Camera — Spec

**Date:** 2026-05-16
**Status:** Approved for implementation
**Feature:** Gesture-native ephemeral video reply system

---

## 1. Philosophy

This is a **social reflex system**, not a camera feature. Success is measured by one constraint:

> Time-to-expression under 800ms perceived effort

If video reply feels slower than emoji, text, or voice note, it will not become habitual. Every architectural decision is subordinate to this constraint.

**Presence vs. Creation:** The system must feel like "I reacted" not "I opened camera." Full-screen modal entry violates this. Bottom-sheet gesture-native capture preserves it.

---

## 2. Architecture

### 2.1 New Modules

| Module | Role |
|--------|------|
| `CameraPrewarmService` | Singleton. Owns the one global camera stream. |
| `QuickVideoCapture.jsx` | Bottom-sheet component. Mounts only after intent threshold. |
| `useLongPress.js` | Gesture hook driving the 3-phase state machine. |
| `VideoReplyMessage.jsx` | Renders received video-reply messages in MessageList. |

### 2.2 State Machine

```
Idle
  ↓ pointerdown/touchstart
Warming (hidden async — getUserMedia + stream stabilization)
  ↓ silentArm at 60–80ms
Intent (no UI change; one hapticLight() + emitSound('tap') at lowest gain)
  ↓ threshold at 120ms → QuickVideoCapture mounts (stream already live)
Recording (ring fills over 5s, non-linear ease)
  ↓ pointerup / touchend → instant send
  OR auto-stop at 5s → instant send
  OR emergency stop → discard → Idle
Send → Idle
  ↓ stream suspend (lazy — tracks disabled, not stopped)
  ↓ full teardown after 15s idle
```

**Intent hysteresis (full lock condition):**
```
intentLock = true only if:
  pressDuration >= 120ms
  AND pointer has not moved beyond drift threshold (≥ 8px)
  AND no scroll gesture detected
```
Without hysteresis, borderline taps cause accidental intent locks and the experience feels inconsistent across devices.

**Micro-feedback fires once per intent-lock cycle**, not per pointer event. Prevents audio spam during scrolling.

---

## 3. CameraPrewarmService

### 3.1 Prewarm Stages

**Stage A — Permission + stream acquisition:**
```js
navigator.mediaDevices.getUserMedia({ video: { facingMode }, audio: true })
```

**Stage B — Stream stabilization (deterministic fallback chain):**
```
READY =
  videoTrack.readyState === 'live'
  AND (
    requestVideoFrameCallback confirms first frame   [modern browsers]
    OR first rAF tick where videoElement.videoWidth > 0  [Safari fallback]
    OR 800ms soft-ready timeout                          [low-end / permission-delay fallback]
  )
```
Safari may never fire `requestVideoFrameCallback` reliably. The fallback chain ensures no device can deadlock the READY gate.

### 3.2 API

```js
prewarm(facingMode)     // Stage A + B async
attach(videoElement)    // binds stream to element; prevents black-stream race
startRecording()        // only callable in READY state; enforces ownership lock
stopRecording()         // returns Promise<Blob>
flipCamera()            // stops current track, reinitializes with opposite facingMode
suspend()               // videoTrack.enabled = false (soft disable, not stop)
release()               // full teardown; called after 15s idle or explicit dismiss
```

### 3.3 Ownership Lock

Only one `QuickVideoCapture` instance may control recording lifecycle at a time.

**Re-entrancy guard (rapid gesture spam across different messages):**
```
if (activeInstance && activeInstance !== currentInstance):
  → release previous instance safely, then grant lock to current
  OR → reject current (ignore) if previous is mid-send
```
Without this, rapid long-press on different messages creates ghost recording sessions and orphaned MediaRecorder instances. `startRecording()` is a no-op if `isRecording || !hasOwnerLock`.

### 3.4 Lazy Suspension

Instead of full teardown on each dismiss:
- `videoTrack.enabled = false` (soft pause — correct WebRTC model)
- `audioTrack.enabled = false`
- tracks are NOT stopped
- if reopened within 15s: `track.enabled = true`, skip Stage A entirely
- after 15s: `track.stop()`, stream released fully

### 3.5 Emergency Stop Conditions

Recording must stop and discard on any of:
- `document.visibilitychange` → hidden
- `pagehide` (critical for mobile Safari)
- `videoTrack.onended`
- `stream 'inactive'` event
- `window.beforeunload`
- `navigator.mediaDevices.ondevicechange` — OS-level camera reallocation can silently invalidate streams without triggering any other hook
- `focus` loss (optional safety net)
- `navigator.connection` change to `type: 'none'`

---

## 4. useLongPress Hook

### 4.1 Phase Breakdown

```
pointerdown / touchstart
  → silentArm() at 60–80ms     (no UI, prewarm begins)
  → onIntent() at 120ms         (micro-feedback once; sheet mounts)
  → onRecord()  (sheet visible, recording starts)

pointerup / touchend
  → onRelease() → triggers send
```

### 4.2 Cancellation

Long press is cancelled (no send, no recording) if:
- `touchmove` exceeds vertical drift threshold (≥ 8px) — prevents scroll conflicts
- `pointercancel` fires
- Focus leaves the element
- Tab becomes hidden before threshold

### 4.3 First-Use Path

On first-ever use, `getUserMedia` may prompt for permission. During this time, the intent phase is extended gracefully — sheet does not mount until READY is signaled. A very subtle "camera warming" indicator appears only if warmup exceeds 600ms.

---

## 5. QuickVideoCapture Component

### 5.1 Layout

- Full-bleed viewfinder, rounded top corners (bottom-sheet shape)
- **No** filter selector in Phase 1 — applies `Normal` filter automatically. Phase 2 adds filter selection.
- Hold ring: centered at bottom, 72px diameter
- Flip button: top-right corner
- Dismiss: swipe-down (only allowed when `recording=false` OR ring progress < 20%) or tap outside

### 5.2 Hold Ring Physics

- Non-linear easing: slight ease-in at start, linear through middle, ease-out near 5s
- Subtle acceleration in first 400ms (increases perceived responsiveness)
- Micro bounce animation on auto-stop (5s completion)
- Ring is a CSS `conic-gradient` animated via `requestAnimationFrame` — no React state updates during animation to avoid dropped frames

### 5.3 Swipe-Down Safety

Disabled when:
- `isRecording && progress >= 0.2` (ring > 20% filled)
- Conflicts with OS gesture bar navigation (Android gesture nav / iOS home indicator) are handled by `safe-area-inset-bottom` padding

### 5.4 replyTo Context

Message context is **frozen at intent-start** (when `onIntent()` fires). Final confirmation metadata (camera state, stream ID) is attached at READY signal. This two-stage approach ensures:
- Logical reply context captured immediately (before any async camera work)
- Actual recorded media is correctly associated with the confirmed capture session
- No mismatch if permission prompts cause delay between intent and READY

---

## 6. Send Pipeline

### 6.1 Recording

```js
MediaRecorder(stream, { mimeType })
```
MIME selection mirrors existing voice note logic:
- Chrome/Android: `video/webm;codecs=vp8,opus`
- Safari: `video/mp4`

Chunks collected on `ondataavailable`. On stop: `new Blob(chunks, { type: mimeType })`.

**Size guard:** if `blob.size > 8MB`, abort and show error. Expected range: 1–3MB for 5s at 480p.

### 6.2 Message Payload

```js
{
  messageType: 'videoReply',
  replyTo: { id, content, nickname },  // frozen at intent-start
  viewOnce: true,
  duration: <ms>,
  // video: base64 data URL (E2EE path via existing MLS socket pipeline)
}
```

### 6.3 Encryption

Same E2EE path as images and voice notes (MLS/AES-GCM). No special handling required.

### 6.4 Instant Send

On `pointerup` or auto-stop:
1. `stopRecording()` → Blob
2. **Backpressure guard:** if `blob.size > 4MB` → encode async off main thread (Web Worker or chunked `FileReader`) to avoid UI stutter
3. Blob → base64 data URL (or chunked for large blobs)
4. Encrypt
5. Emit socket event
6. `emitSound('send')`
7. Sheet dismisses, stream suspends

No preview. No confirmation. One flow.

### 6.5 Camera Readiness Opacity (Perceptual Optimization)

If warmup exceeds 400ms, the viewfinder enters a "semi-ready" state:
- Dim viewfinder (40% opacity) appears immediately
- Sharpens to full opacity when READY is signaled
- Prevents blank-wait feeling on first use or slow hardware

---

## 7. VideoReplyMessage Component

### 7.1 Display

- Rounded thumbnail with play indicator (▶) centered
- Duration badge bottom-right
- replyTo context shown above (same style as existing text replies)
- "View once" lock icon visible before first play

### 7.2 View-Once Behavior

On first play:
- Video plays inline within the message bubble (not full-screen)
- After playback ends (or user manually closes): content replaced with "Video reply — viewed" state, same UX pattern as existing view-once images
- No replay

### 7.3 Fallback

If recipient device cannot play the MIME type: "Video reply — unsupported format" shown with no crash.

---

## 8. Entry Points

| Entry | Trigger | Priority |
|-------|---------|----------|
| Long-press message | Primary gesture flow | High |
| Compose bar attachment tray | Secondary shortcut | Medium |

Standalone (attachment tray) entry skips `replyTo` context — sends as standalone videoReply.

---

## 9. Phase Roadmap

### Phase 1 (this spec)
- Video-only reply, 5s max
- No filter selection (Normal auto-applied)
- View-once default
- Long-press + attachment tray entry
- Inline video playback with view-once

### Phase 2
- Filter selection (swipe to reveal, 3 presets)
- "Undo within 2s" send buffer
- Auto-stop on silence/inactivity
- Optional dual-camera (BeReal-style moment capture)

### Phase 3
- Video reaction overlay (Snap-style face overlay)
- Reaction memory threads
- "Save to chat" permission per message

---

## 10. Key Constraints

1. Camera stream is singleton — only one active globally at any time
2. `replyTo` is frozen at intent-start, not at mount time
3. Filters are hidden in Phase 1 — no user decision step
4. Swipe-dismiss blocked when recording progress ≥ 20%
5. Micro-feedback fires once per intent-lock cycle only
6. Release → instant send — no preview, no confirmation
7. `suspend()` = track.enabled = false, never track.stop() (WebRTC-safe model)
