// Secure credential storage for ExpressTURN and Agora
// Replace with environment variable access in production

export const EXPRESS_TURN = {
  username: import.meta.env.VITE_EXPRESS_TURN_USER,
  credential: import.meta.env.VITE_EXPRESS_TURN_PASS
};

export const AGORA = {
  appId: import.meta.env.VITE_AGORA_APP_ID,
  token: import.meta.env.VITE_AGORA_TOKEN,
  uid: import.meta.env.VITE_AGORA_UID
};

// Metered credentials (legacy, not used)
export const METERED = {
  username: import.meta.env.VITE_METERED_USER,
  credential: import.meta.env.VITE_METERED_PASS
};
