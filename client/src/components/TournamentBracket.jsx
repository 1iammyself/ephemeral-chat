import React from 'react';
import { Trophy, Swords, Clock, Check, Minus } from 'lucide-react';
import { MATCH_STATUS } from '../utils/tournament';

// ─── Single Match Card ──────────────────────────────────────
const MatchCard = ({ match, accentColor, onStartMatch, currentUserId }) => {
  const { player1, player2, winner, status } = match;
  const isBye = status === MATCH_STATUS.BYE;
  const isCompleted = status === MATCH_STATUS.COMPLETED;
  const isPending = status === MATCH_STATUS.PENDING && player1 && player2;
  const isParticipant = player1?.id === currentUserId || player2?.id === currentUserId;

  const PlayerSlot = ({ player, isWinner }) => (
    <div className={`flex items-center justify-between px-2 py-1 text-xs rounded ${
      isWinner ? `bg-${accentColor}-100 dark:bg-${accentColor}-900/30 font-bold text-${accentColor}-700 dark:text-${accentColor}-300`
      : player ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-600 italic'
    }`}>
      <span className="truncate max-w-[100px]">
        {player ? player.nickname : 'TBD'}
        {isWinner && <Trophy className="w-3 h-3 inline ml-1 text-amber-500" />}
      </span>
      {isBye && !player && <span className="text-[9px] text-gray-400">BYE</span>}
    </div>
  );

  return (
    <div className={`w-[140px] sm:w-[160px] rounded-lg border overflow-hidden shadow-sm ${
      isCompleted ? 'border-green-300 dark:border-green-800' :
      isPending ? `border-${accentColor}-300 dark:border-${accentColor}-700` :
      'border-gray-200 dark:border-gray-700'
    }`}>
      <PlayerSlot player={player1} isWinner={winner && player1?.id === winner} />
      <div className="border-t border-gray-200 dark:border-gray-700" />
      <PlayerSlot player={player2} isWinner={winner && player2?.id === winner} />

      {/* Action row */}
      {isPending && !isCompleted && (
        <div className={`border-t border-gray-200 dark:border-gray-700 px-2 py-1 bg-gray-50 dark:bg-gray-700/50`}>
          {isParticipant ? (
            <button
              onClick={() => onStartMatch?.(match)}
              className={`w-full text-[10px] font-bold text-${accentColor}-600 dark:text-${accentColor}-400 flex items-center justify-center gap-1 hover:underline`}
            >
              <Swords className="w-3 h-3" /> Play
            </button>
          ) : (
            <div className="text-[10px] text-gray-400 dark:text-gray-500 text-center flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" /> Waiting
            </div>
          )}
        </div>
      )}
      {isCompleted && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-2 py-0.5 bg-green-50 dark:bg-green-900/10">
          <div className="text-[10px] text-green-600 dark:text-green-400 text-center flex items-center justify-center gap-1">
            <Check className="w-3 h-3" /> Done
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Bracket Connector Lines ────────────────────────────────
const Connector = ({ matchCount }) => {
  if (matchCount <= 1) return null;
  return (
    <div className="flex flex-col justify-around items-center w-6 sm:w-8">
      {Array.from({ length: matchCount / 2 }).map((_, i) => (
        <div key={i} className="flex flex-col items-center" style={{ height: `${100 / (matchCount / 2)}%` }}>
          <div className="w-3 sm:w-4 border-t border-r border-b border-gray-300 dark:border-gray-600 rounded-r h-full" />
        </div>
      ))}
    </div>
  );
};

// ─── Tournament Bracket Component ───────────────────────────
const TournamentBracket = ({ tournament, currentUser, onStartMatch, roomVibe }) => {
  const accentColor = roomVibe === 'party' ? 'indigo' :
    roomVibe === 'chill' ? 'teal' :
      roomVibe === 'focus' ? 'orange' : 'blue';

  const { tournamentData } = tournament;
  if (!tournamentData?.bracket?.rounds) return null;

  const { bracket } = tournamentData;
  const currentUserId = currentUser?.id || currentUser?.socketId;

  const handleMatchStart = (match) => {
    onStartMatch?.(tournament.id, match.id);
  };

  // Render a single bracket section (array of rounds)
  const renderBracketSection = (rounds, label) => {
    if (!rounds || !rounds.length) return null;
    return (
      <div>
        {label && (
          <div className="text-[10px] font-bold text-gray-500 dark:text-gray-400 mb-1 px-1">
            {label}
          </div>
        )}
        <div className="flex items-center gap-1">
          {rounds.map((round, rIdx) => (
            <React.Fragment key={rIdx}>
              <div className="flex flex-col justify-around gap-2 min-w-[140px] sm:min-w-[160px]">
                <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 text-center mb-1">
                  {rIdx === rounds.length - 1 && rounds.length > 1 ? 'Finals' : `Round ${rIdx + 1}`}
                </div>
                {round.map(match => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    accentColor={accentColor}
                    onStartMatch={handleMatchStart}
                    currentUserId={currentUserId}
                  />
                ))}
              </div>
              {rIdx < rounds.length - 1 && <Connector matchCount={round.length} />}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  };

  // Double elimination: show winners, losers, and grand finals separately
  if (bracket.format === 'double-elimination') {
    return (
      <div className="overflow-x-auto py-2 space-y-3">
        {renderBracketSection(bracket.winnersRounds, '🏆 Winners Bracket')}
        {renderBracketSection(bracket.losersRounds, '🔄 Losers Bracket')}
        {bracket.grandFinals && bracket.grandFinals.length > 0 && (
          renderBracketSection([bracket.grandFinals], '⭐ Grand Finals')
        )}
      </div>
    );
  }

  // Single elimination (default)
  const rounds = bracket.rounds;
  if (!rounds || !rounds.length) return null;

  return (
    <div className="overflow-x-auto py-2">
      <div className="flex items-center gap-1">
        {rounds.map((round, rIdx) => (
          <React.Fragment key={rIdx}>
            <div className="flex flex-col justify-around gap-2 min-w-[140px] sm:min-w-[160px]">
              <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500 text-center mb-1">
                {rIdx === rounds.length - 1 ? 'Finals' : `Round ${rIdx + 1}`}
              </div>
              {round.map(match => (
                <MatchCard
                  key={match.id}
                  match={match}
                  accentColor={accentColor}
                  onStartMatch={handleMatchStart}
                  currentUserId={currentUserId}
                />
              ))}
            </div>
            {rIdx < rounds.length - 1 && <Connector matchCount={round.length} />}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};

export default TournamentBracket;
