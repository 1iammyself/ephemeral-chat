export const STANDARD_PICKS = ['rock', 'paper', 'scissors'];
export const RPSLS_PICKS = ['rock', 'paper', 'scissors', 'lizard', 'spock'];

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

// Returns 'player1' | 'player2' | 'draw'
export function resolveRound(p1Pick, p2Pick) {
  if (!p1Pick || !p2Pick) return null;
  if (p1Pick === p2Pick) return 'draw';
  const beaten = BEATS[p1Pick] || [];
  return beaten.includes(p2Pick) ? 'player1' : 'player2';
}

export function getBeatText(winnerPick, loserPick) {
  return BEAT_PHRASES[`${winnerPick}-${loserPick}`]
    || `${PICK_LABEL[winnerPick] || winnerPick} beats ${PICK_LABEL[loserPick] || loserPick}`;
}

// CPU pick strategy — easy: random, medium: 60% counter, hard: always counter
export function getCpuPick(variant, difficulty, roundHistory = []) {
  const picks = getPicks(variant);
  if (difficulty === 'easy' || roundHistory.length < 2) {
    return picks[Math.floor(Math.random() * picks.length)];
  }
  const freq = {};
  roundHistory.forEach(r => { if (r.p1Pick) freq[r.p1Pick] = (freq[r.p1Pick] || 0) + 1; });
  const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!top) return picks[Math.floor(Math.random() * picks.length)];
  const counter = picks.find(p => (BEATS[p] || []).includes(top));
  if (difficulty === 'hard') return counter || picks[Math.floor(Math.random() * picks.length)];
  return Math.random() < 0.6
    ? (counter || picks[Math.floor(Math.random() * picks.length)])
    : picks[Math.floor(Math.random() * picks.length)];
}
