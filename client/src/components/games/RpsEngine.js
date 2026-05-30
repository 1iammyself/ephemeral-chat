// ─── Rock-Paper-Scissors engine ────────────────────────────────────────────
// Pure, immutable game logic. This is the single source of truth for round
// resolution. The referee's client (creator / player1) runs `applyRound` and
// pushes the resulting state to the server, which only stores and broadcasts.
// No server-side resolution exists — that is what eliminates the whole class
// of "CPU thinking forever" identity-mismatch bugs.

export const STANDARD_PICKS = ['rock', 'paper', 'scissors'];
export const RPSLS_PICKS = ['rock', 'paper', 'scissors', 'lizard', 'spock'];

// pick -> the picks it beats
const BEATS = {
  rock:     ['scissors', 'lizard'],
  paper:    ['rock', 'spock'],
  scissors: ['paper', 'lizard'],
  lizard:   ['spock', 'paper'],
  spock:    ['scissors', 'rock'],
};

export const PICK_EMOJI = {
  rock: '✊', paper: '✋', scissors: '✌️', lizard: '🦎', spock: '🖖',
};

export const PICK_LABEL = {
  rock: 'Rock', paper: 'Paper', scissors: 'Scissors', lizard: 'Lizard', spock: 'Spock',
};

const BEAT_PHRASES = {
  'rock-scissors':   'Rock crushes Scissors',
  'rock-lizard':     'Rock crushes Lizard',
  'paper-rock':      'Paper covers Rock',
  'paper-spock':     'Paper disproves Spock',
  'scissors-paper':  'Scissors cuts Paper',
  'scissors-lizard': 'Scissors decapitates Lizard',
  'lizard-spock':    'Lizard poisons Spock',
  'lizard-paper':    'Lizard eats Paper',
  'spock-scissors':  'Spock smashes Scissors',
  'spock-rock':      'Spock vaporizes Rock',
};

export function getPicks(variant) {
  return variant === 'rpsls' ? RPSLS_PICKS : STANDARD_PICKS;
}

export function isValidPick(variant, pick) {
  return getPicks(variant).includes(pick);
}

// 'player1' | 'player2' | 'draw' | null (incomplete)
export function resolveRound(p1Pick, p2Pick) {
  if (!p1Pick || !p2Pick) return null;
  if (p1Pick === p2Pick) return 'draw';
  return (BEATS[p1Pick] || []).includes(p2Pick) ? 'player1' : 'player2';
}

export function getBeatText(winnerPick, loserPick) {
  return BEAT_PHRASES[`${winnerPick}-${loserPick}`]
    || `${PICK_LABEL[winnerPick] || winnerPick} beats ${PICK_LABEL[loserPick] || loserPick}`;
}

// Rounds needed to win the match (Bo3 -> 2, Bo5 -> 3, Bo7 -> 4)
export function winsNeeded(totalRounds) {
  return Math.ceil((totalRounds || 5) / 2);
}

// ─── Authoritative reducer ──────────────────────────────────────────────────
// Given the current game state and both picks, return a BRAND-NEW game state.
// Never mutates the input. Draws replay the same round (no point awarded), per
// the standard "decisive rounds only" tournament rule.
export function applyRound(gameData, p1Pick, p2Pick) {
  const result = resolveRound(p1Pick, p2Pick);
  if (!result) return gameData; // incomplete — nothing to do

  const round = gameData.currentRound || 1;
  const roundHistory = [...(gameData.roundHistory || []), { round, p1Pick, p2Pick, result }];
  const scores = {
    player1: gameData.scores?.player1 || 0,
    player2: gameData.scores?.player2 || 0,
    draw:    gameData.scores?.draw || 0,
  };

  let currentRound = round;
  if (result === 'draw') {
    scores.draw += 1;            // replay the same round number
  } else {
    scores[result] += 1;
    currentRound = round + 1;    // advance only on a decisive round
  }

  const needed = winsNeeded(gameData.totalRounds);
  const matchOver = scores.player1 >= needed || scores.player2 >= needed;

  const next = {
    ...gameData,
    roundHistory,
    scores,
    currentRound,
    // resolution no longer relies on these maps — keep them clean for any
    // legacy reader and so a fresh round always starts empty
    picks: {},
    pickedIds: [],
  };

  if (matchOver) {
    next.status = 'finished';
    next.result = 'match_complete';
    next.winner = scores.player1 >= needed ? gameData.player1 : gameData.player2;
    next.endedAt = Date.now();
  }

  return next;
}

// ─── CPU strategy ─────────────────────────────────────────────────────────--
// easy:   uniform random (the Nash-optimal, unexploitable baseline)
// medium: counter the player's most recent decisive throw
// hard:   first-order Markov — predict the next throw from the last one and
//         counter it; fall back to counter-most-frequent when data is thin
export function getCpuPick(variant, difficulty, roundHistory = []) {
  const picks = getPicks(variant);
  const rand = () => picks[Math.floor(Math.random() * picks.length)];
  const counter = (pick) => picks.find(p => (BEATS[p] || []).includes(pick)) || rand();

  if (difficulty === 'easy') return rand();

  // Draws don't reveal a tendency — analyse decisive rounds only.
  const decisive = roundHistory.filter(r => r.p1Pick && r.result !== 'draw');

  if (difficulty === 'medium') {
    if (decisive.length === 0) return rand();
    return counter(decisive[decisive.length - 1].p1Pick);
  }

  // hard
  const counterMostFrequent = () => {
    const freq = {};
    decisive.forEach(r => { freq[r.p1Pick] = (freq[r.p1Pick] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
    return top ? counter(top) : rand();
  };

  if (decisive.length < 2) return counterMostFrequent();

  const transitions = {};
  for (let i = 0; i < decisive.length - 1; i++) {
    const from = decisive[i].p1Pick;
    const to   = decisive[i + 1].p1Pick;
    if (!transitions[from]) transitions[from] = {};
    transitions[from][to] = (transitions[from][to] || 0) + 1;
  }
  const last = decisive[decisive.length - 1].p1Pick;
  const row = transitions[last];
  if (!row || !Object.keys(row).length) return counterMostFrequent();

  const predicted = Object.entries(row).sort((a, b) => b[1] - a[1])[0][0];
  return counter(predicted);
}
