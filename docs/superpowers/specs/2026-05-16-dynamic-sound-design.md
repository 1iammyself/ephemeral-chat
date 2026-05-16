# Dynamic Sound Design — Spec

**Date:** 2026-05-16
**Status:** Approved for implementation
**Feature:** ReactiveAudioEngine — dynamic, psychoacoustically informed sound system

---

## 1. Philosophy

The sound system must feel **atmospheric, tactile, and almost invisible** — not notification-heavy.

Target feel:
- "This app feels alive" (correct)
- "This app is making noise" (wrong)

Sound identity: **soft futuristic / glassmorphism** — airy synth textures, subtle cyber ambience, minimal percussion. No cartoon sounds, no hard clicks, no Discord-style alerts.

The system treats sound as an **audio ecosystem reacting to social energy**, not a set of discrete MP3 triggers.

**Presence vs. Notification:** Presence sounds must feel like environments reacting, spaces shifting, people existing nearby — not alerts or interruptions. This distinction is the defining principle of the entire system.

---

## 2. Architecture

### 2.1 Module

`ReactiveAudioEngine` — replaces `useSoundFX.js`. Single shared `AudioContext`.

React surface:
- `useSound()` — emit events, access engine state
- `useAudioSettings()` — read/write user preferences

### 2.2 Routing Graph

```
[Event]
    ↓
[Event Classifier]  →  { priority, category, playbackStrategy }
    ↓
[Context Resolver]  →  { inCall, recording, activeRoom, headsetConnected, hiddenTab, lowPowerMode }
    ↓
[Concurrency Guard]  →  cooldown windows · polyphony cap · event compositing
    ↓
[Dynamics Budget]  →  maxSimultaneousEnergy enforcement
    ↓
[Category Bus]
    ↓
[FX Chain]
    ↓
[Master Bus + DuckingController]
    ↓
[AudioContext.destination]
```

### 2.3 Category Buses

```
masterBus
├── uiBus          — microfeedback, tap sounds
├── presenceBus    — room events, reactions
├── attentionBus   — mentions, calls (Phase 2)
├── ambientBus     — environmental atmosphere (Phase 3)
└── voiceBus       — voice room audio (future)
```

### 2.4 Per-Bus FX Chains

| Bus | Chain |
|-----|-------|
| uiBus | soft saturation → limiter |
| presenceBus | compressor → adaptive stereo widener → subtle reverb |
| attentionBus | compressor → limiter |
| ambientBus | lowpass filter → reverb |

**Stereo widener rule:** headphones detected → width 0.3; speaker → width 0.05 (mono-safe). Never fixed.

**uiBus transient character:** rounded attacks, soft saturation — tactile glass feel, not mechanical clicks.

### 2.5 Event Classifier

Every emitted event is classified before reaching the audio graph:

```ts
sound.emit('reaction')
// internally becomes:
{
  type: 'reaction',
  category: 'presence',
  priority: 'low',
  playbackStrategy: 'composite'
}
```

| Event | Category | Priority | Strategy |
|-------|----------|----------|----------|
| tap | ui | LOW | single |
| send | ui | LOW | single |
| toggle / modal | ui | LOW | single |
| reaction | presence | LOW | composite |
| roomJoin | presence | LOW | single |
| roomLeave | presence | LOW | single |
| mention | attention | HIGH | single |
| incomingCall | attention | CRITICAL | single |
| recordingStart/Stop | attention | CRITICAL | single |

### 2.6 Context Resolver

```ts
engine.getContext() → {
  inCall: boolean,
  recording: boolean,
  activeRoom: boolean,
  headsetConnected: boolean,
  hiddenTab: boolean,
  lowPowerMode: boolean
}
```

Context is resolved before every sound decision. No audio logic outside the engine inspects this state.

### 2.7 Concurrency Guard

- Per-event cooldown windows (prevents identical-sound spam)
- Per-bus polyphony cap
- Rapid-fire compositing: >3 events of the same type within 500ms → single composited texture rather than stacked playback
- Event decay curves: composited shimmer dissipates over 1.5s; repeated bursts extend the tail instead of restarting

### 2.8 Dynamics Budget

Each sound contributes a normalized energy value. The engine tracks total simultaneous energy per bus. If energy exceeds threshold, subsequent lower-priority sounds attenuate automatically. Prevents muddy soundscapes and maintains emotional hierarchy.

### 2.9 Randomization

Every procedural sound applies per-playback variance:

| Parameter | Variance |
|-----------|----------|
| Pitch | ±2% |
| Gain | ±3% |
| Timing | ±5ms |
| Stereo width | ±5% |

Prevents repetition fatigue. Values are deliberately small — subconscious richness, not audible instability.

### 2.10 Brightness Budget

Combined uiBus + presenceBus spectral energy is tracked per second. If high-frequency content exceeds threshold, subsequent sounds auto-attenuate. Prevents metallic/fatiguing buildup from concurrent shimmery events.

### 2.11 Density Cap

- Reactions: max 1 composite per 2s window after initial burst
- Taps: max 8 per 2s window

---

## 3. Phase 1 — "Premium Feel"

### 3.1 Events

Six events. All Tier A — procedural synthesis only.

#### tap (uiBus · LOW)

> Soft glass micro-tick

- Oscillators: sine at 650Hz + bandpass-filtered white noise (2–4kHz, gain 0.02)
- Envelope: attack 5ms, decay 30–45ms
- Gain: 0.12 ±3%
- No stereo widening

