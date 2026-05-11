import { useEffect, useState } from 'react';
import socketManager from '../socket';

const EXPIRE_MS = 2000;

export default function TypingPreview() {
  const [previews, setPreviews] = useState(new Map()); // nickname → { text, expiresAt }

  useEffect(() => {
    const handlePreview = ({ partial, nickname }) => {
      if (!nickname) return;
      setPreviews(prev => {
        const next = new Map(prev);
        next.set(nickname, { text: partial, expiresAt: Date.now() + EXPIRE_MS });
        return next;
      });
    };
    socketManager.on('typing-preview-received', handlePreview);
    return () => socketManager.off('typing-preview-received', handlePreview);
  }, []);

  // Expire stale previews
  useEffect(() => {
    const id = setInterval(() => {
      const now = Date.now();
      setPreviews(prev => {
        const filtered = new Map([...prev].filter(([, v]) => v.expiresAt > now));
        return filtered.size === prev.size ? prev : filtered;
      });
    }, 500);
    return () => clearInterval(id);
  }, []);

  if (previews.size === 0) return null;

  return (
    <div className="px-4 pb-1 space-y-0.5">
      {[...previews.entries()].map(([nick, { text }]) => (
        <div key={nick} className="flex items-start gap-1.5">
          <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 shrink-0 mt-px">{nick}</span>
          <p className="text-[13px] italic text-gray-400 dark:text-gray-500 truncate leading-snug">
            {text || '…'}
          </p>
        </div>
      ))}
    </div>
  );
}
