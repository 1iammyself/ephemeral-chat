/**
 * Room vibe configurations for Ephemeral Chat
 * Each vibe changes the room's background and ambient theme
 * 
 * Available moodSounds: rain, lofi, whitenoise, campfire, ocean, forest, cafe, jazz
 */

export const VIBES = {
    default: {
        id: 'default',
        name: 'Default',
        emoji: '💬',
        bgClass: 'bg-gray-50 dark:bg-black',
        messageClass: 'bg-primary-600 dark:bg-primary-700 text-white rounded-tr-none',
        sidebarClass: 'bg-gray-400/10 dark:bg-gray-950/40',
        panelClass: 'bg-gray-400/10 dark:bg-gray-950/40',
        inputClass: 'bg-gray-400/15 dark:bg-white/5 border-gray-400/10 dark:border-white/10 backdrop-blur-3xl shadow-inner',
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
        sidebarClass: 'bg-indigo-300/15 dark:bg-indigo-950/20',
        panelClass: 'bg-indigo-300/15 dark:bg-indigo-950/20',
        inputClass: 'bg-indigo-300/20 dark:bg-indigo-500/10 border-indigo-400/10 dark:border-indigo-500/20 backdrop-blur-3xl shadow-inner',
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
        sidebarClass: 'bg-teal-300/15 dark:bg-teal-950/20',
        panelClass: 'bg-teal-300/15 dark:bg-teal-950/20',
        inputClass: 'bg-teal-300/20 dark:bg-teal-500/10 border-teal-400/10 dark:border-teal-500/20 backdrop-blur-3xl shadow-inner',
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
        sidebarClass: 'bg-amber-300/15 dark:bg-amber-950/20',
        panelClass: 'bg-amber-300/15 dark:bg-amber-950/20',
        inputClass: 'bg-amber-300/20 dark:bg-orange-500/10 border-amber-400/10 dark:border-orange-500/20 backdrop-blur-3xl shadow-inner',
        accentClass: 'bg-orange-600 hover:bg-orange-700 text-white',
        effectType: 'stars',
        description: 'Work mode',
        colors: { primary: '#f97316' },
        moodSound: 'whitenoise'
    },
    starlit: {
        id: 'starlit',
        name: 'Starlit',
        emoji: '🔥',
        bgClass: 'bg-gradient-to-br from-orange-200 via-red-300 to-amber-200 dark:from-gray-900 dark:via-orange-950/30 dark:to-black',
        messageClass: 'bg-orange-700 dark:bg-orange-800 text-white rounded-tr-none',
        sidebarClass: 'bg-orange-300/10 dark:bg-orange-950/10',
        panelClass: 'bg-orange-300/10 dark:bg-orange-950/10',
        inputClass: 'bg-orange-300/15 dark:bg-orange-900/10 border-orange-400/10 dark:border-orange-500/10 backdrop-blur-3xl',
        accentClass: 'bg-orange-600 hover:bg-orange-700 text-white',
        effectType: 'sparkles',
        description: 'Campfire nights',
        colors: { primary: '#ea580c' },
        moodSound: 'campfire'
    },
    beach: {
        id: 'beach',
        name: 'Beach',
        emoji: '🌊',
        bgClass: 'bg-gradient-to-br from-blue-100 via-cyan-200 to-teal-100 dark:from-blue-950 dark:via-cyan-900 dark:to-teal-950',
        messageClass: 'bg-cyan-600 dark:bg-cyan-700 text-white rounded-tr-none',
        sidebarClass: 'bg-cyan-300/15 dark:bg-cyan-950/20',
        panelClass: 'bg-cyan-300/15 dark:bg-cyan-950/20',
        inputClass: 'bg-cyan-300/20 dark:bg-cyan-500/10 border-cyan-400/10 dark:border-cyan-500/20 backdrop-blur-3xl',
        accentClass: 'bg-cyan-600 hover:bg-cyan-700 text-white',
        effectType: 'rain',
        description: 'Ocean breeze',
        colors: { primary: '#0891b2' },
        moodSound: 'ocean'
    },
    zen: {
        id: 'zen',
        name: 'Zen',
        emoji: '🌿',
        bgClass: 'bg-gradient-to-br from-green-100 via-emerald-200 to-teal-100 dark:from-green-950 dark:via-emerald-950 dark:to-teal-950',
        messageClass: 'bg-emerald-600 dark:bg-emerald-700 text-white rounded-tr-none',
        sidebarClass: 'bg-emerald-300/15 dark:bg-emerald-950/20',
        panelClass: 'bg-emerald-300/15 dark:bg-emerald-950/20',
        inputClass: 'bg-emerald-300/20 dark:bg-emerald-500/10 border-emerald-400/10 dark:border-emerald-500/20 backdrop-blur-3xl',
        accentClass: 'bg-emerald-600 hover:bg-emerald-700 text-white',
        effectType: null,
        description: 'Forest peace',
        colors: { primary: '#059669' },
        moodSound: 'forest'
    },
    cozy: {
        id: 'cozy',
        name: 'Cozy',
        emoji: '☕',
        bgClass: 'bg-gradient-to-br from-amber-50 via-warm-gray-200 to-orange-100 dark:from-stone-900 dark:via-amber-950/20 dark:to-black',
        messageClass: 'bg-amber-700 dark:bg-amber-800 text-white rounded-tr-none',
        sidebarClass: 'bg-amber-200/10 dark:bg-amber-950/10',
        panelClass: 'bg-amber-200/10 dark:bg-amber-950/10',
        inputClass: 'bg-amber-200/15 dark:bg-amber-900/10 border-amber-300/10 dark:border-amber-400/10 backdrop-blur-3xl',
        accentClass: 'bg-amber-600 hover:bg-amber-700 text-white',
        effectType: null,
        description: 'Café vibes',
        colors: { primary: '#b45309' },
        moodSound: 'cafe'
    },
    smooth: {
        id: 'smooth',
        name: 'Smooth',
        emoji: '🎷',
        bgClass: 'bg-gradient-to-br from-yellow-100 via-orange-200 to-amber-100 dark:from-black dark:via-yellow-950/20 dark:to-gray-900',
        messageClass: 'bg-yellow-600 dark:bg-yellow-700 text-white rounded-tr-none',
        sidebarClass: 'bg-yellow-300/10 dark:bg-yellow-950/10',
        panelClass: 'bg-yellow-300/10 dark:bg-yellow-950/10',
        inputClass: 'bg-yellow-300/15 dark:bg-yellow-900/10 border-yellow-400/10 dark:border-yellow-500/10 backdrop-blur-3xl',
        accentClass: 'bg-yellow-600 hover:bg-yellow-700 text-white',
        effectType: 'stars',
        description: 'Jazz night',
        colors: { primary: '#ca8a04' },
        moodSound: 'jazz'
    }
};

export const getVibeById = (vibeId) => {
    return VIBES[vibeId] || VIBES.default;
};

export const getAllVibes = () => {
    return Object.values(VIBES);
};
