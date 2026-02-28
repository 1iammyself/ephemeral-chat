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
        sidebarClass: 'bg-gray-300/40 dark:bg-black/30',
        panelClass: 'bg-gray-300/40 dark:bg-black/30',
        inputClass: 'bg-gray-400/20 dark:bg-white/5 border-gray-300/30 dark:border-white/10 backdrop-blur-2xl shadow-inner',
        accentClass: 'bg-primary-600 hover:bg-primary-700 text-white',
        effectType: null,
        description: 'Clean and minimal',
        colors: { primary: '#3b82f6' },
        moodSound: null
    },
    party: {
        id: 'party',
        name: 'Party',
        emoji: '🎉',
        bgClass: 'bg-gradient-to-br from-indigo-200 via-purple-300 to-pink-200 dark:from-indigo-950 dark:via-purple-950 dark:to-pink-900',
        messageClass: 'bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700 text-white rounded-tr-none',
        sidebarClass: 'bg-indigo-400/40 dark:bg-indigo-950/30',
        panelClass: 'bg-indigo-400/40 dark:bg-indigo-950/30',
        inputClass: 'bg-indigo-400/30 dark:bg-indigo-500/10 border-indigo-400/30 dark:border-indigo-500/20 backdrop-blur-2xl shadow-inner',
        accentClass: 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white',
        effectType: 'sparkles',
        description: 'Festive and fun',
        colors: { primary: '#6366f1' },
        moodSound: 'lofi'
    },
    chill: {
        id: 'chill',
        name: 'Chill',
        emoji: '🌊',
        bgClass: 'bg-gradient-to-br from-teal-200 via-cyan-300 to-emerald-200 dark:from-teal-950 dark:via-cyan-950 dark:to-emerald-900',
        messageClass: 'bg-teal-600 dark:bg-teal-700 text-white rounded-tr-none',
        sidebarClass: 'bg-teal-400/40 dark:bg-teal-950/30',
        panelClass: 'bg-teal-400/40 dark:bg-teal-950/30',
        inputClass: 'bg-teal-400/30 dark:bg-teal-500/10 border-teal-400/30 dark:border-teal-500/20 backdrop-blur-2xl shadow-inner',
        accentClass: 'bg-teal-600 hover:bg-teal-700 text-white',
        effectType: 'rain',
        description: 'Relaxed vibes',
        colors: { primary: '#14b8a6' },
        moodSound: 'rain'
    },
    focus: {
        id: 'focus',
        name: 'Focus',
        emoji: '🎯',
        bgClass: 'bg-gradient-to-br from-amber-100 via-orange-200 to-yellow-100 dark:from-amber-950 dark:via-orange-950 dark:to-yellow-950',
        messageClass: 'bg-orange-600 dark:bg-orange-700 text-white rounded-tr-none',
        sidebarClass: 'bg-amber-400/40 dark:bg-amber-950/30',
        panelClass: 'bg-amber-400/40 dark:bg-amber-950/30',
        inputClass: 'bg-amber-400/30 dark:bg-orange-500/10 border-amber-400/30 dark:border-orange-500/20 backdrop-blur-2xl shadow-inner',
        accentClass: 'bg-orange-600 hover:bg-orange-700 text-white',
        effectType: 'stars',
        description: 'Work mode',
        colors: { primary: '#f97316' },
        moodSound: 'whitenoise'
    }
};

export const getVibeById = (vibeId) => {
    return VIBES[vibeId] || VIBES.default;
};

export const getAllVibes = () => {
    return Object.values(VIBES);
};
