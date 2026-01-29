/**
 * Persistence mode configurations for Ephemeral Chat
 * Defines room lifetime and behavior based on persistence mode
 */

const PERSISTENCE_MODES = {
    ephemeral: {
        lifetimeMinutes: 10,
        allowEmpty: false,        // Deletes when empty
        refreshOnActivity: true,  // Timer resets on messages/joins
        socketTimeout: 30000      // 30 seconds
    },
    gathering: {
        lifetimeMinutes: 180,     // 3 hours
        allowEmpty: true,         // Stays alive when empty
        refreshOnActivity: false, // Fixed expiry from creation
        socketTimeout: 300000     // 5 minutes
    },
    social: {
        lifetimeMinutes: 360,     // 6 hours
        allowEmpty: true,
        refreshOnActivity: false,
        socketTimeout: 300000     // 5 minutes  
    },
    extended: {
        lifetimeMinutes: 1440,    // 24 hours
        allowEmpty: true,
        refreshOnActivity: false,
        socketTimeout: 300000     // 5 minutes
    }
};

// Global limit across all persistence modes
const MAX_ROOMS_PER_CREATOR = 5;

/**
 * Get persistence mode configuration
 * @param {string} mode - Persistence mode name
 * @returns {Object} Mode configuration or null if invalid
 */
function getPersistenceMode(mode) {
    return PERSISTENCE_MODES[mode] || null;
}

/**
 * Validate if a persistence mode is valid
 * @param {string} mode - Mode to validate
 * @returns {boolean} True if valid
 */
function isValidPersistenceMode(mode) {
    return PERSISTENCE_MODES.hasOwnProperty(mode);
}

/**
 * Get lifetime in milliseconds for a mode
 * @param {string} mode - Persistence mode
 * @returns {number} Lifetime in milliseconds
 */
function getLifetimeMs(mode) {
    const config = getPersistenceMode(mode);
    return config ? config.lifetimeMinutes * 60 * 1000 : null;
}

module.exports = {
    PERSISTENCE_MODES,
    MAX_ROOMS_PER_CREATOR,
    getPersistenceMode,
    isValidPersistenceMode,
    getLifetimeMs
};
