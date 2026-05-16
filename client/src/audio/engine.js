import { classify } from './classifier.js';
import { setContext, getContext } from './context-resolver.js';
import { canPlay, record, isBurst, passedDensityCap, repeatDecayMultiplier } from './concurrency-guard.js';
import { addEnergy, gainMultiplier } from './dynamics-budget.js';
import { addBrightness, brightnessMultiplier } from './brightness-budget.js';
import { recordActivity, getActivityLevel } from './activity-tracker.js';
import { getTheme } from './themes.js';
import { setupBuses } from './buses.js';
import { startAmbient, stopAmbient } from './ambient.js';
import {
  synthTap, synthSend, synthReceive, synthToggle,
  synthReaction, synthRoomJoin, synthRoomLeave,
  synthTypingNearby, synthConnectionEstablished,
  synthMention, synthRoomInvite, synthIncomingCall,
  synthRecordingStart, synthRecordingStop,
  synthComposite,
} from './synths.js';

const LEGACY_KEY       = 'soundFX_enabled';
const SETTINGS_KEY     = 'audioEngine_settings';
const FIRST_LAUNCH_KEY = 'audioEngine_firstLaunch';
const COMPOSITE_WINDOW_MS  = 100;
const COMPOSITE_COOLDOWN_MS = 500;

// Width→delay mapping: width 0.3 → ~6ms, 0.05 → ~1ms
const WIDTH_TO_DELAY = (w) => w * 0.02;

const ACCESSIBILITY_FILTER_FREQ = {
  normal:               20000,
  reduced:              20000,
  mono:                 20000,
  'low-frequency':      20000,
  'tinnitus-safe':       4000,
  'hearing-sensitivity': 3500,
};

const CRITICAL_EVENTS = new Set(['incomingCall', 'recordingStart', 'recordingStop']);

// ── First-launch detection ───────────────────────────────────────────────────

function detectFirstSession() {
  if (typeof localStorage === 'undefined') return false;
  if (localStorage.getItem(FIRST_LAUNCH_KEY)) return false;
  localStorage.setItem(FIRST_LAUNCH_KEY, String(Date.now()));
  return true;
}

// ── Settings ─────────────────────────────────────────────────────────────────

function defaultSettings() {
  return {
    master:            true,
    ui:                true,
    presence:          true,
    attention:         true,
    ambient:           false,
    uiVolume:          1.0,
    presenceVolume:    1.0,
    attentionVolume:   1.0,
    ambientVolume:     0.6,
    accessibility:     'normal',
    theme:             'default',
  };
}

function loadSettings() {
  const legacy  = typeof localStorage !== 'undefined' ? localStorage.getItem(LEGACY_KEY)    : null;
  const stored  = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY)  : null;
  const base    = defaultSettings();
  if (stored) {
    try { return { ...base, ...JSON.parse(stored) }; } catch { /* fall through */ }
  }
  if (legacy !== null) {
    return { ...base, master: legacy !== 'false' };
  }
  return base;
}

// ── NightProfileResolver — multi-factor, cached, 5 stable levels ─────────────
// Factors: local time, headsetConnected, user activity level.
// Level 0.0 = deepest night (max attenuation), 1.0 = fully active day.

let _nightLevel    = 1.0;
let _nightLastMs   = 0;
const NIGHT_TTL_MS = 60_000;

function refreshNight() {
  const h = new Date().getHours();
  const { headsetConnected } = getContext();
  const activity = getActivityLevel();

  // Time factor: deep night → 0, daytime → 1
  let timeFactor;
  if      (h >= 23 || h < 4) timeFactor = 0.0;
  else if (h >= 22 || h < 5) timeFactor = 0.25;
  else if (h >= 21 || h < 7) timeFactor = 0.5;
  else                        timeFactor = 1.0;

  // Headset at night means private listening — allow slightly louder
  const headsetBonus = headsetConnected ? 0.2 : 0.0;
  // High activity suggests active use — move toward day profile
  const activityBonus = activity * 0.15;

  const raw = Math.min(1.0, timeFactor + headsetBonus + activityBonus);
  // Quantize to 5 stable levels: 0.0, 0.25, 0.5, 0.75, 1.0
  _nightLevel  = Math.round(raw * 4) / 4;
  _nightLastMs = Date.now();
}

function nightIntensity() {
  if (Date.now() - _nightLastMs > NIGHT_TTL_MS) refreshNight();
  return _nightLevel;
}

// ── Headset detection ─────────────────────────────────────────────────────────

