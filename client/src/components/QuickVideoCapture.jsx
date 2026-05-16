import React, { useEffect, useRef, useCallback, useState } from 'react';
import { RotateCcw, X, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cameraPrewarmService } from '../utils/CameraPrewarmService';

const RING_DURATION_MS = 5000;
const RING_SZ = 72;
const RING_SW = 5;
const MAX_OVERLAYS = 6;

export const FILTERS = [
  { name: 'Normal', css: 'none' },
  { name: 'Warm',   css: 'sepia(0.25) saturate(1.5) hue-rotate(-10deg) brightness(1.05)' },
  { name: 'Cool',   css: 'saturate(0.8) hue-rotate(15deg) brightness(1.05) contrast(1.05)' },
];

const REACTION_EMOJI = ['😂', '❤️', '😮', '😍', '😎', '🔥'];

function randomPos() {
  return {
    xPct: 0.15 + Math.random() * 0.7,
    yPct: 0.2  + Math.random() * 0.5,
  };
}

/**
 * Bottom-sheet gesture-native video capture.
 *
 * Phase 2 additions: filter selection (horizontal swipe), 2s undo buffer, silence auto-stop.
 * Phase 3 additions: emoji reaction overlays, "save to chat" toggle.
 */
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
  const touchStartYRef = useRef(null);
  const swipeStartXRef = useRef(null);
  const pipVideoRef = useRef(null);

  const ringContainerRef = useRef(null);

  const [isReady, setIsReady] = useState(false);
  const [showWarmingIndicator, setShowWarmingIndicator] = useState(false);
  const [recording, setRecording] = useState(false);
  const [filterIdx, setFilterIdx] = useState(0);
  const [undoPending, setUndoPending] = useState(false);
  const [undoSecsLeft, setUndoSecsLeft] = useState(2);
  const [overlays, setOverlays] = useState([]); // [{id, emoji, xPct, yPct}]
  const [allowSave, setAllowSave] = useState(false);
  const [isDualEnabled, setIsDualEnabled] = useState(false);

  // ── Ring animation (canvas-only, no React state updates during draw) ──

  const drawRing = useCallback((p) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cx = RING_SZ / 2, cy = RING_SZ / 2;
    const r = (RING_SZ - RING_SW * 2) / 2;

    ctx.clearRect(0, 0, RING_SZ, RING_SZ);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
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
      const raw = Math.min((now - startRef.current) / RING_DURATION_MS, 1);
      progressRef.current = raw;
      drawRing(raw);
      if (raw >= 1) {
        drawRing(1);
        // Micro bounce on auto-stop before triggering send (spec §5.2)
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

  // ── Undo countdown ────────────────────────────────────────────

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

  // Only show "Starting camera…" indicator if warmup exceeds 600ms (spec §4.3)
  useEffect(() => {
    if (isReady) { setShowWarmingIndicator(false); return; }
    const t = setTimeout(() => setShowWarmingIndicator(true), 600);
    return () => clearTimeout(t);
  }, [isReady]);

  // ── Send / dismiss ────────────────────────────────────────────

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
        setUndoSecsLeft(2);
        setUndoPending(true);
        return;
      }
    } catch (err) {
      console.error('stopRecording failed:', err);
    }

    cameraPrewarmService.suspend();
    onDismiss?.();
  }, [onDismiss]);

  handleReleaseRef.current = handleRelease;

  const handleUndo = useCallback(() => {
    pendingBlobRef.current = null;
    setUndoPending(false);
    setUndoSecsLeft(2);
    cameraPrewarmService.suspend();
    onDismiss?.();
  }, [onDismiss]);

  useEffect(() => {
    if (sendTriggerRef) sendTriggerRef.current = handleRelease;
  });

  // ── Mount / unmount lifecycle ─────────────────────────────────

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    sentRef.current = false;
    setIsReady(false);
    setRecording(false);
    setUndoPending(false);
    setUndoSecsLeft(2);
    setOverlays([]);
    setAllowSave(false);
    setIsDualEnabled(false);
    pendingBlobRef.current = null;
    progressRef.current = 0;

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

        const started = cameraPrewarmService.startRecording(instanceRef.current);
        if (started && !cancelled) {
          setRecording(true);
          startRef.current = performance.now();
          animateRing();
        }
      } catch {
        // Camera permission denied or not available
      }
    };

    init();
    return () => {
      cancelled = true;
      cancelAnimationFrame(rafRef.current);
      cameraPrewarmService.onSilenceStop = null;
    };
  }, [open, animateRing, onDismiss]);

  // ── Dismiss ───────────────────────────────────────────────────

  const handleDismiss = useCallback(() => {
    if (undoPending) return;
    if (recording && progressRef.current >= 0.2) return;
    cancelAnimationFrame(rafRef.current);
    setRecording(false);
    if (cameraPrewarmService.state === 'RECORDING') {
      cameraPrewarmService.stopRecording().catch(() => {});
    }
    cameraPrewarmService.suspend();
    onDismiss?.();
  }, [recording, undoPending, onDismiss]);

  const handleFlip = useCallback(async () => {
    if (recording) return;
    setIsDualEnabled(false);
    await cameraPrewarmService.flipCamera();
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

  // Attach PiP stream when ref becomes available after dual is enabled
  useEffect(() => {
    if (isDualEnabled && pipVideoRef.current && cameraPrewarmService.secondStream) {
      pipVideoRef.current.srcObject = cameraPrewarmService.secondStream;
      pipVideoRef.current.play().catch(() => {});
    }
  }, [isDualEnabled]);

  // ── Swipe gestures (vertical = dismiss, horizontal = filter) ──

  const handleSwipeStart = (e) => {
    touchStartYRef.current = e.touches[0].clientY;
    swipeStartXRef.current = e.touches[0].clientX;
  };

  const handleSwipeMove = (e) => {
    if (touchStartYRef.current == null || swipeStartXRef.current == null) return;
    const dy = e.touches[0].clientY - touchStartYRef.current;
    const dx = e.touches[0].clientX - swipeStartXRef.current;

    if (dy > 60 && Math.abs(dy) > Math.abs(dx) * 1.5) {
      handleDismiss();
      return;
    }

    if (!recording && !undoPending && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
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
    <div
      className="fixed inset-0 z-[200] flex items-end"
      onMouseDown={e => { if (e.target === e.currentTarget) handleDismiss(); }}
    >
      <div className="absolute inset-0 bg-black/70" />

      <div
        className="relative w-full bg-black overflow-hidden"
        style={{ height: '72vh', borderRadius: '20px 20px 0 0' }}
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
      >
        {/* Viewfinder with active filter */}
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            opacity: isReady ? 1 : 0.4,
            transition: 'opacity 0.3s ease',
            filter: FILTERS[filterIdx].css,
          }}
          muted
          playsInline
          autoPlay
        />

        {/* Emoji overlays on viewfinder */}
        {overlays.map(o => (
          <div
            key={o.id}
            className="absolute pointer-events-none select-none text-3xl drop-shadow-lg"
            style={{ left: `${o.xPct * 100}%`, top: `${o.yPct * 100}%`, transform: 'translate(-50%,-50%)' }}
          >
            {o.emoji}
          </div>
        ))}

        {showWarmingIndicator && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-white/50 text-xs font-bold uppercase tracking-widest animate-pulse">
              Starting camera…
            </span>
          </div>
        )}

        {/* PiP preview — secondary camera shown in corner when dual enabled */}
        {isDualEnabled && (
          <div
            className="absolute rounded-xl overflow-hidden border-2 border-white/60 shadow-lg pointer-events-none"
            style={{ top: 60, right: 14, width: '30%', aspectRatio: '16/9' }}
          >
            <video
              ref={pipVideoRef}
              className="w-full h-full object-cover"
              muted
              playsInline
              autoPlay
            />
          </div>
        )}

        {/* Top controls */}
        <div className="absolute top-4 left-0 right-0 flex items-center justify-between px-4">
          <button
            onClick={handleDismiss}
            className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white backdrop-blur-sm"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            {/* Dual-camera toggle */}
            <button
              onClick={handleDualToggle}
              disabled={recording}
              title={t('quickVideoCapture.dualCamera')}
              className={`w-10 h-10 rounded-full flex items-center justify-center text-white backdrop-blur-sm disabled:opacity-40 transition-colors ${
                isDualEnabled ? 'bg-rose-500/70' : 'bg-black/50'
              }`}
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={handleFlip}
              disabled={recording}
              className="w-10 h-10 bg-black/50 rounded-full flex items-center justify-center text-white backdrop-blur-sm disabled:opacity-40"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter indicator (hidden during undo) */}
        {isReady && !undoPending && (
          <div className="absolute top-16 left-0 right-0 flex flex-col items-center gap-1 pointer-events-none">
            <div className="flex items-center gap-3 bg-black/30 backdrop-blur-sm rounded-full px-4 py-1">
              {FILTERS.map((f, i) => (
                <span
                  key={f.name}
                  className={`text-[11px] font-bold transition-all duration-200 ${
                    i === filterIdx ? 'text-white' : 'text-white/35'
                  }`}
                >
                  {f.name}
                </span>
              ))}
            </div>
            {!recording && (
              <span className="text-white/25 text-[9px] uppercase tracking-widest">
                {t('quickVideoCapture.swipeFilters')}
              </span>
            )}
          </div>
        )}

        {/* Emoji reaction strip (during recording, if not in undo) */}
        {recording && isReady && !undoPending && (
          <div className="absolute top-28 left-0 right-0 flex justify-center">
            <div className="flex items-center gap-2 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1.5">
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

        {/* Reply context — frozen at intent-start */}
        {replyTo && (
          <div className={`absolute left-4 right-4 px-3 py-2 bg-black/50 rounded-xl backdrop-blur-sm pointer-events-none ${recording && isReady ? 'top-[148px]' : 'top-[104px]'}`}>
            <div className="text-white/50 text-[9px] font-bold uppercase tracking-wider mb-0.5">Replying to</div>
            <div className="text-white text-xs font-bold truncate">
              {replyTo.sender?.nickname ?? replyTo.sender}
            </div>
            <div className="text-white/60 text-[11px] truncate">{replyTo.content}</div>
          </div>
        )}

        {/* Hold ring / undo overlay — safe-area-inset-bottom prevents OS gesture bar overlap */}
        <div
          className="absolute left-0 right-0 flex flex-col items-center gap-2"
          style={{ bottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
        >
          {undoPending ? (
            <div className="flex flex-col items-center gap-3">
              <div className="text-white/70 text-sm font-bold tracking-wide">
                {t('quickVideoCapture.sendingIn', { sec: undoSecsLeft })}
              </div>
              {/* Save to chat toggle */}
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
              {recording && (
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-white/80 text-xs font-bold uppercase tracking-widest">REC</span>
                </div>
              )}

              <div
                ref={ringContainerRef}
                className="relative cursor-pointer select-none"
                style={{ width: RING_SZ, height: RING_SZ }}
                onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
                onPointerUp={recording ? handleRelease : undefined}
              >
                <canvas ref={canvasRef} width={RING_SZ} height={RING_SZ} className="absolute inset-0 pointer-events-none" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className={`w-12 h-12 rounded-full transition-all duration-200 ${
                    recording
                      ? 'bg-red-500/20 border-2 border-red-500'
                      : 'bg-white/10 border-2 border-white/40'
                  }`} />
                </div>
              </div>

              <span className="text-white/40 text-[10px]">
                {recording ? 'Release to send' : 'Warming up…'}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
