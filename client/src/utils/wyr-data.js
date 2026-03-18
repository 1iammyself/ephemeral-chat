/**
 * Would You Rather question bank — all categories combined.
 * Split across part files to stay within module size limits.
 */

import { WYR_PART1 } from './wyr-part1.js';
import { WYR_PART2 } from './wyr-part2.js';
import { WYR_PART3 } from './wyr-part3.js';

export const WOULD_YOU_RATHER_TOPICS = {
  ...WYR_PART1,
  ...WYR_PART2,
  ...WYR_PART3,
};
