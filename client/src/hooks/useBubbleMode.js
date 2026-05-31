import { useState, useEffect } from 'react';

// Below this viewport width, game bubbles default to the compact view.
const COMPACT_MAX_PX = 640;
// Below this viewport width, the screen is too small to show the expanded
// card at all — bubbles are locked to compact (expand is not offered).
const EXPAND_MIN_PX = 380;

function readEnv() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
  return { defaultCompact: w < COMPACT_MAX_PX, canExpand: w >= EXPAND_MIN_PX };
}

/**
 * Drives the compact ⇄ expanded state for an in-chat game bubble.
 *
 * - Defaults to compact on small screens, expanded on larger ones.
 * - The user can override per bubble (expand / collapse).
 * - On very small screens expanding is disabled and the bubble stays compact.
 *
 * @returns {{ isCompact: boolean, canExpand: boolean, expand: () => void, collapse: () => void }}
 */
export default function useBubbleMode() {
  const [env, setEnv] = useState(readEnv);
  const [override, setOverride] = useState(null); // 'compact' | 'expanded' | null

  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setEnv(readEnv()));
    };
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  let mode = override ?? (env.defaultCompact ? 'compact' : 'expanded');
  if (!env.canExpand) mode = 'compact';

  return {
    isCompact: mode === 'compact',
    canExpand: env.canExpand,
    expand: () => setOverride('expanded'),
    collapse: () => setOverride('compact'),
  };
}
