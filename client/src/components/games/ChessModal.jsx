import ChessGame from './ChessGame';
import { getVibeById } from '../../utils/vibes';
import { Chess } from '../../utils/chess-lib';
import { Trophy, X, Info, Swords, Shield, History } from 'lucide-react';

const ChessModal = ({ isOpen, onClose, message, currentUserId, currentNickname, users, onMove, roomVibe }) => {
    if (!isOpen || !message) return null;

    const { gameData } = message;
    const vibe = getVibeById(roomVibe);

    // Dynamic classes based on vibe
    const accentColor = vibe.id === 'party' ? 'indigo' :
        vibe.id === 'chill' ? 'teal' :
            vibe.id === 'focus' ? 'orange' : 'primary';

    const headerClass = vibe.accentClass;
    const isWhite = gameData.players.white?.id === currentUserId || (currentNickname && gameData.players.white?.name === currentNickname);
    const isBlack = gameData.players.black?.id === currentUserId || (currentNickname && gameData.players.black?.name === currentNickname);
    const amPlaying = isWhite || isBlack;
    const isHost = message.sender.id === currentUserId || message.sender.socketId === currentUserId || (currentNickname && message.sender.nickname === currentNickname);

    // Filter users eligible for replacement (not already playing)
    const availableUsers = (users || []).filter(u => {
        const isCurrentPlayer = u.id === gameData.players.white?.id || u.id === gameData.players.black?.id ||
            u.socketId === gameData.players.white?.socketId || u.socketId === gameData.players.black?.socketId ||
            u.nickname === gameData.players.white?.name || u.nickname === gameData.players.black?.name;
        const isMe = u.socketId === currentUserId || u.id === currentUserId;
        return !isCurrentPlayer && !isMe;
    });

    // Use a temporary chess instance to calculate captured pieces and status
    const game = new Chess(gameData.fen || undefined);
    const board = game.board();

    const initialPieces = {
        w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
        b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
    };
    const currentPieces = {
        w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
        b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }
    };
    board.flat().filter(p => p).forEach(p => {
        currentPieces[p.color][p.type]++;
    });

    const capturedByWhite = [];
    const capturedByBlack = [];
    ['p', 'n', 'b', 'r', 'q'].forEach(type => {
        for (let i = 0; i < (initialPieces.b[type] - currentPieces.b[type]); i++) capturedByWhite.push({ type, color: 'b' });
        for (let i = 0; i < (initialPieces.w[type] - currentPieces.w[type]); i++) capturedByBlack.push({ type, color: 'w' });
    });

    const isCheck = game.isCheck();
    const isCheckmate = game.isCheckmate();
    const isDraw = game.isDraw();
    const isGameOver = isCheckmate || isDraw;

    const getPieceIcon = (type, color) => {
        const icons = {
            p: color === 'w' ? '♙' : '♟',
            n: color === 'w' ? '♘' : '♞',
            b: color === 'w' ? '♗' : '♝',
            r: color === 'w' ? '♖' : '♜',
            q: color === 'w' ? '♕' : '♛',
            k: color === 'w' ? '♔' : '♚'
        };
        return icons[type];
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal Container — full-height scroll on mobile */}
            <div className={`relative w-full max-w-2xl bg-gray-50 dark:bg-gray-950 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-gray-300 dark:border-white/10 flex flex-col max-h-[95vh] sm:max-h-[90vh] animate-in zoom-in-95 duration-300`}>

                {/* Header */}
                <div className={`p-3 sm:p-4 ${headerClass} flex items-center justify-between shrink-0`}>
                    <div className="flex items-center gap-2">
                        <div className="p-1.5 sm:p-2 bg-white/20 rounded-xl">
                            <Trophy className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-black text-sm sm:text-lg tracking-tight">Chess Match</h3>
                            <p className="text-white/70 text-[9px] sm:text-[10px] uppercase font-bold tracking-widest leading-none">
                                {gameData.winner ? 'Match Ended' : 'Live Battle'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 sm:p-2 hover:bg-white/20 rounded-full text-white transition-colors"
                    >
                        <X className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-6 flex flex-col md:flex-row gap-4 sm:gap-6 items-center md:items-start justify-start md:justify-center">

                    {/* Left: The Board */}
                    <div className="w-full max-w-[300px] sm:max-w-[380px] md:max-w-[420px] shrink-0">
                        <ChessGame
                            gameData={gameData}
                            currentUserId={currentUserId}
                            currentNickname={currentNickname}
                            onMove={(move) => onMove(message.id, 'chess-move', move)}
                            vibe={vibe.id}
                        />
                    </div>

                    {/* Right: Game Info Panel — compact on mobile */}
                    <div className="flex-1 w-full space-y-3 sm:space-y-6">
                        {/* Status Card */}
                        <div className="bg-gray-100 dark:bg-gray-900/50 rounded-xl sm:rounded-2xl p-3 sm:p-4 border border-gray-200 dark:border-gray-800">
                            <div className="flex items-center gap-2 mb-3 text-gray-400">
                                <Info className="w-3.5 h-3.5" />
                                <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest">Match Status</span>
                            </div>

                            <div className="space-y-2 sm:space-y-4">
                                <div className={`flex items-center justify-between p-2 sm:p-3 rounded-lg sm:rounded-xl border-2 transition-all ${gameData.turn === 'w' ? `border-${accentColor}-500 bg-${accentColor}-50 dark:bg-${accentColor}-900/20` : 'border-transparent opacity-60'}`}>
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-base sm:text-xl shadow-sm">♔</div>
                                        <div>
                                            <p className="text-[10px] sm:text-xs font-bold text-gray-900 dark:text-white">{gameData.players.white?.name || 'Waiting...'}</p>
                                            <div className="flex gap-0.5 mt-0.5 min-h-[10px]">
                                                {capturedByWhite.map((p, idx) => (
                                                    <span key={idx} className="text-[9px] text-gray-400">{getPieceIcon(p.type, 'b')}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    {isWhite && <Shield className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-${accentColor}-500`} />}
                                </div>

                                <div className="flex justify-center -my-1 opacity-30">
                                    <Swords className="w-4 h-4 text-gray-400" />
                                </div>

                                <div className={`flex items-center justify-between p-2 sm:p-3 rounded-lg sm:rounded-xl border-2 transition-all ${gameData.turn === 'b' ? `border-${accentColor}-500 bg-${accentColor}-50 dark:bg-${accentColor}-900/20` : 'border-transparent opacity-60'}`}>
                                    <div className="flex items-center gap-2">
                                        <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-gray-900 border-2 border-gray-700 flex items-center justify-center text-base sm:text-xl text-white shadow-sm font-light">♚</div>
                                        <div>
                                            <p className="text-[10px] sm:text-xs font-bold text-gray-900 dark:text-white">{gameData.players.black?.name || 'Waiting...'}</p>
                                            <div className="flex gap-0.5 mt-0.5 min-h-[10px]">
                                                {capturedByBlack.map((p, idx) => (
                                                    <span key={idx} className="text-[9px] text-gray-400">{getPieceIcon(p.type, 'w')}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    {isBlack && <Shield className={`w-3.5 h-3.5 sm:w-4 sm:h-4 text-${accentColor}-500`} />}
                                </div>
                            </div>
                        </div>

                        {/* Move History */}
                        <div className="bg-gray-100 dark:bg-gray-900/50 rounded-2xl p-4 border border-gray-200 dark:border-gray-800">
                            <div className="flex items-center gap-2 mb-3 text-gray-400">
                                <History className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Move History</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                                {gameData.history && gameData.history.length > 0 ? (
                                    gameData.history.map((move, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-white dark:bg-gray-800 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
                                            <span className="text-[9px] font-black text-gray-400 w-4">{Math.floor(i / 2) + 1}{i % 2 ? '...' : '.'}</span>
                                            <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">{move}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div className="col-span-2 text-center py-4 text-gray-400 italic text-[10px]">No moves yet</div>
                                )}
                            </div>
                        </div>

                        {/* Game Status Message */}
                        {(isCheck || isGameOver) && (
                            <div className={`p-4 rounded-2xl border-2 flex flex-col items-center justify-center text-center animate-bounce-subtle ${isGameOver ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-500' : 'bg-red-50 dark:bg-red-900/20 border-red-500'}`}>
                                <p className={`text-sm font-black uppercase tracking-widest ${isGameOver ? 'text-amber-600' : 'text-red-600'}`}>
                                    {isCheckmate ? 'Checkmate!' : isCheck ? 'Check!' : isDraw ? 'Draw!' : ''}
                                </p>
                                {isGameOver && (
                                    <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mt-1">
                                        {isCheckmate ? `${game.turn() === 'w' ? 'Black' : 'White'} Victory` : 'Game Over'}
                                    </p>
                                )}
                            </div>
                        )}
                        {/* Player Management (Host Only) */}
                        {isHost && !gameData.winner && (
                            <div className="bg-gray-100 dark:bg-gray-900/50 rounded-2xl p-4 border border-gray-200 dark:border-gray-800">
                                <div className="flex items-center gap-2 mb-4 text-gray-400">
                                    <Shield className="w-4 h-4 text-primary-500" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-primary-500">Host Management</span>
                                </div>

                                <div className="space-y-4">
                                    <button
                                        onClick={() => onMove(message.id, 'chess-swap')}
                                        className="w-full py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-[11px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        <Swords className="w-3.5 h-3.5" />
                                        Swap White / Black
                                    </button>

                                    {availableUsers.length > 0 && (
                                        <div className="space-y-4 pt-2 border-t border-gray-200 dark:border-gray-700/50">
                                            {/* Replace White */}
                                            <div className="space-y-2">
                                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center">Replace White ({gameData.players.white?.name || 'Empty'})</p>
                                                <div className="flex flex-wrap gap-2 justify-center">
                                                    {availableUsers.slice(0, 4).map(user => (
                                                        <button
                                                            key={user.socketId}
                                                            onClick={() => onMove(message.id, 'chess-replace', { targetUserId: user.socketId, role: 'white' })}
                                                            className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] font-bold text-gray-600 dark:text-gray-400 hover:border-white hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-95 truncate max-w-[100px]"
                                                        >
                                                            {user.nickname}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Replace Black */}
                                            <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-gray-800/50">
                                                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center">Replace Black ({gameData.players.black?.name || 'Empty'})</p>
                                                <div className="flex flex-wrap gap-2 justify-center">
                                                    {availableUsers.slice(0, 4).map(user => (
                                                        <button
                                                            key={user.socketId}
                                                            onClick={() => onMove(message.id, 'chess-replace', { targetUserId: user.socketId, role: 'black' })}
                                                            className="px-3 py-1.5 bg-gray-900 dark:bg-black border border-gray-700 rounded-lg text-[10px] font-bold text-gray-300 hover:bg-gray-800 transition-all active:scale-95 truncate max-w-[100px]"
                                                        >
                                                            {user.nickname}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Info */}
                <div className="p-4 bg-gray-100 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-between items-center text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                    <span>{amPlaying ? 'You are Playing' : 'Spectating Mode'}</span>
                    <span className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Synchronized Match
                    </span>
                </div>

            </div>
        </div>
    );
};

export default ChessModal;
