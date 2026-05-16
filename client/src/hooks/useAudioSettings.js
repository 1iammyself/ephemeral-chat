import { useState, useEffect } from 'react';
import engine from '../audio/engine.js';

export function useAudioSettings() {
  const [settings, setSettings] = useState(() => engine.getSettings());

  useEffect(() => engine.onSettingsChange(setSettings), []);

  const update = (partial) => engine.updateSettings(partial);

  return { settings, update };
}
