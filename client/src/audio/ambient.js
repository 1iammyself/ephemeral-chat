// Sparse generative ambient — NOT looped background audio.
// Schedules isolated atmospheric pulses at activity-reactive intervals.
// Engine calls startAmbient(ctx, dest) to begin and stopAmbient() to silence.

import { getActivityLevel } from './activity-tracker.js';

const MIN_INTERVAL_MS = 3000;
const MAX_INTERVAL_MS = 20000;

let _running = false;
let _timer = null;

function nextInterval() {
  const activity = getActivityLevel();
  return Math.round(MAX_INTERVAL_MS - (MAX_INTERVAL_MS - MIN_INTERVAL_MS) * activity);
}

function emitPulse(ctx, dest, gainMult) {
  const t = ctx.currentTime;
  const activity = getActivityLevel();
  const intensity = (0.028 + activity * 0.035) * gainMult;

  // Two detuned low sines — a soft harmonic chord (root + perfect fifth)
  const base = 110 + Math.random() * 30;
  const freqs = [base, base * 1.5];
  const dur = 2.0 + Math.random() * 1.5;

  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq + (Math.random() * 2 - 1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(intensity, t + 0.4);
    g.gain.setValueAtTime(intensity, t + dur - 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + dur);
  }
}

function schedule(ctx, dest, gainMult) {
  if (!_running) return;
  _timer = setTimeout(() => {
    if (!_running || ctx.state !== 'running') return;
    emitPulse(ctx, dest, gainMult);
    schedule(ctx, dest, gainMult);
  }, nextInterval());
}

export function startAmbient(ctx, dest, gainMult = 1) {
  if (_running) return;
  _running = true;
  schedule(ctx, dest, gainMult);
}

export function stopAmbient() {
  _running = false;
  clearTimeout(_timer);
  _timer = null;
}
