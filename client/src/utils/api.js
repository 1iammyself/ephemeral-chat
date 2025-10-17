import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

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

export default {
  generateInviteLink,
  validateInviteToken
};
