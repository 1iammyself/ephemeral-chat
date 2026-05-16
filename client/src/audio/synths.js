// Phase 1 + 2 + 3 synthesizers — soft futuristic / glassmorphism personality.
// All synths accept an optional `theme` param: { pitchMult, gainMult, character }.
// Each function schedules audio into `destination` and returns immediately.

// Gain variance
function v(value, pct) {
  return value * (1 + (Math.random() * 2 - 1) * pct);
}

// Timing jitter: ±5ms onset shift per spec §2.9
function jt(ctx) {
  return ctx.currentTime + (Math.random() * 0.01 - 0.005);
}

function noiseBuffer(ctx, durationSec) {
  const len = Math.floor(ctx.sampleRate * durationSec);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function charOscType(character) {
  switch (character) {
    case 'digital':    return 'triangle';
    case 'warm':       return 'triangle';
    case 'percussive': return 'triangle';
    case 'retro':      return 'square';
    case 'detuned':    return 'triangle';
    default:           return 'sine';
  }
}

function detuneOffset(character) {
  return character === 'detuned' ? (Math.random() * 8 - 4) : 0;
}

function tm(theme, gainMult) {
  return {
    p: theme?.pitchMult ?? 1.0,
    g: (theme?.gainMult ?? 1.0) * gainMult,
    c: theme?.character ?? 'glass',
  };
}

// ── Phase 1 ──────────────────────────────────────────────────────────────────

// tap — soft glass micro-tick: sine + faint filtered noise, 35–50ms
export function synthTap(ctx, dest, gainMult, theme = null) {
  const { p, g, c } = tm(theme, gainMult);
  const t = jt(ctx);
  const dur = v(0.04, 0.15);

  const osc = ctx.createOscillator();
  osc.type = charOscType(c);
  osc.frequency.value = v(650 * p, 0.02);
  osc.detune.value = detuneOffset(c);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.12, 0.03) * g, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(t);
  osc.stop(t + dur);

  if (c !== 'retro') {
    const ns = ctx.createBufferSource();
    ns.buffer = noiseBuffer(ctx, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3000 * p;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.018 * g, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
    ns.connect(bp);
    bp.connect(ng);
    ng.connect(dest);
    ns.start(t);
    ns.stop(t + dur);
  }
}

// send — soft upward confirmation: sine-led dual tone, restrained pitch glide, 8ms attack
export function synthSend(ctx, dest, gainMult, theme = null) {
  const { p, g, c } = tm(theme, gainMult);
  const t = jt(ctx);
  const dur = v(0.08, 0.1);
  const f0 = v(440 * p, 0.02);
  const f1 = v(600 * p, 0.02);

  const sineOsc = ctx.createOscillator();
  sineOsc.type = charOscType(c);
  sineOsc.frequency.setValueAtTime(f0, t);
  sineOsc.frequency.exponentialRampToValueAtTime(f1, t + dur);
  sineOsc.detune.value = detuneOffset(c);

  const triOsc = ctx.createOscillator();
  triOsc.type = 'triangle';
  triOsc.frequency.setValueAtTime(f0, t);
  triOsc.frequency.exponentialRampToValueAtTime(f1, t + dur);

  const sG = ctx.createGain();
  sG.gain.setValueAtTime(0, t);
  sG.gain.linearRampToValueAtTime(v(0.105, 0.02) * g, t + 0.008); // 8ms attack
  sG.gain.exponentialRampToValueAtTime(0.001, t + dur);

  const tG = ctx.createGain();
  tG.gain.setValueAtTime(0, t);
  tG.gain.linearRampToValueAtTime(v(0.045, 0.02) * g, t + 0.008); // 8ms attack
  tG.gain.exponentialRampToValueAtTime(0.001, t + dur);

  sineOsc.connect(sG); sG.connect(dest);
  triOsc.connect(tG);  tG.connect(dest);
  sineOsc.start(t); triOsc.start(t);
  sineOsc.stop(t + dur); triOsc.stop(t + dur);
}

// receive — soft descending ping: asymmetric inverse of send, quieter
export function synthReceive(ctx, dest, gainMult, theme = null) {
  const { p, g, c } = tm(theme, gainMult);
  const t = jt(ctx);
  const dur = v(0.07, 0.1);
  const f0 = v(520 * p, 0.02);
  const f1 = v(400 * p, 0.02);

  const osc = ctx.createOscillator();
  osc.type = charOscType(c);
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);
  osc.detune.value = detuneOffset(c);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(v(0.09, 0.03) * g, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain); gain.connect(dest);
  osc.start(t); osc.stop(t + dur);
}

