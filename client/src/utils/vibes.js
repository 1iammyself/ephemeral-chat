/**
 * Room vibe configurations for Ephemeral Chat
 * Each vibe changes the room's background and ambient theme
 */

export const VIBES = {
    default: {
        id: 'default',
        name: 'Default',
        emoji: '💬',
        bgClass: 'bg-gray-50 dark:bg-gray-900',
        description: 'Clean and minimal'
    },
    party: {
        id: 'party',
        name: 'Party',
        emoji: '🎉',
        bgClass: 'bg-gradient-to-br from-blue-100 to-blue-400 dark:from-blue-800/80 dark:to-blue-900/60',
        description: 'Festive and fun'
    },
    chill: {
        id: 'chill',
        name: 'Chill',
        emoji: '🌊',
        bgClass: 'bg-gradient-to-br from-cyan-100 to-blue-300 dark:from-cyan-900/70 dark:to-blue-900/60',
        description: 'Relaxed vibes'
    },
    focus: {
        id: 'focus',
        name: 'Focus',
        emoji: '🎯',
        bgClass: 'bg-gradient-to-br from-amber-100 to-orange-300 dark:from-amber-900/70 dark:to-orange-900/60',
        description: 'Work mode'
    }
};

export const getVibeById = (vibeId) => {
    return VIBES[vibeId] || VIBES.default;
};

export const getAllVibes = () => {
    return Object.values(VIBES);
};
