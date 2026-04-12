import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GAME_TYPES } from '../src/utils/games.js';
import {
  GAME_REGISTRY,
  EXCLUSIVE_WINDOW_GAME_TYPES,
  LEGACY_INLINE_GAME_TYPES,
  SUPPORTED_GAME_TYPES,
  isSingleRecipientGame,
  isSupportedGameType,
} from '../src/utils/game-contract.js';

const EXPECTED_GAME_TYPES = [
  GAME_TYPES.WYR,
  GAME_TYPES.TRIVIA,
  GAME_TYPES.TIC_TAC_TOE,
  GAME_TYPES.ROCK_PAPER_SCISSORS,
  GAME_TYPES.CHESS,
  GAME_TYPES.HANGMAN,
  GAME_TYPES.ANAGRAM,
  GAME_TYPES.TYPING_RACE,
];

test('contract includes exactly all 8 supported game types', () => {
  assert.equal(SUPPORTED_GAME_TYPES.length, 8, 'Expected exactly 8 games in contract');

  for (const gameType of EXPECTED_GAME_TYPES) {
    assert.equal(isSupportedGameType(gameType), true, `Missing game in contract: ${gameType}`);
    assert.ok(GAME_REGISTRY[gameType], `Registry entry missing for ${gameType}`);
  }
});

test('ui mode split is stable (legacy 5 incl chess-split requirement)', () => {
  const expectedExclusive = [
    GAME_TYPES.CHESS,
    GAME_TYPES.HANGMAN,
    GAME_TYPES.ANAGRAM,
    GAME_TYPES.TYPING_RACE,
  ];

  const expectedLegacy = [
    GAME_TYPES.WYR,
    GAME_TYPES.TRIVIA,
    GAME_TYPES.TIC_TAC_TOE,
    GAME_TYPES.ROCK_PAPER_SCISSORS,
  ];

  assert.deepEqual([...EXCLUSIVE_WINDOW_GAME_TYPES].sort(), [...expectedExclusive].sort());
  assert.deepEqual([...LEGACY_INLINE_GAME_TYPES].sort(), [...expectedLegacy].sort());
});

test('single-recipient restriction stays limited to match games', () => {
  const singleRecipientGames = [
    GAME_TYPES.TIC_TAC_TOE,
    GAME_TYPES.ROCK_PAPER_SCISSORS,
    GAME_TYPES.CHESS,
  ];

  for (const gameType of EXPECTED_GAME_TYPES) {
    const shouldBeSingle = singleRecipientGames.includes(gameType);
    assert.equal(
      isSingleRecipientGame(gameType),
      shouldBeSingle,
      `${gameType} single-recipient policy mismatch`,
    );
  }
});

test('server send-message branch still recognizes all 8 game types', async () => {
  const serverIndex = await readFile('../server/index.js', 'utf8');

  const mustContain = [
    "gameData.gameType === 'would-you-rather'",
    "gameData.gameType === 'trivia'",
    "gameData.gameType === 'tic-tac-toe'",
    "gameData.gameType === 'rock-paper-scissors'",
    "gameData.gameType === 'chess'",
    "gameData.gameType === 'hangman'",
    "gameData.gameType === 'anagram'",
    "gameData.gameType === 'typing-race'",
  ];

  for (const marker of mustContain) {
    assert.equal(serverIndex.includes(marker), true, `Missing server game handling marker: ${marker}`);
  }
});
