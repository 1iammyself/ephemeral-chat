import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react';

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function hashHue(input) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h % 360;
}

const ReactionOverlay = forwardRef(function ReactionOverlay(_, ref) {
  const [sprites, setSprites] = useState([]);

  const spawn = useCallback(({ emoji, x, y }) => {
    if (!emoji || typeof emoji !== 'string') return;

    const safeX = typeof x === 'number' ? x : window.innerWidth / 2;
    const safeY = typeof y === 'number' ? y : window.innerHeight - 96;

    const id = `rx_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const dx = (Math.random() - 0.5) * 360;
    const upY = -clamp(220 + Math.random() * 260, 220, 520);
    const downY = clamp(90 + Math.random() * 220, 90, 360);
    const spin = (Math.random() - 0.5) * 900;
    const dur = clamp(1200 + Math.random() * 900, 1200, 2300);
    const hue = hashHue(`${emoji}:${id}`);

    setSprites(prev => {
      const next = prev.length > 35 ? prev.slice(prev.length - 35) : prev;
      return [
        ...next,
        { id, emoji, x: safeX, y: safeY, dx, upY, downY, spin, dur, hue },
      ];
    });
  }, []);

  useImperativeHandle(ref, () => ({ spawn }), [spawn]);

  const nodes = useMemo(() => {
    return sprites.map(s => (
      <div
        key={s.id}
        className="message-reaction-sprite"
        style={{
          left: `${s.x}px`,
          top: `${s.y}px`,
          '--dx': `${s.dx}px`,
          '--upY': `${s.upY}px`,
          '--downY': `${s.downY}px`,
          '--spin': `${s.spin}deg`,
          '--dur': `${s.dur}ms`,
          '--shadow': `hsla(${s.hue}, 85%, 45%, 0.25)`,
        }}
        onAnimationEnd={() => {
          setSprites(prev => prev.filter(p => p.id !== s.id));
        }}
      >
        {s.emoji}
      </div>
    ));
  }, [sprites]);

  return <div className="message-reaction-overlay">{nodes}</div>;
});

export default ReactionOverlay;

