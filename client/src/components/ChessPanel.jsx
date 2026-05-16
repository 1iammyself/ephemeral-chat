import React from 'react';
import { Trophy, Swords, Shield, History, Info } from 'lucide-react';
import ChessGame from './games/ChessGame';
import { getVibeById } from '../utils/vibes';
import { Chess } from '../utils/chess-lib';

const PIECE_ICONS = {
  p: { w: '♙', b: '♟' }, n: { w: '♘', b: '♞' },
  b: { w: '♗', b: '♝' }, r: { w: '♖', b: '♜' },
  q: { w: '♕', b: '♛' }, k: { w: '♔', b: '♚' },
};

const ChessPanel = ({ message, currentUserId, currentNickname, users, onMove, roomVibe }) => {
  if (!message) return null;

  const { gameData } = message;
  const vibe = getVibeById(roomVibe);
  const accentColor = vibe.accent || 'indigo';
  const primary = vibe.colors?.primary || '#6366f1';

  const isWhite =
    gameData.players.white?.id === currentUserId ||
    (currentNickname && gameData.players.white?.name === currentNickname);
  const isBlack =
    gameData.players.black?.id === currentUserId ||
    (currentNickname && gameData.players.black?.name === currentNickname);
  const amPlaying = isWhite || isBlack;
  const isHost =
    message.sender.id === currentUserId ||
    message.sender.socketId === currentUserId ||
    (currentNickname && message.sender.nickname === currentNickname);

  // Captured pieces
  const game = new Chess(gameData.fen || undefined);
  const board = game.board();
  const init = { w: { p: 8, n: 2, b: 2, r: 2, q: 1 }, b: { p: 8, n: 2, b: 2, r: 2, q: 1 } };
  const curr = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  board.flat().filter(Boolean).forEach(p => { if (curr[p.color][p.type] !== undefined) curr[p.color][p.type]++; });
  const capturedByWhite = [], capturedByBlack = [];
  ['p', 'n', 'b', 'r', 'q'].forEach(type => {
    for (let i = 0; i < init.b[type] - curr.b[type]; i++) capturedByWhite.push({ type, color: 'b' });
    for (let i = 0; i < init.w[type] - curr.w[type]; i++) capturedByBlack.push({ type, color: 'w' });
  });

  const isCheckmate = game.isCheckmate();
  const isDraw = game.isDraw();
  const isCheck = game.inCheck();
  const isGameOver = isCheckmate || isDraw;

  // Users eligible as replacements
  const availableUsers = (users || []).filter(u => {
    const playing =
      u.id === gameData.players.white?.id || u.id === gameData.players.black?.id ||
      u.socketId === gameData.players.white?.socketId || u.socketId === gameData.players.black?.socketId ||
      u.nickname === gameData.players.white?.name || u.nickname === gameData.players.black?.name;
    const me = u.socketId === currentUserId || u.id === currentUserId;
    return !playing && !me;
  });

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-950 overflow-hidden">
      {/* Header */}
      <div className={`px-4 py-3 ${vibe.accentClass} flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-white/20 rounded-lg">
            {gameData.isCPU ? <span className="text-lg leading-none">🤖</span> : <Trophy className="w-4 h-4 text-white" />}
          </div>
          <div>
            <h3 className="text-white font-black text-sm leading-none">
              {gameData.isCPU ? 'vs CPU' : 'Chess Match'}
            </h3>
            <p className="text-white/60 text-[9px] font-bold uppercase tracking-widest leading-none mt-0.5">
              {gameData.winner ? 'Match Ended' : gameData.isCPU ? `Difficulty: ${gameData.cpuDifficulty || 'medium'}` : 'Live Battle'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {gameData.isCPU && !gameData.winner && (
            <span className="px-2 py-0.5 bg-white/20 rounded-full text-white text-[8px] font-black uppercase tracking-widest">
              Solo
            </span>
          )}
          {!gameData.winner && <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />}
          <span className="text-white/60 text-[9px] font-bold uppercase tracking-wider">
            {amPlaying ? 'Playing' : 'Spectating'}
          </span>
        </div>
      </div>

      {/* Main content — scroll on small panels */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row gap-4 p-4 items-start justify-center min-h-full">

          {/* Board */}
          <div className="w-full max-w-[340px] lg:max-w-[360px] shrink-0 mx-auto lg:mx-0">
            <ChessGame
              gameData={gameData}
              currentUserId={currentUserId}
              currentNickname={currentNickname}
              onMove={(move) => onMove(message.id, 'chess-move', move)}
              vibeId={vibe.id}
            />
          </div>

          {/* Info sidebar */}
          <div className="flex-1 w-full space-y-3 min-w-0">

            {/* Players card */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-1.5 mb-2.5 text-gray-400">
                <Info className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest">Match Status</span>
              </div>

              <div className="space-y-2">
                {/* White player */}
                <div
                  className={`flex items-center justify-between p-2.5 rounded-lg border-2 transition-all ${
                    gameData.turn === 'w' && !gameData.winner ? '' : 'border-transparent opacity-70'
                  }`}
                  style={gameData.turn === 'w' && !gameData.winner ? { borderColor: primary, backgroundColor: primary + '20' } : {}}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-white border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center text-lg shadow-sm select-none">♔</div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate max-w-[100px]">
                        {gameData.players.white?.name || 'Waiting…'}
                      </p>
                      <div className="flex gap-0.5 mt-0.5 flex-wrap max-w-[120px]">
                        {capturedByWhite.slice(0, 6).map((p, i) => (
                          <span key={i} className="text-[9px] text-gray-400 leading-none">{PIECE_ICONS[p.type]?.b}</span>
                        ))}
                        {capturedByWhite.length > 6 && <span className="text-[8px] text-gray-400">+{capturedByWhite.length - 6}</span>}
                      </div>
                    </div>
                  </div>
                  {isWhite && <Shield className="w-3.5 h-3.5 shrink-0" style={{ color: primary }} />}
                </div>

                <div className="flex justify-center opacity-25">
                  <Swords className="w-4 h-4 text-gray-400" />
                </div>

                {/* Black player */}
                <div
                  className={`flex items-center justify-between p-2.5 rounded-lg border-2 transition-all ${
                    gameData.turn === 'b' && !gameData.winner ? '' : 'border-transparent opacity-70'
                  }`}
                  style={gameData.turn === 'b' && !gameData.winner ? { borderColor: primary, backgroundColor: primary + '20' } : {}}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-gray-900 border-2 border-gray-600 flex items-center justify-center text-lg text-white shadow-sm select-none">♚</div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate max-w-[100px]">
                        {gameData.players.black?.name || 'Waiting…'}
                      </p>
                      <div className="flex gap-0.5 mt-0.5 flex-wrap max-w-[120px]">
                        {capturedByBlack.slice(0, 6).map((p, i) => (
                          <span key={i} className="text-[9px] text-gray-400 leading-none">{PIECE_ICONS[p.type]?.w}</span>
                        ))}
                        {capturedByBlack.length > 6 && <span className="text-[8px] text-gray-400">+{capturedByBlack.length - 6}</span>}
                      </div>
                    </div>
                  </div>
                  {isBlack && <Shield className="w-3.5 h-3.5 shrink-0" style={{ color: primary }} />}
                </div>
              </div>
            </div>

            {/* Check / Checkmate / Draw alert */}
            {(isCheck || isGameOver) && (
              <div className={`p-3 rounded-xl border-2 text-center ${
                isGameOver
                  ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-400'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-400'
              }`}>
                <p className={`text-sm font-black uppercase tracking-widest ${isGameOver ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}`}>
                  {isCheckmate ? '♚ Checkmate!' : isCheck ? '⚠ Check!' : '🤝 Draw!'}
                </p>
                {isGameOver && (
                  <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mt-1">
                    {isCheckmate ? `${game.turn() === 'w' ? 'Black' : 'White'} wins` : 'Game over'}
                  </p>
                )}
              </div>
            )}

            {/* Move history */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-1.5 mb-2 text-gray-400">
                <History className="w-3.5 h-3.5" />
                <span className="text-[9px] font-black uppercase tracking-widest">Move History</span>
                <span className="ml-auto text-[9px] font-bold text-gray-400">{(gameData.history || []).length} moves</span>
              </div>
              <div className="grid grid-cols-2 gap-1 max-h-28 overflow-y-auto pr-1">
                {(gameData.history || []).length > 0 ? (
                  gameData.history.map((move, i) => (
                    <div key={i} className="flex items-center gap-1.5 bg-white dark:bg-gray-800 px-2 py-1 rounded-lg border border-gray-100 dark:border-gray-700">
                      <span className="text-[9px] font-black text-gray-400 w-5 shrink-0">{Math.floor(i / 2) + 1}{i % 2 ? '…' : '.'}</span>
                      <span className="text-xs font-mono font-bold text-gray-700 dark:text-gray-300">{move}</span>
                    </div>
                  ))
                ) : (
                  <div className="col-span-2 text-center py-3 text-gray-400 text-[10px] italic">No moves yet</div>
                )}
              </div>
            </div>

            {/* Host management — only show when both players are in (not in CPU mode) */}
            {!gameData.isCPU && isHost && !gameData.winner && gameData.players.white?.id && gameData.players.black?.id && (
              <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800">
                <div className="flex items-center gap-1.5 mb-2.5 text-gray-400">
                  <Shield className="w-3.5 h-3.5" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Host Controls</span>
                </div>
                <button
                  onClick={() => onMove(message.id, 'chess-swap')}
                  className="w-full py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-1.5 mb-2"
                >
                  <Swords className="w-3 h-3" />
                  Swap White / Black
                </button>

                {availableUsers.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                    {(['white', 'black']).map(role => (
                      <div key={role}>
                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-widest text-center mb-1">
                          Replace {role} ({gameData.players[role]?.name || 'Empty'})
                        </p>
                        <div className="flex flex-wrap gap-1.5 justify-center">
                          {availableUsers.slice(0, 4).map(user => (
                            <button
                              key={user.socketId}
                              onClick={() => onMove(message.id, 'chess-replace', { targetUserId: user.socketId, role })}
                              className={`px-2.5 py-1 rounded-lg text-[9px] font-bold border transition-all active:scale-95 truncate max-w-[90px] ${
                                role === 'white'
                                  ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-400'
                                  : 'bg-gray-900 dark:bg-black border-gray-600 rounded-lg text-gray-300 hover:bg-gray-800'
                              }`}
                            >
                              {user.nickname}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessPanel;
