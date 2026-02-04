/**
 * Creator ID management for persistent rooms
 * Uses localStorage to maintain Private creator identity
 */

const CREATOR_ID_KEY = 'eph-creator-id';

/**
 * Get or create creator ID from localStorage
 * @returns {string} Creator ID (UUID)
 */
export const getCreatorId = () => {
    let creatorId = localStorage.getItem(CREATOR_ID_KEY);

    if (!creatorId) {
        // Generate new UUID for creator
        creatorId = crypto.randomUUID();
        localStorage.setItem(CREATOR_ID_KEY, creatorId);
    }

    return creatorId;
};

/**
 * Clear creator ID from localStorage
 * Used for resetting creator identity
 */
export const clearCreatorId = () => {
    localStorage.removeItem(CREATOR_ID_KEY);
};

/**
 * Check if creator ID exists
 * @returns {boolean} True if creator ID exists in localStorage
 */
export const hasCreatorId = () => {
    return localStorage.getItem(CREATOR_ID_KEY) !== null;
};
