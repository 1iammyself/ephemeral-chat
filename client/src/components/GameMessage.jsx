import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, HelpCircle, Users, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { GAME_TYPES } from '../utils/games';
import { getVibeById } from '../utils/vibes';

const GameMessage = ({ message, currentUser, onGameAnswer, roomVibe }) => {
    const { gameData } = message;
    const currentUserId = currentUser?.id || currentUser?.socketId;
    const vibe = getVibeById(roomVibe);
    const [triviaRevealed, setTriviaRevealed] = useState(false);
    const [triviaTimeLeft, setTriviaTimeLeft] = useState(null);

    const isWYR = gameData.gameType === GAME_TYPES.WYR;
    const isTrivia = gameData.gameType === GAME_TYPES.TRIVIA;

    // Trivia timer: 15 seconds from message timestamp
    useEffect(() => {
        if (!isTrivia) return;
        const endTime = new Date(message.timestamp).getTime() + 15000;

        const tick = () => {
            const left = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            setTriviaTimeLeft(left);
            if (left <= 0) {
                setTriviaRevealed(true);
            }
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [isTrivia, message.timestamp]);

    const answers = gameData.answers || {};
    const myAnswer = answers[currentUserId];
    const hasAnswered = myAnswer !== undefined;

    const stats = useMemo(() => {
        if (isWYR) {
            const aCount = Object.values(answers).filter(v => v === 'A').length;
            const bCount = Object.values(answers).filter(v => v === 'B').length;
            const total = aCount + bCount;
            return {
                aCount, bCount, total,
                aPct: total > 0 ? Math.round((aCount / total) * 100) : 0,
                bPct: total > 0 ? Math.round((bCount / total) * 100) : 0
            };
        }
        if (isTrivia) {
            const groups = {};
            gameData.options.forEach((_, i) => {
                groups[i] = Object.values(answers).filter(v => v === i).length;
            });
            const total = Object.values(answers).length;
            return { groups, total };
        }
        return {};
    }, [answers, isWYR, isTrivia, gameData.options]);

    const handleAnswer = (answer) => {
        if (hasAnswered) return;
        if (isTrivia && triviaRevealed) return; // Too late
        onGameAnswer(message.id, answer);
    };

    // Dynamic classes based on vibe
    const accentColor = vibe.id === 'party' ? 'indigo' :
        vibe.id === 'chill' ? 'teal' :
            vibe.id === 'focus' ? 'orange' : 'primary';

    const headerClass = vibe.accentClass;
    const cardBorderClass = `border-${accentColor}-200 dark:border-${accentColor}-800`;
    const footerBorderClass = `border-${accentColor}-100 dark:border-${accentColor}-800/50`;
    const selectedOutlineClass = `border-${accentColor}-500 bg-${accentColor}-50 dark:bg-${accentColor}-900/20`;
    const hoverBorderClass = `hover:border-${accentColor}-400 dark:hover:border-${accentColor}-600`;
    const statTextClass = `text-${accentColor}-600 dark:text-${accentColor}-400`;
    const progressFillClass = `bg-${accentColor}-500/10`;
    const optionDotClass = `bg-${accentColor}-500 text-white`;

    // ── Would You Rather ──
    if (isWYR) {
        return (
            <div className={`w-full max-w-sm overflow-hidden rounded-xl shadow-sm border ${cardBorderClass}`}>
                <div className={`p-3 ${headerClass}`}>
                    <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-white" />
                        <h3 className="text-white font-bold text-sm">Would You Rather</h3>
                    </div>
                </div>
                <div className="p-3 space-y-2 bg-white dark:bg-gray-800">
                    {/* Option A */}
                    <button
                        onClick={() => handleAnswer('A')}
                        disabled={hasAnswered}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-200 relative overflow-hidden ${hasAnswered
                            ? myAnswer === 'A'
                                ? selectedOutlineClass
                                : 'border-gray-100 dark:border-gray-700 opacity-60'
                            : `border-gray-100 dark:border-gray-700 ${hoverBorderClass} cursor-pointer active:scale-[0.98]`
                            }`}
                    >
                        {hasAnswered && (
                            <div className={`absolute left-0 top-0 h-full ${progressFillClass} transition-all duration-700`} style={{ width: `${stats.aPct}%` }} />
                        )}
                        <div className="relative flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${optionDotClass} text-[10px] font-bold mr-2`}>A</span>
                                {gameData.optionA}
                            </span>
                            {hasAnswered && (
                                <span className={`text-xs font-bold ${statTextClass} ml-2 shrink-0`}>{stats.aPct}%</span>
                            )}
                        </div>
                    </button>
                    {/* Option B */}
                    <button
                        onClick={() => handleAnswer('B')}
                        disabled={hasAnswered}
                        className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-200 relative overflow-hidden ${hasAnswered
                            ? myAnswer === 'B'
                                ? selectedOutlineClass
                                : 'border-gray-100 dark:border-gray-700 opacity-60'
                            : `border-gray-100 dark:border-gray-700 ${hoverBorderClass} cursor-pointer active:scale-[0.98]`
                            }`}
                    >
                        {hasAnswered && (
                            <div className={`absolute left-0 top-0 h-full ${progressFillClass} transition-all duration-700`} style={{ width: `${stats.bPct}%` }} />
                        )}
                        <div className="relative flex items-center justify-between">
                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${optionDotClass} text-[10px] font-bold mr-2`}>B</span>
                                {gameData.optionB}
                            </span>
                            {hasAnswered && (
                                <span className={`text-xs font-bold ${statTextClass} ml-2 shrink-0`}>{stats.bPct}%</span>
                            )}
                        </div>
                    </button>
                </div>
                <div className={`px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-t ${footerBorderClass} flex items-center`}>
                    <Users className="w-3.5 h-3.5 mr-1 text-gray-500 dark:text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{stats.total} response{stats.total !== 1 ? 's' : ''}</span>
                </div>
            </div>
        );
    }

    // ── Trivia ──
    if (isTrivia) {
        return (
            <div className={`w-full max-w-sm overflow-hidden rounded-xl shadow-sm border ${cardBorderClass}`}>
                <div className={`p-3 ${headerClass} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                        <HelpCircle className="w-4 h-4 text-white" />
                        <h3 className="text-white font-bold text-sm">Trivia</h3>
                    </div>
                    {!triviaRevealed && triviaTimeLeft !== null && (
                        <div className="flex items-center gap-1 bg-white/20 rounded-full px-2 py-0.5">
                            <Clock className="w-3 h-3 text-white" />
                            <span className="text-xs font-bold text-white">{triviaTimeLeft}s</span>
                        </div>
                    )}
                    {triviaRevealed && (
                        <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider">Time's up!</span>
                    )}
                </div>
                <div className="p-3 bg-white dark:bg-gray-800">
                    <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">{gameData.question}</p>
                    <div className="space-y-2">
                        {gameData.options.map((opt, i) => {
                            const isCorrect = i === gameData.answer;
                            const isMyPick = myAnswer === i;
                            const showResult = triviaRevealed || hasAnswered;
                            const optionVotes = stats.groups?.[i] || 0;
                            const pct = stats.total > 0 ? Math.round((optionVotes / stats.total) * 100) : 0;

                            return (
                                <button
                                    key={i}
                                    onClick={() => handleAnswer(i)}
                                    disabled={hasAnswered || triviaRevealed}
                                    className={`w-full text-left p-2.5 rounded-lg border-2 transition-all duration-200 relative overflow-hidden ${showResult
                                        ? isCorrect
                                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                            : isMyPick && !isCorrect
                                                ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                                                : 'border-gray-100 dark:border-gray-700 opacity-50'
                                        : `border-gray-100 dark:border-gray-700 ${hoverBorderClass} cursor-pointer active:scale-[0.98]`
                                        }`}
                                >
                                    {showResult && (
                                        <div className={`absolute left-0 top-0 h-full transition-all duration-700 ${isCorrect ? 'bg-green-500/10' : 'bg-gray-500/5'}`} style={{ width: `${pct}%` }} />
                                    )}
                                    <div className="relative flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {showResult && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                                            {showResult && isMyPick && !isCorrect && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                                            <span className={`text-sm ${showResult && isCorrect ? 'font-bold text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                                {String.fromCharCode(65 + i)}. {opt}
                                            </span>
                                        </div>
                                        {showResult && (
                                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 ml-2 shrink-0">{optionVotes}</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className={`px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-t ${footerBorderClass} flex items-center`}>
                    <Users className="w-3.5 h-3.5 mr-1 text-gray-500 dark:text-gray-400" />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{stats.total} answer{stats.total !== 1 ? 's' : ''}</span>
                </div>
            </div>
        );
    }

    return null;
};

export default GameMessage;
