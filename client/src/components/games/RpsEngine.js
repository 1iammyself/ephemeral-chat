const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

export function getRoundResult(a, b) {
  if (a === b) return 'draw';
  return BEATS[a] === b ? 'win' : 'lose';
}

export function getCpuPick(difficulty, history = []) {
  const picks = ['rock', 'paper', 'scissors'];
  if (difficulty === 'easy') return picks[Math.floor(Math.random() * 3)];
  if (difficulty === 'medium') {
    // Counter the player's last move
    const last = history[history.length - 1];
    if (last) return picks.find(p => BEATS[p] === last) || picks[Math.floor(Math.random() * 3)];
    return picks[Math.floor(Math.random() * 3)];
  }
  // hard: counter the player's most frequent move
  if (!history.length) return picks[Math.floor(Math.random() * 3)];
  const freq = { rock: 0, paper: 0, scissors: 0 };
  history.forEach(p => { if (freq[p] !== undefined) freq[p]++; });
  const mostFreq = Object.entries(freq).sort((a,b) => b[1]-a[1])[0][0];
  return picks.find(p => BEATS[p] === mostFreq) || picks[Math.floor(Math.random() * 3)];
}

export const PICK_EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' };
