const EVENTS = {
  // Tier A — UI microfeedback (Phase 1)
  tap:                  { category: 'ui',       priority: 'LOW',      strategy: 'single' },
  send:                 { category: 'ui',       priority: 'LOW',      strategy: 'single' },
  receive:              { category: 'ui',       priority: 'LOW',      strategy: 'single' },
  toggle:               { category: 'ui',       priority: 'LOW',      strategy: 'single' },
  modal:                { category: 'ui',       priority: 'LOW',      strategy: 'single' },
  // Tier B — Presence (Phase 1 + Phase 2)
  reaction:             { category: 'presence', priority: 'LOW',      strategy: 'composite' },
  roomJoin:             { category: 'presence', priority: 'LOW',      strategy: 'single' },
  roomLeave:            { category: 'presence', priority: 'LOW',      strategy: 'single' },
  typingNearby:         { category: 'presence', priority: 'LOW',      strategy: 'single' },
  connectionEstablished:{ category: 'presence', priority: 'LOW',      strategy: 'single' },
  // Tier C — Attention (Phase 2)
  mention:              { category: 'attention', priority: 'HIGH',    strategy: 'single' },
  roomInvite:           { category: 'attention', priority: 'HIGH',    strategy: 'single' },
  incomingCall:         { category: 'attention', priority: 'CRITICAL', strategy: 'single' },
  recordingStart:       { category: 'attention', priority: 'CRITICAL', strategy: 'single' },
  recordingStop:        { category: 'attention', priority: 'CRITICAL', strategy: 'single' },
};

export function classify(eventName) {
  return EVENTS[eventName] ?? null;
}
