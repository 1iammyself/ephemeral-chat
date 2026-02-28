import React, { useState, useEffect, useCallback } from 'react';
import { Chess } from '../../utils/chess-lib';
import { getVibeById } from '../../utils/vibes';

// SVG Pieces for a standalone experience
const PIECES = {
    w: {
        p: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        ),
        n: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" fill={fill} stroke={stroke} strokeWidth="1.5" />
                <path d="M24 18c.3 1.2 1.5 2.5 1.5 2.5s-1.5 3-2.5 4.5" fill="none" stroke={stroke} strokeWidth="1.5" />
                <path d="M9.5 25.5A.5.5 0 1 1 9 25.5a.5.5 0 0 1 .5.5z" fill={fill} stroke={stroke} strokeWidth="1.5" />
                <path d="M15 15.5c4.5 2 7.5 7 7.5 12" fill="none" stroke={stroke} strokeWidth="1.5" />
            </svg>
        ),
        b: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 0 2 0 2H9v-2z" />
                    <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
                    <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />
                </g>
            </svg>
        ),
        r: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
                    <path d="M34 14l-3 3H14l-3-3" />
                    <path d="M31 17v12.5H14V17" />
                    <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
                    <path d="M11 14h23" fill="none" stroke={stroke} strokeLinejoin="miter" />
                </g>
            </svg>
        ),
        q: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM11 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM38 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
                    <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-5.5-13.5V25L13 14l-4 12z" />
                    <path d="M9 26c0 2 1.5 2 2.5 4 2.5 4 4.5 6 12 6s9.5-2 12-6c1-2 2.5-2 2.5-4 0-5-5-10-7-10H16c-2 0-7 5-7 10z" />
                    <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" />
                </g>
            </svg>
        ),
        k: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22.5 11.63V6M20 8h5" fill="none" stroke={stroke} strokeLinejoin="miter" />
                    <path d="M22.5 25s4.5-7.5 3-10c-1.5-2.5-6-2.5-6 0-1.5 2.5 3 10 3 10z" />
                    <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-1-4-1-4s-3 3-3 8c1.5 3-3 5.5-3 5.5s-3-2-3-4.5V14.5h-4V24s-3 2.5-3 2.5-3-2.5-3-2.5V14.5h-4v9.5c0 2.5-3 4.5-3 4.5s-4.5-2.5-3-5.5c0-5-3-8-3-8s3 3-1 4c-3 6 6 10.5 6 10.5v7z" />
                    <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" fill="none" />
                </g>
            </svg>
        )
    },
    b: {
        p: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <path d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z" fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" />
            </svg>
        ),
        n: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21" />
                    <path d="M24 18c.3 1.2 1.5 2.5 1.5 2.5s-1.5 3-2.5 4.5" fill={fill} stroke={stroke} />
                    <path d="M9.5 25.5A.5.5 0 1 1 9 25.5a.5.5 0 0 1 .5.5z" fill={fill} stroke={stroke} />
                    <path d="M15 15.5c4.5 2 7.5 7 7.5 12" fill="none" stroke={stroke} />
                </g>
            </svg>
        ),
        b: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 0 2 0 2H9v-2z" />
                    <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
                    <path d="M25 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z" />
                </g>
            </svg>
        ),
        r: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
                    <path d="M34 14l-3 3H14l-3-3" />
                    <path d="M31 17v12.5H14V17" />
                    <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
                    <path d="M11 14h23" fill="none" stroke={stroke} strokeLinejoin="miter" />
                </g>
            </svg>
        ),
        q: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM24.5 7.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM41 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM11 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM38 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0z" />
                    <path d="M9 26c8.5-1.5 21-1.5 27 0l2-12-7 11V11l-5.5 13.5-5.5-13.5V25L13 14l-4 12z" />
                    <path d="M9 26c0 2 1.5 2 2.5 4 2.5 4 4.5 6 12 6s9.5-2 12-6c1-2 2.5-2 2.5-4 0-5-5-10-7-10H16c-2 0-7 5-7 10z" />
                    <path d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0" fill="none" />
                </g>
            </svg>
        ),
        k: (fill, stroke) => (
            <svg viewBox="0 0 45 45" width="100%" height="100%">
                <g fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22.5 11.63V6M20 8h5" fill="none" stroke={stroke} strokeLinejoin="miter" />
                    <path d="M22.5 25s4.5-7.5 3-10c-1.5-2.5-6-2.5-6 0-1.5 2.5 3 10 3 10z" />
                    <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-1-1-4-1-4s-3 3-3 8c1.5 3-3 5.5-3 5.5s-3-2-3-4.5V14.5h-4V24s-3 2.5-3 2.5-3-2.5-3-2.5V14.5h-4v9.5c0 2.5-3 4.5-3 4.5s-4.5-2.5-3-5.5c0-5-3-8-3-8s3 3-1 4c-3 6 6 10.5 6 10.5v7z" />
                    <path d="M11.5 30c5.5-3 15.5-3 21 0M11.5 33.5c5.5-3 15.5-3 21 0M11.5 37c5.5-3 15.5-3 21 0" fill="none" />
                </g>
            </svg>
        )
    }
};

