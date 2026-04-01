/**
 * Mini-Games data and utilities for Ephemeral Chat
 * Game types: "Would You Rather", "Trivia"
 *
 * Trivia data is imported from trivia-data.js (split across trivia-part1–4.js).
 * WYR data is imported from wyr-data.js (split across wyr-part1–3.js).
 */

import { TRIVIA_TOPICS as _TRIVIA_TOPICS } from './trivia-data.js';
import { WOULD_YOU_RATHER_TOPICS as _WYR_TOPICS } from './wyr-data.js';

export const GAME_TYPES = {
    WYR: 'would-you-rather',
    TRIVIA: 'trivia',
    TIC_TAC_TOE: 'tic-tac-toe',
    ROCK_PAPER_SCISSORS: 'rock-paper-scissors',
    CHESS: 'chess',
    HANGMAN: 'hangman',
    ANAGRAM: 'anagram',
    TYPING_RACE: 'typing-race',
};

// Shorthand command aliases for games
export const GAME_SHORTHAND = {
    hmg: GAME_TYPES.HANGMAN,
    hangman: GAME_TYPES.HANGMAN,
    agm: GAME_TYPES.ANAGRAM,
    anagram: GAME_TYPES.ANAGRAM,
    trg: GAME_TYPES.TYPING_RACE,
    'typing-race': GAME_TYPES.TYPING_RACE,
    'typing': GAME_TYPES.TYPING_RACE,
};

// Game-specific configuration: TTL (seconds), defaults
export const GAME_CONFIG = {
    [GAME_TYPES.HANGMAN]: {
        ttl: 600, // 10 minutes
        minDifficulty: 'easy',
        defaultDifficulty: 'medium',
        maxMistakes: 6,
    },
    [GAME_TYPES.ANAGRAM]: {
        ttl: 480, // 8 minutes
        minDifficulty: 'novice',
        defaultDifficulty: 'novice',
        defaultRounds: 5,
    },
    [GAME_TYPES.TYPING_RACE]: {
        ttl: 300, // 5 minutes
        minDifficulty: 'easy',
        defaultDifficulty: 'easy',
    },
};

export const WOULD_YOU_RATHER_TOPICS = _WYR_TOPICS;
// Trivia comes from the expanded external file (961+ questions, 14 categories)
export const TRIVIA_TOPICS = _TRIVIA_TOPICS;

// Compatible with existing exports
export const WOULD_YOU_RATHER = Object.values(WOULD_YOU_RATHER_TOPICS).flat();
export const TRIVIA_QUESTIONS = Object.values(TRIVIA_TOPICS).flat();

// Topic lists for selection
export const WYR_TOPIC_LIST = Object.keys(WOULD_YOU_RATHER_TOPICS);
export const TRIVIA_TOPIC_LIST = Object.keys(TRIVIA_TOPICS);

let remainingWYR = { "ANY": [] };
let remainingTrivia = { "ANY": [] };

const shuffleArray = (array) => {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

export const getRandomWYR = (topic = null) => {
    const key = topic || "ANY";
    if (!remainingWYR[key] || remainingWYR[key].length === 0) {
        const source = topic ? WOULD_YOU_RATHER_TOPICS[topic] : WOULD_YOU_RATHER;
        remainingWYR[key] = shuffleArray(source);
    }
    return remainingWYR[key].pop();
};

export const getRandomTrivia = (topic = null) => {
    const key = topic || "ANY";
    if (!remainingTrivia[key] || remainingTrivia[key].length === 0) {
        const source = topic ? TRIVIA_TOPICS[topic] : TRIVIA_QUESTIONS;
        remainingTrivia[key] = shuffleArray(source);
    }
    return remainingTrivia[key].pop();
};