// reaction — soft crystalline FM shimmer, burst-aware FM index
export function synthReaction(ctx, dest, gainMult, burst, theme = null) {
  const { p, g } = tm(theme, gainMult);
  const t = jt(ctx);
  const dur = v(0.14, 0.1);
  const carrierFreq = v(380 * p, 0.02);
  const modIndex = burst ? 0.8 : 1.5;

  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.value = carrierFreq;

  const modulator = ctx.createOscillator();
  modulator.type = 'sine';
  modulator.frequency.value = carrierFreq / 2;

  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(carrierFreq * modIndex, t);
  modGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  modulator.connect(modGain);
  modGain.connect(carrier.frequency);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3000;
  lp.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.13, 0.03) * g, t + 0.015);
  gain.gain.setValueAtTime(v(0.13, 0.03) * g, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  carrier.connect(lp); lp.connect(gain); gain.connect(dest);
  carrier.start(t); modulator.start(t);
  carrier.stop(t + dur); modulator.stop(t + dur);
}

// roomJoin — airy rising presence: filtered noise + sine sweep
export function synthRoomJoin(ctx, dest, gainMult, theme = null) {
  const { p, g, c } = tm(theme, gainMult);
  const t = jt(ctx);
  const dur = v(0.2, 0.1);

  const osc = ctx.createOscillator();
  osc.type = charOscType(c);
  osc.frequency.setValueAtTime(v(220 * p, 0.02), t);
  osc.frequency.exponentialRampToValueAtTime(v(440 * p, 0.02), t + dur);
  osc.detune.value = detuneOffset(c);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.14, 0.03) * g, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain); gain.connect(dest);
  osc.start(t); osc.stop(t + dur);

  const ns = ctx.createBufferSource();
  ns.buffer = noiseBuffer(ctx, dur);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = v(400 * p, 0.1);
  bp.Q.value = 0.5;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.06 * g, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
  ns.connect(bp); bp.connect(ng); ng.connect(dest);
  ns.start(t); ns.stop(t + dur);
}

// roomLeave — soft descending departure, asymmetric from join (no noise)
export function synthRoomLeave(ctx, dest, gainMult, theme = null) {
  const { p, g, c } = tm(theme, gainMult);
  const t = jt(ctx);
  const dur = v(0.13, 0.1);

  const osc = ctx.createOscillator();
  osc.type = charOscType(c);
  osc.frequency.setValueAtTime(v(380 * p, 0.02), t);
  osc.frequency.exponentialRampToValueAtTime(v(220 * p, 0.02), t + dur * 0.7);
  osc.detune.value = detuneOffset(c);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.10, 0.03) * g, t + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.85);

  osc.connect(gain); gain.connect(dest);
  osc.start(t); osc.stop(t + dur);
}

// toggle/modal — ultra-soft tactile tick, mid-frequency for perceptibility
export function synthToggle(ctx, dest, gainMult, theme = null) {
  const { p, g, c } = tm(theme, gainMult);
  const t = jt(ctx);
  const dur = v(0.04, 0.1);

  const osc = ctx.createOscillator();
  osc.type = charOscType(c);
  osc.frequency.value = v(480 * p, 0.02);
  osc.detune.value = detuneOffset(c);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.10, 0.03) * g, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain); gain.connect(dest);
  osc.start(t); osc.stop(t + dur);
}

// ── Phase 2 ──────────────────────────────────────────────────────────────────

// typingNearby — barely perceptible presence whisper, fires once per typing session
export function synthTypingNearby(ctx, dest, gainMult, theme = null) {
  const { p, g } = tm(theme, gainMult);
  const t = jt(ctx);
  const dur = 0.032;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = v(320 * p, 0.03);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.038, 0.05) * g, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain); gain.connect(dest);
  osc.start(t); osc.stop(t + dur);
}

// connectionEstablished — three ascending major-chord tones (~290ms total)
export function synthConnectionEstablished(ctx, dest, gainMult, theme = null) {
  const { p, g, c } = tm(theme, gainMult);
  const t = jt(ctx); // jitter applies to onset; relative spacing preserved
  const tones = [330 * p, 415 * p, 523 * p];
  const toneDur = 0.085;
  const spacing = 0.075;

  tones.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = charOscType(c);
    osc.frequency.value = v(freq, 0.015);
    osc.detune.value = detuneOffset(c);

    const gain = ctx.createGain();
    const onset = t + i * spacing;
    gain.gain.setValueAtTime(0, onset);
    gain.gain.linearRampToValueAtTime(v(0.13, 0.03) * g * (1 - i * 0.06), onset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, onset + toneDur);

    osc.connect(gain); gain.connect(dest);
    osc.start(onset); osc.stop(onset + toneDur);
  });
}

// mention — assertive attention ping: strong ascending two-tone (200–250ms)
export function synthMention(ctx, dest, gainMult, theme = null) {
  const { p, g } = tm(theme, gainMult);
  const t = jt(ctx);
  const dur = v(0.22, 0.08);
  const f0 = v(520 * p, 0.02);
  const f1 = v(780 * p, 0.02);

  const sineOsc = ctx.createOscillator();
  sineOsc.type = 'sine';
  sineOsc.frequency.setValueAtTime(f0, t);
  sineOsc.frequency.exponentialRampToValueAtTime(f1, t + dur);

  const triOsc = ctx.createOscillator();
  triOsc.type = 'triangle';
  triOsc.frequency.setValueAtTime(f0, t);
  triOsc.frequency.exponentialRampToValueAtTime(f1, t + dur);

  const sG = ctx.createGain();
  sG.gain.setValueAtTime(0, t);
  sG.gain.linearRampToValueAtTime(v(0.175, 0.03) * g, t + 0.015);
  sG.gain.exponentialRampToValueAtTime(0.001, t + dur);

  const tG = ctx.createGain();
  tG.gain.setValueAtTime(0, t);
  tG.gain.linearRampToValueAtTime(v(0.065, 0.03) * g, t + 0.015);
  tG.gain.exponentialRampToValueAtTime(0.001, t + dur);

  sineOsc.connect(sG); sG.connect(dest);
  triOsc.connect(tG);  tG.connect(dest);
  sineOsc.start(t); triOsc.start(t);
  sineOsc.stop(t + dur); triOsc.stop(t + dur);
}

