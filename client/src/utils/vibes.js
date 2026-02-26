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
        sidebarClass: 'bg-white/95 dark:bg-gray-900/90',
        panelClass: 'bg-white/95 dark:bg-gray-900/90',
        accentClass: 'bg-primary-600 hover:bg-primary-700 text-white',
        effectType: null,
        description: 'Clean and minimal',
        moodSound: null
    },
    party: {
        id: 'party',
        name: 'Party',
        emoji: '🎉',
        bgClass: 'bg-gradient-to-br from-indigo-100 via-purple-200 to-pink-200 dark:from-indigo-900/80 dark:via-purple-900/70 dark:to-pink-900/60',
        messageClass: 'bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700 text-white rounded-tr-none',
        sidebarClass: 'bg-indigo-100/95 dark:bg-indigo-950/80',
        panelClass: 'bg-indigo-100/95 dark:bg-indigo-950/80',
        accentClass: 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white',
        effectType: 'sparkles',
        description: 'Festive and fun',
        moodSound: 'lofi'
    },
    chill: {
        id: 'chill',
        name: 'Chill',
        emoji: '🌊',
        bgClass: 'bg-gradient-to-br from-teal-100 via-cyan-200 to-emerald-200 dark:from-teal-900/80 dark:via-cyan-950/80 dark:to-emerald-900/70',
        messageClass: 'bg-teal-600 dark:bg-teal-700 text-white rounded-tr-none',
        sidebarClass: 'bg-teal-100/95 dark:bg-teal-950/80',
        panelClass: 'bg-teal-100/95 dark:bg-teal-950/80',
        accentClass: 'bg-teal-600 hover:bg-teal-700 text-white',
        effectType: 'bubbles',
        description: 'Relaxed vibes',
        moodSound: 'rain'
    },
    focus: {
        id: 'focus',
        name: 'Focus',
        emoji: '🎯',
        bgClass: 'bg-gradient-to-br from-amber-50 via-orange-100 to-yellow-100 dark:from-amber-950 dark:via-orange-950/90 dark:to-yellow-950/80',
        messageClass: 'bg-orange-600 dark:bg-orange-700 text-white rounded-tr-none',
        sidebarClass: 'bg-orange-100/95 dark:bg-orange-950/80',
        panelClass: 'bg-orange-100/95 dark:bg-orange-950/80',
        accentClass: 'bg-orange-600 hover:bg-orange-700 text-white',
        effectType: 'breath',
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
