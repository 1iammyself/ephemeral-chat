import React, { useState, useMemo } from 'react';
import { Trophy, Users, Swords, Play, ChevronDown, ChevronUp, Crown, Clock, CheckCircle2 } from 'lucide-react';
import TournamentBracket from './TournamentBracket';
import TournamentLeaderboard from './TournamentLeaderboard';
import TournamentTrivia from './TournamentTrivia';
import { TOURNAMENT_STATUS, TOURNAMENT_FORMATS, getReadyMatches, isTournamentComplete, getTournamentWinner } from '../utils/tournament';
import { getVibeById } from '../utils/vibes';

const TournamentMessage = ({ message, currentUser, onJoinTournament, onStartTournament, onStartMatch, roomVibe }) => {
  const { tournamentData } = message;
  const [expanded, setExpanded] = useState(false);

  const vibe = getVibeById(roomVibe);
  const accentColor = vibe.id === 'party' ? 'indigo' :
    vibe.id === 'chill' ? 'teal' :
      vibe.id === 'focus' ? 'orange' : 'blue';

  if (!tournamentData) return null;

  const { name, gameType, format, status, players = [], maxPlayers, bracket, createdBy } = tournamentData;
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const isJoined = players.some(p => p.id === currentUserId);
  const isCreator = createdBy === currentUserId;
  const canStart = isCreator && status === TOURNAMENT_STATUS.WAITING && players.length >= 2;
  const isComplete = status === TOURNAMENT_STATUS.COMPLETED;
  const isInProgress = status === TOURNAMENT_STATUS.IN_PROGRESS;

  const readyMatches = useMemo(() => {
    if (!bracket) return [];
    return getReadyMatches(bracket.rounds, bracket);
  }, [bracket]);

  const champion = useMemo(() => {
    if (!bracket) return null;
    // For trivia, get top scorer
    if (gameType === 'trivia' && tournamentData.triviaData?.scores) {
      const scores = tournamentData.triviaData.scores;
      const sorted = Object.entries(scores).sort((a, b) => b[1].score - a[1].score);
      if (sorted.length > 0 && tournamentData.status === 'completed') {
        return { id: sorted[0][0], nickname: sorted[0][1].nickname };
      }
      return null;
    }
    return getTournamentWinner(bracket.rounds, bracket);
  }, [bracket, gameType, tournamentData]);

  const GAME_EMOJI = { 'tic-tac-toe': '⭕', 'rock-paper-scissors': '✊', 'chess': '♟️', 'trivia': '🧠' };
  const GAME_LABEL = { 'tic-tac-toe': 'Tic-Tac-Toe', 'rock-paper-scissors': 'RPS', 'chess': 'Chess', 'trivia': 'Trivia' };
  const FORMAT_LABEL = {
    [TOURNAMENT_FORMATS.SINGLE_ELIMINATION]: 'Single Elim',
    [TOURNAMENT_FORMATS.DOUBLE_ELIMINATION]: 'Double Elim',
    [TOURNAMENT_FORMATS.ROUND_ROBIN]: 'Round Robin'
  };

  return (
    <div className={`w-full max-w-[300px] sm:max-w-[380px] bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-md border border-gray-200 dark:border-gray-700 border-t-4 border-t-amber-500`}>
      {/* Header */}
      <div className={`p-3 bg-gradient-to-r from-amber-500 to-${accentColor}-500`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Trophy className="w-5 h-5 text-white" />
            <div>
              <h3 className="text-white font-bold text-sm sm:text-base leading-tight truncate max-w-[200px]">{name}</h3>
              <p className="text-white/80 text-[10px] sm:text-xs">
                {GAME_EMOJI[gameType]} {GAME_LABEL[gameType]} · {FORMAT_LABEL[format]}
              </p>
            </div>
          </div>
          <div className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
            isComplete ? 'bg-green-100 text-green-700' :
            isInProgress ? 'bg-blue-100 text-blue-700' :
            'bg-amber-100 text-amber-700'
          }`}>
            {isComplete ? 'Complete' : isInProgress ? 'Live' : 'Open'}
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-bold text-gray-600 dark:text-gray-400 flex items-center">
            <Users className="w-3.5 h-3.5 mr-1" />
            Players ({players.length}/{maxPlayers})
          </span>
          {readyMatches.length > 0 && (
            <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center animate-pulse">
              <Swords className="w-3 h-3 mr-0.5" />
              {readyMatches.length} match{readyMatches.length > 1 ? 'es' : ''} ready
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {players.map((p, i) => (
            <span key={p.id} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] sm:text-xs ${
              p.id === currentUserId
                ? `bg-${accentColor}-100 dark:bg-${accentColor}-900/30 text-${accentColor}-700 dark:text-${accentColor}-300 font-bold`
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
            }`}>
              {champion && champion.id === p.id && <Crown className="w-3 h-3 mr-0.5 text-amber-500" />}
              {p.nickname}
            </span>
          ))}
        </div>
      </div>

      {/* Champion announcement */}
      {isComplete && champion && (
        <div className="px-3 py-2 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-b border-amber-200 dark:border-amber-800/30">
          <div className="flex items-center justify-center space-x-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">{champion.nickname} wins!</span>
            <Crown className="w-5 h-5 text-amber-500" />
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2 space-y-1.5">
        {/* Join button */}
        {status === TOURNAMENT_STATUS.WAITING && !isJoined && players.length < maxPlayers && (
          <button
            onClick={() => onJoinTournament?.(message.id)}
            className={`w-full py-2 rounded-lg font-bold text-sm btn-${accentColor} active:scale-95 transition-transform flex items-center justify-center space-x-2`}
          >
            <Swords className="w-4 h-4" />
            <span>Join Tournament</span>
          </button>
        )}

        {/* Already joined indicator */}
        {status === TOURNAMENT_STATUS.WAITING && isJoined && (
          <div className={`w-full py-2 rounded-lg text-center text-sm font-bold text-${accentColor}-600 dark:text-${accentColor}-400 bg-${accentColor}-50 dark:bg-${accentColor}-900/10`}>
            <CheckCircle2 className="w-4 h-4 inline mr-1" />
            Joined! Waiting to start...
          </div>
        )}

        {/* Start button (creator only) */}
        {canStart && (
          <button
            onClick={() => onStartTournament?.(message.id)}
            className="w-full py-2 rounded-lg font-bold text-sm bg-amber-500 hover:bg-amber-600 text-white active:scale-95 transition-transform flex items-center justify-center space-x-2"
          >
            <Play className="w-4 h-4" />
            <span>Start Tournament ({players.length} players)</span>
          </button>
        )}

        {/* Expand bracket */}
        {bracket && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full py-1.5 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center justify-center space-x-1"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{expanded ? 'Hide' : 'Show'} Bracket</span>
          </button>
        )}

        {/* Ready matches for current user (round-robin or bracket) */}
        {isInProgress && readyMatches.length > 0 && (
          <div className="space-y-1">
            {readyMatches
              .filter(m => m.player1?.id === currentUserId || m.player2?.id === currentUserId)
              .filter(m => !m.gameMessageId)
              .map(m => {
                const opponent = m.player1?.id === currentUserId ? m.player2 : m.player1;
                return (
                  <button
                    key={m.id}
                    onClick={() => onStartMatch?.(message.id, m.id)}
                    className={`w-full py-1.5 rounded-lg text-xs font-bold text-${accentColor}-600 dark:text-${accentColor}-400 bg-${accentColor}-50 dark:bg-${accentColor}-900/10 hover:bg-${accentColor}-100 dark:hover:bg-${accentColor}-900/20 active:scale-95 transition-transform flex items-center justify-center gap-1`}
                  >
                    <Swords className="w-3.5 h-3.5" />
                    Play vs {opponent?.nickname || 'TBD'}
                  </button>
                );
              })}
          </div>
        )}
      </div>

      {/* Trivia mode: always show active trivia UI when in progress */}
      {gameType === 'trivia' && (isInProgress || isComplete) && tournamentData.triviaData && (
        <div className="px-2 pb-2 border-t border-gray-100 dark:border-gray-700">
          <TournamentTrivia
            message={message}
            currentUser={currentUser}
            accentColor={accentColor}
          />
        </div>
      )}

      {/* Bracket view (non-trivia) */}
      {expanded && bracket && gameType !== 'trivia' && (
        <div className="px-2 pb-3 border-t border-gray-100 dark:border-gray-700">
          {format === TOURNAMENT_FORMATS.ROUND_ROBIN && bracket.standings ? (
            <TournamentLeaderboard
              standings={bracket.standings}
              rounds={bracket.rounds}
              currentUserId={currentUserId}
              accentColor={accentColor}
            />
          ) : (
            <TournamentBracket
              tournament={message}
              currentUser={currentUser}
              onStartMatch={onStartMatch}
              roomVibe={roomVibe}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default TournamentMessage;
