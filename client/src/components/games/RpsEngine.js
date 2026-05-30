// Standard RPS beats table
const BEATS_STD = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
// RPSLS beats table (each key beats listed values)
const BEATS_RPSLS = {
  rock:     ['scissors', 'lizard'],
  paper:    ['rock', 'spock'],
  scissors: ['paper', 'lizard'],
  lizard:   ['spock', 'paper'],
  spock:    ['scissors', 'rock'],
};

export const PICKS_BY_VARIANT = {
  standard: ['rock', 'paper', 'scissors'],
  rpsls:    ['rock', 'paper', 'scissors', 'lizard', 'spock'],
};

export const PICK_EMOJI = {
  rock: '✊', paper: '✋', scissors: '✌️',
  lizard: '🦎', spock: '🖖',
};

export const RPSLS_BEATS_TEXT = {
  rock:     ['Rock crushes Scissors', 'Rock crushes Lizard'],
  paper:    ['Paper covers Rock', 'Paper disproves Spock'],
  scissors: ['Scissors cuts Paper', 'Scissors decapitates Lizard'],
  lizard:   ['Lizard poisons Spock', 'Lizard eats Paper'],
  spock:    ['Spock smashes Scissors', 'Spock vaporizes Rock'],
};

export function getRoundResult(a, b, variant = 'standard') {
  if (a === b) return 'draw';
  const beats = variant === 'rpsls' ? BEATS_RPSLS : BEATS_STD;
  const aBeats = beats[a];
  return Array.isArray(aBeats) ? (aBeats.includes(b) ? 'win' : 'lose') : (aBeats === b ? 'win' : 'lose');
}

function counterPick(predicted, picks, variant) {
  const beats = variant === 'rpsls' ? BEATS_RPSLS : BEATS_STD;
  return picks.find(p => {
    const pBeats = beats[p];
    return Array.isArray(pBeats) ? pBeats.includes(predicted) : pBeats === predicted;
  }) || picks[Math.floor(Math.random() * picks.length)];
}

export function getCpuPick(difficulty, history = [], variant = 'standard') {
  const picks = PICKS_BY_VARIANT[variant] || PICKS_BY_VARIANT.standard;

  if (difficulty === 'easy') return picks[Math.floor(Math.random() * picks.length)];

  if (difficulty === 'medium') {
    const last = history[history.length - 1];
    if (last) return counterPick(last, picks, variant);
    return picks[Math.floor(Math.random() * picks.length)];
  }

  // Hard: Markov chain — track P[previous_throw → next_throw]
  if (history.length < 2) {
    if (!history.length) return picks[Math.floor(Math.random() * picks.length)];
    const freq = Object.fromEntries(picks.map(p => [p, 0]));
    history.forEach(p => { if (p in freq) freq[p]++; });
    const mostFreq = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
    return counterPick(mostFreq, picks, variant);
  }

  // Build transition matrix
  const transitions = Object.fromEntries(picks.map(p => [p, Object.fromEntries(picks.map(q => [q, 0]))]));
  for (let i = 0; i < history.length - 1; i++) {
    const from = history[i], to = history[i + 1];
    if (transitions[from] && to in transitions[from]) transitions[from][to]++;
  }

  const last = history[history.length - 1];
  const nextProbs = transitions[last] || {};
  const total = Object.values(nextProbs).reduce((a, b) => a + b, 0);

  let predicted;
  if (total > 0) {
    predicted = Object.entries(nextProbs).sort((a, b) => b[1] - a[1])[0][0];
  } else {
    const freq = Object.fromEntries(picks.map(p => [p, 0]));
    history.forEach(p => { if (p in freq) freq[p]++; });
    predicted = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
  }
  return counterPick(predicted, picks, variant);
}
