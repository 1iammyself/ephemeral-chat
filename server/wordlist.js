/**
 * Themed Wordlist for Verbal Join Codes
 * Categories: Academic, Learning, Mental Health, Wellness
 * 
 * 256 words × 4 positions = 4 billion combinations (32 bits entropy)
 * Enough for verbal security with rate limiting
 */

const WORDLIST = [
    // Academic & Learning (A-Z themed)
    'algebra', 'anchor', 'archive', 'aurora', 'beacon', 'bloom', 'bridge', 'canvas',
    'chapter', 'cipher', 'clarity', 'compass', 'cosmos', 'craft', 'crystal', 'curious',
    'dawn', 'decode', 'delta', 'depth', 'discover', 'draft', 'dream', 'echo',
    'ember', 'emerge', 'enlighten', 'epoch', 'essence', 'evolve', 'explore', 'fable',
    'faculty', 'flourish', 'focus', 'forge', 'formula', 'foster', 'fountain', 'frame',
    'frontier', 'fusion', 'galaxy', 'garden', 'gather', 'genesis', 'gentle', 'glow',
    'golden', 'grace', 'gradient', 'granite', 'graph', 'gratitude', 'growth', 'guide',
    'harmony', 'haven', 'healing', 'heart', 'heritage', 'hero', 'horizon', 'humble',

    // Mental Health & Wellness
    'idea', 'ignite', 'illuminate', 'imagine', 'immerse', 'impact', 'improve', 'impulse',
    'infinite', 'insight', 'inspire', 'instinct', 'intent', 'intuition', 'invent', 'invest',
    'journey', 'journal', 'joy', 'jubilee', 'keen', 'kernel', 'keystone', 'kindle',
    'kinetic', 'knowing', 'knowledge', 'ladder', 'lantern', 'lattice', 'launch', 'lavender',
    'layer', 'legacy', 'lesson', 'lever', 'library', 'light', 'liminal', 'linear',
    'listen', 'logic', 'lotus', 'lucid', 'lunar', 'maple', 'margin', 'marvel',
    'mastery', 'meadow', 'meaning', 'meditate', 'melody', 'memoir', 'memory', 'mend',
    'mental', 'mentor', 'merit', 'method', 'mindful', 'mirror', 'mission', 'moment',

    // Growth & Resilience
    'mosaic', 'motive', 'mountain', 'mural', 'muse', 'nature', 'nectar', 'nerve',
    'neural', 'neutral', 'noble', 'north', 'notable', 'notion', 'nourish', 'novel',
    'nucleus', 'nurture', 'oak', 'oasis', 'observe', 'ocean', 'odyssey', 'olive',
    'omega', 'onward', 'open', 'optimist', 'orbit', 'orchid', 'origin', 'outline',
    'outlook', 'oxygen', 'pace', 'palette', 'panorama', 'paradigm', 'parallel', 'parcel',
    'passage', 'passion', 'path', 'patience', 'pattern', 'pause', 'peace', 'peak',
    'pearl', 'pebble', 'pendulum', 'perceive', 'persist', 'phoenix', 'phrase', 'pillar',
    'pinnacle', 'pioneer', 'pivot', 'pixel', 'placid', 'planet', 'plateau', 'pledge',

    // Positive Psychology
    'plume', 'poetry', 'polaris', 'ponder', 'portal', 'positive', 'potential', 'practice',
    'praxis', 'precise', 'presence', 'present', 'preserve', 'prism', 'process', 'profound',
    'progress', 'promise', 'proof', 'prosper', 'protect', 'prowess', 'pulse', 'purpose',
    'puzzle', 'pyramid', 'quartz', 'quest', 'quiet', 'radiant', 'radius', 'rainbow',
    'range', 'rapport', 'reach', 'reason', 'rebound', 'recall', 'reclaim', 'recover',
    'reflect', 'reform', 'refuge', 'regain', 'relate', 'relax', 'release', 'relief',
    'renew', 'repair', 'replenish', 'resonate', 'respect', 'restore', 'retreat', 'reveal',
    'revive', 'rhythm', 'ridge', 'ripple', 'rise', 'ritual', 'river', 'robust'
];

// Ensure exactly 256 words for clean bit alignment
if (WORDLIST.length !== 256) {
    throw new Error(`Wordlist must have exactly 256 words, got ${WORDLIST.length}`);
}

module.exports = { WORDLIST };