// roomInvite — three rising tones, differentiated from mention (~250ms)
export function synthRoomInvite(ctx, dest, gainMult, theme = null) {
  const { p, g, c } = tm(theme, gainMult);
  const t = jt(ctx);
  const tones = [440 * p, 550 * p, 660 * p];
  const toneDur = 0.09;
  const spacing = 0.068;

  tones.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = charOscType(c);
    osc.frequency.value = v(freq, 0.015);
    osc.detune.value = detuneOffset(c);

    const gain = ctx.createGain();
    const onset = t + i * spacing;
    gain.gain.setValueAtTime(0, onset);
    gain.gain.linearRampToValueAtTime(v(0.16, 0.03) * g, onset + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, onset + toneDur);

    osc.connect(gain); gain.connect(dest);
    osc.start(onset); osc.stop(onset + toneDur);
  });
}

// incomingCall — CRITICAL: two urgent double-pulse bursts at high pitch
export function synthIncomingCall(ctx, dest, gainMult, theme = null) {
  const { p, g } = tm(theme, gainMult);
  const t = jt(ctx);
  const pulseDur = 0.1;
  const gap = 0.08;

  for (let i = 0; i < 2; i++) {
    const onset = t + i * (pulseDur + gap);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = v(880 * p, 0.02);

    const harmOsc = ctx.createOscillator();
    harmOsc.type = 'sine';
    harmOsc.frequency.value = v(1320 * p, 0.02);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, onset);
    gain.gain.linearRampToValueAtTime(v(0.28, 0.03) * g, onset + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, onset + pulseDur);

    const hGain = ctx.createGain();
    hGain.gain.setValueAtTime(0, onset);
    hGain.gain.linearRampToValueAtTime(v(0.10, 0.03) * g, onset + 0.008);
    hGain.gain.exponentialRampToValueAtTime(0.001, onset + pulseDur);

    osc.connect(gain); gain.connect(dest);
    harmOsc.connect(hGain); hGain.connect(dest);
    osc.start(onset); osc.stop(onset + pulseDur);
    harmOsc.start(onset); harmOsc.stop(onset + pulseDur);
  }
}

// recordingStart — CRITICAL: sharp transient + sustaining harmonic (280ms)
export function synthRecordingStart(ctx, dest, gainMult, theme = null) {
  const { p, g } = tm(theme, gainMult);
  const t = jt(ctx);

  const transOsc = ctx.createOscillator();
  transOsc.type = 'sine';
  transOsc.frequency.value = v(1320 * p, 0.02);
  const transGain = ctx.createGain();
  transGain.gain.setValueAtTime(0, t);
  transGain.gain.linearRampToValueAtTime(v(0.22, 0.03) * g, t + 0.008);
  transGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  transOsc.connect(transGain); transGain.connect(dest);
  transOsc.start(t); transOsc.stop(t + 0.06);

  const harmOsc = ctx.createOscillator();
  harmOsc.type = 'sine';
  harmOsc.frequency.value = v(660 * p, 0.02);
  const harmGain = ctx.createGain();
  harmGain.gain.setValueAtTime(0, t + 0.01);
  harmGain.gain.linearRampToValueAtTime(v(0.14, 0.03) * g, t + 0.04);
  harmGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  harmOsc.connect(harmGain); harmGain.connect(dest);
  harmOsc.start(t + 0.01); harmOsc.stop(t + 0.28);
}

// recordingStop — CRITICAL: descending resolve, inverse shape of start (230ms)
export function synthRecordingStop(ctx, dest, gainMult, theme = null) {
  const { p, g } = tm(theme, gainMult);
  const t = jt(ctx);
  const dur = v(0.23, 0.08);
  const f0 = v(880 * p, 0.02);
  const f1 = v(550 * p, 0.02);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.7);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(v(0.18, 0.03) * g, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc.connect(gain); gain.connect(dest);
  osc.start(t); osc.stop(t + dur);
}

// ── Phase 3 ──────────────────────────────────────────────────────────────────

// composite — soft atmospheric texture for concurrent multi-category event bursts
export function synthComposite(ctx, dest, gainMult) {
  const t = jt(ctx);
  const dur = 0.19;

  for (const freq of [210, 315]) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * (1 + (Math.random() * 0.01 - 0.005));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.038 * gainMult, t + 0.04);
    g.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur);
  }
}
