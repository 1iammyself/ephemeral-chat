import { useCallback } from 'react';
import engine from '../audio/engine.js';

export function useSound() {
  const emit = useCallback((eventName) => {
    engine.emit(eventName);
  }, []);

  const setSoundContext = useCallback((partial) => {
    engine.setContext(partial);
  }, []);

  return { emit, setSoundContext };
}
