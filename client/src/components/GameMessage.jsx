import React, { useState, useMemo, useEffect } from 'react';
import { Sparkles, HelpCircle, Users, CheckCircle2, XCircle, Clock, Hash, Circle, X, Trophy, Swords, Skull, Puzzle, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';
import { GAME_TYPES } from '../utils/games';
import { getVibeById } from '../utils/vibes';
import ChessGame from './games/ChessGame';
import AnagramGame from './games/AnagramGame';
import HangmanGame from './games/HangmanGame';
import TypingRaceGame from './games/TypingRaceGame';

const GameMessage = ({
    message, currentUser, onGameAnswer, onTicTacToeMove, onRPSAction, onLaunchChess, onDelete, roomVibe,
    onAnagramJoin, onAnagramSubmit, onAnagramNextRound, onAnagramReveal, onAnagramHint,
    onHangmanJoin, onHangmanGuess,
    onTypingRaceJoin, onTypingRaceStart, onTypingRaceProgress, onTypingRaceFinish,
    onRematch, onShareResult,
}) => {
    const { gameData } = message;
    const currentUserId = currentUser?.id || currentUser?.socketId;
    const vibe = getVibeById(roomVibe);
    const [triviaRevealed, setTriviaRevealed] = useState(false);
    const [triviaTimeLeft, setTriviaTimeLeft] = useState(null);

    const isWYR = gameData.gameType === GAME_TYPES.WYR;
    const isTrivia = gameData.gameType === GAME_TYPES.TRIVIA;
    const isTicTacToe = gameData.gameType === GAME_TYPES.TIC_TAC_TOE;
    const isRPS = gameData.gameType === GAME_TYPES.ROCK_PAPER_SCISSORS;
    const isChess = gameData.gameType === GAME_TYPES.CHESS;
    const isHangman = gameData.gameType === GAME_TYPES.HANGMAN;
    const isAnagram = gameData.gameType === GAME_TYPES.ANAGRAM;
    const isTypingRace = gameData.gameType === GAME_TYPES.TYPING_RACE;

    const isTargeted = message.recipients && message.recipients.length > 0;
    const isIntendedRecipient = isTargeted && message.recipients.includes(currentUserId);
    const currentNickname = currentUser?.nickname;
    const isSender = message.sender.socketId === currentUserId || message.sender.id === currentUserId || (currentNickname && message.sender.nickname === currentNickname);
    const isPlayer = (isTicTacToe && (gameData.players.X.id === currentUserId || gameData.players.O.id === currentUserId)) ||
        (isRPS && (gameData.players.P1.id === currentUserId || gameData.players.P2.id === currentUserId)) ||
        (isChess && (
            gameData.players.white?.id === currentUserId || gameData.players.black?.id === currentUserId ||
            (currentNickname && (gameData.players.white?.name === currentNickname || gameData.players.black?.name === currentNickname))
        ));
    const isSpectator = !isPlayer && (isTicTacToe || isRPS || isChess);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showVoteDetails, setShowVoteDetails] = useState(false);

    // Trivia timer: Dynamic based on gameData.timer (defaults to 15 if missing)
    useEffect(() => {
        if (!isTrivia) return;
        const durationSecs = gameData.timer || 15;
        const endTime = new Date(message.timestamp).getTime() + (durationSecs * 1000);

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
        // When server provides pre-computed stats (masked view for non-senders), use those
        if (gameData.isMasked && gameData.stats) {
            if (isWYR) {
                const aCount = gameData.stats['A'] || 0;
                const bCount = gameData.stats['B'] || 0;
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
                        groups[i] = gameData.stats[i] || 0;
                    });
                }
                const total = Object.values(gameData.stats).reduce((a, b) => a + b, 0);
                return { groups, total };
            }
        }

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
    }, [answers, isWYR, isTrivia, gameData.options, gameData.isMasked, gameData.stats]);

    const handleAnswer = (answer) => {
        if (hasAnswered) return;
        if (isTrivia && triviaRevealed) return; // Too late

        // Celebration for correct trivia answer
        if (isTrivia && answer === gameData.answer) {
            confetti({
                particleCount: 150,
                spread: 100,
                origin: { y: 0.8 },
                colors: vibe.colors?.primary ? [vibe.colors.primary, '#ffffff'] : ['#3b82f6', '#ffffff', '#10b981'],
                gravity: 1.2,
                scalar: 0.8,
                drift: 0,
                ticks: 200,
                zIndex: 9999
            });
        }

        onGameAnswer(message.id, answer);
    };

    const handleTTTMove = (index) => {
        if (!isTicTacToe || gameData.winner) return;
        if (gameData.board[index]) return;
        // Check if it's my turn using both id and nickname
        const currentTurnPlayer = gameData.players[gameData.turn];
        if (currentTurnPlayer.id !== currentUserId && !(currentNickname && currentTurnPlayer.name === currentNickname)) return;
        onTicTacToeMove(message.id, 'move', index);
    };

    const handleTTTJoin = () => {
        if (!isTicTacToe || gameData.players.O.id) return;
        onTicTacToeMove(message.id, 'join');
    };

    const handleRPSJoin = () => {
        if (!isRPS || gameData.players.P2.id) return;
        onRPSAction(message.id, 'join');
    };

    const handleRPSMove = (move) => {
        if (!isRPS || gameData.winner) return;
        onRPSAction(message.id, 'move', move);
    };

    const handleChessMove = (move) => {
        if (!isChess || gameData.winner) return;
        onTicTacToeMove(message.id, 'chess-move', move); // Re-using onTicTacToeMove as a generic game action handler
    };

    const handleChessJoin = () => {
        if (!isChess || (gameData.players.white?.id && gameData.players.black?.id)) return;
        onTicTacToeMove(message.id, 'chess-join');
    };

    // Celebration for winning games
    useEffect(() => {
        if (gameData.winner && gameData.winner !== 'draw') {
            let amWinner = false;
            if (isTicTacToe) {
                const winningPlayer = gameData.players[gameData.winner];
                if (winningPlayer?.id === currentUserId || (currentNickname && winningPlayer?.name === currentNickname)) {
                    amWinner = true;
                }
            } else if (isRPS) {
                const winningPlayer = gameData.players[gameData.winner];
                if (winningPlayer?.id === currentUserId || (currentNickname && winningPlayer?.name === currentNickname)) {
                    amWinner = true;
                }
            } else if (isChess) {
                const winningPlayer = gameData.players[gameData.winner];
                if (winningPlayer?.id === currentUserId || (currentNickname && winningPlayer?.name === currentNickname)) {
                    amWinner = true;
                }
            }

            if (amWinner) {
                // Triple burst for winning the whole game
                const count = 200;
                const defaults = {
                    origin: { y: 0.9 },
                    zIndex: 9999
                };

                const fire = (particleRatio, opts) => {
                    confetti({
                        ...defaults,
                        ...opts,
                        particleCount: Math.floor(count * particleRatio)
                    });
                };

                fire(0.25, { spread: 26, startVelocity: 55 });
                fire(0.2, { spread: 60 });
                fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8 });
                fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
                fire(0.1, { spread: 120, startVelocity: 45 });
            }
        }
    }, [gameData.winner, isTicTacToe, isRPS, isChess, currentUserId, currentNickname]);

    // Dynamic classes based on vibe
    // Explicit hex colors for buttons
    const vibeBtnColor = vibe.colors?.primary || '#3b82f6';

    const headerClass = vibe.accentClass;
    const cardBorderClass = `border-black/10 dark:border-white/10`;
    const footerBorderClass = `border-black/5 dark:border-white/5`;
    const selectedOutlineClass = `border-${vibe.accent || 'primary'}-500 bg-${vibe.accent || 'primary'}-50 dark:bg-${vibe.accent || 'primary'}-900/20`;
    const hoverBorderClass = `hover:border-${vibe.accent || 'primary'}-400 dark:hover:border-${vibe.accent || 'primary'}-600`;
    const statTextClass = `text-${vibe.accent || 'primary'}-600 dark:text-${vibe.accent || 'primary'}-400`;
    const progressFillClass = `bg-${vibe.accent || 'primary'}-500/10`;
    const optionDotClass = `bg-${vibe.accent || 'primary'}-500 text-white`;
    const accentColor = vibe.accent || 'primary';

    // ── Tic-Tac-Toe ──
    if (isTicTacToe) {
        const isPlayerX = gameData.players.X.id === currentUserId || (currentNickname && gameData.players.X.name === currentNickname);
        const isPlayerO = gameData.players.O.id === currentUserId || (currentNickname && gameData.players.O.name === currentNickname);
        const isMyTurn = (isPlayerX && gameData.turn === 'X') || (isPlayerO && gameData.turn === 'O');
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
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border-x border-b ${cardBorderClass} border-t-4 border-t-${accentColor}-500 animate-in fade-in zoom-in duration-300`}>
                <div className={`p-2 sm:p-3 ${headerClass} flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Hash className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Tic-Tac-Toe</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {isSpectator && (
                            <div className="bg-white/10 rounded-full px-2 py-0.5 border border-white/20">
                                <span className="text-[9px] font-black text-white/80 uppercase tracking-tighter">Spectating</span>
                            </div>
                        )}
                        {gameData.players.O.id && !gameData.winner && (
                            <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2 py-0.5">
                                <div className={`w-2 h-2 rounded-full bg-white ${isMyTurn ? 'animate-pulse' : 'opacity-50'}`} />
                                <span className="text-[10px] font-black text-white uppercase tracking-tighter">Live</span>
                            </div>
                        )}
                    </div>
                </div>

                {!isExpanded ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center gap-3">
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center">
                                <X className="w-6 h-6 text-indigo-500" />
                                <span className="text-[10px] font-bold text-gray-600">{gameData.players.X.name}</span>
                            </div>
                            <span className="text-gray-500 dark:text-gray-300 font-bold italic">VS</span>
                            <div className="flex flex-col items-center">
                                <Circle className="w-6 h-6 text-rose-500" />
                                <span className="text-[10px] font-bold text-gray-700 dark:text-gray-400">{gameData.players.O.name || '???'}</span>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsExpanded(true)}
                            style={{ backgroundColor: vibeBtnColor }}
                            className="w-full py-2 rounded-xl text-white text-[11px] font-bold transition-all shadow-md active:scale-95"
                        >
                            {gameData.winner ? 'View Result' : (amPlaying ? 'Continue Playing' : 'View Game')}
                        </button>
                    </div>
                ) : (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center">
                        <div className="w-full flex justify-between items-center mb-4 px-2">
                            <div className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${gameData.turn === 'X' && !gameData.winner ? `border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20` : 'border-transparent opacity-60'}`}>
                                <X className={`w-5 h-5 ${gameData.turn === 'X' && !gameData.winner ? 'text-indigo-500' : 'text-gray-400'}`} />
                                <span className="text-[10px] font-bold mt-1 max-w-[60px] truncate">{gameData.players.X.name}</span>
                            </div>
                            <div className="text-gray-400 dark:text-gray-700 font-black text-xl italic">VS</div>
                            <div className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${gameData.turn === 'O' && !gameData.winner ? `border-rose-500 bg-rose-50 dark:bg-rose-900/20` : 'border-transparent opacity-60'}`}>
                                <Circle className={`w-5 h-5 ${gameData.turn === 'O' && !gameData.winner ? 'text-rose-500' : 'text-gray-400'}`} />
                                <span className="text-[10px] font-bold mt-1 max-w-[60px] truncate">{gameData.players.O.name || '???'}</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 w-full aspect-square bg-gray-500 dark:bg-gray-800 p-2 rounded-xl border border-gray-500 dark:border-gray-700 shadow-inner">
                            {gameData.board.map((cell, i) => {
                                const isWinningCell = gameData.winningLine?.includes(i);
                                return (
                                    <button
                                        key={i}
                                        onClick={() => handleTTTMove(i)}
                                        disabled={!!cell || !isMyTurn || !!gameData.winner}
                                        className={`relative flex items-center justify-center bg-white dark:bg-gray-900 rounded-lg shadow-sm border border-gray-600 dark:border-gray-800 transition-all active:scale-90 ${!cell && isMyTurn ? `hover:bg-${accentColor}-50 dark:hover:bg-${accentColor}-900/10 cursor-pointer` : 'cursor-default'} ${isWinningCell ? `ring-4 ring-${gameData.winner === 'X' ? 'indigo' : 'rose'}-500/50 ttt-win-pulse` : ''}`}
                                    >
                                        {cell === 'X' && <X className={`w-8 h-8 text-indigo-500 ttt-piece-pop ${isWinningCell ? 'ttt-win-pulse' : ''}`} />}
                                        {cell === 'O' && <Circle className={`w-8 h-8 text-rose-500 ttt-piece-pop ${isWinningCell ? 'ttt-win-pulse' : ''}`} />}
                                    </button>
                                );
                            })}
                        </div>

                        <div className={`mt-4 w-full p-2.5 rounded-xl text-center font-bold text-sm transition-all animate-bounce-subtle ${gameData.winner ? (gameData.winner === 'draw' ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300' : `bg-${gameData.winner === 'X' ? 'indigo' : 'rose'}-500 text-white shadow-lg shadow-${gameData.winner === 'X' ? 'indigo' : 'rose'}-500/30`) : `text-gray-800 dark:text-gray-200`}`}>
                            {getStatusMessage()}
                        </div>

                        {!gameData.players.O.id && !isPlayerX && (
                            <button
                                onClick={handleTTTJoin}
                                className={`mt-3 w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-indigo-500 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all`}
                            >
                                Tap to Join Game
                            </button>
                        )}

                        <button
                            onClick={() => setIsExpanded(false)}
                            className="mt-4 text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
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
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-xl shadow-sm border-x border-b ${cardBorderClass} border-t-4 border-t-${accentColor}-500`}>
                <div className={`p-2 sm:p-3 ${headerClass} flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Would You Rather</h3>
                    </div>
                </div>

                {!isExpanded ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 flex flex-col items-center">
                        <p className="text-sm text-gray-700 dark:text-gray-300 mb-3 text-center truncate w-full">
                            {gameData.optionA ? `${gameData.optionA} or ${gameData.optionB}?` : 'Loading question...'}
                        </p>
                        <button
                            onClick={() => setIsExpanded(true)}
                            style={{ backgroundColor: vibeBtnColor }}
                            className="w-full py-2 rounded-xl text-white text-[11px] font-bold transition-all shadow-md active:scale-95"
                        >
                            View Choices
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="p-3 space-y-2 bg-gray-50 dark:bg-gray-800 min-h-[140px] flex flex-col justify-center">
                            {gameData.optionA ? (
                                <>
                                    <button
                                        onClick={() => handleAnswer('A')}
                                        disabled={hasAnswered}
                                        className={`w-full text-left p-3 rounded-lg border-2 transition-all duration-200 relative overflow-hidden ${hasAnswered
                                            ? myAnswer === 'A'
                                                ? selectedOutlineClass
                                                : 'border-gray-200 dark:border-gray-700 opacity-60'
                                            : `border-gray-200 dark:border-gray-700 ${hoverBorderClass} cursor-pointer active:scale-[0.98]`
                                            }`}
                                    >
                                        {hasAnswered && (
                                            <div className={`absolute left-0 top-0 h-full ${progressFillClass} transition-all duration-700`} style={{ width: `${stats.aPct}%` }} />
                                        )}
                                        <div className="relative flex items-center justify-between">
                                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
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
                                                : 'border-gray-200 dark:border-gray-700 opacity-60'
                                            : `border-gray-200 dark:border-gray-700 ${hoverBorderClass} cursor-pointer active:scale-[0.98]`
                                            }`}
                                    >
                                        {hasAnswered && (
                                            <div className={`absolute left-0 top-0 h-full ${progressFillClass} transition-all duration-700`} style={{ width: `${stats.bPct}%` }} />
                                        )}
                                        <div className="relative flex items-center justify-between">
                                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
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
                                <div className="flex flex-col items-center justify-center py-4 space-y-2 text-gray-500">
                                    <Clock className="w-8 h-8 animate-pulse" />
                                    <p className="text-xs font-medium">Loading question...</p>
                                </div>
                            )}
                        </div>
                        <div className={`px-3 py-2 bg-gray-100 dark:bg-gray-700/50 border-t ${footerBorderClass} flex items-center justify-between`}>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center">
                                    <Users className="w-3.5 h-3.5 mr-1 text-gray-500 dark:text-gray-400" />
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{stats.total} response{stats.total !== 1 ? 's' : ''}</span>
                                </div>
                                {isSender && stats.total > 0 && (
                                    <button
                                        onClick={() => setShowVoteDetails(!showVoteDetails)}
                                        className="text-[10px] font-black text-primary-500 dark:text-primary-400 uppercase tracking-widest hover:underline"
                                    >
                                        {showVoteDetails ? 'Hide Details' : 'View Details'}
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                            >
                                Collapse
                            </button>
                        </div>
                        {showVoteDetails && isSender && (
                            <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 animate-in slide-in-from-top-2 duration-200">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Vote Details</p>
                                <div className="space-y-1.5">
                                    {Object.entries(answers).map(([uid, choice]) => (
                                        <div key={uid} className="flex items-center justify-between bg-gray-100 dark:bg-gray-900/50 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800">
                                            <span className="text-xs font-bold text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                                                {uid === currentUserId ? 'You' : (gameData.answerNicknames?.[uid] || 'Member')}
                                            </span>
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${choice === 'A' ? 'bg-indigo-500' : 'bg-teal-500'} text-white`}>
                                                Option {choice}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    // ── Trivia ──
    if (isTrivia) {
        return (
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-xl shadow-sm border-x border-b ${cardBorderClass} border-t-4 border-t-${accentColor}-500`}>
                <div className={`p-2 sm:p-3 ${headerClass} flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <HelpCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Trivia</h3>
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
                {!isExpanded ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center">
                        <p className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3 text-center">
                            {gameData.question ? "Trivia Time! 🤔" : 'Loading trivia...'}
                        </p>
                        <button
                            onClick={() => setIsExpanded(true)}
                            style={{ backgroundColor: vibeBtnColor }}
                            className="w-full py-2 rounded-xl text-white text-[11px] font-bold transition-all shadow-md active:scale-95"
                        >
                            Open Question
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 min-h-[160px] flex flex-col justify-center">
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
                                                            ? `border-green-500 bg-green-50 dark:bg-green-900/20 ${isMyPick ? 'trivia-correct-anim' : ''}`
                                                            : isMyPick && !isCorrect
                                                                ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                                                                : 'border-gray-200 dark:border-gray-700 opacity-50'
                                                        : `border-gray-200 dark:border-gray-700 ${hoverBorderClass} cursor-pointer active:scale-[0.98]`
                                                        }`}
                                                >
                                                    {showResult && (
                                                        <div className={`absolute left-0 top-0 h-full transition-all duration-700 ${isCorrect ? 'bg-green-500/10' : 'bg-gray-500/5'}`} style={{ width: `${pct}%` }} />
                                                    )}
                                                    <div className="relative flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            {showResult && isCorrect && <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />}
                                                            {showResult && isMyPick && !isCorrect && <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                                                            <span className={`text-sm ${showResult && isCorrect ? 'font-bold text-green-700 dark:text-green-400' : 'text-gray-900 dark:text-gray-100'}`}>
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
                        <div className={`px-3 py-2 bg-gray-100 dark:bg-gray-700/50 border-t ${footerBorderClass} flex items-center justify-between`}>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center">
                                    <Users className="w-3.5 h-3.5 mr-1 text-gray-500 dark:text-gray-400" />
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{stats.total} answer{stats.total !== 1 ? 's' : ''}</span>
                                </div>
                                {isSender && stats.total > 0 && (
                                    <button
                                        onClick={() => setShowVoteDetails(!showVoteDetails)}
                                        className="text-[10px] font-black text-primary-500 dark:text-primary-400 uppercase tracking-widest hover:underline"
                                    >
                                        {showVoteDetails ? 'Hide Details' : 'View Details'}
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="text-[10px] font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                            >
                                Collapse
                            </button>
                        </div>
                        {showVoteDetails && isSender && (
                            <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 animate-in slide-in-from-top-2 duration-200">
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Detailed Results</p>
                                <div className="space-y-1.5">
                                    {Object.entries(answers).map(([uid, choiceIdx]) => (
                                        <div key={uid} className="flex items-center justify-between bg-gray-100 dark:bg-gray-900/50 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-800">
                                            <span className="text-xs font-bold text-gray-600 dark:text-gray-400 truncate max-w-[120px]">
                                                {uid === currentUserId ? 'You' : (gameData.answerNicknames?.[uid] || 'Member')}
                                            </span>
                                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${choiceIdx === gameData.answer ? 'bg-green-500' : 'bg-red-500'} text-white`}>
                                                {String.fromCharCode(65 + choiceIdx)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    // ── Rock Paper Scissors ──
    if (isRPS) {
        const isP1 = gameData.players.P1.id === currentUserId || (currentNickname && gameData.players.P1.name === currentNickname);
        const isP2 = gameData.players.P2.id === currentUserId || (currentNickname && gameData.players.P2.name === currentNickname);
        const amPlaying = isP1 || isP2;
        const p1Move = gameData.players.P1.move;
        const p2Move = gameData.players.P2.move;
        const myMove = isP1 ? p1Move : isP2 ? p2Move : null;

        const getRPSStatus = () => {
            if (gameData.winner) {
                if (gameData.winner === 'draw') return "It's a draw! 🤝";
                const winnerName = gameData.players[gameData.winner].name;
                return gameData.winner === (isP1 ? 'P1' : 'P2') ? "You Won the Match! 🏆" : `${winnerName} Won the Match!`;
            }
            if (!gameData.players.P2.id) return "Waiting for opponent...";

            const roundNum = (gameData.rounds?.length || 0) + 1;
            if (amPlaying) {
                if (!myMove) return `Round ${roundNum}: Make your move!`;
                return `Round ${roundNum}: Waiting for opponent...`;
            }
            return `Round ${roundNum} in progress...`;
        };

        const getMoveIcon = (move) => {
            switch (move) {
                case 'rock': return '🪨';
                case 'paper': return '📄';
                case 'scissors': return '✂️';
                case 'locked': return '🔒';
                default: return '❓';
            }
        };

        return (
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border-x border-b ${cardBorderClass} border-t-4 border-t-${accentColor}-500 animate-in fade-in zoom-in duration-300`}>
                <div className={`p-2 sm:p-3 ${headerClass} flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Sparkles className="w-3.5 h-3.5 sm:w-5 sm:h-5 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Best of Three RPS</h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {isSpectator && (
                            <div className="bg-white/10 rounded-full px-2 py-0.5 border border-white/20">
                                <span className="text-[9px] font-black text-white/80 uppercase tracking-tighter">Spectating</span>
                            </div>
                        )}
                        {gameData.players.P2.id && (
                            <div className="flex items-center gap-2 bg-white/20 rounded-full px-2 py-0.5">
                                <span className="text-[10px] font-black text-white uppercase tracking-tighter">
                                    {gameData.scores.P1} - {gameData.scores.P2}
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {!isExpanded ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center gap-3">
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col items-center">
                                <div className="text-2xl mb-1">👤</div>
                                <span className="text-[10px] font-bold text-gray-500 truncate max-w-[60px]">{gameData.players.P1.name}</span>
                                <div className="flex gap-1 mt-1">
                                    {[...Array(2)].map((_, i) => (
                                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < gameData.scores.P1 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                                    ))}
                                </div>
                            </div>
                            <span className="text-gray-400 dark:text-gray-300 font-bold italic text-xs">VS</span>
                            <div className="flex flex-col items-center">
                                <div className="text-2xl mb-1">👤</div>
                                <span className="text-[10px] font-bold text-gray-500 truncate max-w-[60px]">{gameData.players.P2.name || '???'}</span>
                                <div className="flex gap-1 mt-1">
                                    {[...Array(2)].map((_, i) => (
                                        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < gameData.scores.P2 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsExpanded(true)}
                            style={{ backgroundColor: vibeBtnColor }}
                            className={`w-full py-2 rounded-xl text-white text-[11px] font-bold transition-all shadow-md active:scale-95`}
                        >
                            {gameData.winner ? 'View match' : (amPlaying ? 'Continue match' : 'View match')}
                        </button>
                    </div>
                ) : (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center">
                        <div className="w-full flex justify-between items-center mb-4 px-2">
                            <div className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${isP1 ? selectedOutlineClass : 'border-transparent opacity-60'}`}>
                                <div className="text-3xl mb-1">{myMove && isP1 ? getMoveIcon(myMove) : (gameData.winner && p1Move ? getMoveIcon(p1Move) : '❓')}</div>
                                <span className="text-[10px] font-bold mt-1 max-w-[60px] truncate">{gameData.players.P1.name}</span>
                                <div className="flex gap-1 mt-1">
                                    {[...Array(2)].map((_, i) => (
                                        <div key={i} className={`w-2 h-2 rounded-full ${i < gameData.scores.P1 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                                    ))}
                                </div>
                            </div>
                            <div className="text-gray-400 dark:text-gray-700 font-black text-xl italic">VS</div>
                            <div className={`flex flex-col items-center p-2 rounded-xl border-2 transition-all ${isP2 ? selectedOutlineClass : 'border-transparent opacity-60'}`}>
                                <div className="text-3xl mb-1">{myMove && isP2 ? getMoveIcon(myMove) : (gameData.winner && p2Move ? getMoveIcon(p2Move) : '❓')}</div>
                                <span className="text-[10px] font-bold mt-1 max-w-[60px] truncate">{gameData.players.P2.name || '???'}</span>
                                <div className="flex gap-1 mt-1">
                                    {[...Array(2)].map((_, i) => (
                                        <div key={i} className={`w-2 h-2 rounded-full ${i < gameData.scores.P2 ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {gameData.rounds?.length > 0 && (
                            <div className="w-full mb-4 px-2 py-2 bg-gray-100 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                                <div className="text-[9px] font-black text-gray-500 uppercase mb-1 tracking-wider">Round History</div>
                                <div className="flex flex-col gap-1">
                                    {gameData.rounds.map((round, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-[10px]">
                                            <span className="text-gray-500">Round {idx + 1}</span>
                                            <div className="flex items-center gap-1.5">
                                                <span>{getMoveIcon(round.P1)}</span>
                                                <span className="text-gray-300">vs</span>
                                                <span>{getMoveIcon(round.P2)}</span>
                                            </div>
                                            <span className={`font-bold ${round.result === 'draw' ? 'text-gray-400' : 'text-green-500'}`}>
                                                {round.result === 'draw' ? 'Tie' : round.result === 'P1' ? 'P1 win' : 'P2 win'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!gameData.winner && amPlaying && !myMove && gameData.players.P2.id && (
                            <div className="grid grid-cols-3 gap-3 w-full mb-4">
                                {['rock', 'paper', 'scissors'].map((move) => (
                                    <button
                                        key={move}
                                        onClick={() => handleRPSMove(move)}
                                        className={`flex flex-col items-center justify-center p-3 rounded-xl border-2 border-dashed ${cardBorderClass} ${hoverBorderClass} transition-all active:scale-90 bg-gray-50 dark:bg-gray-800`}
                                    >
                                        <span className="text-2xl mb-1">{getMoveIcon(move)}</span>
                                        <span className="text-[10px] font-bold capitalize text-gray-800 dark:text-gray-200">{move}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {!gameData.winner && !amPlaying && !gameData.players.P2.id && (
                            <button
                                onClick={handleRPSJoin}
                                className={`w-full py-3 rounded-xl bg-gradient-to-r from-${accentColor}-500 to-${accentColor}-600 text-white font-black text-xs uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all mb-4`}
                            >
                                Tap to Join Game
                            </button>
                        )}

                        <div className={`w-full p-2.5 rounded-xl text-center font-bold text-sm transition-all ${gameData.winner ? `bg-green-500 text-white shadow-lg` : `text-gray-900 dark:text-gray-100 bg-gray-100 dark:bg-gray-800`}`}>
                            {getRPSStatus()}
                        </div>

                        <button
                            onClick={() => setIsExpanded(false)}
                            className="mt-4 text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                        >
                            Collapse
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // ── Chess ──
    if (isChess) {
        return (
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border-x border-b ${cardBorderClass} border-t-4 border-t-${accentColor}-500 animate-in fade-in zoom-in duration-300`}>
                <div className={`p-2 sm:p-3 ${headerClass} flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Chess Match</h3>
                    </div>
                    {!gameData.players.black?.id && (
                        <div className="flex items-center gap-1.5 bg-white/20 rounded-full px-2 py-0.5">
                            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                            <span className="text-[9px] font-black text-white uppercase tracking-tighter">Waiting</span>
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center gap-4">
                    <div className="flex items-center gap-4 w-full justify-center">
                        <div className="flex flex-col items-center">
                            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl shadow-inner border border-gray-200 dark:border-gray-700">♔</div>
                            <span className="text-[10px] font-bold text-gray-500 mt-1 truncate max-w-[60px]">{gameData.players.white?.name}</span>
                        </div>
                        <Swords className="w-4 h-4 text-gray-300 italic" />
                        <div className="flex flex-col items-center">
                            <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xl shadow-inner border border-gray-200 dark:border-gray-700">♚</div>
                            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-400 mt-1 truncate max-w-[60px]">
                                {gameData.players.black?.name || gameData.invitedNickname || '???'}
                            </span>
                        </div>
                    </div>

                    {(!gameData.players.white?.id || !gameData.players.black?.id) && !isPlayer && (!isTargeted || isIntendedRecipient) ? (
                        <button
                            onClick={handleChessJoin}
                            className={`w-full py-2.5 rounded-xl bg-gradient-to-r ${vibe.accentClass} text-white font-black text-xs uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all`}
                        >
                            Join Match
                        </button>
                    ) : (
                        <button
                            onClick={() => onLaunchChess(message)}
                            className={`w-full py-2.5 rounded-xl bg-gray-900 dark:bg-black text-white font-black text-xs uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-2`}
                        >
                            <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                            {isPlayer ? 'Launch Board' : 'Spectate Game'}
                        </button>
                    )}

                    {gameData.winner && (
                        <div className={`w-full p-2.5 rounded-xl text-center font-bold text-[11px] bg-green-500 text-white shadow-lg`}>
                            {gameData.winner === 'draw' ? "Match Drawn" : `${gameData.winner === 'white' ? 'White' : 'Black'} Wins! 🏆`}
                        </div>
                    )}

                    {!gameData.winner && gameData.players.white?.id && gameData.players.black?.id && (() => {
                        const isMyTurnAsWhite = gameData.turn === 'w' && (gameData.players.white?.id === currentUserId || gameData.players.white?.name === currentNickname);
                        const isMyTurnAsBlack = gameData.turn === 'b' && (gameData.players.black?.id === currentUserId || gameData.players.black?.name === currentNickname);
                        const isMyTurn = isMyTurnAsWhite || isMyTurnAsBlack;
                        return (
                            <div className={`w-full p-2.5 rounded-xl text-center font-bold text-[11px] transition-all
                                ${isMyTurn
                                    ? 'bg-indigo-500 text-white shadow-md'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'}`}>
                                {isMyTurn
                                    ? "Your move! ♟️"
                                    : `${gameData.turn === 'w' ? 'White' : 'Black'}'s Turn`}
                            </div>
                        );
                    })()}

                    {isSender && (
                        <button
                            onClick={() => onDelete(message.id)}
                            className="text-[10px] font-bold text-rose-500 hover:text-rose-600 transition-colors uppercase tracking-widest mt-2"
                        >
                            Delete Game
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // ── Hangman ──
    if (isHangman) {
        const isPlayer = (gameData.players || []).some(
            p => p.id === currentUserId || p.socketId === currentUserId ||
            (currentUser?.id && p.id === currentUser.id)
        );
        const isInvitedUser = gameData.invitedUserId && (
            gameData.invitedUserId === currentUserId ||
            (currentUser?.id && gameData.invitedUserId === currentUser.id)
        );

        return (
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border-x border-b ${cardBorderClass} border-t-4 border-t-orange-500 animate-in fade-in zoom-in duration-300`}>
                <div className={`p-2 sm:p-3 bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Skull className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Hangman</h3>
                    </div>
                </div>

                {!isExpanded ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center gap-3">
                        <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            Guess the word before {gameData.maxMistakes || 6} wrong guesses
                        </p>
                        <button
                            onClick={() => setIsExpanded(true)}
                            style={{ backgroundColor: vibeBtnColor }}
                            className="w-full py-2 rounded-xl text-white text-[11px] font-bold transition-all shadow-md active:scale-95"
                        >
                            {gameData.gameOver ? 'View Result' : (isPlayer ? 'Continue Game' : 'View Game')}
                        </button>
                    </div>
                ) : (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900">
                        <HangmanGame
                            message={message}
                            currentUser={currentUser}
                            vibeColor={vibe.colors?.primary}
                            onHangmanJoin={onHangmanJoin}
                            onHangmanGuess={onHangmanGuess}
                            onRematch={onRematch}
                            onShareResult={onShareResult}
                        />
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="mt-4 w-full text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                        >
                            Collapse
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // ── Anagram ──
    if (isAnagram) {
        const isPlayer = (gameData.players || []).some(
            p => p.id === currentUserId || p.socketId === currentUserId ||
            (currentUser?.id && p.id === currentUser.id)
        );

        return (
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border-x border-b ${cardBorderClass} border-t-4 border-t-violet-500 animate-in fade-in zoom-in duration-300`}>
                <div className={`p-2 sm:p-3 bg-gradient-to-r from-violet-500 to-purple-500 flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Puzzle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Anagrams</h3>
                    </div>
                </div>

                {!isExpanded ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center gap-3">
                        <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            Unscramble {gameData.rounds || 5} words
                        </p>
                        <button
                            onClick={() => setIsExpanded(true)}
                            style={{ backgroundColor: vibeBtnColor }}
                            className="w-full py-2 rounded-xl text-white text-[11px] font-bold transition-all shadow-md active:scale-95"
                        >
                            {gameData.gameOver ? 'View Result' : (isPlayer ? 'Continue Game' : 'View Game')}
                        </button>
                    </div>
                ) : (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900">
                        <AnagramGame
                            message={message}
                            currentUser={currentUser}
                            vibeColor={vibe.colors?.primary}
                            onAnagramJoin={onAnagramJoin}
                            onAnagramSubmit={onAnagramSubmit}
                            onAnagramNextRound={onAnagramNextRound}
                            onAnagramReveal={onAnagramReveal}
                            onAnagramHint={onAnagramHint}
                            onRematch={onRematch}
                            onShareResult={onShareResult}
                        />
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="mt-4 w-full text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                        >
                            Collapse
                        </button>
                    </div>
                )}
            </div>
        );
    }

    // ── Typing Race ──
    if (isTypingRace) {
        const allPlayers = Object.values(gameData.players || {});
        const isPlayer = allPlayers.some(
            p => p.id === currentUserId || p.socketId === currentUserId ||
            (currentUser?.id && p.id === currentUser.id)
        );

        return (
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border-x border-b ${cardBorderClass} border-t-4 border-t-blue-500 animate-in fade-in zoom-in duration-300`}>
                <div className={`p-2 sm:p-3 bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Typing Race</h3>
                    </div>
                </div>

                {!isExpanded ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center gap-3">
                        <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            Type as fast as you can
                        </p>
                        <button
                            onClick={() => setIsExpanded(true)}
                            style={{ backgroundColor: vibeBtnColor }}
                            className="w-full py-2 rounded-xl text-white text-[11px] font-bold transition-all shadow-md active:scale-95"
                        >
                            {gameData.status === 'finished' ? 'View Result' : (isPlayer ? 'Continue Game' : 'View Game')}
                        </button>
                    </div>
                ) : (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900">
                        <TypingRaceGame
                            message={message}
                            currentUser={currentUser}
                            vibeColor={vibe.colors?.primary}
                            onTypingRaceJoin={onTypingRaceJoin}
                            onTypingRaceStart={onTypingRaceStart}
                            onTypingRaceProgress={onTypingRaceProgress}
                            onTypingRaceFinish={onTypingRaceFinish}
                            onRematch={onRematch}
                            onShareResult={onShareResult}
                        />
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="mt-4 w-full text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                        >
                            Collapse
                        </button>
                    </div>
                )}
            </div>
        );
    }
};

export default GameMessage;
