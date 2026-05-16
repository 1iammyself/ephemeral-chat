// Audio bus graph: buses → FX chains → master → destination.
// Stereo widener is a pass-through GainNode in Phase 1; Phase 2 will add mid-side processing.

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
  // ── Master ──
  const masterBus = ctx.createGain();
  masterBus.gain.value = 1.0;
  masterBus.connect(ctx.destination);

  // ── uiBus: soft saturation → limiter → master ──
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

  uiBus.connect(saturation);
  saturation.connect(limiter);
  limiter.connect(masterBus);

  // ── presenceBus: compressor → dry/wet split → master ──
  const presenceBus = ctx.createGain();
  presenceBus.gain.value = 1.0;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 6;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.25;

  const dryGain = ctx.createGain();
  dryGain.gain.value = 0.85;

  const reverb = ctx.createConvolver();
  reverb.buffer = reverbIR(ctx, 0.4, 4);

  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.15;

  presenceBus.connect(compressor);
  compressor.connect(dryGain);
  compressor.connect(reverb);
  reverb.connect(wetGain);
  dryGain.connect(masterBus);
  wetGain.connect(masterBus);

  // ── attentionBus: compressor → limiter → master (Phase 2 sounds) ──
  const attentionBus = ctx.createGain();
  attentionBus.gain.value = 1.0;

  const attentionComp = ctx.createDynamicsCompressor();
  attentionComp.threshold.value = -6;
  attentionComp.ratio.value = 8;
  attentionComp.attack.value = 0.001;
  attentionComp.release.value = 0.1;

  attentionBus.connect(attentionComp);
  attentionComp.connect(masterBus);

  // ── ambientBus: muted until Phase 2 ──
  const ambientBus = ctx.createGain();
  ambientBus.gain.value = 0.0;
  ambientBus.connect(masterBus);

  return { masterBus, uiBus, presenceBus, attentionBus, ambientBus };
}
