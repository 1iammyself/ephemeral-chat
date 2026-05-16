// Singleton camera stream manager.
// Uses lazy suspension (track.enabled = false) instead of stop/restart on every dismiss.

const READY_TIMEOUT_MS = 800;
const SUSPEND_IDLE_MS = 15_000;
const MAX_VIDEO_BYTES = 8 * 1024 * 1024;

const SILENCE_THRESHOLD = 0.015; // RMS
const SILENCE_DURATION_MS = 2000;
const SILENCE_GRACE_MS = 1000;

// Dual-camera canvas dimensions
const DUAL_W = 854;
const DUAL_H = 480;
// PiP: 32% width, top-right, rounded 12px
const PIP_W = Math.round(DUAL_W * 0.32);
const PIP_H = Math.round(PIP_W * (DUAL_H / DUAL_W));
const PIP_X = DUAL_W - PIP_W - 14;
const PIP_Y = 14;
const PIP_R = 12;

const S = Object.freeze({
  IDLE: 'IDLE',
  ACQUIRING: 'ACQUIRING',
  READY: 'READY',
  RECORDING: 'RECORDING',
  SUSPENDED: 'SUSPENDED',
});

class CameraPrewarmService {
  constructor() {
    this._state = S.IDLE;
    this._stream = null;
    this._recorder = null;
    this._chunks = [];
    this._owner = null;
    this._suspendTimer = null;
    this._readyResolve = null;
    this._readyPromise = null;
    this._facingMode = 'user';
    this._mimeType = '';
    this._attachedEl = null;
    this._audioCtx = null;
    this._analyser = null;
    this._silenceCheckId = null;
    this._silenceGraceTimer = null;
    this.onSilenceStop = null;

    // Dual-camera state
    this._secondStream = null;
    this._dualCanvas = null;
    this._dualRafId = null;
    this._dualPrimaryVideo = null;
    this._dualSecondVideo = null;

    const stop = () => this._emergencyStop();
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
    window.addEventListener('pagehide', stop);
    window.addEventListener('beforeunload', stop);
    // OS-level camera reallocation can silently invalidate streams
    navigator.mediaDevices?.addEventListener?.('devicechange', stop);
    // Network drop to offline should stop recording immediately
    navigator.connection?.addEventListener('change', () => {
      if (navigator.connection?.type === 'none') stop();
    });
  }

  // ── Public API ────────────────────────────────────────────────

