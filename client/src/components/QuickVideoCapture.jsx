import React, { useEffect, useRef, useCallback, useState } from 'react';
import { RotateCcw, X, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cameraPrewarmService } from '../utils/CameraPrewarmService';

const MAX_DURATION_MS = 15000;
const UNDO_SECS = 4;
const RING_SZ = 80;
const RING_SW = 6;
const MAX_OVERLAYS = 6;

export const FILTERS = [
  { name: 'Normal', css: 'none' },
  { name: 'Warm',   css: 'sepia(0.25) saturate(1.5) hue-rotate(-10deg) brightness(1.05)' },
  { name: 'Cool',   css: 'saturate(0.8) hue-rotate(15deg) brightness(1.05) contrast(1.05)' },
];

const REACTION_EMOJI = ['😂', '❤️', '😮', '😍', '😎', '🔥'];

function randomPos() {
  return { xPct: 0.15 + Math.random() * 0.7, yPct: 0.2 + Math.random() * 0.5 };
}

export default function QuickVideoCapture({ open, replyTo, sendTriggerRef, onSend, onDismiss }) {
  const { t } = useTranslation();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const progressRef = useRef(0);
  const instanceRef = useRef({ _onForceRelease: null });
  const pendingBlobRef = useRef(null);
  const handleReleaseRef = useRef(null);
  const sentRef = useRef(false);
  const swipeStartXRef = useRef(null);
  const pipVideoRef = useRef(null);
  const ringContainerRef = useRef(null);

  const [isReady, setIsReady] = useState(false);
  const [showWarmingIndicator, setShowWarmingIndicator] = useState(false);
  const [recording, setRecording] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [filterIdx, setFilterIdx] = useState(0);
  const [undoPending, setUndoPending] = useState(false);
  const [undoSecsLeft, setUndoSecsLeft] = useState(UNDO_SECS);
  const [overlays, setOverlays] = useState([]);
  const [allowSave, setAllowSave] = useState(false);
  const [isDualEnabled, setIsDualEnabled] = useState(false);

  // ── Ring animation ──────────────────────────────────────────

  const drawRing = useCallback((p) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = RING_SZ / 2, cy = RING_SZ / 2;
    const r = (RING_SZ - RING_SW * 2) / 2;

    ctx.clearRect(0, 0, RING_SZ, RING_SZ);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = RING_SW;
    ctx.stroke();

    if (p > 0) {
      let ep;
      if (p < 0.08) ep = (p / 0.08) * (p / 0.08) * 0.08;
      else if (p > 0.92) { const q = (p - 0.92) / 0.08; ep = 0.92 + (1 - (1 - q) * (1 - q)) * 0.08; }
      else ep = p;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ep);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = RING_SW;
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }, []);

  const animateRing = useCallback(() => {
    const step = (now) => {
      const raw = Math.min((now - startRef.current) / MAX_DURATION_MS, 1);
      progressRef.current = raw;
      drawRing(raw);
      if (raw >= 1) {
        drawRing(1);
        const el = ringContainerRef.current;
        if (el) {
          el.style.transition = 'transform 80ms ease-out';
          el.style.transform = 'scale(1.18)';
          setTimeout(() => {
            if (el) { el.style.transition = 'transform 80ms ease-in'; el.style.transform = 'scale(1)'; }
            setTimeout(() => handleReleaseRef.current?.(), 80);
          }, 80);
        } else {
          handleReleaseRef.current?.();
        }
      } else {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [drawRing]);

  // ── Undo countdown ──────────────────────────────────────────

  useEffect(() => {
    if (!undoPending) return;
    if (undoSecsLeft <= 0) {
      const pending = pendingBlobRef.current;
      pendingBlobRef.current = null;
      setUndoPending(false);
      if (pending) {
        onSend?.(
          pending.blob, replyTo, pending.duration, pending.mimeType,
          FILTERS[filterIdx].css, overlays, allowSave
        );
      }
      cameraPrewarmService.suspend();
      onDismiss?.();
      return;
    }
    const timer = setTimeout(() => setUndoSecsLeft(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [undoPending, undoSecsLeft, replyTo, onSend, onDismiss, filterIdx, overlays, allowSave]);

  useEffect(() => {
    if (isReady) { setShowWarmingIndicator(false); return; }
    const t = setTimeout(() => setShowWarmingIndicator(true), 600);
    return () => clearTimeout(t);
  }, [isReady]);

  // ── Release / send ──────────────────────────────────────────

  const handleRelease = useCallback(async () => {
    if (sentRef.current) return;
    sentRef.current = true;
    cancelAnimationFrame(rafRef.current);
    setRecording(false);

    const duration = startRef.current != null
      ? Math.round(performance.now() - startRef.current)
      : 0;

    try {
      const blob = await cameraPrewarmService.stopRecording();
      if (blob && blob.size > 0) {
        pendingBlobRef.current = { blob, duration, mimeType: cameraPrewarmService.mimeType };
        setUndoSecsLeft(UNDO_SECS);
        setUndoPending(true);
        return;
      }
    } catch (err) {
    }

    cameraPrewarmService.suspend();
    onDismiss?.();
  }, [onDismiss]);

  handleReleaseRef.current = handleRelease;

  const handleUndo = useCallback(() => {
    pendingBlobRef.current = null;
    setUndoPending(false);
    setUndoSecsLeft(UNDO_SECS);
    cameraPrewarmService.suspend();
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    if (sendTriggerRef) sendTriggerRef.current = handleRelease;
  });

  // ── Mount / unmount lifecycle ───────────────────────────────

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    sentRef.current = false;
    setIsReady(false);
    setRecording(false);
    setUndoPending(false);
    setUndoSecsLeft(UNDO_SECS);
    setOverlays([]);
    setAllowSave(false);
    setIsDualEnabled(false);
    pendingBlobRef.current = null;
    progressRef.current = 0;
    drawRing(0);

    instanceRef.current._onForceRelease = () => {
      cancelAnimationFrame(rafRef.current);
      setRecording(false);
      onDismiss?.();
    };

    cameraPrewarmService.onSilenceStop = () => {
      if (!sentRef.current) handleReleaseRef.current?.();
    };

    const init = async () => {
      try {
        await cameraPrewarmService.waitReady();
        if (cancelled) return;
        if (videoRef.current) cameraPrewarmService.attach(videoRef.current);
        setIsReady(true);
        // Do NOT auto-start recording — user must press the button
      } catch {
        // Camera permission denied
      }
    };

    init();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      cameraPrewarmService.onSilenceStop = null;
    };
  }, [open, onDismiss, drawRing]);

  // ── Start recording (on button press) ──────────────────────

  const handleStartRecording = useCallback(() => {
    if (recording || !isReady || undoPending) return;
    sentRef.current = false;
    const started = cameraPrewarmService.startRecording(instanceRef.current);
    if (started) {
      setRecording(true);
      startRef.current = performance.now();
      animateRing();
    }
  }, [recording, isReady, undoPending, animateRing]);

  // ── Dismiss ─────────────────────────────────────────────────

  const handleDismiss = useCallback(() => {
    if (undoPending) return;
    cancelAnimationFrame(rafRef.current);
    setRecording(false);
    if (cameraPrewarmService.state === 'RECORDING') {
      cameraPrewarmService.stopRecording().catch(() => {});
    }
    cameraPrewarmService.suspend();
    onDismiss?.();
  }, [undoPending, onDismiss]);

  const handleFlip = useCallback(async () => {
    if (recording) return;
    setIsDualEnabled(false);
    await cameraPrewarmService.flipCamera();
    setIsFrontCamera(f => !f);
  }, [recording]);

  const handleDualToggle = useCallback(async () => {
    if (recording) return;
    if (isDualEnabled) {
      cameraPrewarmService.disableDualCamera();
      setIsDualEnabled(false);
      if (pipVideoRef.current) pipVideoRef.current.srcObject = null;
    } else {
      const ok = await cameraPrewarmService.enableDualCamera();
      if (ok) {
        setIsDualEnabled(true);
        if (pipVideoRef.current && cameraPrewarmService.secondStream) {
          pipVideoRef.current.srcObject = cameraPrewarmService.secondStream;
          pipVideoRef.current.play().catch(() => {});
        }
      }
    }
  }, [recording, isDualEnabled]);

  useEffect(() => {
    if (isDualEnabled && pipVideoRef.current && cameraPrewarmService.secondStream) {
      pipVideoRef.current.srcObject = cameraPrewarmService.secondStream;
      pipVideoRef.current.play().catch(() => {});
    }
  }, [isDualEnabled]);

  // ── Horizontal swipe → switch filter (when not recording) ──

  const handleSwipeStart = (e) => { swipeStartXRef.current = e.touches[0].clientX; };
  const handleSwipeMove = (e) => {
    if (swipeStartXRef.current == null) return;
    const dx = e.touches[0].clientX - swipeStartXRef.current;
    if (!recording && !undoPending && Math.abs(dx) > 50) {
      setFilterIdx(i => dx < 0 ? (i + 1) % FILTERS.length : (i - 1 + FILTERS.length) % FILTERS.length);
      swipeStartXRef.current = e.touches[0].clientX;
    }
  };

  const handleAddEmoji = (emoji) => {
    if (overlays.length >= MAX_OVERLAYS) return;
    setOverlays(prev => [...prev, { id: Date.now(), emoji, ...randomPos() }]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black flex flex-col">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 safe-area-inset-top">
        <button
          onClick={handleDismiss}
          className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white backdrop-blur-sm"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDualToggle}
            disabled={recording}
            title={t('quickVideoCapture.dualCamera')}
            className={`w-10 h-10 rounded-full flex items-center justify-center text-white backdrop-blur-sm disabled:opacity-40 transition-colors ${
              isDualEnabled ? 'bg-rose-500/70' : 'bg-white/10'
            }`}
          >
            <Layers className="w-4 h-4" />
          </button>
          <button
            onClick={handleFlip}
            disabled={recording}
            className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white backdrop-blur-sm disabled:opacity-40"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Viewfinder rectangle (centred) ──────────────────── */}
      <div className="flex-1 flex items-center justify-center px-4 min-h-0">
        <div
          className="relative w-full max-w-sm h-full max-h-[65vh] aspect-[3/4] bg-gray-950 rounded-[32px] overflow-hidden shadow-2xl border border-white/10"
          onTouchStart={handleSwipeStart}
          onTouchMove={handleSwipeMove}
        >
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: isReady ? 1 : 0.4,
              transition: 'opacity 0.3s ease',
              filter: FILTERS[filterIdx].css,
              transform: isFrontCamera ? 'scaleX(-1)' : 'none',
            }}
            muted
            playsInline
            autoPlay
          />

          {/* Emoji overlays */}
          {overlays.map(o => (
            <div
              key={o.id}
              className="absolute pointer-events-none select-none text-3xl drop-shadow-lg"
              style={{ left: `${o.xPct * 100}%`, top: `${o.yPct * 100}%`, transform: 'translate(-50%,-50%)' }}
            >
              {o.emoji}
            </div>
          ))}

          {/* Warming indicator */}
          {showWarmingIndicator && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-white/50 text-xs font-bold uppercase tracking-widest animate-pulse">
                Starting camera…
              </span>
            </div>
          )}

          {/* PiP for dual camera */}
          {isDualEnabled && (
            <div
              className="absolute rounded-xl overflow-hidden border-2 border-white/60 shadow-lg pointer-events-none"
              style={{ top: 12, right: 12, width: '30%', aspectRatio: '16/9' }}
            >
              <video
                ref={pipVideoRef}
                className="w-full h-full object-cover"
                muted playsInline autoPlay
              />
            </div>
          )}

          {/* REC indicator */}
          {recording && (
            <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-black/50 rounded-full px-3 py-1 backdrop-blur-sm">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white text-xs font-bold uppercase tracking-widest">REC</span>
            </div>
          )}

          {/* Reply context */}
          {replyTo && (
            <div className="absolute bottom-4 left-4 right-4 px-3 py-2 bg-black/60 rounded-xl backdrop-blur-sm pointer-events-none">
              <div className="text-white/50 text-[9px] font-bold uppercase tracking-wider mb-0.5">Replying to</div>
              <div className="text-white text-xs font-bold truncate">
                {replyTo.sender?.nickname ?? replyTo.sender}
              </div>
              <div className="text-white/60 text-[11px] truncate">{replyTo.content}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter strip ────────────────────────────────────── */}
      {isReady && !undoPending && (
        <div className="flex items-center justify-center gap-4 py-2">
          {FILTERS.map((f, i) => (
            <button
              key={f.name}
              onClick={() => !recording && setFilterIdx(i)}
              className={`text-[11px] font-bold transition-all duration-200 ${
                i === filterIdx ? 'text-white' : 'text-white/30'
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Emoji strip (during recording) ──────────────────── */}
      {recording && !undoPending && (
        <div className="flex justify-center pb-1">
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1.5">
            {REACTION_EMOJI.map(emoji => (
              <button
                key={emoji}
                onClick={() => handleAddEmoji(emoji)}
                disabled={overlays.length >= MAX_OVERLAYS}
                className="text-xl active:scale-125 transition-transform disabled:opacity-30"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Bottom controls ──────────────────────────────────── */}
      <div
        className="flex flex-col items-center gap-3 pb-10 pt-3 safe-area-inset-bottom"
      >
        {undoPending ? (
          <div className="flex flex-col items-center gap-3">
            <div className="text-white/70 text-sm font-bold tracking-wide">
              {t('quickVideoCapture.sendingIn', { sec: undoSecsLeft })}
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setAllowSave(s => !s)}
                className={`w-9 h-5 rounded-full transition-colors duration-200 flex items-center px-0.5 ${allowSave ? 'bg-green-500' : 'bg-white/20'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${allowSave ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
              <span className="text-white/60 text-xs">{t('quickVideoCapture.allowSave')}</span>
            </label>
            <button
              onClick={handleUndo}
              className="px-8 py-2.5 bg-white/15 rounded-full text-white font-bold text-sm backdrop-blur-sm border border-white/25 active:bg-white/30 transition-colors"
            >
              {t('quickVideoCapture.undo')}
            </button>
          </div>
        ) : (
          <>
            <span className="text-white/40 text-[11px] uppercase tracking-widest">
              {isReady
                ? recording
                  ? 'Release to send'
                  : 'Hold to record'
                : 'Warming up…'}
            </span>

            {/* Record button: hold to record, release to stop */}
            <div
              ref={ringContainerRef}
              className="relative select-none cursor-pointer"
              style={{ width: RING_SZ, height: RING_SZ }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                handleStartRecording();
              }}
              onPointerUp={recording ? handleRelease : undefined}
            >
              <canvas
                ref={canvasRef}
                width={RING_SZ}
                height={RING_SZ}
                className="absolute inset-0 pointer-events-none"
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className={`rounded-full transition-all duration-200 ${
                  recording
                    ? 'w-10 h-10 bg-red-500'
                    : 'w-14 h-14 border-[6px] border-white/30 bg-white'
                }`} />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
