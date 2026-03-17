/**
 * Creator ID management for persistent rooms.
 *
 * Uses sessionStorage instead of localStorage to limit the tracking
 * surface — the ID is unique per browser session (tab lifetime) and
 * is automatically cleared when the tab is closed. This aligns with
 * the "zero-persistence" privacy model.
 */

const CREATOR_ID_KEY = 'eph-creator-id';

/**
 * Get or create creator ID from sessionStorage.
 * Falls back to localStorage for migration, but new IDs are always
 * stored in sessionStorage.
 * @returns {string} Creator ID (UUID)
 */
export const getCreatorId = () => {
    let creatorId = sessionStorage.getItem(CREATOR_ID_KEY);

    if (!creatorId) {
        // Migrate any existing localStorage ID for continuity within this session
        const legacyId = localStorage.getItem(CREATOR_ID_KEY);
        if (legacyId) {
            creatorId = legacyId;
            sessionStorage.setItem(CREATOR_ID_KEY, creatorId);
            localStorage.removeItem(CREATOR_ID_KEY); // clean up persistent store
        } else {
            creatorId = crypto.randomUUID();
            sessionStorage.setItem(CREATOR_ID_KEY, creatorId);
        }
    }

    return creatorId;
};

/**
 * Clear creator ID
 */
export const clearCreatorId = () => {
    sessionStorage.removeItem(CREATOR_ID_KEY);
    localStorage.removeItem(CREATOR_ID_KEY); // also clear any legacy entry
};

/**
 * Check if creator ID exists
 * @returns {boolean}
 */
export const hasCreatorId = () => {
    return sessionStorage.getItem(CREATOR_ID_KEY) !== null;
};
