const EVENTS = {
  tap:            { category: 'ui',       priority: 'LOW',      strategy: 'single' },
  send:           { category: 'ui',       priority: 'LOW',      strategy: 'single' },
  receive:        { category: 'ui',       priority: 'LOW',      strategy: 'single' },
  toggle:         { category: 'ui',       priority: 'LOW',      strategy: 'single' },
  modal:          { category: 'ui',       priority: 'LOW',      strategy: 'single' },
  reaction:       { category: 'presence', priority: 'LOW',      strategy: 'composite' },
  roomJoin:       { category: 'presence', priority: 'LOW',      strategy: 'single' },
  roomLeave:      { category: 'presence', priority: 'LOW',      strategy: 'single' },
  mention:        { category: 'attention', priority: 'HIGH',    strategy: 'single' },
  incomingCall:   { category: 'attention', priority: 'CRITICAL', strategy: 'single' },
  recordingStart: { category: 'attention', priority: 'CRITICAL', strategy: 'single' },
  recordingStop:  { category: 'attention', priority: 'CRITICAL', strategy: 'single' },
};

export function classify(eventName) {
  return EVENTS[eventName] ?? null;
}
