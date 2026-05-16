import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, MessageSquare, Send, CornerDownRight } from 'lucide-react';

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ThreadMessage({ msg }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-0.5 group">
      <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500">
        <span className="font-bold text-gray-600 dark:text-gray-300">{msg.isAnonymous ? 'Anonymous 👻' : msg.sender?.nickname}</span>
        <span>·</span>
        <span>{formatTime(msg.timestamp)}</span>
      </div>
      <div className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-3 py-2 leading-snug">
        {msg.messageType === 'image' ? '📷 Photo' :
          msg.messageType === 'audio' ? '🎤 Voice Note' :
          msg.messageType === 'file' ? `📎 ${msg.fileName || 'File'}` :
          msg.content}
      </div>
    </div>
  );
}

export default function ThreadView({ parentMessage, messages, currentUser, isOpen, onClose, onSend, roomVibe }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const threadReplies = messages
    .filter(m => m.parentId === parentMessage?.id)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [isOpen, threadReplies.length]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || !parentMessage?.id) return;
    onSend(parentMessage.id, text);
    setDraft('');
  };

  if (!isOpen || !parentMessage) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[70] w-full sm:w-96 flex flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-100 dark:border-gray-800 animate-in slide-in-from-right-4 duration-200">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <MessageSquare className="w-4 h-4 text-indigo-500" />
        <span className="font-black text-sm text-gray-900 dark:text-white flex-1">{t('thread.title')}</span>
        <span className="text-xs text-gray-400">{t('thread.reply', { count: threadReplies.length })}</span>
        <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
          <X className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* Parent message */}
      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-800/30 shrink-0">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 dark:text-gray-500 mb-1">
          <span className="font-bold text-gray-600 dark:text-gray-300">
            {parentMessage.isAnonymous ? 'Anonymous 👻' : parentMessage.sender?.nickname}
          </span>
          <span>·</span>
          <span>{formatTime(parentMessage.timestamp)}</span>
        </div>
        <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug">
          {parentMessage.messageType === 'image' ? '📷 Photo' :
            parentMessage.messageType === 'audio' ? '🎤 Voice Note' :
            parentMessage.messageType === 'file' ? `📎 ${parentMessage.fileName || 'File'}` :
            parentMessage.content}
        </p>
      </div>

      {/* Thread replies */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {threadReplies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 opacity-50">
            <CornerDownRight className="w-6 h-6 text-gray-400" />
            <p className="text-xs text-gray-400">{t('thread.noReplies')}</p>
          </div>
        ) : (
          threadReplies.map(m => <ThreadMessage key={m.id} msg={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2 focus-within:ring-2 focus-within:ring-indigo-400/40 transition-shadow">
          <input
            ref={inputRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={t('thread.replyPlaceholder')}
            className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!draft.trim()}
            className="p-1.5 rounded-lg bg-indigo-500 text-white disabled:opacity-40 hover:bg-indigo-600 transition-colors active:scale-95"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 text-center">{t('thread.repliesVisible')}</p>
      </div>
    </div>
  );
}
