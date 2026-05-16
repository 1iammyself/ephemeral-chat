let _ctx = {
  inCall: false,
  recording: false,
  activeRoom: false,
  headsetConnected: false,
  hiddenTab: false,
  lowPowerMode: false,
  performanceMode: 'full', // 'full' | 'balanced' | 'lowPower'
};

export function setContext(partial) {
  _ctx = { ..._ctx, ...partial };
}

export function getContext() {
  return { ..._ctx };
}
