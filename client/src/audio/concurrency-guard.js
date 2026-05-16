const _lastPlayed = new Map();
const _bursts = new Map(); // eventName → { count, windowStart }

const COOLDOWNS_MS = {
  tap:       50,
  send:      250,
  receive:   150,
  toggle:    80,
  modal:     80,
  reaction:  0,    // compositing logic handles pacing
  roomJoin:  600,
  roomLeave: 600,
};

const BURST_WINDOW_MS = 500;
const BURST_THRESHOLD = 3; // > this many in window = burst

// Per-event density caps: max N plays in windowMs after burst threshold crossed
const DENSITY_CAPS = {
  reaction: { max: 1, windowMs: 2000 },
  tap:      { max: 8, windowMs: 2000 },
};

export function canPlay(eventName) {
  const cooldown = COOLDOWNS_MS[eventName] ?? 0;
  if (cooldown === 0) return true;
  const last = _lastPlayed.get(eventName) ?? 0;
  return Date.now() - last >= cooldown;
}

export function record(eventName) {
  const now = Date.now();
  _lastPlayed.set(eventName, now);

  const b = _bursts.get(eventName);
  if (!b || now - b.windowStart > BURST_WINDOW_MS) {
    _bursts.set(eventName, { count: 1, windowStart: now });
  } else {
    _bursts.set(eventName, { count: b.count + 1, windowStart: b.windowStart });
  }
}

export function isBurst(eventName) {
  const now = Date.now();
  const b = _bursts.get(eventName);
  return !!b && now - b.windowStart <= BURST_WINDOW_MS && b.count > BURST_THRESHOLD;
}

export function passedDensityCap(eventName) {
  const cap = DENSITY_CAPS[eventName];
  if (!cap) return false;
  const b = _bursts.get(eventName);
  if (!b) return false;
  return Date.now() - b.windowStart <= cap.windowMs && b.count > cap.max;
}
