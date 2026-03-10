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
    campfire: {
        id: 'campfire',
        name: 'Glow',
        emoji: '⛺',
        bgClass: 'bg-gradient-to-br from-red-50 via-rose-100 to-red-100 dark:from-red-950 dark:via-rose-950 dark:to-black',
        messageClass: 'bg-red-600 dark:bg-red-700 text-white rounded-tr-none',
        sidebarClass: 'bg-red-100/15 dark:bg-red-950/20',
        panelClass: 'bg-red-100/15 dark:bg-red-950/20',
        inputClass: 'bg-red-100/20 dark:bg-red-500/10 border-red-400/10 dark:border-red-500/20 backdrop-blur-3xl shadow-inner',
        accentClass: 'bg-red-600 hover:bg-red-700 text-white',
        effectType: 'stars',
        description: 'Warm and cozy',
        colors: { primary: '#dc2626' },
        moodSound: 'campfire'
    },
    ocean: {
        id: 'ocean',
        name: 'Deep Blue',
        emoji: '🐋',
        bgClass: 'bg-gradient-to-br from-blue-50 via-sky-100 to-blue-100 dark:from-blue-950 dark:via-slate-950 dark:to-black',
        messageClass: 'bg-blue-600 dark:bg-blue-700 text-white rounded-tr-none',
        sidebarClass: 'bg-blue-100/15 dark:bg-blue-950/20',
        panelClass: 'bg-blue-100/15 dark:bg-blue-950/20',
        inputClass: 'bg-blue-100/20 dark:bg-blue-500/10 border-blue-400/10 dark:border-blue-500/20 backdrop-blur-3xl shadow-inner',
        accentClass: 'bg-blue-600 hover:bg-blue-700 text-white',
        effectType: 'rain',
        description: 'Deep and calm',
        colors: { primary: '#2563eb' },
        moodSound: 'ocean'
    },
    forest: {
        id: 'forest',
        name: 'Wildwood',
        emoji: '�',
        bgClass: 'bg-gradient-to-br from-lime-50 via-green-100 to-emerald-50 dark:from-lime-950 dark:via-green-950 dark:to-black',
        messageClass: 'bg-green-600 dark:bg-green-700 text-white rounded-tr-none',
        sidebarClass: 'bg-green-100/15 dark:bg-green-950/20',
        panelClass: 'bg-green-100/15 dark:bg-green-950/20',
        inputClass: 'bg-green-100/20 dark:bg-green-500/10 border-green-400/10 dark:border-green-500/20 backdrop-blur-3xl shadow-inner',
        accentClass: 'bg-green-600 hover:bg-green-700 text-white',
        effectType: 'fireflies',
        description: 'Fresh and natural',
        colors: { primary: '#16a34a' },
        moodSound: 'forest'
    },
    cafe: {
        id: 'cafe',
        name: 'Bistro',
        emoji: '🍽️',
        bgClass: 'bg-gradient-to-br from-stone-200 via-orange-100 to-stone-300 dark:from-stone-900 dark:via-orange-950/40 dark:to-black',
        messageClass: 'bg-orange-900 dark:bg-orange-950 text-white rounded-tr-none border border-orange-800/30',
        sidebarClass: 'bg-stone-300/15 dark:bg-stone-950/20',
        panelClass: 'bg-stone-300/15 dark:bg-stone-950/20',
        inputClass: 'bg-stone-300/20 dark:bg-orange-900/10 border-stone-400/10 dark:border-orange-900/20 backdrop-blur-3xl shadow-inner',
        accentClass: 'bg-orange-900 hover:bg-black text-white',
        effectType: null,
        description: 'Busy and productive',
        colors: { primary: '#7c2d12' },
        moodSound: 'cafe'
    },
    jazz: {
        id: 'jazz',
        name: 'After Hours',
        emoji: '🕶️',
        bgClass: 'bg-gradient-to-br from-slate-300 via-zinc-400 to-slate-400 dark:from-slate-950 dark:via-zinc-950 dark:to-black',
        messageClass: 'bg-zinc-800 dark:bg-zinc-900 text-white rounded-tr-none border border-yellow-500/20',
        sidebarClass: 'bg-slate-400/15 dark:bg-slate-950/20',
        panelClass: 'bg-slate-400/15 dark:bg-slate-950/20',
        inputClass: 'bg-slate-400/20 dark:bg-zinc-900/40 border-yellow-500/10 dark:border-yellow-500/20 backdrop-blur-3xl shadow-inner',
        accentClass: 'bg-yellow-600 hover:bg-yellow-700 text-white',
        effectType: 'stars',
        description: 'Smooth and rhythmic',
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
