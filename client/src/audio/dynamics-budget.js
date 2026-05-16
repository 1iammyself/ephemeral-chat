// Rolling per-bus energy tracker. Energy decays over time.
// When a bus exceeds budget, subsequent sounds attenuate proportionally.

const _energy = new Map(); // bus → { value, lastMs }
const DECAY_RATE = 0.93;   // per 100ms tick
const MAX_ENERGY = 1.0;
const ENERGY_PER_SOUND = 0.22;

function currentEnergy(bus) {
  const entry = _energy.get(bus);
  if (!entry) return 0;
  const ticks = (Date.now() - entry.lastMs) / 100;
  return entry.value * Math.pow(DECAY_RATE, ticks);
}

export function addEnergy(bus) {
  const now = Date.now();
  const current = currentEnergy(bus);
  _energy.set(bus, { value: Math.min(current + ENERGY_PER_SOUND, MAX_ENERGY * 2), lastMs: now });
}

// Returns a multiplier in [0.3, 1.0] — lower when bus is over budget
export function gainMultiplier(bus) {
  const e = currentEnergy(bus);
  if (e <= MAX_ENERGY) return 1.0;
  return Math.max(0.3, 1.0 - (e - MAX_ENERGY) * 0.5);
}
