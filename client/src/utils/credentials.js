// Secure credential storage for ExpressTURN and Agora
// Replace with environment variable access in production

const clean = (val) => val ? val.replace(/^"|"$/g, '') : val;

export const EXPRESS_TURN = {
  username: clean(import.meta.env.VITE_EXPRESS_TURN_USER),
  credential: clean(import.meta.env.VITE_EXPRESS_TURN_PASS)
};

export const AGORA = {
  appId: clean(import.meta.env.VITE_AGORA_APP_ID),
  uid: clean(import.meta.env.VITE_AGORA_UID)
};

// Metered credentials (Global Relay)
export const METERED = {
  username: clean(import.meta.env.VITE_METERED_USER),
  credential: clean(import.meta.env.VITE_METERED_PASS)
};
