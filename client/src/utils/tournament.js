/**
 * Tournament system utilities for Ephemeral Chat
 * Supports: Single Elimination, Double Elimination, Round Robin
 * Game types: Chess, Tic-Tac-Toe, Rock-Paper-Scissors, Trivia
 */

export const TOURNAMENT_FORMATS = {
  SINGLE_ELIMINATION: 'single-elimination',
  DOUBLE_ELIMINATION: 'double-elimination',
  ROUND_ROBIN: 'round-robin'
};

export const TOURNAMENT_STATUS = {
  WAITING: 'waiting',       // Waiting for players to join
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const MATCH_STATUS = {
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COMPLETED: 'completed',
  BYE: 'bye'               // Auto-win (odd player count)
};

// Game types eligible for tournament play (1v1 games + trivia)
export const TOURNAMENT_GAME_TYPES = ['tic-tac-toe', 'rock-paper-scissors', 'chess', 'trivia'];

/**
 * Generate a single-elimination bracket
 * @param {Array<{id: string, nickname: string}>} players - Seeded player list
 * @returns {{ rounds: Array<Array<Match>>, totalRounds: number }}
 */
export function generateSingleEliminationBracket(players) {
  if (players.length < 2) return { rounds: [], totalRounds: 0 };

  // Round up to next power of 2 for bracket size
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(players.length)));
  const totalRounds = Math.log2(bracketSize);

  // Create seeded first round with byes
  const firstRound = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    const p1 = players[i] || null;
    const p2 = players[bracketSize - 1 - i] || null;

    const match = {
      id: `m_r1_${i}`,
      round: 1,
      matchIndex: i,
      player1: p1,
      player2: p2,
      winner: null,
      status: (!p1 || !p2) ? MATCH_STATUS.BYE : MATCH_STATUS.PENDING,
      gameMessageId: null   // Will be linked to actual game message
    };

    // Auto-advance byes
    if (!p1 && p2) match.winner = p2.id;
    if (p1 && !p2) match.winner = p1.id;

    firstRound.push(match);
  }

  // Generate subsequent rounds (empty, filled as matches complete)
  const rounds = [firstRound];
  for (let r = 2; r <= totalRounds; r++) {
    const matchCount = bracketSize / Math.pow(2, r);
    const round = [];
    for (let i = 0; i < matchCount; i++) {
      round.push({
        id: `m_r${r}_${i}`,
        round: r,
        matchIndex: i,
        player1: null,
        player2: null,
        winner: null,
        status: MATCH_STATUS.PENDING,
        gameMessageId: null
      });
    }
    rounds.push(round);
  }

  // Advance bye winners to round 2
  advanceByeWinners(rounds);

  return { rounds, totalRounds };
}

/**
 * Generate a double-elimination bracket
 * Creates winners bracket + losers bracket
 */
export function generateDoubleEliminationBracket(players) {
  const { rounds: winnersRounds, totalRounds } = generateSingleEliminationBracket(players);

  // Losers bracket has (totalRounds - 1) * 2 rounds
  const losersRounds = [];
  let losersMatchCount = Math.pow(2, Math.ceil(Math.log2(players.length))) / 2;
  for (let r = 1; r <= (totalRounds - 1) * 2; r++) {
    if (r % 2 === 0) losersMatchCount = Math.max(1, Math.floor(losersMatchCount / 2));
    const round = [];
    for (let i = 0; i < losersMatchCount; i++) {
      round.push({
        id: `m_l${r}_${i}`,
        round: r,
        matchIndex: i,
        player1: null,
        player2: null,
        winner: null,
        status: MATCH_STATUS.PENDING,
        gameMessageId: null,
        bracket: 'losers'
      });
    }
    losersRounds.push(round);
  }

  // Grand finals
  const grandFinals = [{
    id: 'm_gf_0',
    round: 1,
    matchIndex: 0,
    player1: null,
    player2: null,
    winner: null,
    status: MATCH_STATUS.PENDING,
    gameMessageId: null,
    bracket: 'grand-finals'
  }];

  return {
    winnersRounds,
    losersRounds,
    grandFinals,
    totalRounds
  };
}

/**
 * Generate a round-robin schedule
 * Every player plays every other player once
 */
export function generateRoundRobinSchedule(players) {
  if (players.length < 2) return { rounds: [], standings: [] };

  const n = players.length;
  const isOdd = n % 2 !== 0;
  const padded = isOdd ? [...players, null] : [...players]; // null = bye
  const total = padded.length;
  const roundCount = total - 1;
  const matchesPerRound = total / 2;

  const rounds = [];
  // Use circle method for scheduling
  const fixed = padded[0];
  const rotating = padded.slice(1);

  for (let r = 0; r < roundCount; r++) {
    const round = [];
    const all = [fixed, ...rotating];

    for (let m = 0; m < matchesPerRound; m++) {
      const p1 = all[m];
      const p2 = all[total - 1 - m];

      if (!p1 || !p2) continue; // bye

      round.push({
        id: `m_rr${r + 1}_${m}`,
        round: r + 1,
        matchIndex: m,
        player1: p1,
        player2: p2,
        winner: null,
        status: MATCH_STATUS.PENDING,
        gameMessageId: null
      });
    }

    rounds.push(round);
    // Rotate: move last element to second position
    rotating.unshift(rotating.pop());
  }

  const standings = players.map(p => ({
    playerId: p.id,
    nickname: p.nickname,
    wins: 0,
    losses: 0,
    draws: 0,
    points: 0
  }));

  return { rounds, standings };
}

