import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, HelpCircle, Users, CheckCircle2, XCircle, Clock, Hash, Circle, X } from 'lucide-react';
import { GAME_TYPES } from '../utils/games';
import { getVibeById } from '../utils/vibes';

const GameMessage = ({ message, currentUser, onGameAnswer, onTicTacToeMove, roomVibe }) => {
    const { gameData } = message;
    const currentUserId = currentUser?.id || currentUser?.socketId;
    const vibe = getVibeById(roomVibe);
    const [triviaRevealed, setTriviaRevealed] = useState(false);
    const [triviaTimeLeft, setTriviaTimeLeft] = useState(null);

    const isWYR = gameData.gameType === GAME_TYPES.WYR;
    const isTrivia = gameData.gameType === GAME_TYPES.TRIVIA;
    const isTicTacToe = gameData.gameType === GAME_TYPES.TIC_TAC_TOE;

    const isPlayer = isTicTacToe && (gameData.players.X.id === currentUserId || gameData.players.O.id === currentUserId);
    const [isExpanded, setIsExpanded] = useState(false);

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
            if (gameData.options) {
                gameData.options.forEach((_, i) => {
                    groups[i] = Object.values(answers).filter(v => v === i).length;
                });
            }
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

    const handleTTTMove = (index) => {
        if (!isTicTacToe || gameData.winner) return;
        if (gameData.board[index]) return;
        if (gameData.players[gameData.turn].id !== currentUserId) return;
        onTicTacToeMove(message.id, 'move', index);
    };

    const handleTTTJoin = () => {
        if (!isTicTacToe || gameData.players.O.id) return;
        onTicTacToeMove(message.id, 'join');
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

    // ── Tic-Tac-Toe ──
    if (isTicTacToe) {
        const isMyTurn = gameData.players[gameData.turn]?.id === currentUserId;
        const isPlayerX = gameData.players.X.id === currentUserId;
        const isPlayerO = gameData.players.O.id === currentUserId;
        const amPlaying = isPlayerX || isPlayerO;

        const getStatusMessage = () => {
            if (gameData.winner) {
                if (gameData.winner === 'draw') return "It's a draw!";
                const winnerName = gameData.players[gameData.winner].name;
                return gameData.winner === (isPlayerX ? 'X' : isPlayerO ? 'O' : null) ? "You Won! 🎉" : `${winnerName} Won!`;
            }
            if (!gameData.players.O.id) return "Waiting for Player O...";
            if (isMyTurn) return "Your move!";
            return `${gameData.players[gameData.turn].name}'s turn`;
        };

        return (
            <div className={`w-full max-w-[280px] overflow-hidden rounded-2xl shadow-lg border-2 ${cardBorderClass} animate-in fade-in zoom-in duration-300`}>
                <div className={`p-3 ${headerClass} flex items-center justify-between`}>
                    <div className="flex items-center gap-2">
                        <Hash className="w-5 h-5 text-white" />
                        <h3 className="text-white font-bold text-sm">Tic-Tac-Toe</h3>
                    </div>
                    {gameData.players.O.id && !gameData.winner && (
                        <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2 py-0.5">
                            <div className={`w-2 h-2 rounded-full bg-white ${isMyTurn ? 'animate-pulse' : 'opacity-50'}`} />
                            <span className="text-[10px] font-black text-white uppercase tracking-tighter">Live</span>
                        </div>
                    )}
                </div>

                {!isExpanded ? (
                    <div className="p-4 bg-white dark:bg-gray-900 flex flex-col items-center gap-3">
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center">
                                <X className="w-6 h-6 text-indigo-500" />
                                <span className="text-[10px] font-bold text-gray-500">{gameData.players.X.name}</span>
                            </div>
                            <span className="text-gray-300 font-bold italic">VS</span>
                            <div className="flex flex-col items-center">
                                <Circle className="w-6 h-6 text-rose-500" />
                                <span className="text-[10px] font-bold text-gray-500">{gameData.players.O.name || '???'}</span>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsExpanded(true)}
                            className={`w-full py-2 rounded-xl bg-${accentColor}-500 hover:bg-${accentColor}-600 text-white text-[11px] font-bold transition-all shadow-md active:scale-95`}
                        >
                            {gameData.winner ? 'View Result' : (amPlaying ? 'Continue Playing' : 'View Game')}
                        </button>
                    </div>
                ) : (
                    <div className="p-4 bg-white dark:bg-gray-900 flex flex-col items-center">
                        <div className="w-full flex justify-between items-center mb-4 px-2">
                            <div className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${gameData.turn === 'X' && !gameData.winner ? `border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20` : 'border-transparent opacity-60'}`}>
                                <X className={`w-5 h-5 ${gameData.turn === 'X' && !gameData.winner ? 'text-indigo-500' : 'text-gray-400'}`} />
                                <span className="text-[10px] font-bold mt-1 max-w-[60px] truncate">{gameData.players.X.name}</span>
                            </div>
                            <div className="text-gray-300 dark:text-gray-700 font-black text-xl italic">VS</div>
                            <div className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${gameData.turn === 'O' && !gameData.winner ? `border-rose-500 bg-rose-50 dark:bg-rose-900/20` : 'border-transparent opacity-60'}`}>
                                <Circle className={`w-5 h-5 ${gameData.turn === 'O' && !gameData.winner ? 'text-rose-500' : 'text-gray-400'}`} />
                                <span className="text-[10px] font-bold mt-1 max-w-[60px] truncate">{gameData.players.O.name || '???'}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 w-full aspect-square bg-gray-100 dark:bg-gray-800 p-2 rounded-xl border border-gray-200 dark:border-gray-700 shadow-inner">
                            {gameData.board.map((cell, i) => {
                                const isWinningCell = gameData.winningLine?.includes(i);
                                return (
                                    <button
                                        key={i}
                                        onClick={() => handleTTTMove(i)}
                                        disabled={!!cell || !isMyTurn || !!gameData.winner}
                                        className={`relative flex items-center justify-center bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-100 dark:border-gray-800 transition-all active:scale-90 ${!cell && isMyTurn ? `hover:bg-${accentColor}-50 dark:hover:bg-${accentColor}-900/10 cursor-pointer` : 'cursor-default'} ${isWinningCell ? `ring-4 ring-${gameData.winner === 'X' ? 'indigo' : 'rose'}-500/50 ttt-win-pulse` : ''}`}
                                    >
                                        {cell === 'X' && <X className={`w-8 h-8 text-indigo-500 ttt-piece-pop ${isWinningCell ? 'ttt-win-pulse' : ''}`} />}
                                        {cell === 'O' && <Circle className={`w-8 h-8 text-rose-500 ttt-piece-pop ${isWinningCell ? 'ttt-win-pulse' : ''}`} />}
                                    </button>
                                );
                            })}
                        </div>

                        <div className={`mt-4 w-full p-2.5 rounded-xl text-center font-bold text-sm transition-all animate-bounce-subtle ${gameData.winner ? (gameData.winner === 'draw' ? 'bg-gray-100 dark:bg-gray-800 text-gray-600' : `bg-${gameData.winner === 'X' ? 'indigo' : 'rose'}-500 text-white shadow-lg shadow-${gameData.winner === 'X' ? 'indigo' : 'rose'}-500/30`) : `text-gray-600 dark:text-gray-400`}`}>
                            {getStatusMessage()}
                        </div>

                        {!gameData.players.O.id && currentUserId !== gameData.players.X.id && (
                            <button
                                onClick={handleTTTJoin}
                                className={`mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-indigo-500 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all`}
                            >
                                Tap to Join Game
                            </button>
                        )}

                        <button
                            onClick={() => setIsExpanded(false)}
                            className="mt-4 text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                        >
                            Collapse
                        </button>
                    </div>
                )}
            </div>
        );
    }

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
                <div className="p-3 space-y-2 bg-white dark:bg-gray-800 min-h-[140px] flex flex-col justify-center">
                    {gameData.optionA ? (
                        <>
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
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-4 space-y-2 text-gray-400">
                            <Clock className="w-8 h-8 animate-pulse" />
                            <p className="text-xs font-medium">Loading question...</p>
                        </div>
                    )}
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
                <div className="p-3 bg-white dark:bg-gray-800 min-h-[160px] flex flex-col justify-center">
                    {gameData.question ? (
                        <>
                            <p className="text-sm font-bold text-gray-900 dark:text-white mb-3">{gameData.question}</p>
                            <div className="space-y-2">
                                {gameData.options && gameData.options.map((opt, i) => {
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
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-4 space-y-2 text-gray-400">
                            <Clock className="w-8 h-8 animate-pulse" />
                            <p className="text-xs font-medium">Loading trivia...</p>
                        </div>
                    )}
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
