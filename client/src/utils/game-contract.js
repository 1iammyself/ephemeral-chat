import { GAME_TYPES } from './games.js';

export const GAME_UI_MODES = {
  LEGACY_INLINE: 'legacy-inline',
  EXCLUSIVE_WINDOW: 'exclusive-window',
};

export const GAME_REGISTRY = {
  [GAME_TYPES.WYR]: {
    label: 'Would You Rather',
    uiMode: GAME_UI_MODES.LEGACY_INLINE,
    quickSend: false,
    singleRecipientOnly: false,
  },
  [GAME_TYPES.TRIVIA]: {
    label: 'Trivia',
    uiMode: GAME_UI_MODES.LEGACY_INLINE,
    quickSend: false,
    singleRecipientOnly: false,
  },
  [GAME_TYPES.TIC_TAC_TOE]: {
    label: 'Tic-Tac-Toe',
    uiMode: GAME_UI_MODES.LEGACY_INLINE,
    quickSend: false,
    singleRecipientOnly: true,
  },
  [GAME_TYPES.ROCK_PAPER_SCISSORS]: {
    label: 'Rock Paper Scissors',
    uiMode: GAME_UI_MODES.LEGACY_INLINE,
    quickSend: false,
    singleRecipientOnly: true,
  },
  [GAME_TYPES.CHESS]: {
    label: 'Chess',
    uiMode: GAME_UI_MODES.EXCLUSIVE_WINDOW,
    quickSend: false,
    singleRecipientOnly: true,
  },
  [GAME_TYPES.HANGMAN]: {
    label: 'Hangman',
    uiMode: GAME_UI_MODES.EXCLUSIVE_WINDOW,
    quickSend: false,
    singleRecipientOnly: false,
  },
  [GAME_TYPES.ANAGRAM]: {
    label: 'Anagram',
    uiMode: GAME_UI_MODES.EXCLUSIVE_WINDOW,
    quickSend: false,
    singleRecipientOnly: false,
  },
  [GAME_TYPES.TYPING_RACE]: {
    label: 'Typing Race',
    uiMode: GAME_UI_MODES.EXCLUSIVE_WINDOW,
    quickSend: false,
    singleRecipientOnly: false,
  },
};

export const SUPPORTED_GAME_TYPES = Object.keys(GAME_REGISTRY);

export const EXCLUSIVE_WINDOW_GAME_TYPES = SUPPORTED_GAME_TYPES.filter(
  (type) => GAME_REGISTRY[type].uiMode === GAME_UI_MODES.EXCLUSIVE_WINDOW,
);

export const LEGACY_INLINE_GAME_TYPES = SUPPORTED_GAME_TYPES.filter(
  (type) => GAME_REGISTRY[type].uiMode === GAME_UI_MODES.LEGACY_INLINE,
);

export function isSupportedGameType(gameType) {
  return Boolean(GAME_REGISTRY[gameType]);
}

export function isSingleRecipientGame(gameType) {
  return Boolean(GAME_REGISTRY[gameType]?.singleRecipientOnly);
}

export function isQuickSendGame(gameType) {
  return Boolean(GAME_REGISTRY[gameType]?.quickSend);
}

export function normalizeGamePayload(gameData = {}) {
  if (!gameData || typeof gameData !== 'object') return null;
  const { gameType } = gameData;
  if (!isSupportedGameType(gameType)) return null;
  return { ...gameData, gameType };
}
