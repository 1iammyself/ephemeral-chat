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
        messageClass: 'bg-primary-600 dark:bg-primary-700 text-white rounded-tr-none',
        sidebarClass: 'bg-white/80 dark:bg-gray-900/80',
        description: 'Clean and minimal',
        moodSound: null
    },
    party: {
        id: 'party',
        name: 'Party',
        emoji: '🎉',
        bgClass: 'bg-gradient-to-br from-blue-100 to-blue-400 dark:from-blue-800/80 dark:to-blue-900/60',
        messageClass: 'bg-purple-600 dark:bg-purple-700 text-white rounded-tr-none',
        sidebarClass: 'bg-purple-50/80 dark:bg-purple-900/40',
        description: 'Festive and fun',
        moodSound: 'lofi'
    },
    chill: {
        id: 'chill',
        name: 'Chill',
        emoji: '🌊',
        bgClass: 'bg-gradient-to-br from-cyan-100 to-blue-300 dark:from-cyan-900/70 dark:to-blue-900/60',
        messageClass: 'bg-cyan-600 dark:bg-cyan-700 text-white rounded-tr-none',
        sidebarClass: 'bg-cyan-50/80 dark:bg-cyan-900/40',
        description: 'Relaxed vibes',
        moodSound: 'rain'
    },
    focus: {
        id: 'focus',
        name: 'Focus',
        emoji: '🎯',
        bgClass: 'bg-gradient-to-br from-amber-100 to-orange-300 dark:from-amber-900/70 dark:to-orange-900/60',
        messageClass: 'bg-orange-600 dark:bg-orange-700 text-white rounded-tr-none',
        sidebarClass: 'bg-orange-50/80 dark:bg-orange-900/40',
        description: 'Work mode',
        moodSound: 'whitenoise'
    }
};

export const getVibeById = (vibeId) => {
    return VIBES[vibeId] || VIBES.default;
};

export const getAllVibes = () => {
    return Object.values(VIBES);
};
