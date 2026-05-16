// Tracks event rate over a rolling window and outputs a normalized activity level [0, 1].
// Used by the ambient system to scale atmospheric intensity.

const WINDOW_MS = 10_000;
const HIGH_THRESHOLD = 8; // events per window = fully active

const _times = [];

export function recordActivity() {
  const now = Date.now();
  _times.push(now);
  while (_times.length && _times[0] < now - WINDOW_MS) _times.shift();
}

export function getActivityLevel() {
  const cutoff = Date.now() - WINDOW_MS;
  const recent = _times.filter(t => t > cutoff).length;
  return Math.min(1.0, recent / HIGH_THRESHOLD);
}
