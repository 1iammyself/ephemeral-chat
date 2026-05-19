/**
 * Utility functions for the Ephemeral Chat application
 */

const sanitizeHtml = require('sanitize-html');
const crypto = require('crypto');

/**
 * Generate a unique 10-character room code using cryptographic randomness
 * @returns {string} 10-character alphanumeric code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = crypto.randomBytes(10);
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate a random nickname if user doesn't provide one
 * @returns {string} Random nickname
 */
function generateRandomNickname() {
  const adjectives = [
    'Private', 'Mystery', 'Secret', 'Hidden', 'Phantom', 'Shadow',
    'Silent', 'Quiet', 'Swift', 'Clever', 'Bright', 'Quick'
  ];

  const animals = [
    'Panda', 'Tiger', 'Eagle', 'Wolf', 'Fox', 'Bear',
    'Lion', 'Hawk', 'Owl', 'Cat', 'Dog', 'Rabbit'
  ];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const number = Math.floor(Math.random() * 999) + 1;

  return `${adjective}${animal}${number}`;
}

/**
 * Sanitize user input to prevent XSS
 * @param {string} input - User input to sanitize
 * @returns {string} Sanitized input
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') return '';

  const sanitized = sanitizeHtml(input, {
    allowedTags: [],
    allowedAttributes: {}
  });

  return sanitized
    .trim()
    .substring(0, 500); // Limit length
}

/**
 * Validate room code format
 * Accepts auto-generated codes (10-char A-Z0-9) or custom phrases (3-30 chars, a-zA-Z0-9 and hyphens)
 * @param {string} code - Room code to validate
 * @returns {boolean} True if valid
 */
function isValidRoomCode(code) {
  if (typeof code !== 'string' || code.length < 3 || code.length > 30) return false;
  // Auto-generated: exactly 10 uppercase alphanumeric
  if (/^[A-Z0-9]{10}$/.test(code)) return true;
  // Custom phrase: alphanumeric and hyphens, no leading/trailing/consecutive hyphens
  return /^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(code);
}

/**
 * Validate nickname format
 * @param {string} nickname - Nickname to validate
 * @returns {boolean} True if valid
 */
function isValidNickname(nickname) {
  return typeof nickname === 'string' &&
    nickname.length >= 1 &&
    nickname.length <= 20 &&
    /^[a-zA-Z0-9_\-\s]+$/.test(nickname);
}

/**
 * Get TTL options for message expiration
 * @returns {Object} TTL options with labels and values in seconds
 */
function getTTLOptions() {
  return {
    'none': 0,
    '30sec': 30,
    '1min': 60,
    '5min': 300,
    '30min': 1800,
    '1hour': 3600
  };
}

const logger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
};

/**
 * Generate a short hash from a seed string
 * @param {string} seed - The seed to hash
 * @returns {string} A short alphanumeric hash
 */
function shortHash(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex').substring(0, 12).toUpperCase();
}

module.exports = {
  generateRoomCode,
  generateRandomNickname,
  sanitizeInput,
  isValidRoomCode,
  isValidNickname,
  getTTLOptions,
  logger,
  shortHash
};
