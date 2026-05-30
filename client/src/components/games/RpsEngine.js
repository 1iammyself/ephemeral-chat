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

// CPU pick strategy — per WRPSA research
// Easy: pure 1/3 random (Nash equilibrium — unexploitable)
// Medium: counter the player's last move (simple reactive, per research spec)
// Hard: Markov chain — track P[previous→next] transitions; predict from last throw;
//        fall back to counter-frequency if not enough data (per research spec)
export function getCpuPick(variant, difficulty, roundHistory = []) {
  const picks = getPicks(variant);
  const rand = () => picks[Math.floor(Math.random() * picks.length)];
  const counter = (pick) => picks.find(p => (BEATS[p] || []).includes(pick)) || rand();

  if (difficulty === 'easy') return rand();

  // Use only decisive (non-draw) rounds for analysis — draws don't reveal tendency
  const decisive = roundHistory.filter(r => r.p1Pick && r.result !== 'draw');

  if (difficulty === 'medium') {
    if (decisive.length === 0) return rand();
    // Counter the player's last move
    return counter(decisive[decisive.length - 1].p1Pick);
  }

  // Hard: Markov chain (needs ≥2 decisive rounds to build transitions)
  if (decisive.length < 2) {
    // Fall back: counter most-frequent pick
    const freq = {};
    decisive.forEach(r => { freq[r.p1Pick] = (freq[r.p1Pick] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
    return top ? counter(top) : rand();
  }
  // Build transition matrix: transitions[prevPick][nextPick] = count
  const transitions = {};
  for (let i = 0; i < decisive.length - 1; i++) {
    const from = decisive[i].p1Pick;
    const to   = decisive[i + 1].p1Pick;
    if (!transitions[from]) transitions[from] = {};
    transitions[from][to] = (transitions[from][to] || 0) + 1;
  }
  const lastPick = decisive[decisive.length - 1].p1Pick;
  const row = transitions[lastPick];
  if (!row || Object.keys(row).length === 0) {
    // No transitions from this pick yet — fall back to counter-frequency
    const freq = {};
    decisive.forEach(r => { freq[r.p1Pick] = (freq[r.p1Pick] || 0) + 1; });
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0];
    return top ? counter(top) : rand();
  }
  // Predict most probable next throw and counter it
  const predicted = Object.entries(row).sort((a, b) => b[1] - a[1])[0][0];
  return counter(predicted);
}
