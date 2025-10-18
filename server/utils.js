/**
 * Utility functions for the Ephemeral Chat application
 */

/**
 * Generate a unique 6-character room code
 * @returns {string} 6-character alphanumeric code
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a random nickname if user doesn't provide one
 * @returns {string} Random nickname
 */
function generateRandomNickname() {
  const adjectives = [
    'Anonymous', 'Mystery', 'Secret', 'Hidden', 'Phantom', 'Shadow',
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
  
  return input
    .replace(/[<>]/g, '') // Remove < and > characters
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
    .substring(0, 500); // Limit length
}

/**
 * Validate room code format
 * @param {string} code - Room code to validate
 * @returns {boolean} True if valid
 */
function isValidRoomCode(code) {
  return typeof code === 'string' && 
         code.length === 10 && 
         /^[A-Z0-9]+$/.test(code);
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

/**
 * Generate a random math CAPTCHA problem
 * @returns {Object} { problem: string, answer: string }
 */
function generateMathCaptcha() {
  const operations = ['+', '-', '*', '/'];
  const operation = operations[Math.floor(Math.random() * operations.length)];
  
  let num1, num2, answer;
  
  if (operation === '/') {
    // For division, ensure whole number result
    num2 = Math.floor(Math.random() * 20) + 1; // 1-20
    answer = Math.floor(Math.random() * 15) + 1; // 1-15
    num1 = num2 * answer; // Ensures num1 / num2 = answer
  } else {
    num1 = Math.floor(Math.random() * 99) + 1; // 1-99
    num2 = Math.floor(Math.random() * 99) + 1; // 1-99
    
    switch (operation) {
      case '+': answer = num1 + num2; break;
      case '-': answer = num1 - num2; break; // Allow negative results
      case '*': answer = num1 * num2; break;
    }
  }
  
  return {
    problem: `${num1} ${operation} ${num2} = ?`,
    answer: answer.toString()
  };
}

module.exports = {
  generateRoomCode,
  generateRandomNickname,
  sanitizeInput,
  isValidRoomCode,
  isValidNickname,
  getTTLOptions,
  generateMathCaptcha
};
