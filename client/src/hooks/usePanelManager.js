import { useState, useRef, useCallback } from 'react';

const BASE_Z = 220;

export function usePanelManager() {
  const [panels, setPanels] = useState({});
  const counter = useRef(BASE_Z);

  const openPanel = useCallback((id) => {
    counter.current += 1;
    const z = counter.current;
    setPanels(prev => ({ ...prev, [id]: { open: true, z } }));
  }, []);

  const closePanel = useCallback((id) => {
    setPanels(prev => ({ ...prev, [id]: { ...prev[id], open: false } }));
  }, []);

  const focusPanel = useCallback((id) => {
    setPanels(prev => {
      const maxZ = Math.max(BASE_Z, ...Object.values(prev).map(p => p.z ?? BASE_Z));
      if ((prev[id]?.z ?? 0) >= maxZ) return prev;
      counter.current = maxZ + 1;
      return { ...prev, [id]: { ...prev[id], z: maxZ + 1 } };
    });
  }, []);

  const isOpen = useCallback((id) => panels[id]?.open === true, [panels]);
  const getZ   = useCallback((id) => panels[id]?.z ?? BASE_Z, [panels]);

  return { openPanel, closePanel, focusPanel, isOpen, getZ };
}
