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
        accent: 'primary',
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
        accent: 'indigo',
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
        accent: 'teal',
        moodSound: 'rain'
    },
    focus: {
        id: 'focus',
        name: 'Focus',
        emoji: '🎯',
        bgClass: 'bg-gradient-to-br from-amber-200 via-orange-300 to-yellow-200 dark:from-amber-950 dark:via-orange-950 dark:to-yellow-950',
        messageClass: 'bg-orange-600 dark:bg-orange-700 text-white rounded-tr-none',
        sidebarClass: 'bg-amber-300/15 dark:bg-amber-950/20',
        panelClass: 'bg-amber-300/15 dark:bg-amber-950/20',
        inputClass: 'bg-amber-300/20 dark:bg-orange-500/10 border-amber-400/10 dark:border-orange-500/20 backdrop-blur-3xl shadow-inner',
        accentClass: 'bg-orange-600 hover:bg-orange-700 text-white',
        effectType: 'stars',
        description: 'Work mode',
        colors: { primary: '#f97316' },
        accent: 'orange',
        moodSound: 'whitenoise'
    },
    campfire: {
        id: 'campfire',
        name: 'Solace',
        emoji: '🏕️',
        bgClass: 'bg-gradient-to-br from-rose-200 via-rose-300 to-rose-200 dark:from-[#1a0f0f] dark:via-[#2d1b10] dark:to-black',
        messageClass: 'bg-rose-600 dark:bg-rose-900/60 text-white rounded-tr-none border border-rose-500/20 shadow-lg shadow-rose-500/10',
        sidebarClass: 'bg-rose-100/20 dark:bg-rose-950/20 backdrop-blur-xl',
        panelClass: 'bg-rose-50/40 dark:bg-rose-950/30 backdrop-blur-2xl',
        inputClass: 'bg-white/40 dark:bg-rose-900/10 border-rose-200 dark:border-rose-900/30 shadow-inner focus:ring-2 focus:ring-rose-500/40 transition-all',
        accentClass: 'bg-rose-600 hover:bg-rose-700 text-white shadow-md shadow-rose-600/20',
        effectType: 'embers',
        description: 'Warm and crackling',
        colors: { primary: '#e11d48' },
        accent: 'rose',
        moodSound: 'campfire'
    },
    ocean: {
        id: 'ocean',
        name: 'Abyss',
        emoji: '🌊',
        bgClass: 'bg-gradient-to-br from-sky-200 via-sky-300 to-sky-200 dark:from-[#051120] dark:via-[#0a1f33] dark:to-black',
        messageClass: 'bg-sky-600 dark:bg-sky-900/60 text-white rounded-tr-none border border-sky-500/20 shadow-lg shadow-sky-500/10',
        sidebarClass: 'bg-sky-100/20 dark:bg-sky-950/20 backdrop-blur-xl',
        panelClass: 'bg-sky-50/40 dark:bg-sky-950/30 backdrop-blur-2xl',
        inputClass: 'bg-white/40 dark:bg-sky-900/10 border-sky-200 dark:border-sky-900/30 shadow-inner focus:ring-2 focus:ring-sky-500/40 transition-all',
        accentClass: 'bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-600/20',
        effectType: 'bubbles',
        description: 'Deep and weightless',
        colors: { primary: '#0284c7' },
        accent: 'sky',
        moodSound: 'ocean'
    },
    forest: {
        id: 'forest',
        name: 'Verdant',
        emoji: '🌳',
        bgClass: 'bg-gradient-to-br from-emerald-200 via-emerald-300 to-emerald-200 dark:from-[#0f1a10] dark:via-[#1a2e1d] dark:to-black',
        messageClass: 'bg-emerald-600 dark:bg-emerald-900/60 text-white rounded-tr-none border border-emerald-500/20 shadow-lg shadow-emerald-500/10',
        sidebarClass: 'bg-emerald-100/20 dark:bg-emerald-950/20 backdrop-blur-xl',
        panelClass: 'bg-emerald-50/40 dark:bg-emerald-950/30 backdrop-blur-2xl',
        inputClass: 'bg-white/40 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-900/30 shadow-inner focus:ring-2 focus:ring-emerald-500/40 transition-all',
        accentClass: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20',
        effectType: 'fireflies',
        description: 'Earthy and ancient',
        colors: { primary: '#10b981' },
        accent: 'emerald',
        moodSound: 'forest'
    },
    cafe: {
        id: 'cafe',
        name: 'Moka',
        emoji: '☕',
        bgClass: 'bg-gradient-to-br from-[#bcaaa4] via-[#a1887f] to-[#bcaaa4] dark:from-[#1b1512] dark:via-[#2a1e19] dark:to-black',
        messageClass: 'bg-[#5d4037] dark:bg-[#3e2723]/80 text-white rounded-tr-none border border-white/10 shadow-lg shadow-black/20',
        sidebarClass: 'bg-[#d7ccc8]/20 dark:bg-[#1b1512]/40 backdrop-blur-xl',
        panelClass: 'bg-[#efebe9]/40 dark:bg-[#1b1512]/50 backdrop-blur-2xl',
        inputClass: 'bg-white/40 dark:bg-[#3e2723]/20 border-[#d7ccc8] dark:border-[#3e2723]/40 shadow-inner focus:ring-2 focus:ring-[#5d4037]/40 transition-all',
        accentClass: 'bg-[#5d4037] hover:bg-[#4e342e] text-white shadow-md shadow-[#5d4037]/20',
        effectType: 'steam',
        description: 'Roasted and cozy',
        colors: { primary: '#5d4037' },
        accent: 'stone',
        moodSound: 'cafe'
    },
    jazz: {
        id: 'jazz',
        name: 'Noire',
        emoji: '🎺',
        bgClass: 'bg-gradient-to-br from-zinc-300 via-zinc-400 to-zinc-300 dark:from-[#0a0a0f] dark:via-[#16161a] dark:to-black',
        messageClass: 'bg-zinc-800 dark:bg-zinc-900 text-white rounded-tr-none border border-yellow-500/10 shadow-lg shadow-black/40 relative before:absolute before:inset-0 before:bg-yellow-500/5 before:pointer-events-none',
        sidebarClass: 'bg-zinc-200/20 dark:bg-zinc-950/40 backdrop-blur-xl',
        panelClass: 'bg-zinc-100/40 dark:bg-zinc-950/50 backdrop-blur-2xl border-b border-white/5',
        inputClass: 'bg-white/20 dark:bg-zinc-900/20 border-zinc-300 dark:border-yellow-500/10 shadow-inner focus:ring-2 focus:ring-yellow-500/20 transition-all',
        accentClass: 'bg-yellow-600 hover:bg-yellow-500 text-white shadow-md shadow-yellow-600/20',
        effectType: 'jazz-notes',
        description: 'Smooth and moody',
        colors: { primary: '#ca8a04' },
        accent: 'yellow',
        moodSound: 'jazz'
    }
};

export const getVibeById = (vibeId) => {
    return VIBES[vibeId] || VIBES.default;
};

export const getAllVibes = () => {
    return Object.values(VIBES);
};
