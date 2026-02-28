import ChessGame from './ChessGame';
import { getVibeById } from '../../utils/vibes';
import { Chess } from '../../utils/chess-lib';

const ChessModal = ({ isOpen, onClose, message, currentUserId, onMove, roomVibe }) => {
    if (!isOpen || !message) return null;

    const { gameData } = message;
    const vibe = getVibeById(roomVibe);

    // Dynamic classes based on vibe
    const accentColor = vibe.id === 'party' ? 'indigo' :
        vibe.id === 'chill' ? 'teal' :
            vibe.id === 'focus' ? 'orange' : 'primary';

    const headerClass = vibe.accentClass;
    const isWhite = gameData.players.white?.id === currentUserId;
    const isBlack = gameData.players.black?.id === currentUserId;
    const amPlaying = isWhite || isBlack;

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

            {/* Modal Container */}
            <div className={`relative w-full max-w-2xl bg-white dark:bg-gray-950 rounded-3xl shadow-2xl overflow-hidden border border-white/10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300`}>

                {/* Header */}
                <div className={`p-4 ${headerClass} flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/20 rounded-xl">
                            <Trophy className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-black text-lg tracking-tight">Chess Match</h3>
                            <p className="text-white/70 text-[10px] uppercase font-bold tracking-widest leading-none">
                                {gameData.winner ? 'Match Ended' : 'Live Battle'}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/20 rounded-full text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex flex-col md:flex-row gap-8 items-center md:items-start justify-center">

                    {/* Left: The Board */}
                    <div className="w-full max-w-[450px] shrink-0">
                        <ChessGame
                            gameData={gameData}
                            currentUserId={currentUserId}
                            onMove={(move) => onMove(message.id, 'chess-move', move)}
                            vibe={vibe.id}
                        />
                    </div>

                    {/* Right: Game Info Panel */}
                    <div className="flex-1 w-full space-y-6">
                        {/* Status Card */}
                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-2 mb-4 text-gray-400">
                                <Info className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Match Status</span>
                            </div>

                            <div className="space-y-4">
                                <div className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${gameData.turn === 'w' ? `border-${accentColor}-500 bg-${accentColor}-50 dark:bg-${accentColor}-900/20` : 'border-transparent opacity-60'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-white border-2 border-gray-200 flex items-center justify-center text-xl shadow-sm">♔</div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-900 dark:text-white">{gameData.players.white?.name || 'Waiting...'}</p>
                                            <div className="flex gap-0.5 mt-0.5 min-h-[12px]">
                                                {capturedByWhite.map((p, idx) => (
                                                    <span key={idx} className="text-[10px] text-gray-400">{getPieceIcon(p.type, 'b')}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    {isWhite && <Shield className={`w-4 h-4 text-${accentColor}-500`} />}
                                </div>

                                <div className="flex justify-center -my-2 opacity-30">
                                    <Swords className="w-5 h-5 text-gray-400" />
                                </div>

                                <div className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${gameData.turn === 'b' ? `border-${accentColor}-500 bg-${accentColor}-50 dark:bg-${accentColor}-900/20` : 'border-transparent opacity-60'}`}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-gray-900 border-2 border-gray-700 flex items-center justify-center text-xl text-white shadow-sm font-light">♚</div>
                                        <div>
                                            <p className="text-xs font-bold text-gray-900 dark:text-white">{gameData.players.black?.name || 'Waiting...'}</p>
                                            <div className="flex gap-0.5 mt-0.5 min-h-[12px]">
                                                {capturedByBlack.map((p, idx) => (
                                                    <span key={idx} className="text-[10px] text-gray-400">{getPieceIcon(p.type, 'w')}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    {isBlack && <Shield className={`w-4 h-4 text-${accentColor}-500`} />}
                                </div>
                            </div>
                        </div>

                        {/* Move History */}
                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 border border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-2 mb-3 text-gray-400">
                                <History className="w-4 h-4" />
                                <span className="text-[10px] font-black uppercase tracking-widest">Move History</span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                                {gameData.history && gameData.history.length > 0 ? (
                                    gameData.history.map((move, i) => (
                                        <div key={i} className="flex items-center gap-2 bg-white dark:bg-gray-800 px-2 py-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
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
                    </div>
                </div>

                {/* Footer Info */}
                <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
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
