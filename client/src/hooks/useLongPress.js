import { useRef, useCallback, useEffect } from 'react';

const SILENT_ARM_MS = 70;
const INTENT_MS = 120;
const DRIFT_PX = 8;

/**
 * 3-phase gesture hook for video reply capture.
 * Phase 1 — silentArm (70ms):  no UI, prewarm begins
 * Phase 2 — intent    (120ms): micro-feedback fires once, capture sheet mounts
 * Phase 3 — release:           triggers send
 *
 * Hysteresis: intentLock only if pressDuration >= 120ms AND drift < 8px AND no scroll
 */
export function useLongPress({ onArm, onIntent, onRecord, onRelease, onCancel, disabled = false }) {
  const st = useRef({ armed: false, intentLocked: false, feedbackFired: false, startPos: null });
  const armTimer = useRef(null);
  const intentTimer = useRef(null);

  const resetState = useCallback(() => {
    clearTimeout(armTimer.current);
    clearTimeout(intentTimer.current);
    st.current = { armed: false, intentLocked: false, feedbackFired: false, startPos: null };
  }, []);

  const cancel = useCallback(() => {
    const wasLocked = st.current.intentLocked;
    resetState();
    if (wasLocked) onCancel?.();
  }, [onCancel, resetState]);

  const onStart = useCallback((e) => {
    if (disabled) return;
    const pt = e.touches?.[0] ?? e;
    st.current.startPos = { x: pt.clientX, y: pt.clientY };

    armTimer.current = setTimeout(() => {
      st.current.armed = true;
      onArm?.();
    }, SILENT_ARM_MS);

    intentTimer.current = setTimeout(() => {
      if (!st.current.startPos) return;
      st.current.intentLocked = true;
      if (!st.current.feedbackFired) {
        st.current.feedbackFired = true;
        onIntent?.();
      }
      onRecord?.();
    }, INTENT_MS);
  }, [disabled, onArm, onIntent, onRecord]);

  const onMove = useCallback((e) => {
    if (!st.current.startPos) return;
    const pt = e.touches?.[0] ?? e;
    const dx = pt.clientX - st.current.startPos.x;
    const dy = pt.clientY - st.current.startPos.y;
    if (Math.sqrt(dx * dx + dy * dy) >= DRIFT_PX) cancel();
  }, [cancel]);

  const onEnd = useCallback(() => {
    if (st.current.intentLocked) {
      resetState();
      onRelease?.();
    } else {
      resetState();
    }
  }, [onRelease, resetState]);

  useEffect(() => {
    const onHide = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, [cancel]);

  return {
    onPointerDown: onStart,
    onPointerMove: onMove,
    onPointerUp: onEnd,
    onPointerCancel: cancel,
    onTouchStart: onStart,
    onTouchMove: onMove,
    onTouchEnd: onEnd,
    onTouchCancel: cancel,
  };
}
