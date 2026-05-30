export const GRID = 20;
const BONUS_FOOD_INTERVAL = 5;  // spawn bonus every N regular foods
const BONUS_FOOD_TICKS    = 70; // ~7s at ~100ms/tick

export function createInitialState(seed = Date.now(), options = {}) {
  const mid = Math.floor(GRID / 2);
  return {
    snake: [[mid, mid], [mid, mid + 1], [mid, mid + 2]],
    dir: 'left',
    food: spawnFood([[mid, mid], [mid, mid + 1], [mid, mid + 2]], seed),
    score: 0,
    dead: false,
    level: 1,
    wrapWalls: options.wrapWalls || false,
    foodEaten: 0,
    bonusFood: null,
    bonusFoodTimer: 0,
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
  const { snake, dir, food, score, level, wrapWalls, foodEaten, bonusFood, bonusFoodTimer } = state;
  const [hr, hc] = snake[0];
  const moves = { up: [-1,0], down: [1,0], left: [0,-1], right: [0,1] };
  const [dr, dc] = moves[dir] || [0,-1];
  let nr = hr + dr, nc = hc + dc;

  if (wrapWalls) {
    nr = ((nr % GRID) + GRID) % GRID;
    nc = ((nc % GRID) + GRID) % GRID;
  } else {
    if (nr < 0 || nr >= GRID || nc < 0 || nc >= GRID) return { ...state, dead: true };
  }
  if (snake.some(([r,c]) => r === nr && c === nc)) return { ...state, dead: true };

  const atRegular = nr === food[0] && nc === food[1];
  const atBonus   = !!bonusFood && nr === bonusFood[0] && nc === bonusFood[1];
  const newSnake  = [[nr, nc], ...snake];
  if (!atRegular) newSnake.pop(); // only regular food grows snake

  let newScore       = score + (atRegular ? 10 * level : atBonus ? 50 : 0);
  let newFoodEaten   = foodEaten + (atRegular ? 1 : 0);
  let newFood        = atRegular ? spawnFood(newSnake, Date.now()) : food;
  let newBonusFood   = atBonus ? null : bonusFood;
  let newBonusTimer  = atBonus ? 0 : bonusFoodTimer;

  // Spawn bonus food every BONUS_FOOD_INTERVAL regular foods eaten
  if (atRegular && newFoodEaten % BONUS_FOOD_INTERVAL === 0 && !newBonusFood) {
    newBonusFood  = spawnFood(newSnake, Date.now() + 1337);
    newBonusTimer = BONUS_FOOD_TICKS;
  }

  // Tick down bonus food timer
  if (newBonusFood) {
    newBonusTimer--;
    if (newBonusTimer <= 0) { newBonusFood = null; newBonusTimer = 0; }
  }

  return {
    snake: newSnake, dir, food: newFood, score: newScore,
    level: Math.floor(newScore / 100) + 1, dead: false,
    wrapWalls, foodEaten: newFoodEaten,
    bonusFood: newBonusFood, bonusFoodTimer: newBonusTimer,
  };
}

export function changeDir(state, newDir) {
  const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };
  if (opposite[newDir] === state.dir) return state;
  return { ...state, dir: newDir };
}

export function getSpeed(level) {
  return Math.max(80, 200 - (level - 1) * 15);
}
