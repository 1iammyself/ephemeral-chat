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
        bgClass: 'bg-blue-200 dark:bg-black',
        messageClass: 'bg-primary-600 dark:bg-primary-700 text-white rounded-tr-none',
        sidebarClass: 'bg-transparent dark:bg-gray-950/40',
        panelClass: 'bg-transparent dark:bg-gray-950/40 dark:border-b dark:border-white/5',
        inputClass: 'bg-transparent dark:bg-white/5 border-transparent dark:border-white/10 backdrop-blur-3xl',
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
        bgClass: 'bg-gradient-to-br from-indigo-300 via-purple-300 to-pink-300 dark:from-indigo-950 dark:via-purple-950 dark:to-pink-900',
        messageClass: 'bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-700 dark:to-purple-700 text-white rounded-tr-none',
        sidebarClass: 'bg-transparent dark:bg-indigo-950/20',
        panelClass: 'bg-transparent dark:bg-indigo-950/20 dark:border-b dark:border-indigo-500/10',
        inputClass: 'bg-transparent dark:bg-indigo-500/10 border-transparent dark:border-indigo-500/20 backdrop-blur-3xl',
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
        emoji: '🕶️',
        bgClass: 'bg-gradient-to-br from-teal-300 via-cyan-300 to-emerald-300 dark:from-teal-950 dark:via-cyan-950 dark:to-emerald-900',
        messageClass: 'bg-teal-600 dark:bg-teal-700 text-white rounded-tr-none',
        sidebarClass: 'bg-transparent dark:bg-teal-950/20',
        panelClass: 'bg-transparent dark:bg-teal-950/20 dark:border-b dark:border-teal-500/10',
        inputClass: 'bg-transparent dark:bg-teal-500/10 border-transparent dark:border-teal-500/20 backdrop-blur-3xl',
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
        bgClass: 'bg-gradient-to-br from-amber-300 via-orange-300 to-yellow-300 dark:from-amber-950 dark:via-orange-950 dark:to-yellow-950',
        messageClass: 'bg-orange-600 dark:bg-orange-700 text-white rounded-tr-none',
        sidebarClass: 'bg-transparent dark:bg-amber-950/20',
        panelClass: 'bg-transparent dark:bg-amber-950/20 dark:border-b dark:border-amber-500/10',
        inputClass: 'bg-transparent dark:bg-orange-500/10 border-transparent dark:border-orange-500/20 backdrop-blur-3xl',
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
        bgClass: 'bg-gradient-to-br from-rose-400 via-rose-300 to-rose-400 dark:bg-rose-950/80 dark:backdrop-blur-xl',
        messageClass: 'bg-rose-600 dark:bg-rose-900/60 text-white rounded-tr-none border border-rose-500/20 shadow-lg shadow-rose-500/10',
        sidebarClass: 'bg-transparent dark:bg-transparent',
        panelClass: 'bg-transparent dark:bg-transparent dark:border-b dark:border-rose-800/20',
        inputClass: 'bg-transparent dark:bg-transparent border-transparent dark:border-rose-900/30 backdrop-blur-3xl',
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
        bgClass: 'bg-gradient-to-br from-sky-400 via-sky-300 to-sky-400 dark:from-[#051120] dark:via-[#0a1f33] dark:to-black',
        messageClass: 'bg-sky-600 dark:bg-sky-900/60 text-white rounded-tr-none border border-sky-500/20 shadow-lg shadow-sky-500/10',
        sidebarClass: 'bg-transparent dark:bg-sky-950/20 backdrop-blur-xl',
        panelClass: 'bg-transparent dark:bg-sky-950/30 dark:backdrop-blur-2xl dark:border-b dark:border-sky-800/20',
        inputClass: 'bg-transparent dark:bg-sky-900/10 border-transparent dark:border-sky-900/30 backdrop-blur-3xl',
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
        bgClass: 'bg-gradient-to-br from-emerald-400 via-emerald-300 to-emerald-400 dark:from-[#0f1a10] dark:via-[#1a2e1d] dark:to-black',
        messageClass: 'bg-emerald-600 dark:bg-emerald-900/60 text-white rounded-tr-none border border-emerald-500/20 shadow-lg shadow-emerald-500/10',
        sidebarClass: 'bg-transparent dark:bg-emerald-950/20 backdrop-blur-xl',
        panelClass: 'bg-transparent dark:bg-emerald-950/30 dark:backdrop-blur-2xl dark:border-b dark:border-emerald-800/20',
        inputClass: 'bg-transparent dark:bg-emerald-900/10 border-transparent dark:border-emerald-900/30 backdrop-blur-3xl',
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
        bgClass: 'bg-gradient-to-br from-[#a1887f] via-[#bcaaa4] to-[#a1887f] dark:from-[#1b1512] dark:via-[#2a1e19] dark:to-black',
        messageClass: 'bg-[#5d4037] dark:bg-[#3e2723]/80 text-white rounded-tr-none border border-white/10 shadow-lg shadow-black/20',
        sidebarClass: 'bg-transparent dark:bg-[#1b1512]/40 backdrop-blur-xl',
        panelClass: 'bg-transparent dark:bg-[#1b1512]/50 dark:backdrop-blur-2xl dark:border-b dark:border-[#3e2723]/30',
        inputClass: 'bg-transparent dark:bg-[#3e2723]/20 border-transparent dark:border-[#3e2723]/40 backdrop-blur-3xl',
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
        bgClass: 'bg-gradient-to-br from-zinc-500 via-zinc-400 to-zinc-500 dark:from-[#09090f] dark:via-[#10101a] dark:to-black',
        messageClass: 'bg-zinc-800 dark:bg-zinc-900 text-white rounded-tr-none border border-yellow-500/10 shadow-lg shadow-black/40 relative before:absolute before:inset-0 before:bg-yellow-500/5 before:pointer-events-none',
        sidebarClass: 'bg-transparent dark:bg-[#09090f]/60 backdrop-blur-xl',
        panelClass: 'bg-transparent dark:bg-[#09090f]/50 dark:backdrop-blur-2xl dark:border-b dark:border-yellow-500/5',
        inputClass: 'bg-transparent dark:bg-transparent border-transparent dark:border-yellow-500/10 backdrop-blur-3xl',
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
