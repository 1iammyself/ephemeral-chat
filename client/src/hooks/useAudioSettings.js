import { useState, useEffect, useCallback } from 'react';
import engine from '../audio/engine.js';
import { THEME_NAMES } from '../audio/themes.js';

export { THEME_NAMES };

export function useAudioSettings() {
  const [settings, setSettings] = useState(() => engine.getSettings());

  useEffect(() => engine.onSettingsChange(setSettings), []);

  const update = useCallback((partial) => engine.updateSettings(partial), []);

  return { settings, update };
}
