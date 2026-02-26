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
        panelClass: 'bg-white/80 dark:bg-gray-900/80',
        description: 'Clean and minimal',
        moodSound: null
    },
    party: {
        id: 'party',
        name: 'Party',
        emoji: '🎉',
        bgClass: 'bg-gradient-to-br from-indigo-100 to-purple-400 dark:from-indigo-800/80 dark:to-purple-900/60',
        messageClass: 'bg-indigo-600 dark:bg-indigo-700 text-white rounded-tr-none',
        sidebarClass: 'bg-indigo-50/80 dark:bg-indigo-900/40',
        panelClass: 'bg-indigo-50/80 dark:bg-indigo-900/40',
        description: 'Festive and fun',
        moodSound: 'lofi'
    },
    chill: {
        id: 'chill',
        name: 'Chill',
        emoji: '🌊',
        bgClass: 'bg-gradient-to-br from-teal-100 to-emerald-300 dark:from-teal-900/70 dark:to-emerald-900/60',
        messageClass: 'bg-teal-600 dark:bg-teal-700 text-white rounded-tr-none',
        sidebarClass: 'bg-teal-50/80 dark:bg-teal-900/40',
        panelClass: 'bg-teal-50/80 dark:bg-teal-900/40',
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
        panelClass: 'bg-orange-50/80 dark:bg-orange-900/40',
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