Triggers on: primary CTA, send button, reaction buttons, drag/drop success, desktop hover/select.
Does NOT trigger on: every card click, scroll, checkbox.

#### send (uiBus · LOW)

> Soft upward confirmation

- Oscillators: sine (0.7 mix) + triangle (0.3 mix)
- Pitch: 440Hz → 600Hz glide (restrained interval — confirmation, not alert)
- Envelope: attack 8ms, decay 60–80ms
- Gain: 0.15 ±2%

#### reaction (presenceBus · LOW · composite)

> Soft crystalline shimmer

- FM synthesis: carrier 380Hz, modulator 190Hz (2:1 ratio), modulation index 1.5
- Spectral cap: lowpass at 3kHz, Q=0.7 — prevents metallic harshness
- Envelope: attack 15ms, brightness peak at 40ms, smooth harmonic decay to 150ms
- Burst composite (>3 in 500ms): shared reverb tail, 1.5s decay, no restacking
- Gain: 0.13

#### roomJoin (presenceBus · LOW)

> Airy rising presence

- Oscillators: bandpass noise (200–800Hz) + sine sweep 220Hz→440Hz
- Adaptive stereo (headphone-aware): headphones → width 0.3, speaker → 0.05
- Envelope: attack 20ms, decay 160–200ms
- Gain: 0.14

#### roomLeave (presenceBus · LOW)

> Soft departure — asymmetric from join

- Oscillator: sine sweep 380Hz→220Hz only (no noise component)
- Envelope: attack 15ms, decay 120–150ms with early gain rolloff
- Gain: 0.10 (perceptibly softer than join; asymmetry is intentional — emotional realism)

#### toggle / modal (uiBus · LOW)

> Ultra-soft tactile tick

- Oscillator: sine at 480Hz (mid-frequency for device perceptibility)
- Slightly more defined attack than tap
- Envelope: attack 8ms, decay 35–45ms
- Gain: 0.10 minimum floor — never drops below audible threshold

### 3.2 Ducking Rules (Phase 1)

| Context | uiBus | presenceBus |
|---------|-------|-------------|
| inCall | 30% | 15% |
| recording | 5% | 0% (muted) |

### 3.3 Settings Panel (Phase 1)

Minimum controls shipped with Phase 1:
- Master Sound toggle (on/off)
- UI Sounds toggle
- Presence Sounds toggle

---

## 4. Silent Mode Intelligence

- First launch: minimal sounds (master gain -50% for first session)
- Repeated identical events within 30s: gain reduces 10% per occurrence
- Night profile: see NightProfileResolver below (adaptive, not hardcoded)

### NightProfileResolver

Not a hardcoded 22:00–07:00 rule. Factors evaluated:
- Local time
- Device screen brightness
- Headset connected
- User activity level
- OS focus/do-not-disturb mode

Output: `nightIntensity` (0.0–1.0) applied as a multiplier on masterBus gain.

---

## 5. Performance States

| State | Behavior |
|-------|----------|
| full | All buses active, reverb tails, full polyphony |
| balanced | Ambient disabled, reverb tails shortened |
| lowPower | No reverb, polyphony cap halved, ambient muted, presence bus reduced |

Low power activates automatically when `lowPowerMode=true` in Context Resolver.

---

## 6. Accessibility Modes

Architected from the start even if UI ships later:
- **Reduced audio** — master gain floored at lower level, no ambient
- **Mono** — stereo widener bypassed, all output collapsed to mono
- **Tinnitus-safe** — high-frequency content above 4kHz rolled off
- **Low-frequency** — synthesis pitch shifted downward by -20%
- **Hearing sensitivity** — all gain values halved; no CRITICAL sounds above threshold

---

## 7. Phase Roadmap

### Phase 2 — "Presence Layer"

- Live ambient room tone (sparse generative, NOT looped music)
- Activity-reactive soundscape (active room → richer ambience, quiet room → softer)
- Collaborative editing sounds (Tier B)
- Typing proximity effects
- Full spatial widening rules via headphone detection
- Expanded settings: per-category sliders, accessibility UI
- Tier C attention sounds (mention, room invite, recording state)
- Howler.js for sample playback (lightweight pre-recorded presence assets)

### Phase 3 — "Sound Identity"

- Sound themes: cyberpunk · soft ambient · minimal glass · gaming · retro terminal · lo-fi
- Branded audio motifs
- Richer ambient loops (sparse generative layering, NOT background music)
- Event compositing system (multiple rapid events → single evolving audio texture)
- Adaptive pitch variation per theme
- voiceBus + musicBus

---

## 8. Technical Stack

| Concern | Tool |
|---------|------|
| Core engine | Web Audio API |
| Synthesis helpers | Tone.js (optional, Phase 2+) |
| Sample playback | Howler.js (Phase 2+ only) |
| Mobile audio session | Capacitor native audio handling |
| Desktop | Electron — richer ambient permitted |

**Do not build around raw MP3 playback.** The architecture depends on low-latency procedural flexibility.

---

## 9. Key Constraints

1. Never play identical sounds repeatedly without randomization
2. Presence sounds must feel environmental, not notification-like
3. Ambient audio must be sparse generative — not looped tracks
4. Stereo widening always adaptive (never fixed)
5. uiBus transient character: tactile glass, not mechanical
6. Restraint is the defining discipline — fewer sounds, better sounds
