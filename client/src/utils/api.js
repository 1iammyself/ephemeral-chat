import axios from 'axios';

// Detect environment and set base URL
// Vite uses import.meta.env, Create React App uses process.env
const isDev = (typeof process !== 'undefined' && process.env.NODE_ENV === 'development') ||
  (typeof import.meta !== 'undefined' && import.meta.env.DEV);

const ENV_API_URL = (typeof process !== 'undefined' ? process.env.REACT_APP_API_URL : null) ||
  (typeof import.meta !== 'undefined' ? import.meta.env.VITE_API_URL : null);

// In production, we need a full URL if hosting on a different domain (like Cloudflare Pages)
// If no URL is provided, it will fallback to relative path (empty string)
const API_BASE_URL = ENV_API_URL || (isDev ? 'http://localhost:3001' : '');

if (ENV_API_URL) {
  console.log('📡 Using API URL:', ENV_API_URL);
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Generate an invite link for a room
 * @param {string} roomCode - The room code to generate an invite for
 * @param {Object} options - Options for the invite
 * @param {boolean} [options.isPermanent=false] - Whether the invite should be permanent
 * @param {number} [options.expiryHours] - Optional expiry time in hours
 * @returns {Promise<{success: boolean, token: string, url: string, expiresAt: string | null}>}
 */
export const generateInviteLink = async (roomCode, { isPermanent = false, expiryHours } = {}) => {
  try {
    const response = await api.post(`/api/rooms/${roomCode}/invite`, {
      isPermanent,
      expiryHours
    });
    return response.data;
  } catch (error) {
    console.error('Error generating invite link:', error);
    throw error.response?.data?.error || 'Failed to generate invite link';
  }
};

/**
 * Validate an invite token
 * @param {string} token - The invite token to validate
 * @param {string} [roomCode] - Optional room code to validate against
 * @returns {Promise<{success: boolean, roomCode: string, requiresPassword: boolean, isPermanent: boolean}>}
 */
export const validateInviteToken = async (token, roomCode) => {
  try {
    const response = await api.get(`/api/invite/${token}`, {
      params: { roomCode }
    });
    return response.data;
  } catch (error) {
    console.error('Error validating invite token:', error);
    throw error.response?.data?.error || 'Invalid or expired invite link';
  }
};

/**
 * Join a room using a verbal code
 * @param {string} verbalCode - 4-word verbal code (e.g., "clarity compass journey peace")
 * @returns {Promise<{success: boolean, roomCode: string, token: string, requiresPassword: boolean}>}
 */
export const joinWithVerbalCode = async (verbalCode) => {
  try {
    const response = await api.post('/api/verbal-join', { verbalCode });
    return response.data;
  } catch (error) {
    console.error('Error joining with verbal code:', error);
    throw error.response?.data?.error || 'Invalid or expired code';
  }
};

/**
 * Check if a room exists
 * @param {string} roomCode 
 * @returns {Promise<{exists: boolean}>}
 */
export const checkRoom = async (roomCode) => {
  try {
    const response = await api.get(`/api/rooms/${roomCode}`);
    return response.data;
  } catch (error) {
    console.error('Error checking room:', error);
    throw error.response?.data?.error || 'Failed to check room';
  }
};

export default {
  generateInviteLink,
  validateInviteToken,
  joinWithVerbalCode,
  checkRoom
};
