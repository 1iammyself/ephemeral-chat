// Phase 3 sound themes — parameter sets applied to all synths.
// Themes control pitch, gain, and synthesis character.
// The engine resolves the active theme and passes it into each synth call.

export const THEMES = {
  default: {
    name: 'Default',
    pitchMult: 1.0,
    gainMult: 1.0,
    character: 'glass',      // sine-dominant, soft saturation
    ambientColor: 'airy',
  },
  'cyberpunk': {
    name: 'Cyberpunk',
    pitchMult: 1.2,
    gainMult: 1.1,
    character: 'digital',    // slight FM coloration, saw-ish
    ambientColor: 'neon',
  },
  'soft-ambient': {
    name: 'Soft Ambient',
    pitchMult: 0.85,
    gainMult: 0.88,
    character: 'warm',       // triangle-dominant, slower envelopes
    ambientColor: 'warm',
  },
  'minimal-glass': {
    name: 'Minimal Glass',
    pitchMult: 1.0,
    gainMult: 0.72,
    character: 'glass',
    ambientColor: 'airy',
  },
  'gaming': {
    name: 'Gaming',
    pitchMult: 1.15,
    gainMult: 1.18,
    character: 'percussive',  // faster attacks, brighter
    ambientColor: 'game',
  },
  'retro-terminal': {
    name: 'Retro Terminal',
    pitchMult: 0.78,
    gainMult: 0.95,
    character: 'retro',       // square wave at low gain, slightly muffled
    ambientColor: 'terminal',
  },
  'lo-fi': {
    name: 'Lo-Fi',
    pitchMult: 0.9,
    gainMult: 0.82,
    character: 'detuned',     // slight random detune, warmer
    ambientColor: 'lofi',
  },
};

export function getTheme(name) {
  return THEMES[name] ?? THEMES.default;
}

export const THEME_NAMES = Object.keys(THEMES);