function detectHeadset() {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
  const update = () => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const outputs = devices.filter(d => d.kind === 'audiooutput');
      const has = outputs.some(d => /headphone|headset|earphone|earpiece|airpod|buds/i.test(d.label));
      setContext({ headsetConnected: has });
    }).catch(() => {});
  };
  update();
  navigator.mediaDevices.addEventListener('devicechange', update);
}

// ── Engine ────────────────────────────────────────────────────────────────────

class ReactiveAudioEngine {
  constructor() {
    this._actx          = null;
    this._buses         = null;
    this._settings      = loadSettings();
    this._listeners     = new Set();
    this._compositeBuf  = [];
    this._lastComposite = 0;
    this._firstSession  = detectFirstSession();
    this._lastBurstTail = 0;
    this._widenerTarget = 0.001; // current target delay (lerp destination)

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        setContext({ hiddenTab: document.hidden });
      });
    }

    detectHeadset();
  }

  // ── AudioContext lifecycle ─────────────────────────────────────────────────

  _ensureContext() {
    if (this._actx) {
      if (this._actx.state === 'closed') { this._actx = null; this._buses = null; }
      else {
        if (this._actx.state === 'suspended') this._actx.resume().catch(() => {});
        return true;
      }
    }
    try {
      this._actx  = new (window.AudioContext || window.webkitAudioContext)();
      this._buses = setupBuses(this._actx);
      this._applyDucking();
      this._applyVolumes();
      this._applyAccessibility();
      this._applyPerformanceMode();
      this._applyWidener();
      return true;
    } catch {
      return false;
    }
  }

  // ── Ducking ────────────────────────────────────────────────────────────────

  _applyDucking() {
    if (!this._buses || !this._actx) return;
    const { inCall, recording } = getContext();
    const { uiBus, presenceBus } = this._buses;
    const t = this._actx.currentTime;
    const ramp = (node, target) => {
      node.gain.cancelScheduledValues(t);
      node.gain.setValueAtTime(node.gain.value, t);
      node.gain.linearRampToValueAtTime(target, t + 0.1);
    };
    if (recording)    { ramp(uiBus, 0.05); ramp(presenceBus, 0.0);  }
    else if (inCall)  { ramp(uiBus, 0.30); ramp(presenceBus, 0.15); }
    else              { ramp(uiBus, 1.0);  ramp(presenceBus, 1.0);  }
  }

  // ── Per-category volume ────────────────────────────────────────────────────

  _applyVolumes() {
    if (!this._buses) return;
    const { uiVolume, presenceVolume, attentionVolume, ambientVolume } = this._buses;
    const s = this._settings;
    if (uiVolume)        uiVolume.gain.value        = s.ui        ? s.uiVolume        : 0;
    if (presenceVolume)  presenceVolume.gain.value   = s.presence  ? s.presenceVolume  : 0;
    if (attentionVolume) attentionVolume.gain.value  = s.attention ? s.attentionVolume : 0;
    if (ambientVolume)   ambientVolume.gain.value    = (s.ambient && s.master) ? s.ambientVolume : 0;
  }

  // ── Accessibility filter + mono mode ──────────────────────────────────────

  _applyAccessibility() {
    if (!this._buses?.accessibilityFilter || !this._actx) return;
    const { accessibility } = this._settings;
    const freq = ACCESSIBILITY_FILTER_FREQ[accessibility] ?? 20000;
    this._buses.accessibilityFilter.frequency.setValueAtTime(freq, this._actx.currentTime);

    // Mono mode: collapse stereo widener by zeroing the delay (both channels identical)
    if (this._buses.widenerDelay) {
      const monoDelay = accessibility === 'mono' ? 0 : null;
      if (monoDelay !== null) {
        this._widenerTarget = 0;
        this._buses.widenerDelay.delayTime.setValueAtTime(0, this._actx.currentTime);
      }
    }
  }

  // ── Stereo widener — headphone-aware, lerp-smoothed ───────────────────────

  _applyWidener() {
    if (!this._buses?.widenerDelay || !this._actx) return;
    if (this._settings.accessibility === 'mono') return; // mono mode overrides widener

    const { headsetConnected } = getContext();
    const targetWidth = headsetConnected ? 0.3 : 0.05;
    const targetDelay = WIDTH_TO_DELAY(targetWidth);

    // Lerp: width(t) = lerp(previous, target, 0.15)
    const current = this._widenerTarget;
    this._widenerTarget = current + (targetDelay - current) * 0.15;

    this._buses.widenerDelay.delayTime.setValueAtTime(
      this._widenerTarget,
      this._actx.currentTime,
    );
  }

  // ── Performance mode — balanced / lowPower ─────────────────────────────────

  _applyPerformanceMode() {
    if (!this._buses || !this._actx) return;
    const { performanceMode } = getContext();
    const { presenceWetGain } = this._buses;
    const t = this._actx.currentTime;

    if (performanceMode === 'lowPower') {
      // No reverb on presenceBus
      if (presenceWetGain) presenceWetGain.gain.setValueAtTime(0, t);
      // Presence bus at 50% (overrides volume node temporarily)
      if (this._buses.presenceVolume) {
        const base = this._settings.presence ? this._settings.presenceVolume : 0;
        this._buses.presenceVolume.gain.setValueAtTime(base * 0.5, t);
      }
    } else if (performanceMode === 'balanced') {
      // Shortened reverb tails (lower wet gain)
      if (presenceWetGain) presenceWetGain.gain.setValueAtTime(0.05, t);
    } else {
      // full
      if (presenceWetGain) presenceWetGain.gain.setValueAtTime(0.15, t);
    }
  }

  // ── Ambient lifecycle ──────────────────────────────────────────────────────

  _manageAmbient() {
    if (!this._actx || !this._buses) return;
    const { performanceMode } = getContext();
    const ambientAllowed =
      this._settings.ambient &&
      this._settings.master &&
      performanceMode !== 'lowPower' &&
      performanceMode !== 'balanced';

    if (ambientAllowed) {
      startAmbient(this._actx, this._buses.ambientBus, 1);
    } else {
      stopAmbient();
    }
  }

  // ── Bus routing ────────────────────────────────────────────────────────────

  _bus(category) {
    switch (category) {
      case 'ui':        return this._buses.uiBus;
      case 'presence':  return this._buses.presenceBus;
      case 'attention': return this._buses.attentionBus;
      default:          return this._buses.uiBus;
    }
  }

  // ── Master gain scale ──────────────────────────────────────────────────────
  // Combines: night profile × performance × accessibility × first-session.

  _masterScale() {
    const { performanceMode } = getContext();
    const { accessibility } = this._settings;

    const night      = nightIntensity();
    const perfMult   = performanceMode === 'lowPower' ? 0.6 : 1.0;
    const firstMult  = this._firstSession ? 0.5 : 1.0;

    let accessMult = 1.0;
    if (accessibility === 'reduced' || accessibility === 'hearing-sensitivity') {
      accessMult = 0.5; // halved per spec §6
    }

    return perfMult * night * firstMult * accessMult;
  }

  // ── Event compositing (Phase 3) ───────────────────────────────────────────

  _checkComposite(category) {
    const now = Date.now();
    this._compositeBuf.push({ category, time: now });
    this._compositeBuf = this._compositeBuf.filter(e => e.time > now - COMPOSITE_WINDOW_MS);

    if (this._compositeBuf.length < 3) return;
    if (now - this._lastComposite < COMPOSITE_COOLDOWN_MS) return;

    const cats = new Set(this._compositeBuf.map(e => e.category));
    if (cats.size < 3) return;

    this._lastComposite = now;
    synthComposite(
      this._actx,
      this._buses.presenceBus,
      gainMultiplier('presence') * this._masterScale(),
    );
  }

  // ── Sound persistence: reaction burst tail ─────────────────────────────────
  // Seeds the 1.5s long reverb with a short impulse; burstWetGain opens for tail duration.
  // Subsequent bursts extend the tail (reschedule fade, add more impulse) instead of restarting.

  _triggerBurstTail() {
    const buses = this._buses;
    const ctx   = this._actx;
    if (!buses?.burstReverbSend || !ctx) return;

    const now = Date.now();
    const t   = ctx.currentTime;

    // Seed the long reverb with a brief impulse
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 380;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.08, t + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(env);
    env.connect(buses.burstReverbSend);
    osc.start(t);
    osc.stop(t + 0.14);

    // Open burst wet gain for 1.5s — rescheduling extends rather than restarts
    buses.burstWetGain.gain.cancelScheduledValues(t);
    buses.burstWetGain.gain.setValueAtTime(0.22, t);
    buses.burstWetGain.gain.setValueAtTime(0.22, t + 0.4);
    buses.burstWetGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    this._lastBurstTail = now;
  }

  // ── Sound persistence: roomJoin presenceBus lift ───────────────────────────
  // Brief 300ms lift on presenceBus gain: fade in → hold → fade out.

  _roomJoinLift() {
    const buses = this._buses;
    const ctx   = this._actx;
    if (!buses?.presenceVolume || !ctx) return;

    const vol   = buses.presenceVolume;
    const t     = ctx.currentTime;
    const base  = this._settings.presence ? this._settings.presenceVolume : 0;
    const boost = Math.min(base * 1.35, 1.0);

    vol.gain.cancelScheduledValues(t);
    vol.gain.setValueAtTime(base, t);
    vol.gain.linearRampToValueAtTime(boost, t + 0.04);
    vol.gain.setValueAtTime(boost, t + 0.22);
    vol.gain.linearRampToValueAtTime(base, t + 0.30);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setContext(partial) {
    setContext(partial);
    if ('inCall' in partial || 'recording' in partial)   this._applyDucking();
    if ('performanceMode' in partial)                     this._applyPerformanceMode();
    if ('headsetConnected' in partial)                    this._applyWidener();
  }

  getSettings() {
    return { ...this._settings };
  }

  updateSettings(partial) {
    this._settings = { ...this._settings, ...partial };
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings));
    }
    if ('master' in partial) {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LEGACY_KEY, partial.master ? 'true' : 'false');
      }
      window.electronAPI?.setSetting?.('soundEnabled', partial.master).catch?.(() => {});
      window.dispatchEvent(new CustomEvent('ephchat:soundEnabled', { detail: partial.master }));
    }
    this._applyVolumes();
    if ('accessibility' in partial) this._applyAccessibility();
    if ('ambient' in partial || 'master' in partial) this._manageAmbient();
    this._listeners.forEach(fn => fn({ ...this._settings }));
  }

  onSettingsChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  emit(eventName) {
    if (!this._settings.master) return;
    if (!this._ensureContext()) return;

    const info = classify(eventName);
    if (!info) return;

    const { category, priority } = info;
    if (category === 'ui'        && !this._settings.ui)       return;
    if (category === 'presence'  && !this._settings.presence) return;
    if (category === 'attention' && !this._settings.attention) return;

    // Accessibility: gate CRITICAL sounds in hearing-sensitivity mode
    if (CRITICAL_EVENTS.has(eventName) && this._settings.accessibility === 'hearing-sensitivity') return;

    if (!canPlay(eventName)) return;

    record(eventName);
    recordActivity();

    if (passedDensityCap(eventName)) return;

    const ctx  = this._actx;
    const dest = this._bus(category);

    // Apply all gain multipliers: dynamics budget × brightness × repeat decay × master scale
    const repeatMult     = repeatDecayMultiplier(eventName);
    const brightnessMult = brightnessMultiplier();
    const mult = gainMultiplier(category) * this._masterScale() * repeatMult * brightnessMult;

    addEnergy(category);
    addBrightness(category);

    // Refresh widener on every emit (lightweight lerp step)
    this._applyWidener();

    const burst = isBurst(eventName);

    let theme = getTheme(this._settings.theme);
    if (this._settings.accessibility === 'low-frequency') {
      theme = { ...theme, pitchMult: (theme.pitchMult ?? 1.0) * 0.8 };
    }

    switch (eventName) {
      case 'tap':                   synthTap(ctx, dest, mult, theme); break;
      case 'send':                  synthSend(ctx, dest, mult, theme); break;
      case 'receive':               synthReceive(ctx, dest, mult, theme); break;
      case 'toggle':
      case 'modal':                 synthToggle(ctx, dest, mult, theme); break;
      case 'reaction':
        synthReaction(ctx, dest, mult, burst, theme);
        if (burst) this._triggerBurstTail();
        break;
      case 'roomJoin':
        synthRoomJoin(ctx, dest, mult, theme);
        this._roomJoinLift();
        break;
      case 'roomLeave':             synthRoomLeave(ctx, dest, mult, theme); break;
      case 'typingNearby':          synthTypingNearby(ctx, dest, mult, theme); break;
      case 'connectionEstablished': synthConnectionEstablished(ctx, dest, mult, theme); break;
      case 'mention':               synthMention(ctx, dest, mult, theme); break;
      case 'roomInvite':            synthRoomInvite(ctx, dest, mult, theme); break;
      case 'incomingCall':          synthIncomingCall(ctx, dest, mult, theme); break;
      case 'recordingStart':        synthRecordingStart(ctx, dest, mult, theme); break;
      case 'recordingStop':         synthRecordingStop(ctx, dest, mult, theme); break;
    }

    this._checkComposite(category);
  }
}

const engine = new ReactiveAudioEngine();
export default engine;
