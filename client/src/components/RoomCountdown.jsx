import { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';

function formatCountdown(ms) {
  if (ms <= 0) return '00:00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

export default function RoomCountdown({ opensAt, roomCode, onOpen }) {
  const [remaining, setRemaining] = useState(() => opensAt - Date.now());

  useEffect(() => {
    if (remaining <= 0) { onOpen?.(); return; }
    const id = setInterval(() => {
      const r = opensAt - Date.now();
      setRemaining(r);
      if (r <= 0) { clearInterval(id); onOpen?.(); }
    }, 500);
    return () => clearInterval(id);
  }, [opensAt, onOpen]);

  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-6 bg-gray-50 dark:bg-gray-950 select-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
          <Clock className="w-8 h-8 text-indigo-500 dark:text-indigo-400" />
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium tracking-wide uppercase">
          Room opens in
        </p>
        <p className="text-5xl font-black tabular-nums text-gray-900 dark:text-white tracking-tight">
          {formatCountdown(remaining)}
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-600 font-mono">
          {roomCode}
        </p>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-600 max-w-xs text-center">
        You'll be joined automatically when the room opens.
      </p>
    </div>
  );
}
