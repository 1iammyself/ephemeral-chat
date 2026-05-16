// Brightness budget: tracks combined uiBus + presenceBus spectral events per second.
// High-frequency event density causes subsequent sounds to auto-attenuate.
// This prevents the metallic/fatiguing buildup from concurrent shimmery events (§2.10).
//
// Hierarchy: global brightness budget ceiling overrides local per-event spectral caps.

const BRIGHTNESS_WINDOW_MS = 1000;
const ENERGY_PER_EVENT = 0.18;
const MAX_BRIGHTNESS = 1.0; // threshold before attenuation begins

const _events = []; // { time: number }

function pruned(now) {
  const cutoff = now - BRIGHTNESS_WINDOW_MS;
  while (_events.length && _events[0].time < cutoff) _events.shift();
}

export function addBrightness(category) {
  if (category !== 'ui' && category !== 'presence') return;
  const now = Date.now();
  pruned(now);
  _events.push({ time: now });
}

// Returns a multiplier in [0.3, 1.0].
// 1.0 when below budget, attenuates linearly above it.
export function brightnessMultiplier() {
  const now = Date.now();
  pruned(now);
  const total = _events.length * ENERGY_PER_EVENT;
  if (total <= MAX_BRIGHTNESS) return 1.0;
  return Math.max(0.3, 1.0 - (total - MAX_BRIGHTNESS) * 0.35);
}