/**
 * Advance bye winners into the next round
 */
function advanceByeWinners(rounds) {
  if (rounds.length < 2) return;
  const firstRound = rounds[0];
  const secondRound = rounds[1];

  for (let i = 0; i < firstRound.length; i++) {
    const match = firstRound[i];
    if (match.status === MATCH_STATUS.BYE && match.winner) {
      const nextMatchIdx = Math.floor(i / 2);
      const nextMatch = secondRound[nextMatchIdx];
      if (!nextMatch) continue;

      const winnerPlayer = match.player1?.id === match.winner ? match.player1 : match.player2;
      if (i % 2 === 0) {
        nextMatch.player1 = winnerPlayer;
      } else {
        nextMatch.player2 = winnerPlayer;
      }
    }
  }
}

/**
 * Advance a winner from a completed match to the next round
 * @returns {Object|null} The next match that was updated, or null
 */
export function advanceWinner(rounds, completedMatchId, winnerId) {
  for (let r = 0; r < rounds.length - 1; r++) {
    const round = rounds[r];
    const matchIdx = round.findIndex(m => m.id === completedMatchId);
    if (matchIdx === -1) continue;

    const match = round[matchIdx];
    match.winner = winnerId;
    match.status = MATCH_STATUS.COMPLETED;

    // Find the winner player object
    const winnerPlayer = match.player1?.id === winnerId ? match.player1 : match.player2;

    // Place into next round
    const nextRound = rounds[r + 1];
    const nextMatchIdx = Math.floor(matchIdx / 2);
    const nextMatch = nextRound[nextMatchIdx];
    if (!nextMatch) return null;

    if (matchIdx % 2 === 0) {
      nextMatch.player1 = winnerPlayer;
    } else {
      nextMatch.player2 = winnerPlayer;
    }

    // If both players are set, match is ready
    if (nextMatch.player1 && nextMatch.player2) {
      nextMatch.status = MATCH_STATUS.PENDING; // Ready to play
    }

    return nextMatch;
  }

  // Final round match completed — tournament winner!
  const lastRound = rounds[rounds.length - 1];
  const finalMatch = lastRound.find(m => m.id === completedMatchId);
  if (finalMatch) {
    finalMatch.winner = winnerId;
    finalMatch.status = MATCH_STATUS.COMPLETED;
  }
  return null;
}

/**
 * Check if tournament is complete
 */
export function isTournamentComplete(rounds) {
  const lastRound = rounds[rounds.length - 1];
  return lastRound && lastRound.every(m => m.status === MATCH_STATUS.COMPLETED);
}

/**
 * Get the tournament champion
 * Handles single elimination, round-robin, and double elimination
 */
export function getTournamentWinner(rounds, bracket) {
  // Double elimination: check grand finals
  if (bracket?.grandFinals?.length > 0) {
    const gf = bracket.grandFinals[0];
    if (gf.status === MATCH_STATUS.COMPLETED && gf.winner) {
      return gf.player1?.id === gf.winner ? gf.player1 : gf.player2;
    }
    return null;
  }

  // Round-robin: winner is top of standings
  if (bracket?.standings?.length > 0) {
    const sorted = [...bracket.standings].sort((a, b) => b.points - a.points || b.wins - a.wins);
    const allDone = rounds && rounds.every(r => r.every(m => m.status === MATCH_STATUS.COMPLETED || m.status === 'completed'));
    if (allDone && sorted.length > 0) {
      return { id: sorted[0].playerId, nickname: sorted[0].nickname };
    }
    return null;
  }

  // Single elimination: winner of the last round
  if (!rounds || rounds.length === 0) return null;
  const lastRound = rounds[rounds.length - 1];
  if (!lastRound || lastRound.length === 0) return null;
  const finalMatch = lastRound[0];
  if (finalMatch.status !== MATCH_STATUS.COMPLETED || !finalMatch.winner) return null;
  return finalMatch.player1?.id === finalMatch.winner ? finalMatch.player1 : finalMatch.player2;
}

/**
 * Get all matches that are ready to play (both players set, not completed)
 * Handles single elimination, round-robin, and double elimination brackets
 */
export function getReadyMatches(rounds, bracket) {
  const ready = [];
  const allRounds = [];

  // Collect all rounds from any bracket structure
  if (rounds) {
    allRounds.push(...rounds);
  }
  if (bracket?.winnersRounds) {
    allRounds.push(...bracket.winnersRounds);
  }
  if (bracket?.losersRounds) {
    allRounds.push(...bracket.losersRounds);
  }
  if (bracket?.grandFinals) {
    allRounds.push(bracket.grandFinals);
  }

  for (const round of allRounds) {
    if (!Array.isArray(round)) continue;
    for (const match of round) {
      if (match.player1 && match.player2 && match.status === MATCH_STATUS.PENDING) {
        ready.push(match);
      }
    }
  }
  return ready;
}
