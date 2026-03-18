/**
 * Trivia question bank — all categories combined.
 * Split across part files to stay within module size limits.
 */

import { TRIVIA_PART1 } from './trivia-part1.js';
import { TRIVIA_PART2 } from './trivia-part2.js';
import { TRIVIA_PART3 } from './trivia-part3.js';
import { TRIVIA_PART4 } from './trivia-part4.js';

export const TRIVIA_TOPICS = {
  ...TRIVIA_PART1,
  ...TRIVIA_PART2,
  ...TRIVIA_PART3,
  ...TRIVIA_PART4,
};