  async prewarm(facingMode = 'user') {
    this._facingMode = facingMode;

    if (this._state === S.SUSPENDED) {
      clearTimeout(this._suspendTimer);
      this._stream.getTracks().forEach(t => { t.enabled = true; });
      this._state = S.READY;
      return;
    }
    if (this._state !== S.IDLE) return;

    this._state = S.ACQUIRING;
    this._readyPromise = new Promise(r => { this._readyResolve = r; });

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 854 }, height: { ideal: 480 } },
        audio: true,
      });

      const vt = this._stream.getVideoTracks()[0];
      if (vt) vt.onended = () => this._emergencyStop();
      this._stream.addEventListener('inactive', () => this._emergencyStop());

      this._mimeType = this._pickMime();
      await this._waitForFrame();

      this._state = S.READY;
      this._readyResolve(true);
    } catch (err) {
      this._state = S.IDLE;
      this._readyResolve(false);
      throw err;
    }
  }

  attach(videoEl) {
    this._attachedEl = videoEl;
    if (!this._stream || !videoEl) return;
    videoEl.srcObject = this._stream;
    videoEl.muted = true;
    videoEl.playsInline = true;
    videoEl.play().catch(() => {});
  }

  get isReady() { return this._state === S.READY; }
  get state() { return this._state; }
  get mimeType() { return this._mimeType; }
  get isDualActive() { return !!this._secondStream; }
  get secondStream() { return this._secondStream; }

  waitReady() {
    if (this._state === S.READY) return Promise.resolve(true);
    return this._readyPromise ?? Promise.resolve(false);
  }

  // ── Dual-camera (BeReal-style) ────────────────────────────────

  async enableDualCamera() {
    if (!this._stream || this._state === S.RECORDING) return false;
    if (this._secondStream) return true; // already enabled
    const secondFacing = this._facingMode === 'user' ? 'environment' : 'user';
    try {
      this._secondStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: secondFacing, width: { ideal: PIP_W * 2 }, height: { ideal: PIP_H * 2 } },
        audio: false,
      });
      this._setupDualCanvas();
      return true;
    } catch {
      this._secondStream = null;
      return false;
    }
  }

  disableDualCamera() {
    this._teardownDualCanvas();
    this._secondStream?.getTracks().forEach(t => t.stop());
    this._secondStream = null;
  }

  startRecording(owner) {
    if (this._state !== S.READY) return false;
    if (this._owner && this._owner !== owner) {
      // Release previous instance safely before granting lock to new one
      this._owner._onForceRelease?.();
    }
    this._owner = owner;
    this._chunks = [];

    // Use canvas stream when dual-camera is active; otherwise record primary stream directly
    let recordStream = this._stream;
    if (this._dualCanvas && typeof this._dualCanvas.captureStream === 'function') {
      recordStream = this._dualCanvas.captureStream(30);
      // Add audio track from primary stream (canvas captureStream has no audio)
      this._stream.getAudioTracks().forEach(t => recordStream.addTrack(t));
    }

    const opts = this._mimeType ? { mimeType: this._mimeType } : {};
    this._recorder = new MediaRecorder(recordStream, opts);
    this._recorder.ondataavailable = e => { if (e.data.size > 0) this._chunks.push(e.data); };
    this._recorder.start(100);
    this._state = S.RECORDING;
    this._startSilenceDetection();
    return true;
  }

  stopRecording() {
    return new Promise((res, rej) => {
      if (!this._recorder || this._state !== S.RECORDING) { res(null); return; }
      this._recorder.onstop = () => {
        this._stopSilenceDetection();
        const blob = new Blob(this._chunks, { type: this._mimeType || 'video/webm' });
        this._chunks = [];
        this._owner = null;
        this._state = S.READY;
        blob.size > MAX_VIDEO_BYTES ? rej(new Error('Video exceeds 8 MB')) : res(blob);
      };
      this._recorder.stop();
    });
  }

  async flipCamera() {
    const next = this._facingMode === 'user' ? 'environment' : 'user';
    if (this._state === S.RECORDING) await this.stopRecording().catch(() => {});
    // Tear down dual before flip
    if (this._secondStream) this.disableDualCamera();
    this._stream?.getVideoTracks().forEach(t => t.stop());
    this._state = S.IDLE;
    await this.prewarm(next);
    if (this._attachedEl) this.attach(this._attachedEl);
  }

  // Soft pause — WebRTC-safe: track.enabled = false, NOT track.stop()
  suspend() {
    if (!this._stream) return;
    this._stream.getTracks().forEach(t => { t.enabled = false; });
    this._state = S.SUSPENDED;
    clearTimeout(this._suspendTimer);
    this._suspendTimer = setTimeout(() => this.release(), SUSPEND_IDLE_MS);
  }

  release() {
    clearTimeout(this._suspendTimer);
    this._stopSilenceDetection();
    this.onSilenceStop = null;
    this._teardownDualCanvas();
    this._secondStream?.getTracks().forEach(t => t.stop());
    this._secondStream = null;
    if (this._recorder && this._state === S.RECORDING) this._recorder.stop();
    this._stream?.getTracks().forEach(t => t.stop());
    this._stream = null;
    this._recorder = null;
    this._chunks = [];
    this._owner = null;
    this._attachedEl = null;
    this._state = S.IDLE;
    this._readyPromise = null;
    this._readyResolve = null;
  }

  // ── Private ───────────────────────────────────────────────────

  _setupDualCanvas() {
    this._dualCanvas = document.createElement('canvas');
    this._dualCanvas.width = DUAL_W;
    this._dualCanvas.height = DUAL_H;

    this._dualPrimaryVideo = document.createElement('video');
    this._dualPrimaryVideo.srcObject = this._stream;
    this._dualPrimaryVideo.muted = true;
    this._dualPrimaryVideo.playsInline = true;
    this._dualPrimaryVideo.play().catch(() => {});

    this._dualSecondVideo = document.createElement('video');
    this._dualSecondVideo.srcObject = this._secondStream;
    this._dualSecondVideo.muted = true;
    this._dualSecondVideo.playsInline = true;
    this._dualSecondVideo.play().catch(() => {});

    const draw = () => {
      if (!this._dualCanvas) return;
      const ctx = this._dualCanvas.getContext('2d');

      // Primary: full frame
      ctx.drawImage(this._dualPrimaryVideo, 0, 0, DUAL_W, DUAL_H);

      // PiP: secondary camera with rounded clip
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(PIP_X + PIP_R, PIP_Y);
      ctx.arcTo(PIP_X + PIP_W, PIP_Y,     PIP_X + PIP_W, PIP_Y + PIP_H, PIP_R);
      ctx.arcTo(PIP_X + PIP_W, PIP_Y + PIP_H, PIP_X, PIP_Y + PIP_H, PIP_R);
      ctx.arcTo(PIP_X,         PIP_Y + PIP_H, PIP_X, PIP_Y,           PIP_R);
      ctx.arcTo(PIP_X,         PIP_Y,         PIP_X + PIP_W, PIP_Y,     PIP_R);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(this._dualSecondVideo, PIP_X, PIP_Y, PIP_W, PIP_H);
      ctx.restore();

      // PiP border
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(PIP_X + PIP_R, PIP_Y);
      ctx.arcTo(PIP_X + PIP_W, PIP_Y,     PIP_X + PIP_W, PIP_Y + PIP_H, PIP_R);
      ctx.arcTo(PIP_X + PIP_W, PIP_Y + PIP_H, PIP_X, PIP_Y + PIP_H, PIP_R);
      ctx.arcTo(PIP_X,         PIP_Y + PIP_H, PIP_X, PIP_Y,           PIP_R);
      ctx.arcTo(PIP_X,         PIP_Y,         PIP_X + PIP_W, PIP_Y,     PIP_R);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      this._dualRafId = requestAnimationFrame(draw);
    };
    this._dualRafId = requestAnimationFrame(draw);
  }

  _teardownDualCanvas() {
    cancelAnimationFrame(this._dualRafId);
    this._dualRafId = null;
    if (this._dualPrimaryVideo) {
      this._dualPrimaryVideo.pause();
      this._dualPrimaryVideo.srcObject = null;
      this._dualPrimaryVideo = null;
    }
    if (this._dualSecondVideo) {
      this._dualSecondVideo.pause();
      this._dualSecondVideo.srcObject = null;
      this._dualSecondVideo = null;
    }
    this._dualCanvas = null;
  }

  _startSilenceDetection() {
    if (!this._stream) return;
    try {
      this._audioCtx = new AudioContext();
      const src = this._audioCtx.createMediaStreamSource(this._stream);
      this._analyser = this._audioCtx.createAnalyser();
      this._analyser.fftSize = 512;
      src.connect(this._analyser);
      const buf = new Float32Array(this._analyser.fftSize);
      let silentSince = null;

      this._silenceGraceTimer = setTimeout(() => {
        this._silenceCheckId = setInterval(() => {
          if (this._state !== S.RECORDING) { this._stopSilenceDetection(); return; }
          this._analyser.getFloatTimeDomainData(buf);
          const rms = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
          if (rms < SILENCE_THRESHOLD) {
            if (!silentSince) silentSince = Date.now();
            else if (Date.now() - silentSince >= SILENCE_DURATION_MS) {
              this._stopSilenceDetection();
              this.onSilenceStop?.();
            }
          } else {
            silentSince = null;
          }
        }, 200);
      }, SILENCE_GRACE_MS);
    } catch (_) { /* AudioContext not available */ }
  }

  _stopSilenceDetection() {
    clearTimeout(this._silenceGraceTimer);
    clearInterval(this._silenceCheckId);
    this._silenceGraceTimer = null;
    this._silenceCheckId = null;
    this._audioCtx?.close().catch(() => {});
    this._audioCtx = null;
    this._analyser = null;
  }

  _pickMime() {
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isSafari && MediaRecorder.isTypeSupported('video/mp4')) return 'video/mp4';
    for (const m of ['video/webm;codecs=vp8,opus', 'video/webm']) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  // Deterministic fallback chain: requestVideoFrameCallback → rAF videoWidth → 800ms timeout
  _waitForFrame() {
    const tmp = document.createElement('video');
    tmp.srcObject = this._stream;
    tmp.muted = true;
    tmp.playsInline = true;
    tmp.play().catch(() => {});
    return new Promise(resolve => {
      const done = () => { tmp.pause(); tmp.srcObject = null; resolve(); };
      const tid = setTimeout(done, READY_TIMEOUT_MS);
      if (typeof tmp.requestVideoFrameCallback === 'function') {
        tmp.requestVideoFrameCallback(() => { clearTimeout(tid); done(); });
      } else {
        const check = () => {
          if (tmp.videoWidth > 0) { clearTimeout(tid); done(); }
          else requestAnimationFrame(check);
        };
        requestAnimationFrame(check);
      }
    });
  }

  _emergencyStop() {
    if (this._state === S.IDLE) return;
    this._chunks = [];
    this.release();
  }
}

export const cameraPrewarmService = new CameraPrewarmService();
