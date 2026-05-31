import React from 'react';
import { ChevronDown, ChevronUp, Trophy } from 'lucide-react';

// Status chip styling, keyed by game status.
const STATUS = {
  open: { dot: 'bg-white', text: 'text-white', label: 'Open', wrap: 'bg-white/20' },
  live: { dot: 'bg-green-400', text: 'text-green-100', label: 'Live', wrap: 'bg-green-500/30' },
  finished: { text: 'text-yellow-100', label: 'Done', wrap: 'bg-black/20' },
};

// Non-accent primary button variants (accent uses the room vibe class instead).
const PRIMARY_VARIANTS = {
  queue: 'bg-yellow-600/80 text-yellow-100',
  cpu: 'bg-purple-600/80 text-purple-100',
  ghost: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
};

/**
 * A minimized representation of an in-chat game. Shows just enough to identify
 * the game and the mode/settings being played, plus the single most relevant
 * action and an optional control to expand into the full card.
 */
export default function CompactGameBubble({
  vibe,
  icon,
  title,
  badges = [],
  status,
  subtitle,
  primary,
  canExpand,
  onExpand,
  maxWidthClass = 'max-w-[260px] sm:max-w-[280px]',
}) {
  const st = status ? STATUS[status] : null;
  const isAccentPrimary = !primary?.variant || primary.variant === 'accent';

  return (
    <div className={`w-full ${maxWidthClass} overflow-hidden rounded-2xl shadow-md border border-black/10 dark:border-white/10 bg-white dark:bg-gray-900`}>
      {/* Accent header — identity, mode badges, status */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 ${vibe.accentClass}`}>
        {icon != null && <span className="text-white text-sm leading-none shrink-0">{icon}</span>}
        <span className="text-white font-bold text-xs truncate flex-1 min-w-0">{title}</span>
        {badges.filter(Boolean).map((b, i) => (
          <span key={i} className="text-[9px] font-black text-white/85 bg-white/20 rounded-full px-1.5 py-0.5 uppercase tracking-tight shrink-0">
            {b}
          </span>
        ))}
        {st && (
          <span className={`flex items-center gap-1 rounded-full px-1.5 py-0.5 shrink-0 ${st.wrap}`}>
            {status === 'finished'
              ? <Trophy className="w-3 h-3 text-yellow-300" />
              : <span className={`w-1.5 h-1.5 rounded-full ${st.dot} animate-pulse`} />}
            <span className={`text-[9px] font-black ${st.text}`}>{st.label}</span>
          </span>
        )}
      </div>

      {/* Summary + actions */}
      <div className="flex items-center gap-2 px-2.5 py-1.5">
        <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300 truncate flex-1 min-w-0">
          {subtitle}
        </span>
        {primary && (
          <button
            onClick={primary.onClick}
            className={`py-1 px-2.5 text-[11px] font-black rounded-lg shrink-0 transition-opacity hover:opacity-90 ${isAccentPrimary ? `text-white ${vibe.accentClass}` : PRIMARY_VARIANTS[primary.variant]}`}
          >
            {primary.label}
          </button>
        )}
        {canExpand && (
          <button
            onClick={onExpand}
            title="Expand"
            aria-label="Expand game card"
            className="p-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Slim control shown above an expanded card to collapse it back to compact. */
export function BubbleCollapseBar({ onCollapse }) {
  return (
    <div className="flex justify-end mb-1">
      <button
        onClick={onCollapse}
        title="Minimize card"
        aria-label="Collapse game card"
        className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
      >
        <ChevronUp className="w-3 h-3" /> Collapse
      </button>
    </div>
  );
}
