import React, { useState, useEffect } from 'react';
import { X, Send, Dices, Sparkles, HelpCircle, ChevronLeft, Hash, Trophy } from 'lucide-react';
import { GAME_TYPES, getRandomWYR, getRandomTrivia, WYR_TOPIC_LIST, TRIVIA_TOPIC_LIST } from '../utils/games';

const GameModal = ({ isOpen, onClose, onSend, roomVibe, initialGameType, roomTTL }) => {
    const [gameType, setGameType] = useState(null); // null = select game, then select topic
    const [selectedTopic, setSelectedTopic] = useState(null);
    const [wyrData, setWyrData] = useState(null);
    const [triviaData, setTriviaData] = useState(null);
    const [customTimer, setCustomTimer] = useState(15);

    // Calculate dynamic timer bounds based on room TTL
    const dynamicRoomTtl = roomTTL && roomTTL < 300 ? roomTTL * 2 : (roomTTL || 300);
    const minTimer = Math.max(5, Math.floor(dynamicRoomTtl * 0.5));
    const maxTimer = Math.floor(dynamicRoomTtl * 0.75);
    const actualMaxTimer = Math.max(minTimer + 1, maxTimer);

    const getFormattedTime = (seconds) => {
        if (seconds < 60) return `${seconds}s`;
        return `${Math.floor(seconds / 60)}m`;
    };

    const ttlBoosted = roomTTL && roomTTL < 300;
    const ttlLabel = ttlBoosted ? `${getFormattedTime(dynamicRoomTtl)} (Boosted 2x)` : getFormattedTime(dynamicRoomTtl);

    useEffect(() => {
        if (!isOpen) {
            setGameType(null);
            setSelectedTopic(null);
            setWyrData(null);
            setTriviaData(null);
        } else if (initialGameType) {
            setGameType(initialGameType);
        }

        if (isOpen) {
            // Reset to default minimum whenever opened
            setCustomTimer(minTimer);
        }
    }, [isOpen, initialGameType, minTimer]);

    if (!isOpen) return null;

    const handlePickGame = (type) => {
        if (type === GAME_TYPES.TIC_TAC_TOE) {
            onSend({ gameType: GAME_TYPES.TIC_TAC_TOE });
            handleClose();
        } else if (type === GAME_TYPES.CHESS) {
            onSend({ gameType: GAME_TYPES.CHESS });
            handleClose();
        } else if (type === GAME_TYPES.ROCK_PAPER_SCISSORS) {
            onSend({ gameType: GAME_TYPES.ROCK_PAPER_SCISSORS });
            handleClose();
        } else {
            setGameType(type);
        }
    };

    const handlePickTopic = (topic) => {
        const topicVal = topic === 'Any' ? null : topic;
        setSelectedTopic(topicVal);
        if (gameType === GAME_TYPES.WYR) {
            setWyrData(getRandomWYR(topicVal));
        } else {
            setTriviaData(getRandomTrivia(topicVal));
        }
    };

    const handleShuffle = () => {
        if (gameType === GAME_TYPES.WYR) setWyrData(getRandomWYR(selectedTopic));
        else if (gameType === GAME_TYPES.TRIVIA) setTriviaData(getRandomTrivia(selectedTopic));
    };

    const handleSend = () => {
        if (gameType === GAME_TYPES.WYR && wyrData) {
            onSend({
                gameType: GAME_TYPES.WYR,
                optionA: wyrData.optionA,
                optionB: wyrData.optionB
            });
        } else if (gameType === GAME_TYPES.TRIVIA && triviaData) {
            onSend({
                gameType: GAME_TYPES.TRIVIA,
                question: triviaData.question,
                options: triviaData.options,
                answer: triviaData.answer,
                timer: customTimer
            });
        } else if (gameType === GAME_TYPES.CHESS) {
            onSend({
                gameType: GAME_TYPES.CHESS,
                players: { white: null, black: null }
            });
        }
        handleClose();
    };

    const handleClose = () => {
        setGameType(null);
        setSelectedTopic(null);
        setWyrData(null);
        setTriviaData(null);
        onClose();
    };

    const handleBack = () => {
        if (wyrData || triviaData) {
            setWyrData(null);
            setTriviaData(null);
            setSelectedTopic(null);
        } else {
            setGameType(null);
        }
    };

    const vibeAccent = roomVibe === 'party' ? 'indigo' :
        roomVibe === 'chill' ? 'teal' :
            roomVibe === 'focus' ? 'orange' : 'primary';

    // Explicit colors for vibe send buttons — avoids Tailwind JIT purge issues in Focus light mode
    const vibeColor = {
        party: '#6366f1',
        chill: '#14b8a6',
        focus: '#f97316',
        default: '#3b82f6'
    }[roomVibe] || '#3b82f6';
    const vibeColorHover = {
        party: '#4f46e5',
        chill: '#0d9488',
        focus: '#ea580c',
        default: '#2563eb'
    }[roomVibe] || '#2563eb';

    const currentTopicList = gameType === GAME_TYPES.WYR ? WYR_TOPIC_LIST : TRIVIA_TOPIC_LIST;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm z-[100]">
            <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[85vw] max-w-[300px] sm:max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-${vibeAccent}-500/20 flex flex-col max-h-[85vh] sm:max-h-[90vh]`}>
                <div className={`flex items-center justify-between px-3 py-2 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-${vibeAccent}-50/30 dark:bg-${vibeAccent}-900/10 shrink-0`}>
                    <div className="flex items-center">
                        {gameType && (
                            <button onClick={handleBack} className="mr-1 p-0.5 sm:p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-gray-500 transition-colors">
                                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                            </button>
                        )}
                        <h2 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white flex items-center">
                            <Dices className={`w-4 h-4 sm:w-6 sm:h-6 mr-1 sm:mr-2 text-${vibeAccent}-500`} />
                            {!gameType ? 'Pick a Game' : !selectedTopic && !(wyrData || triviaData) ? 'Pick a Topic' : gameType === GAME_TYPES.WYR ? 'Would You Rather' : 'Trivia'}
                        </h2>
                    </div>
                    <button onClick={handleClose} className="p-1 sm:p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                </div>

                <div className="p-2.5 sm:p-4 overflow-y-auto min-h-0">
                    {!gameType ? (
                        /* Game picker: 2-col on mobile, 2-col on desktop */
                        <div className="grid grid-cols-2 gap-1.5 sm:gap-3">
                            <button
                                onClick={() => handlePickGame(GAME_TYPES.WYR)}
                                className={`flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl border-2 border-dashed border-${vibeAccent}-300 dark:border-${vibeAccent}-700 hover:border-${vibeAccent}-50 dark:hover:bg-${vibeAccent}-900/20 transition-all group active:scale-95`}
                            >
                                <Sparkles className={`w-4 h-4 sm:w-6 sm:h-6 text-${vibeAccent}-500 mb-1 sm:mb-2 group-hover:scale-110 transition-transform`} />
                                <span className="font-bold text-gray-900 dark:text-white text-[10px] sm:text-xs text-center leading-tight">Would You Rather</span>
                                <span className="hidden sm:block text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 text-center">Impossible choices</span>
                            </button>
                            <button
                                onClick={() => handlePickGame(GAME_TYPES.TRIVIA)}
                                className={`flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl border-2 border-dashed border-${vibeAccent}-300 dark:border-${vibeAccent}-700 hover:border-${vibeAccent}-50 dark:hover:bg-${vibeAccent}-900/20 transition-all group active:scale-95`}
                            >
                                <HelpCircle className={`w-4 h-4 sm:w-6 sm:h-6 text-${vibeAccent}-500 mb-1 sm:mb-2 group-hover:scale-110 transition-transform`} />
                                <span className="font-bold text-gray-900 dark:text-white text-[10px] sm:text-xs text-center leading-tight">Trivia</span>
                                <span className="hidden sm:block text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 text-center">Test your knowledge</span>
                            </button>
                            <button
                                onClick={() => handlePickGame(GAME_TYPES.TIC_TAC_TOE)}
                                className={`flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl border-2 border-dashed border-${vibeAccent}-300 dark:border-${vibeAccent}-700 hover:border-${vibeAccent}-50 dark:hover:bg-${vibeAccent}-900/20 transition-all group active:scale-95`}
                            >
                                <Hash className={`w-4 h-4 sm:w-6 sm:h-6 text-${vibeAccent}-500 mb-1 sm:mb-2 group-hover:scale-110 transition-transform`} />
                                <span className="font-bold text-gray-900 dark:text-white text-[10px] sm:text-xs text-center leading-tight">Tic-Tac-Toe</span>
                                <span className="hidden sm:block text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 text-center">Classic 3x3 game</span>
                            </button>
                            <button
                                onClick={() => handlePickGame(GAME_TYPES.ROCK_PAPER_SCISSORS)}
                                className={`flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl border-2 border-dashed border-${vibeAccent}-300 dark:border-${vibeAccent}-700 hover:border-${vibeAccent}-50 dark:hover:bg-${vibeAccent}-900/20 transition-all group active:scale-95`}
                            >
                                <Dices className={`w-4 h-4 sm:w-6 sm:h-6 text-${vibeAccent}-500 mb-1 sm:mb-2 group-hover:scale-110 transition-transform`} />
                                <span className="font-bold text-gray-900 dark:text-white text-[10px] sm:text-xs text-center leading-tight">RPS</span>
                                <span className="hidden sm:block text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 text-center">Classic Showdown</span>
                            </button>
                            <button
                                onClick={() => handlePickGame(GAME_TYPES.CHESS)}
                                className={`flex flex-col items-center justify-center p-2 sm:p-4 rounded-xl border-2 border-dashed border-${vibeAccent}-300 dark:border-${vibeAccent}-700 hover:border-${vibeAccent}-50 dark:hover:bg-${vibeAccent}-900/20 transition-all group active:scale-95 col-span-2`}
                            >
                                <Trophy className={`w-4 h-4 sm:w-6 sm:h-6 text-${vibeAccent}-500 mb-1 sm:mb-2 group-hover:scale-110 transition-transform`} />
                                <span className="font-bold text-gray-900 dark:text-white text-[10px] sm:text-xs text-center leading-tight">Chess</span>
                                <span className="hidden sm:block text-[9px] text-gray-500 dark:text-gray-400 mt-0.5 text-center">Classic Strategy</span>
                            </button>
                        </div>
                    ) : !selectedTopic && !(wyrData || triviaData) ? (
                        /* Topic picker */
                        <div className="max-h-[260px] sm:max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                            <div className="grid grid-cols-1 gap-1 sm:gap-2">
                                <button
                                    onClick={() => handlePickTopic('Any')}
                                    className={`flex items-center p-2 sm:p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-${vibeAccent}-50 dark:hover:bg-${vibeAccent}-900/20 text-left font-semibold text-xs sm:text-sm text-gray-700 dark:text-gray-200`}
                                >
                                    ✨ Any Topic (Shuffle All)
                                </button>
                                {currentTopicList.map(topic => (
                                    <button
                                        key={topic}
                                        onClick={() => handlePickTopic(topic)}
                                        className={`flex items-center p-2 sm:p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-${vibeAccent}-50 dark:hover:bg-${vibeAccent}-900/20 text-left text-xs sm:text-sm text-gray-700 dark:text-gray-200`}
                                    >
                                        {topic}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (gameType === GAME_TYPES.WYR && wyrData) ? (
                        <div className="space-y-2 sm:space-y-3">
                            <div className={`bg-gradient-to-br from-${vibeAccent}-50 to-pink-50 dark:from-${vibeAccent}-900/20 dark:to-pink-900/20 rounded-xl p-2.5 sm:p-4 border border-${vibeAccent}-100 dark:border-${vibeAccent}-800`}>
                                <div className="flex justify-between items-center mb-1.5 sm:mb-2">
                                    <p className={`text-[9px] sm:text-xs font-bold uppercase tracking-wider text-${vibeAccent}-500`}>
                                        Would You Rather...
                                    </p>
                                    {selectedTopic && (
                                        <span className="text-[8px] sm:text-[9px] bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded-full text-gray-500 uppercase font-bold">{selectedTopic}</span>
                                    )}
                                </div>
                                <div className="space-y-1 sm:space-y-2">
                                    <div className={`p-2 sm:p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-${vibeAccent}-100 dark:border-${vibeAccent}-800`}>
                                        <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">🅰️ {wyrData.optionA}</span>
                                    </div>
                                    <div className="text-center text-[9px] sm:text-[10px] uppercase font-bold text-gray-400 leading-none">OR</div>
                                    <div className={`p-2 sm:p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-${vibeAccent}-100 dark:border-${vibeAccent}-800`}>
                                        <span className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200">🅱️ {wyrData.optionB}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-1.5 sm:gap-2">
                                <button onClick={handleShuffle} className="flex-1 py-2 sm:py-2.5 px-2 sm:px-4 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-[10px] sm:text-xs hover:bg-gray-200 dark:hover:bg-gray-600 transition-all flex items-center justify-center gap-1 sm:gap-2 active:scale-95">
                                    <Dices className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Shuffle
                                </button>
                                <button onClick={handleSend} style={{ backgroundColor: vibeColor }} onMouseOver={e => e.currentTarget.style.backgroundColor = vibeColorHover} onMouseOut={e => e.currentTarget.style.backgroundColor = vibeColor} className="flex-1 py-2 sm:py-2.5 rounded-xl font-bold flex items-center justify-center gap-1 sm:gap-2 text-white shadow-sm active:scale-95 text-[10px] sm:text-xs transition-all">
                                    <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Send
                                </button>
                            </div>
                        </div>
                    ) : gameType === GAME_TYPES.TRIVIA && triviaData ? (
                        <div className="space-y-2 sm:space-y-4">
                            <div className={`bg-gradient-to-br from-${vibeAccent}-50 to-cyan-50 dark:from-${vibeAccent}-900/20 dark:to-cyan-900/20 rounded-xl p-2.5 sm:p-4 border border-${vibeAccent}-100 dark:border-${vibeAccent}-800`}>
                                <div className="flex justify-between items-center mb-1.5 sm:mb-3">
                                    <p className={`text-[9px] sm:text-xs font-bold uppercase tracking-wider text-${vibeAccent}-500`}>Trivia Question</p>
                                    {selectedTopic && (
                                        <span className="text-[8px] sm:text-[9px] bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded-full text-gray-500 uppercase font-bold">{selectedTopic}</span>
                                    )}
                                </div>
                                <p className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">{triviaData.question}</p>
                                <div className="space-y-1 sm:space-y-2">
                                    {triviaData.options.map((opt, i) => (
                                        <div key={i} className="p-1.5 sm:p-2.5 rounded-lg text-xs sm:text-sm border bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300">
                                            {String.fromCharCode(65 + i)}. {opt}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Trivia Custom Timer Slider */}
                            <div className="px-0.5 sm:px-1 space-y-1 sm:space-y-2">
                                <div className="flex justify-between items-center text-[10px] sm:text-xs font-black text-gray-500 uppercase tracking-widest">
                                    <div className="flex items-center gap-1">
                                        <Sparkles className="w-3 h-3" />
                                        Timer
                                    </div>
                                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-400">
                                        TTL: {ttlLabel}
                                    </span>
                                </div>

                                <div className="relative">
                                    <input
                                        type="range"
                                        min={minTimer}
                                        max={actualMaxTimer}
                                        value={customTimer}
                                        onChange={(e) => setCustomTimer(parseInt(e.target.value, 10))}
                                        className={`w-full h-1.5 sm:h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-${vibeAccent}-500 transition-all`}
                                    />
                                    <div className="flex justify-between items-center mt-0.5 sm:mt-1.5 px-0.5">
                                        <span className={`text-[9px] sm:text-[10px] font-black ${customTimer === minTimer ? `text-${vibeAccent}-500` : 'text-gray-400'}`}>{minTimer}s</span>
                                        <span className={`text-[10px] sm:text-xs font-black text-${vibeAccent}-500`}>{customTimer}s</span>
                                        <span className={`text-[9px] sm:text-[10px] font-black ${customTimer === actualMaxTimer ? `text-${vibeAccent}-500` : 'text-gray-400'}`}>{actualMaxTimer}s</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-1.5 sm:gap-2">
                                <button onClick={handleShuffle} className="flex-1 py-2 sm:py-3 px-2 sm:px-4 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-[10px] sm:text-xs uppercase tracking-widest hover:bg-gray-200 dark:hover:bg-gray-700 transition-all flex items-center justify-center gap-1 sm:gap-2">
                                    <Dices className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Shuffle
                                </button>
                                <button onClick={handleSend} style={{ backgroundColor: vibeColor }} onMouseOver={e => e.currentTarget.style.backgroundColor = vibeColorHover} onMouseOut={e => e.currentTarget.style.backgroundColor = vibeColor} className="flex-[1.5] py-2 sm:py-3 rounded-xl text-white font-black text-[10px] sm:text-xs uppercase tracking-widest shadow-lg transition-all active:scale-95 flex items-center justify-center gap-1 sm:gap-2">
                                    <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Send
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-8 text-gray-400">
                            <Dices className="w-8 h-8 mb-3 opacity-50" />
                            <p className="text-sm font-bold">Game Data Missing</p>
                            <p className="text-xs text-center mt-1">Please try selecting a topic again.</p>
                            <button onClick={handleBack} className={`mt-4 px-4 py-2 rounded-lg bg-${vibeAccent}-500 text-white font-semibold text-xs hover:bg-${vibeAccent}-600 transition-colors`}>
                                Go Back
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GameModal;
