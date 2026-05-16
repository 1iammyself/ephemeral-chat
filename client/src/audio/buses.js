// Audio bus graph: buses → FX chains → master → accessibilityFilter → destination.
// Volume nodes sit after each FX chain, giving per-category user-controlled gain.
// Ducking (_applyDucking) controls bus input gain nodes directly.
// Stereo widener on presenceBus: headphone-aware width, smoothed via lerp.

function saturationCurve(amount = 28) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

function reverbIR(ctx, durationSec = 0.4, decay = 4) {
  const len = Math.floor(ctx.sampleRate * durationSec);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return ir;
}

export function setupBuses(ctx) {
  // ── Accessibility filter → destination ──
  const accessibilityFilter = ctx.createBiquadFilter();
  accessibilityFilter.type = 'lowpass';
  accessibilityFilter.frequency.value = 20000;
  accessibilityFilter.Q.value = 0.5;
  accessibilityFilter.connect(ctx.destination);

  // ── Master ──
  const masterBus = ctx.createGain();
  masterBus.gain.value = 1.0;
  masterBus.connect(accessibilityFilter);

  // ── uiBus: (ducking) → saturation → limiter → uiVolume → master ──
  const uiBus = ctx.createGain();
  uiBus.gain.value = 1.0;

  const saturation = ctx.createWaveShaper();
  saturation.curve = saturationCurve(28);
  saturation.oversample = '2x';

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  const uiVolume = ctx.createGain();
  uiVolume.gain.value = 1.0;

  uiBus.connect(saturation);
  saturation.connect(limiter);
  limiter.connect(uiVolume);
  uiVolume.connect(masterBus);

  // ── presenceBus: (ducking) → compressor → stereoWidener → dry/wet/burst → presenceVolume → master ──
  const presenceBus = ctx.createGain();
  presenceBus.gain.value = 1.0;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 6;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  // Stereo widener: Haas-effect pseudo-stereo from mono source.
  // widenerDelay.delayTime controls width: 0 = mono, 0.02 = 20ms (max width).
  // Engine updates delayTime via _applyWidener() when headset state changes.
  const widenerDelay = ctx.createDelay(0.05);
  widenerDelay.delayTime.value = 0.001; // start nearly mono (speaker assumption)

  const widenerMerger = ctx.createChannelMerger(2);
  compressor.connect(widenerMerger, 0, 0); // left: direct (no delay)
  compressor.connect(widenerDelay);
  widenerDelay.connect(widenerMerger, 0, 1); // right: delayed

  // Short reverb (0.4s) — normal presence sounds
  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.85;

  const reverb = ctx.createConvolver();
  reverb.buffer = reverbIR(ctx, 0.4, 4);

  const presenceWetGain = ctx.createGain();
  presenceWetGain.gain.value = 0.15;

  // Long reverb (1.5s) — reaction burst tail.
  // Engine opens burstWetGain when burst detected; tail extends naturally on repeat bursts.
  const burstReverb = ctx.createConvolver();
  burstReverb.buffer = reverbIR(ctx, 1.5, 3);

  const burstWetGain = ctx.createGain();
  burstWetGain.gain.value = 0;

  // burstReverbSend: engine feeds short impulses here to seed the long reverb tail.
  const burstReverbSend = ctx.createGain();
  burstReverbSend.gain.value = 1.0;

  const presenceVolume = ctx.createGain();
  presenceVolume.gain.value = 1.0;

  presenceBus.connect(compressor);
  widenerMerger.connect(dryGain);
  widenerMerger.connect(reverb);
  reverb.connect(presenceWetGain);
  dryGain.connect(presenceVolume);
  presenceWetGain.connect(presenceVolume);

  burstReverbSend.connect(burstReverb);
  burstReverb.connect(burstWetGain);
  burstWetGain.connect(presenceVolume);

  presenceVolume.connect(masterBus);

  // ── attentionBus: compressor → limiter → attentionVolume → master ──
  const attentionBus = ctx.createGain();
  attentionBus.gain.value = 1.0;

  const attentionComp = ctx.createDynamicsCompressor();
  attentionComp.threshold.value = -6;
  attentionComp.ratio.value = 8;
  attentionComp.attack.value = 0.001;
  attentionComp.release.value = 0.1;

  const attentionLimiter = ctx.createDynamicsCompressor();
  attentionLimiter.threshold.value = -1;
  attentionLimiter.knee.value = 0;
  attentionLimiter.ratio.value = 20;
  attentionLimiter.attack.value = 0.001;
  attentionLimiter.release.value = 0.05;

  const attentionVolume = ctx.createGain();
  attentionVolume.gain.value = 1.0;

  attentionBus.connect(attentionComp);
  attentionComp.connect(attentionLimiter);
  attentionLimiter.connect(attentionVolume);
  attentionVolume.connect(masterBus);

  // ── ambientBus: lowpass filter → reverb → ambientVolume → master ──
  // Fully wet reverb treatment gives the lush atmospheric quality ambient requires.
  const ambientBus = ctx.createGain();
  ambientBus.gain.value = 1.0;

  const ambientLowpass = ctx.createBiquadFilter();
  ambientLowpass.type = 'lowpass';
  ambientLowpass.frequency.value = 800;
  ambientLowpass.Q.value = 0.5;

  const ambientReverb = ctx.createConvolver();
  ambientReverb.buffer = reverbIR(ctx, 1.5, 3);

  const ambientVolume = ctx.createGain();
  ambientVolume.gain.value = 0.0; // muted until settings.ambient = true

  ambientBus.connect(ambientLowpass);
  ambientLowpass.connect(ambientReverb);
  ambientReverb.connect(ambientVolume);
  ambientVolume.connect(masterBus);

  // ── voiceBus: reserved for future call audio mixing ──
  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 0.0;
  voiceBus.connect(masterBus);

  return {
    masterBus,
    accessibilityFilter,
    uiBus, presenceBus, attentionBus, ambientBus, voiceBus,
    uiVolume, presenceVolume, attentionVolume, ambientVolume,
    // Presence FX controls — used by engine for performance modes and burst tails
    presenceWetGain,
    burstReverbSend, burstWetGain,
    widenerDelay,
  };
}
