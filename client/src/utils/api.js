import axios from 'axios';
import { isOHTTPReady } from '../crypto/ohttp.js';
import { ohttpFetch } from '../crypto/ohttp.js';
import { getAuthToken, isPrivacyPassReady, refreshTokensIfNeeded } from '../crypto/privacy-pass.js';
import { unpadResponse } from './secure-fetch.js';

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

// ─── Security Interceptors ─────────────────────────────────

/**
 * Request interceptor: attach Privacy Pass auth token to every outbound request.
 */
api.interceptors.request.use((config) => {
  if (isPrivacyPassReady()) {
    const tokenHeader = getAuthToken();
    if (tokenHeader?.Authorization) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = tokenHeader.Authorization;
    }
  }
  // Fire-and-forget token refresh
  refreshTokensIfNeeded(API_BASE_URL).catch(() => {});

  // Tell axios to receive binary so we can unpad before JSON-parsing
  // (only for routes that may be padded — all /api/* routes)
  if (!config.responseType) {
    config.responseType = 'arraybuffer';
  }
  return config;
});

/**
 * Response interceptor: transparently unpad server traffic-padded responses.
 * The server wraps every /api JSON response in a binary envelope
 * ([flag][length][json][random padding]) and sets X-Padded: 1.
 */
const FLAG_REAL_AX = 0x00;
const HEADER_SIZE_AX = 5;

api.interceptors.response.use((response) => {
  const xPadded = response.headers?.['x-padded'];
  if (xPadded !== '1') {
    // Not padded — if we forced arraybuffer, try to parse as JSON
    if (response.config?.responseType === 'arraybuffer' && response.data instanceof ArrayBuffer) {
      try {
        const text = new TextDecoder().decode(response.data);
        response.data = JSON.parse(text);
      } catch (_) {
        // Not JSON, leave as-is
      }
    }
    return response;
  }

  // Unpad the binary envelope
  const buf = new Uint8Array(response.data);
  if (buf.length >= HEADER_SIZE_AX && buf[0] === FLAG_REAL_AX) {
    const originalLength =
      (buf[1] << 24) | (buf[2] << 16) | (buf[3] << 8) | buf[4];

    if (originalLength + HEADER_SIZE_AX <= buf.length) {
      const originalBytes = buf.slice(HEADER_SIZE_AX, HEADER_SIZE_AX + originalLength);
      const text = new TextDecoder().decode(originalBytes);
      try {
        response.data = JSON.parse(text);
      } catch (_) {
        response.data = text;
      }
      return response;
    }
  }

  // Fallback — couldn't unpad, return raw
  return response;
});

/**
 * Custom adapter: when OHTTP is available, route axios requests through the
 * OHTTP relay instead of making a direct network call.  This keeps the
 * server from ever seeing the client IP.
 */
const originalAdapter = api.defaults.adapter;
api.defaults.adapter = async function ohttpAdapter(config) {
  if (isOHTTPReady()) {
    try {
      const fullUrl = `${config.baseURL || ''}${config.url || ''}`;
      const method = (config.method || 'GET').toUpperCase();
      const rawResponse = await ohttpFetch(method, fullUrl, {
        headers: config.headers,
        body: config.data ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data)) : undefined,
      });
      // Unpad server traffic-padding envelope before reading body
      const response = await unpadResponse(rawResponse);
      const responseData = await response.text();
      return {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        config,
        request: {},
      };
    } catch (e) {
      console.warn('⚠️ OHTTP adapter failed, falling back to direct:', e.message);
    }
  }
  // Fall back to default adapter
  if (typeof originalAdapter === 'function') {
    return originalAdapter(config);
  }
  // Axios default
  return axios.defaults.adapter(config);
};

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
