import { useState, useEffect, useRef } from 'react';
import { Mic, X, ChevronRight, Send } from 'lucide-react';
import socketManager from '../socket';

export default function HotSeat({ hotSeatTarget, isHotSeat, isHost, onEnd }) {
  const [question, setQuestion] = useState('');
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleQuestion = ({ text }) => {
      setQueue(q => [...q, text]);
    };
    const handleNext = ({ question: q }) => {
      setCurrent(q);
      setQueue(prev => prev.slice(1));
    };
    socketManager.on('hotSeat-question-received', handleQuestion);
    socketManager.on('hotSeat-next-question', handleNext);
    return () => {
      socketManager.off('hotSeat-question-received', handleQuestion);
      socketManager.off('hotSeat-next-question', handleNext);
    };
  }, []);

  const submitQuestion = () => {
    const text = question.trim();
    if (!text) return;
    socketManager.emit('hotSeat-question', { text });
    setQuestion('');
  };

  const nextQuestion = () => {
    socketManager.emit('hotSeat-next');
  };

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

        <div className="p-5 space-y-4">
          {isHotSeat ? (
            /* Hot seat person's view */
            <div className="space-y-4">
              <div className="min-h-[80px] flex items-center justify-center rounded-xl bg-gray-50 dark:bg-gray-800 px-4 py-5">
                {current ? (
                  <p className="text-center text-gray-900 dark:text-white font-medium text-lg leading-snug">{current}</p>
                ) : (
                  <p className="text-center text-gray-400 text-sm">Waiting for a question…</p>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{queue.length} question{queue.length !== 1 ? 's' : ''} in queue</span>
                <button
                  onClick={nextQuestion}
                  disabled={queue.length === 0}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-500 text-white font-bold disabled:opacity-40 hover:bg-orange-600 transition-colors active:scale-95"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            /* Audience view */
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Submit an anonymous question for <span className="font-bold text-gray-700 dark:text-gray-200">{hotSeatTarget}</span>:
              </p>
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
              {queue.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Recent questions</p>
                  {queue.map((q, i) => (
                    <div key={i} className="text-xs text-gray-600 dark:text-gray-400 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800">
                      {q}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