const ChessGame = ({ gameData, currentUserId, currentNickname, onMove, vibe: vibeId }) => {
    const [game, setGame] = useState(new Chess(gameData?.fen || undefined));
    const [selectedSquare, setSelectedSquare] = useState(null);
    const [validMoves, setValidMoves] = useState([]);
    const [pendingPromotion, setPendingPromotion] = useState(null);
    const vibe = getVibeById(vibeId);

    const isWhite = gameData?.players?.white?.id === currentUserId || (currentNickname && gameData?.players?.white?.name === currentNickname);
    const isBlack = gameData?.players?.black?.id === currentUserId || (currentNickname && gameData?.players?.black?.name === currentNickname);
    const isMyTurn = (game.turn() === 'w' && isWhite) || (game.turn() === 'b' && isBlack);

    useEffect(() => {
        if (gameData?.fen) {
            setGame(new Chess(gameData.fen));
        }
    }, [gameData?.fen]);

    const handleSquareClick = (square) => {
        if (!isMyTurn) return;

        if (selectedSquare === square) {
            setSelectedSquare(null);
            setValidMoves([]);
            return;
        }

        const piece = game.get(square);
        if (piece && piece.color === game.turn()) {
            setSelectedSquare(square);
            const moves = game.moves({ square, verbose: true });
            setValidMoves(moves.map(m => m.to));
        } else if (selectedSquare && validMoves.includes(square)) {
            // Check for pawn promotion
            const movePiece = game.get(selectedSquare);
            const isPromotion = movePiece?.type === 'p' &&
                ((movePiece.color === 'w' && square[1] === '8') ||
                    (movePiece.color === 'b' && square[1] === '1'));

            if (isPromotion) {
                setPendingPromotion({ from: selectedSquare, to: square });
            } else {
                onMove({ from: selectedSquare, to: square });
                setSelectedSquare(null);
                setValidMoves([]);
            }
        } else {
            setSelectedSquare(null);
            setValidMoves([]);
        }
    };

    const handleConfirmPromotion = (promotionPiece) => {
        if (pendingPromotion) {
            onMove({ ...pendingPromotion, promotion: promotionPiece });
            setPendingPromotion(null);
            setSelectedSquare(null);
            setValidMoves([]);
        }
    };

    const board = game.board();
    const squares = [];
    const history = gameData?.history || [];
    const lastMove = history.length > 0 ? history[history.length - 1] : null;

    // Track captured pieces
    const initialPieces = {
        w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
        b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 }
    };
    const currentPieces = {
        w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 },
        b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }
    };
    board.flat().filter(p => p).forEach(p => currentPieces[p.color][p.type]++);

    const capturedByWhite = [];
    const capturedByBlack = [];
    ['p', 'n', 'b', 'r', 'q'].forEach(type => {
        for (let i = 0; i < (initialPieces.b[type] - currentPieces.b[type]); i++) capturedByWhite.push({ type, color: 'b' });
        for (let i = 0; i < (initialPieces.w[type] - currentPieces.w[type]); i++) capturedByBlack.push({ type, color: 'w' });
    });

    const rows = isBlack ? [...board].reverse() : [...board];
    const inCheck = game.inCheck();
    const kingSquare = inCheck ? game.board().flat().find(p => p?.type === 'k' && p?.color === game.turn())?.square : null;

    rows.forEach((row, i) => {
        const displayRow = isBlack ? [...row].reverse() : [...row];
        displayRow.forEach((cell, j) => {
            const fileIdx = isBlack ? 7 - j : j;
            const rankIdx = isBlack ? i : 7 - i;
            const currentSquare = String.fromCharCode(97 + fileIdx) + (rankIdx + 1);

            const isDark = (rankIdx + fileIdx) % 2 === 0;
            const isSelected = selectedSquare === currentSquare;
            const isValidMove = validMoves.includes(currentSquare);
            const isLastMoveSrc = lastMove?.from === currentSquare;
            const isLastMoveDst = lastMove?.to === currentSquare;
            const isCheckSquare = kingSquare === currentSquare;

            squares.push(
                <div
                    key={currentSquare}
                    onClick={() => handleSquareClick(currentSquare)}
                    style={{
                        width: '12.5%',
                        height: '12.5%',
                        backgroundColor: isSelected
                            ? vibe.colors.primary + '88'
                            : isCheckSquare
                                ? '#ff444488'
                                : (isLastMoveSrc || isLastMoveDst)
                                    ? vibe.colors.primary + '44'
                                    : (isDark ? vibe.colors.primary + '22' : 'transparent'),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: isMyTurn ? 'pointer' : 'default',
                        position: 'relative',
                        transition: 'all 0.2s ease',
                        animation: isCheckSquare ? 'pulse 1.5s infinite' : 'none'
                    }}
                >
                    {/* Coordinates */}
                    {fileIdx === 0 && (
                        <span style={{
                            position: 'absolute',
                            left: '2px',
                            top: '2px',
                            fontSize: '8px',
                            color: isDark ? '#fff' : vibe.colors.primary,
                            opacity: 0.6,
                            pointerEvents: 'none'
                        }}>{rankIdx + 1}</span>
                    )}
                    {rankIdx === (isBlack ? 7 : 0) && (
                        <span style={{
                            position: 'absolute',
                            right: '2px',
                            bottom: '2px',
                            fontSize: '8px',
                            color: isDark ? '#fff' : vibe.colors.primary,
                            opacity: 0.6,
                            pointerEvents: 'none'
                        }}>{String.fromCharCode(97 + fileIdx)}</span>
                    )}

                    {isValidMove && (
                        <div style={{
                            width: cell ? '85%' : '12px',
                            height: cell ? '85%' : '12px',
                            borderRadius: cell ? '50%' : '50%',
                            border: cell ? `4px solid ${vibe.colors.primary}44` : 'none',
                            backgroundColor: cell ? 'transparent' : vibe.colors.primary + '44',
                            position: 'absolute',
                            zIndex: 1
                        }} />
                    )}
                    {cell && (
                        <div style={{
                            width: '85%',
                            height: '85%',
                            zIndex: 2,
                            transform: isSelected ? 'scale(1.1) translateY(-4px)' : 'none',
                            transition: 'all 0.2s ease',
                            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
                        }}>
                            {PIECES[cell.color][cell.type](
                                cell.color === 'w' ? '#fff' : '#2d2d2d',
                                cell.color === 'w' ? '#2d2d2d' : '#888'
                            )}
                        </div>
                    )}
                </div>
            );
        });
    });

    return (
        <div style={{ width: '100%', maxWidth: '450px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Captured Pieces White (Top) */}
            <div style={{ display: 'flex', gap: '2px', height: '24px', opacity: 0.7, padding: '0 4px' }}>
                {capturedByBlack.map((p, idx) => (
                    <div key={idx} style={{ width: '16px', height: '16px' }}>
                        {PIECES[p.color][p.type]('#ccc', '#333')}
                    </div>
                ))}
            </div>

            <div style={{
                width: '100%',
                borderRadius: '12px',
                overflow: 'hidden',
                border: `2px solid ${vibe.colors.primary}44`,
                aspectRatio: '1/1',
                display: 'flex',
                flexWrap: 'wrap',
                background: vibe.id === 'party' ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.05)',
                boxShadow: `0 8px 32px ${vibe.colors.primary}22`,
                position: 'relative'
            }}>
                <style>{`
                    @keyframes pulse {
                        0% { opacity: 1; }
                        50% { opacity: 0.5; }
                        100% { opacity: 1; }
                    }
                `}</style>
                {squares}
            </div>

            {/* Captured Pieces Black (Bottom) */}
            <div style={{ display: 'flex', gap: '2px', height: '24px', opacity: 0.7, padding: '0 4px', justifyContent: 'flex-end' }}>
                {capturedByWhite.map((p, idx) => (
                    <div key={idx} style={{ width: '16px', height: '16px' }}>
                        {PIECES[p.color][p.type]('#333', '#ccc')}
                    </div>
                ))}
            </div>

            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '4px 8px',
                borderRadius: '8px',
                background: `${vibe.colors.primary}11`,
                fontSize: '0.85rem',
                fontWeight: '500'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: isMyTurn ? vibe.colors.primary : '#ccc',
                        boxShadow: isMyTurn ? `0 0 8px ${vibe.colors.primary}` : 'none'
                    }} />
                    <span>{isMyTurn ? "Your turn" : "Opponent's turn"}</span>
                </div>
                {game.isGameOver() && (
                    <span style={{ color: '#ff4444' }}>
                        {game.isCheckmate() ? "Checkmate!" : "Draw!"}
                    </span>
                )}
                {!game.isGameOver() && inCheck && (
                    <span style={{ color: '#ff4444', animation: 'pulse 1s infinite' }}>Check!</span>
                )}
            </div>

            {/* Promotion Picker Overlay */}
            {pendingPromotion && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700">
                        <p className="text-center text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">Promote Pawn To:</p>
                        <div className="flex gap-4">
                            {['q', 'r', 'b', 'n'].map(type => (
                                <button
                                    key={type}
                                    onClick={() => handleConfirmPromotion(type)}
                                    className="w-16 h-16 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors p-2"
                                >
                                    {PIECES[game.turn()][type]('#4B5563', '#1F2937')}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChessGame;
