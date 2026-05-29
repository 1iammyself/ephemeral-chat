export const GRID = 20;

export function createInitialState(seed = Date.now()) {
  const mid = Math.floor(GRID / 2);
  return {
    snake: [[mid, mid], [mid, mid + 1], [mid, mid + 2]],
    dir: 'left',
    food: spawnFood([[mid, mid], [mid, mid + 1], [mid, mid + 2]], seed),
    score: 0,
    dead: false,
    level: 1,
  };
}

export function spawnFood(snake, seed) {
  const snakeSet = new Set(snake.map(([r,c]) => `${r},${c}`));
  const empties = [];
  for (let r = 0; r < GRID; r++)
    for (let c = 0; c < GRID; c++)
      if (!snakeSet.has(`${r},${c}`)) empties.push([r,c]);
  if (!empties.length) return [0, 0];
  const idx = (seed * 1664525 + 1013904223) % empties.length;
  return empties[Math.abs(idx)];
}

export function tick(state) {
  if (state.dead) return state;
  const { snake, dir, food, score, level } = state;
  const [hr, hc] = snake[0];
  const moves = { up: [-1,0], down: [1,0], left: [0,-1], right: [0,1] };
  const [dr, dc] = moves[dir] || [0,-1];
  const nr = hr + dr, nc = hc + dc;

  // Wall or self collision
  if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return { ...state, dead: true };
  if (snake.some(([r,c]) => r === nr && c === nc)) return { ...state, dead: true };

  const ate = nr === food[0] && nc === food[1];
  const newSnake = [[nr, nc], ...snake];
  if (!ate) newSnake.pop();

  const newScore = score + (ate ? 10 * level : 0);
  const newLevel = Math.floor(newScore / 100) + 1;
  const newFood = ate ? spawnFood(newSnake, Date.now()) : food;

  return { snake: newSnake, dir, food: newFood, score: newScore, level: newLevel, dead: false };
}

export function changeDir(state, newDir) {
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  if (opposite[newDir] === state.dir) return state;
  return { ...state, dir: newDir };
}

export function getSpeed(level) {
  return Math.max(80, 200 - (level - 1) * 15);
}
