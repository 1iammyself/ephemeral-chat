import axios from 'axios';
import { API_BASE } from './resolve-url.js';

// ---------------------------------------------------------------------------
// 1.  Resolve the backend URL
// ---------------------------------------------------------------------------
const BACKEND_URL = API_BASE;

// ---------------------------------------------------------------------------
// 2.  Create the Axios instance
// ---------------------------------------------------------------------------
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// ---------------------------------------------------------------------------
// 3.  Request interceptor  (Privacy Pass token - soft / non-blocking)
// ---------------------------------------------------------------------------
api.interceptors.request.use(async (config) => {
  try {
    const { getAuthToken, isPrivacyPassReady, refreshTokensIfNeeded } =
      await import('../crypto/privacy-pass.js');

    if (isPrivacyPassReady()) {
      const token = getAuthToken();
      if (token) {
        config.headers['Authorization'] = 'PrivacyPass ' + token;
      } else {
        refreshTokensIfNeeded(BACKEND_URL).catch(() => {});
      }
    }
  } catch (_e) {
    // Privacy Pass unavailable - proceed without it
  }
  return config;
});

// ---------------------------------------------------------------------------
// 4.  Response interceptor  (unpad binary envelope + error normalisation)
// ---------------------------------------------------------------------------
const FLAG_REAL = 0x00;
const HEADER_SIZE = 5;

function unpadIfNeeded(data, headers) {
  const padded = headers?.['x-padded'] || headers?.['X-Padded'];
  if (padded !== '1') return data;

  let bytes;
  if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else {
    return data;
  }

  if (bytes.length < HEADER_SIZE || bytes[0] !== FLAG_REAL) {
    return new TextDecoder().decode(bytes);
  }

  const originalLength =
    (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4];

  if (originalLength + HEADER_SIZE > bytes.length) {
    return new TextDecoder().decode(bytes);
  }

  const jsonBytes = bytes.slice(HEADER_SIZE, HEADER_SIZE + originalLength);
  const jsonStr = new TextDecoder().decode(jsonBytes);

  try {
    return JSON.parse(jsonStr);
  } catch (_e) {
    return jsonStr;
  }
}

// Force arraybuffer so we can handle the binary envelope
api.interceptors.request.use((config) => {
  if (!config.responseType) {
    config.responseType = 'arraybuffer';
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    response.data = unpadIfNeeded(response.data, response.headers);
    // If still arraybuffer (no padding header), try to parse as JSON
    if (response.data instanceof ArrayBuffer || response.data instanceof Uint8Array) {
      try {
        const text = new TextDecoder().decode(response.data);
        response.data = JSON.parse(text);
      } catch (_e) {
        response.data = new TextDecoder().decode(response.data);
      }
    }
    return response;
  },
  (error) => {
    if (error.response?.data) {
      try {
        let parsed = unpadIfNeeded(error.response.data, error.response.headers);
        if (parsed instanceof ArrayBuffer || parsed instanceof Uint8Array) {
          parsed = new TextDecoder().decode(parsed);
        }
        if (typeof parsed === 'string') {
          try { parsed = JSON.parse(parsed); } catch (_e) { parsed = { error: parsed }; }
        }
        error.response.data = parsed;
      } catch (_e) {
        // leave as-is
      }
    }
    return Promise.reject(error);
  }
);

// ---------------------------------------------------------------------------
// 5.  API functions
// ---------------------------------------------------------------------------

export async function validateInviteToken(token) {
  try {
    const { data } = await api.get('/api/invite/' + encodeURIComponent(token));
    if (!data || !data.success) {
      throw (data?.error || 'Invalid or expired invite link');
    }
    return data;
  } catch (err) {
    if (typeof err === 'string') throw err;
    const msg =
      err?.response?.data?.error ||
      err?.message ||
      'Failed to validate invite link';
    throw msg;
  }
}

export async function joinWithVerbalCode(verbalCode) {
  try {
    const { data } = await api.post('/api/verbal-join', { verbalCode });
    if (!data || !data.success) {
      throw (data?.error || 'Invalid or expired verbal code');
    }
    return data;
  } catch (err) {
    if (typeof err === 'string') throw err;
    const msg =
      err?.response?.data?.error ||
      err?.message ||
      'Failed to process verbal code';
    throw msg;
  }
}

export async function checkRoom(roomCode) {
  try {
    const { data } = await api.get('/api/rooms/' + encodeURIComponent(roomCode));
    return data;
  } catch (err) {
    if (err?.response?.status === 404) {
      return { exists: false };
    }
    throw err;
  }
}

export async function generateInviteLink(roomCode, opts) {
  opts = opts || {};
  try {
    const { data } = await api.post(
      '/api/rooms/' + encodeURIComponent(roomCode) + '/invite',
      {
        password: opts.password,
        isPermanent: opts.isPermanent,
        expiryHours: opts.expiryHours,
      }
    );
    if (!data || !data.success) {
      throw (data?.error || 'Failed to generate invite link');
    }
    return data;
  } catch (err) {
    if (typeof err === 'string') throw err;
    const msg =
      err?.response?.data?.error ||
      err?.message ||
      'Failed to generate invite link';
    throw msg;
  }
}

export default api;
