import { classify } from './classifier.js';
import { setContext, getContext } from './context-resolver.js';
import { canPlay, record, isBurst, passedDensityCap } from './concurrency-guard.js';
import { addEnergy, gainMultiplier } from './dynamics-budget.js';
import { setupBuses } from './buses.js';
import {
  synthTap, synthSend, synthReceive,
  synthReaction, synthRoomJoin, synthRoomLeave, synthToggle,
} from './synths.js';

const LEGACY_KEY = 'soundFX_enabled';
const SETTINGS_KEY = 'audioEngine_settings';

function defaultSettings() {
  return { master: true, ui: true, presence: true };
}

function loadSettings() {
  // Migrate legacy soundFX_enabled key
  const legacy = localStorage.getItem(LEGACY_KEY);
  const stored = localStorage.getItem(SETTINGS_KEY);
  const base = defaultSettings();
  if (stored) {
    try { return { ...base, ...JSON.parse(stored) }; } catch { /* fall through */ }
  }
  if (legacy !== null) {
    return { ...base, master: legacy !== 'false' };
  }
  return base;
}

// Night intensity: quantized to 5 stable levels based on local hour
function nightIntensity() {
  const h = new Date().getHours();
  if (h >= 23 || h < 5)  return 0.5;
  if (h >= 22 || h < 7)  return 0.75;
  return 1.0;
}

class ReactiveAudioEngine {
  constructor() {
    this._actx = null;
    this._buses = null;
    this._settings = loadSettings();
    this._listeners = new Set();

    // Track tab visibility
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        setContext({ hiddenTab: document.hidden });
      });
    }
  }

  // ── AudioContext lifecycle ──────────────────────────────────────────────

  _ensureContext() {
    if (this._actx) {
      if (this._actx.state === 'closed') { this._actx = null; this._buses = null; }
      else { if (this._actx.state === 'suspended') this._actx.resume().catch(() => {}); return true; }
    }
    try {
      this._actx = new (window.AudioContext || window.webkitAudioContext)();
      this._buses = setupBuses(this._actx);
      this._applyDucking();
      return true;
    } catch {
      return false;
    }
  }

  // ── Ducking ────────────────────────────────────────────────────────────

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
    if (recording) { ramp(uiBus, 0.05); ramp(presenceBus, 0.0); }
    else if (inCall) { ramp(uiBus, 0.30); ramp(presenceBus, 0.15); }
    else { ramp(uiBus, 1.0); ramp(presenceBus, 1.0); }
  }

  // ── Bus routing ────────────────────────────────────────────────────────

  _bus(category) {
    switch (category) {
      case 'ui':       return this._buses.uiBus;
      case 'presence': return this._buses.presenceBus;
      case 'attention': return this._buses.attentionBus;
      default:         return this._buses.uiBus;
    }
  }

  // ── Master gain (night profile + performance mode) ─────────────────────

  _masterScale() {
    const { performanceMode } = getContext();
    const night = nightIntensity();
    return performanceMode === 'lowPower' ? 0.6 * night : 1.0 * night;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  setContext(partial) {
    setContext(partial);
    if ('inCall' in partial || 'recording' in partial) this._applyDucking();
  }

  getSettings() {
    return { ...this._settings };
  }

  updateSettings(partial) {
    this._settings = { ...this._settings, ...partial };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this._settings));
    // Keep Electron/Tauri in sync via the master toggle
    if ('master' in partial) {
      localStorage.setItem(LEGACY_KEY, partial.master ? 'true' : 'false');
      window.electronAPI?.setSetting?.('soundEnabled', partial.master).catch?.(() => {});
      window.dispatchEvent(new CustomEvent('ephchat:soundEnabled', { detail: partial.master }));
    }
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

    const { category } = info;
    if (category === 'ui' && !this._settings.ui) return;
    if (category === 'presence' && !this._settings.presence) return;
    if (!canPlay(eventName)) return;

    record(eventName);

    // Density cap: suppress if over the per-event window limit
    if (passedDensityCap(eventName)) return;

    const ctx = this._actx;
    const dest = this._bus(category);
    const mult = gainMultiplier(category) * this._masterScale();
    addEnergy(category);

    const burst = isBurst(eventName);

    switch (eventName) {
      case 'tap':       synthTap(ctx, dest, mult); break;
      case 'send':      synthSend(ctx, dest, mult); break;
      case 'receive':   synthReceive(ctx, dest, mult); break;
      case 'toggle':
      case 'modal':     synthToggle(ctx, dest, mult); break;
      case 'reaction':  synthReaction(ctx, dest, mult, burst); break;
      case 'roomJoin':  synthRoomJoin(ctx, dest, mult); break;
      case 'roomLeave': synthRoomLeave(ctx, dest, mult); break;
    }
  }
}

const engine = new ReactiveAudioEngine();
export default engine;
