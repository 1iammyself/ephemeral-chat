import { useState, useEffect, useRef } from 'react';
import { Mic, X, ChevronRight, Send, Minimize2, Maximize2, CheckCircle2 } from 'lucide-react';
import socketManager from '../socket';

/**
 * Role matrix:
 *  isHost && !isHotSeat  → overseer: sees current Q, queue count, skip/end controls, no dismiss
 *  isHotSeat && !isHost  → subject:  sees current Q, queue count, next button, can dismiss
 *  isHotSeat && isHost   → host-in-seat: both of the above, can dismiss
 *  !isHotSeat && !isHost → audience: sees current Q, anonymous submit form, can dismiss
 */
export default function HotSeat({ hotSeatTarget, isHotSeat, isHost, onEnd }) {
  const [question, setQuestion] = useState('');
  const [queueCount, setQueueCount] = useState(0);
  const [current, setCurrent] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const submitTimerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleQuestion = () => {
      setQueueCount(n => n + 1);
    };
    const handleNext = ({ question: q }) => {
      setCurrent(q);
      setQueueCount(n => Math.max(0, n - 1));
    };
    socketManager.on('hotSeat-question-received', handleQuestion);
    socketManager.on('hotSeat-next-question', handleNext);
    return () => {
      socketManager.off('hotSeat-question-received', handleQuestion);
      socketManager.off('hotSeat-next-question', handleNext);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    };
  }, []);

  const submitQuestion = () => {
    const text = question.trim();
    if (!text) return;
    socketManager.emit('hotSeat-question', { text });
    setQuestion('');
    setSubmitted(true);
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current);
    submitTimerRef.current = setTimeout(() => setSubmitted(false), 3000);
  };

  const nextQuestion = () => {
    socketManager.emit('hotSeat-next');
  };

  // Only pure overseers (host who is NOT in the hot seat) stay locked to the overlay
  const canMinimize = isHotSeat || !isHost;

  if (dismissed) {
    return (
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[80]">
        <button
          onClick={() => setDismissed(false)}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-red-500 to-orange-500 text-white text-xs font-bold shadow-lg shadow-red-500/30"
        >
          <Mic className="w-3.5 h-3.5" />
          Hot Seat: {hotSeatTarget}
          <Maximize2 className="w-3 h-3 opacity-70" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-red-500 to-orange-500">
          <Mic className="w-5 h-5 text-white" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-red-100 font-medium uppercase tracking-wider">Hot Seat</p>
            <p className="text-white font-black text-sm truncate">{hotSeatTarget}</p>
          </div>
          <div className="flex items-center gap-1">
            {canMinimize && (
              <button
                onClick={() => setDismissed(true)}
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                title="Minimize"
              >
                <Minimize2 className="w-4 h-4 text-white" />
              </button>
            )}
            {isHost && (
              <button
                onClick={onEnd}
                className="p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                title="End Hot Seat"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Current question — visible to all */}
          <div className="min-h-[72px] flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-4">
            {current ? (
              <p className="text-center text-gray-900 dark:text-white font-medium leading-snug">{current}</p>
            ) : (
              <p className="text-center text-gray-400 text-sm">
                {isHotSeat ? 'Waiting for a question…' : `Waiting for ${hotSeatTarget} to start…`}
              </p>
            )}
          </div>

          {/* Hot-seat subject controls */}
          {isHotSeat && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {queueCount} question{queueCount !== 1 ? 's' : ''} waiting
              </span>
              <button
                onClick={nextQuestion}
                disabled={queueCount === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-bold disabled:opacity-40 hover:bg-orange-600 transition-colors active:scale-95"
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Host overseer controls (host who is not in the hot seat) */}
          {isHost && !isHotSeat && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">
                {queueCount} question{queueCount !== 1 ? 's' : ''} in queue
              </span>
              <button
                onClick={nextQuestion}
                disabled={queueCount === 0}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500/80 text-white text-xs font-bold disabled:opacity-40 hover:bg-orange-600 transition-colors active:scale-95"
                title="Skip to next question"
              >
                Skip <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Audience submission form (not host, not hot-seat) */}
          {!isHotSeat && !isHost && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ask <span className="font-bold text-gray-700 dark:text-gray-200">{hotSeatTarget}</span> something:
              </p>
              {submitted ? (
                <div className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Submitted anonymously</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && submitQuestion()}
                    placeholder="Your anonymous question…"
                    maxLength={200}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-400/50"
                  />
                  <button
                    onClick={submitQuestion}
                    disabled={!question.trim()}
                    className="p-2 rounded-lg bg-orange-500 text-white disabled:opacity-40 hover:bg-orange-600 transition-colors active:scale-95"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
              {queueCount > 0 && (
                <p className="text-[10px] text-center text-gray-400">
                  {queueCount} question{queueCount !== 1 ? 's' : ''} waiting in queue
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
