import React, { useState, useEffect } from 'react';
import { Trophy, Target, X, Flame } from 'lucide-react';

/**
 * ChallengeBar — Displays active room challenge progress and streak badges.
 * 
 * Challenge types:
 * - messages: "Send N messages as a group"
 * - votes: "Everyone vote on the poll"
 * - reactions: "React to N messages"
 */

const CHALLENGE_PRESETS = [
    { type: 'messages', target: 25, label: 'Send 25 messages together', emoji: '💬' },
    { type: 'messages', target: 50, label: 'Send 50 messages together', emoji: '💬' },
    { type: 'messages', target: 100, label: 'Send 100 messages together', emoji: '🔥' },
    { type: 'reactions', target: 10, label: 'React to 10 messages', emoji: '❤️' },
    { type: 'reactions', target: 25, label: 'React to 25 messages', emoji: '🎉' },
];

const ChallengeBar = ({ challenge, onDismiss }) => {
    const [showConfetti, setShowConfetti] = useState(false);

    if (!challenge) return null;

    const { label, current, target, completed, emoji } = challenge;
    const progress = Math.min((current / target) * 100, 100);

    useEffect(() => {
        if (completed && !showConfetti) {
            setShowConfetti(true);
            // Auto-dismiss confetti after 3 seconds
            const timer = setTimeout(() => setShowConfetti(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [completed]);

    return (
        <div className={`relative overflow-hidden ${completed ? 'bg-gradient-to-r from-yellow-100 to-amber-100 dark:from-yellow-900/20 dark:to-amber-900/20 border-yellow-300 dark:border-yellow-700' : 'bg-white/80 dark:bg-gray-800/80 border-gray-200 dark:border-gray-700'} backdrop-blur-sm border rounded-xl px-4 py-2.5 shadow-sm transition-all duration-500`}>
            {/* Confetti animation overlay */}
            {showConfetti && (
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {Array.from({ length: 20 }).map((_, i) => (
                        <span
                            key={i}
                            className="absolute text-sm animate-bounce"
                            style={{
                                left: `${Math.random() * 100}%`,
                                top: `${Math.random() * 100}%`,
                                animationDelay: `${Math.random() * 0.5}s`,
                                animationDuration: `${0.5 + Math.random() * 1}s`,
                            }}
                        >
                            {['🎉', '✨', '🏆', '⭐', '🎊'][Math.floor(Math.random() * 5)]}
                        </span>
                    ))}
                </div>
            )}

            <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center space-x-2">
                    {completed ? (
                        <Trophy className="w-4 h-4 text-yellow-500 animate-bounce" />
                    ) : (
                        <Target className="w-4 h-4 text-blue-500" />
                    )}
                    <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                        {emoji} {label}
                    </span>
                </div>
                <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-mono font-bold ${completed ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-500'}`}>
                        {current}/{target}
                    </span>
                    {onDismiss && (
                        <button onClick={onDismiss} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                            <X className="w-3 h-3 text-gray-400" />
                        </button>
                    )}
                </div>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all duration-700 ease-out ${completed ? 'bg-gradient-to-r from-yellow-400 to-amber-500' : 'bg-gradient-to-r from-blue-400 to-purple-500'}`}
                    style={{ width: `${progress}%` }}
                />
            </div>

            {completed && (
                <div className="mt-1.5 text-[10px] font-bold text-yellow-600 dark:text-yellow-400 text-center animate-pulse">
                    🏆 Challenge Complete! 🏆
                </div>
            )}
        </div>
    );
};

// --- Streak Badge Component ---
export const StreakBadge = ({ nickname, roomCode }) => {
    const [streak, setStreak] = useState(0);

    useEffect(() => {
        if (!roomCode || !nickname) return;
        const key = `streak_${roomCode}_${nickname}`;
        const data = JSON.parse(localStorage.getItem(key) || '{}');
        const today = new Date().toDateString();

        if (data.lastActive === today) {
            setStreak(data.count || 1);
        } else {
            const yesterday = new Date(Date.now() - 86400000).toDateString();
            const newCount = data.lastActive === yesterday ? (data.count || 0) + 1 : 1;
            localStorage.setItem(key, JSON.stringify({ lastActive: today, count: newCount }));
            setStreak(newCount);
        }
    }, [roomCode, nickname]);

    if (streak < 2) return null;

    return (
        <span className="inline-flex items-center space-x-0.5 text-[9px] font-bold text-orange-500" title={`${streak}-day streak`}>
            <Flame className="w-2.5 h-2.5" />
            <span>{streak}</span>
        </span>
    );
};

export { CHALLENGE_PRESETS };
export default ChallengeBar;
