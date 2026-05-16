// Phase 1 synthesizers — soft futuristic / glassmorphism personality.
// Each function schedules audio into `destination` and returns immediately.

function v(value, pct) {
  return value * (1 + (Math.random() * 2 - 1) * pct);
}

function noiseBuffer(ctx, durationSec) {
  const len = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// tap — soft glass micro-tick: sine + faint filtered noise, 35–50ms
export function synthTap(ctx, dest, gainMult) {
  const t = ctx.currentTime;
  const dur = v(0.04, 0.15);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = v(650, 0.02);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.12, 0.03) * gainMult, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + dur);

  // Faint noise transient
  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuffer(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3000;
  bp.Q.value = 1.2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.018 * gainMult, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
  ns.connect(bp);
  bp.connect(ng);
  ng.connect(dest);
  ns.start(t);
  ns.stop(t + dur);
}

// send — soft upward confirmation: sine-led dual tone, restrained pitch glide
export function synthSend(ctx, dest, gainMult) {
  const t = ctx.currentTime;
  const dur = v(0.08, 0.1);
  const f0 = v(440, 0.02);
  const f1 = v(600, 0.02);

  const sineOsc = ctx.createOscillator();
  sineOsc.type = 'sine';
  sineOsc.frequency.setValueAtTime(f0, t);
  sineOsc.frequency.exponentialRampToValueAtTime(f1, t + dur);

  const triOsc = ctx.createOscillator();
  triOsc.type = 'triangle';
  triOsc.frequency.setValueAtTime(f0, t);
  triOsc.frequency.exponentialRampToValueAtTime(f1, t + dur);

  const sG = ctx.createGain();
  sG.gain.setValueAtTime(v(0.105, 0.02) * gainMult, t);
  sG.gain.exponentialRampToValueAtTime(0.001, t + dur);

  const tG = ctx.createGain();
  tG.gain.setValueAtTime(v(0.045, 0.02) * gainMult, t);
  tG.gain.exponentialRampToValueAtTime(0.001, t + dur);

  sineOsc.connect(sG); sG.connect(dest);
  triOsc.connect(tG);  tG.connect(dest);
  sineOsc.start(t); triOsc.start(t);
  sineOsc.stop(t + dur); triOsc.stop(t + dur);
}

// receive — soft descending ping: asymmetric inverse of send, quieter
export function synthReceive(ctx, dest, gainMult) {
  const t = ctx.currentTime;
  const dur = v(0.07, 0.1);
  const f0 = v(520, 0.02);
  const f1 = v(400, 0.02);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(v(0.09, 0.03) * gainMult, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain); gain.connect(dest);
  osc.start(t); osc.stop(t + dur);
}

// reaction — soft crystalline FM shimmer, burst-aware FM index
export function synthReaction(ctx, dest, gainMult, burst) {
  const t = ctx.currentTime;
  const dur = v(0.14, 0.1);
  const carrierFreq = v(380, 0.02);
  const modIndex = burst ? 0.8 : 1.5; // reduce FM harshness under burst

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = carrierFreq;

  const modulator = ctx.createOscillator();
  modulator.type = 'sine';
  modulator.frequency.value = carrierFreq / 2; // 2:1 ratio

  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(carrierFreq * modIndex, t);
  modGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  // Spectral cap — prevents metallic sidebands
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3000;
  lp.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.13, 0.03) * gainMult, t + 0.015);
  gain.gain.setValueAtTime(v(0.13, 0.03) * gainMult, t + 0.04); // brightness peak
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  carrier.connect(lp); lp.connect(gain); gain.connect(dest);
  carrier.start(t); modulator.start(t);
  carrier.stop(t + dur); modulator.stop(t + dur);
}

// roomJoin — airy rising presence: filtered noise + sine sweep
export function synthRoomJoin(ctx, dest, gainMult) {
  const t = ctx.currentTime;
  const dur = v(0.2, 0.1);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(v(220, 0.02), t);
  osc.frequency.exponentialRampToValueAtTime(v(440, 0.02), t + dur);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.14, 0.03) * gainMult, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain); gain.connect(dest);
  osc.start(t); osc.stop(t + dur);

  // Airy noise layer
  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuffer(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = v(400, 0.1);
  bp.Q.value = 0.5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.06 * gainMult, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
  ns.connect(bp); bp.connect(ng); ng.connect(dest);
  ns.start(t); ns.stop(t + dur);
}

// roomLeave — soft descending departure, asymmetric from join (no noise)
export function synthRoomLeave(ctx, dest, gainMult) {
  const t = ctx.currentTime;
  const dur = v(0.13, 0.1);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(v(380, 0.02), t);
  osc.frequency.exponentialRampToValueAtTime(v(220, 0.02), t + dur * 0.7);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.10, 0.03) * gainMult, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.85); // early rolloff

  osc.connect(gain); gain.connect(dest);
  osc.start(t); osc.stop(t + dur);
}

// toggle/modal — ultra-soft tactile tick, mid-frequency for perceptibility
export function synthToggle(ctx, dest, gainMult) {
  const t = ctx.currentTime;
  const dur = v(0.04, 0.1);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = v(480, 0.02);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.10, 0.03) * gainMult, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain); gain.connect(dest);
  osc.start(t); osc.stop(t + dur);
}
