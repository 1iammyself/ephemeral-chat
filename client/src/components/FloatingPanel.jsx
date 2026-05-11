import { useState, useRef, useCallback } from 'react';
import { X, Minus, Maximize2 } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const MIN_W = 320;
const MIN_H = 200;

const HANDLES = {
  n:  { top: 0,    left: 10,  right: 10, height: 6,  cursor: 'ns-resize'   },
  ne: { top: 0,    right: 0,  width: 14, height: 14, cursor: 'nesw-resize' },
  e:  { right: 0,  top: 10,   bottom: 10, width: 6,  cursor: 'ew-resize'   },
  se: { bottom: 0, right: 0,  width: 14, height: 14, cursor: 'nwse-resize' },
  s:  { bottom: 0, left: 10,  right: 10, height: 6,  cursor: 'ns-resize'   },
  sw: { bottom: 0, left: 0,   width: 14, height: 14, cursor: 'nesw-resize' },
  w:  { left: 0,   top: 10,   bottom: 10, width: 6,  cursor: 'ew-resize'   },
  nw: { top: 0,    left: 0,   width: 14, height: 14, cursor: 'nwse-resize' },
};

export default function FloatingPanel({
  title,
  icon: Icon,
  iconColor = 'text-blue-400',
  children,
  onClose,
  defaultWidth  = 660,
  defaultHeight = 500,
  defaultX,
  defaultY,
  zIndex  = 220,
  onFocus,
}) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const ix = defaultX ?? Math.max(20, (window.innerWidth  - (defaultWidth  ?? 660)) / 2);
  const iy = defaultY ?? Math.max(60, (window.innerHeight - (defaultHeight ?? 500)) / 3);

  const panelRef = useRef(null);
  const [pos,       setPos]       = useState({ x: ix, y: iy });
  const [size,      setSize]      = useState({ w: defaultWidth, h: defaultHeight });
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [saved,     setSaved]     = useState(null);

  const posRef  = useRef(pos);  posRef.current  = pos;
  const sizeRef = useRef(size); sizeRef.current = size;

  // ── drag ────────────────────────────────────────────────────────────
  const drag = useRef(null);

  const onDragMove = useCallback((e) => {
    if (!drag.current) return;
    const { ox, oy } = drag.current;
    const w = panelRef.current?.offsetWidth ?? sizeRef.current.w;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth  - w,  e.clientX - ox)),
      y: Math.max(0, Math.min(window.innerHeight - 44, e.clientY - oy)),
    });
  }, []);

  const onDragUp = useCallback(() => {
    drag.current = null;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup',   onDragUp);
  }, [onDragMove]);

  const startDrag = useCallback((e) => {
    if (maximized) return;
    e.preventDefault();
    onFocus?.();
    const r = panelRef.current.getBoundingClientRect();
    drag.current = { ox: e.clientX - r.left, oy: e.clientY - r.top };
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup',   onDragUp);
  }, [maximized, onFocus, onDragMove, onDragUp]);

  // ── resize ──────────────────────────────────────────────────────────
  const rsz = useRef(null);

  const onRszMove = useCallback((e) => {
    if (!rsz.current) return;
    const { dir, sx, sy, sw, sh, sl, st } = rsz.current;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    let w = sw, h = sh, x = sl, y = st;
    if (dir.includes('e')) w = Math.max(MIN_W, sw + dx);
    if (dir.includes('s')) h = Math.max(MIN_H, sh + dy);
    if (dir.includes('w')) { const nw = Math.max(MIN_W, sw - dx); x = sl + sw - nw; w = nw; }
    if (dir.includes('n')) { const nh = Math.max(MIN_H, sh - dy); y = st + sh - nh; h = nh; }
    setSize({ w, h });
    setPos({ x, y });
  }, []);

  const onRszUp = useCallback(() => {
    rsz.current = null;
    window.removeEventListener('pointermove', onRszMove);
    window.removeEventListener('pointerup',   onRszUp);
  }, [onRszMove]);

  const startResize = useCallback((e, dir) => {
    if (maximized) return;
    e.preventDefault(); e.stopPropagation();
    onFocus?.();
    const r = panelRef.current.getBoundingClientRect();
    rsz.current = { dir, sx: e.clientX, sy: e.clientY, sw: r.width, sh: r.height, sl: r.left, st: r.top };
    window.addEventListener('pointermove', onRszMove);
    window.addEventListener('pointerup',   onRszUp);
  }, [maximized, onFocus, onRszMove, onRszUp]);

  // ── maximize ────────────────────────────────────────────────────────
  const toggleMax = useCallback(() => {
    if (maximized) {
      if (saved) { setPos(saved.pos); setSize(saved.size); }
      setMaximized(false);
    } else {
      setSaved({ pos: posRef.current, size: sizeRef.current });
      setMaximized(true);
    }
  }, [maximized, saved]);

  // ── theme-aware values ──────────────────────────────────────────────
  const panelBg      = isDark ? '#0f0f14'                                           : '#ffffff';
  const titleBarBg   = isDark ? '#0b0b10'                                           : '#f1f5f9';
  const borderColor  = isDark ? 'rgba(255,255,255,0.07)'                            : 'rgba(0,0,0,0.09)';
  const titleColor   = isDark ? 'rgba(255,255,255,0.5)'                             : 'rgba(0,0,0,0.5)';
  const shadowStyle  = isDark
    ? '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.07)'
    : '0 12px 40px rgba(0,0,0,0.13), 0 0 0 1px rgba(0,0,0,0.09)';

  // ── style ───────────────────────────────────────────────────────────
  const outerStyle = maximized
    ? { position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex, borderRadius: 0 }
    : { position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: minimized ? 'auto' : size.h, zIndex, borderRadius: 14 };

  return (
    <div
      ref={panelRef}
      onPointerDown={onFocus}
      style={{
        ...outerStyle,
        background: panelBg,
        boxShadow: shadowStyle,
        border: `1px solid ${borderColor}`,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        willChange: 'transform',
      }}
    >
      {/* ── title bar ─────────────────────────────────────────────────── */}
      <div
        onPointerDown={startDrag}
        onDoubleClick={toggleMax}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '8px 14px',
          flexShrink: 0,
          cursor: 'grab',
          background: titleBarBg,
          borderBottom: `1px solid ${borderColor}`,
        }}
      >
        {/* traffic lights */}
        <div
          style={{ display: 'flex', gap: 6, flexShrink: 0 }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {[
            { bg: '#ff5f57', hover: '#ff7b77', action: onClose,                   title: 'Close',    Icon: X        },
            { bg: '#febc2e', hover: '#ffd050', action: () => setMinimized(m=>!m), title: minimized ? 'Restore' : 'Minimize', Icon: Minus     },
            { bg: '#28c840', hover: '#4cd964', action: toggleMax,                  title: maximized ? 'Restore' : 'Maximize', Icon: Maximize2 },
          ].map(({ bg, action, title: t, Icon: Ic }, i) => (
            <button
              key={i}
              onClick={action}
              title={t}
              style={{ width: 12, height: 12, borderRadius: '50%', background: bg, border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'filter 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.2)'}
              onMouseLeave={e => e.currentTarget.style.filter = 'brightness(1)'}
              onMouseDown={e  => e.currentTarget.style.filter = 'brightness(0.8)'}
            >
              <Ic style={{ width: 7, height: 7, opacity: 0, transition: 'opacity 0.1s', color: 'rgba(0,0,0,0.5)' }}
                  strokeWidth={3}
                  onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              />
            </button>
          ))}
        </div>

        {/* title */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, minWidth: 0 }}>
          {Icon && <Icon style={{ width: 13, height: 13, flexShrink: 0 }} className={iconColor} />}
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: titleColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </span>
        </div>

        {/* spacer balances traffic lights */}
        <div style={{ width: 54, flexShrink: 0 }} />
      </div>

      {/* ── content ───────────────────────────────────────────────────── */}
      {!minimized && (
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {children}
        </div>
      )}

      {/* ── resize handles ────────────────────────────────────────────── */}
      {!maximized && !minimized && Object.entries(HANDLES).map(([dir, s]) => (
        <div
          key={dir}
          onPointerDown={(e) => startResize(e, dir)}
          style={{ position: 'absolute', cursor: s.cursor, top: s.top, right: s.right, bottom: s.bottom, left: s.left, width: s.width, height: s.height }}
        />
      ))}
    </div>
  );
}
