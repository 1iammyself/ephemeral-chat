import React, { useState } from 'react';
import { X, Send, Dices, Sparkles, HelpCircle } from 'lucide-react';
import { GAME_TYPES, getRandomWYR, getRandomTrivia } from '../utils/games';

const GameModal = ({ isOpen, onClose, onSend }) => {
    const [gameType, setGameType] = useState(null); // null = selection screen
    const [wyrData, setWyrData] = useState(null);
    const [triviaData, setTriviaData] = useState(null);

    if (!isOpen) return null;

    const handlePickWYR = () => {
        setGameType(GAME_TYPES.WYR);
        setWyrData(getRandomWYR());
    };

    const handlePickTrivia = () => {
        setGameType(GAME_TYPES.TRIVIA);
        setTriviaData(getRandomTrivia());
    };

    const handleShuffle = () => {
        if (gameType === GAME_TYPES.WYR) setWyrData(getRandomWYR());
        else if (gameType === GAME_TYPES.TRIVIA) setTriviaData(getRandomTrivia());
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
                answer: triviaData.answer
            });
        }
        handleClose();
    };

    const handleClose = () => {
        setGameType(null);
        setWyrData(null);
        setTriviaData(null);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                        <Dices className="w-6 h-6 mr-2 text-purple-500" />
                        {!gameType ? 'Pick a Game' : gameType === GAME_TYPES.WYR ? 'Would You Rather' : 'Trivia'}
                    </h2>
                    <button onClick={handleClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-4">
                    {!gameType ? (
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={handlePickWYR}
                                className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-purple-300 dark:border-purple-700 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all group"
                            >
                                <Sparkles className="w-8 h-8 text-purple-500 mb-2 group-hover:scale-110 transition-transform" />
                                <span className="font-bold text-gray-900 dark:text-white text-sm">Would You Rather</span>
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Pick between two options</span>
                            </button>
                            <button
                                onClick={handlePickTrivia}
                                className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-700 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group"
                            >
                                <HelpCircle className="w-8 h-8 text-blue-500 mb-2 group-hover:scale-110 transition-transform" />
                                <span className="font-bold text-gray-900 dark:text-white text-sm">Trivia</span>
                                <span className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">Test everyone's knowledge</span>
                            </button>
                        </div>
                    ) : gameType === GAME_TYPES.WYR && wyrData ? (
                        <div className="space-y-4">
                            <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-4 border border-purple-100 dark:border-purple-800">
                                <p className="text-xs font-bold uppercase tracking-wider text-purple-500 mb-3">Would You Rather...</p>
                                <div className="space-y-2">
                                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-purple-100 dark:border-purple-800">
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">🅰️ {wyrData.optionA}</span>
                                    </div>
                                    <div className="text-center text-xs font-bold text-gray-400">OR</div>
                                    <div className="p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-purple-100 dark:border-purple-800">
                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">🅱️ {wyrData.optionB}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleShuffle} className="flex-1 py-2.5 px-4 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2">
                                    <Dices className="w-4 h-4" /> Shuffle
                                </button>
                                <button onClick={handleSend} className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2">
                                    <Send className="w-4 h-4" /> Send
                                </button>
                            </div>
                        </div>
                    ) : gameType === GAME_TYPES.TRIVIA && triviaData ? (
                        <div className="space-y-4">
                            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
                                <p className="text-xs font-bold uppercase tracking-wider text-blue-500 mb-3">Trivia Question</p>
                                <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">{triviaData.question}</p>
                                <div className="space-y-2">
                                    {triviaData.options.map((opt, i) => (
                                        <div key={i} className={`p-2.5 rounded-lg text-sm border ${i === triviaData.answer ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 font-semibold' : 'bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}>
                                            {String.fromCharCode(65 + i)}. {opt}
                                            {i === triviaData.answer && <span className="ml-2 text-[10px]">✓ correct</span>}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleShuffle} className="flex-1 py-2.5 px-4 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium text-sm hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors flex items-center justify-center gap-2">
                                    <Dices className="w-4 h-4" /> Shuffle
                                </button>
                                <button onClick={handleSend} className="flex-1 btn-primary py-2.5 flex items-center justify-center gap-2">
                                    <Send className="w-4 h-4" /> Send
                                </button>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>
        </div>
    );
};

export default GameModal;
