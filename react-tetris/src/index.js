import React from 'react';
import { render } from 'react-dom';
import { Provider } from 'react-redux';
import store from './store';
import App from './containers/';
import './unit/const';
import './control';
import { subscribeRecord } from './unit';

subscribeRecord(store);

// ── Multiplayer bridge ──────────────────────────────────────────────────────
window.__tetrisStore = store;

let prevClearLines = store.getState().get('clearLines');
let prevReset = store.getState().get('reset');
let lastStateBroadcast = 0;

store.subscribe(() => {
  const state = store.getState();
  const now = Date.now();

  const isReset = state.get('reset');

  // Game over: reset just became true
  if (isReset && !prevReset) {
    window.parent.postMessage({
      type: 'TETRIS_GAME_OVER',
      score: state.get('points'),
      lines: state.get('clearLines'),
    }, '*');
  }

  // New game: reset became false (player hit reset after game over)
  if (!isReset && prevReset) {
    prevClearLines = 0;
  }

  prevReset = isReset;

  // Line clear detection
  const currentLines = state.get('clearLines');
  if (currentLines > prevClearLines) {
    window.parent.postMessage({
      type: 'TETRIS_LINES_CLEARED',
      count: currentLines - prevClearLines,
    }, '*');
  }
  prevClearLines = currentLines;

  // Throttled board state broadcast for opponent minimap / spectators
  if (now - lastStateBroadcast >= 150) {
    lastStateBroadcast = now;
    window.parent.postMessage({
      type: 'TETRIS_STATE',
      score: state.get('points'),
      lines: state.get('clearLines'),
      level: state.get('speedRun'),
      matrix: state.get('matrix').toJS(),
    }, '*');
  }
});

// Receive commands from parent frame
window.addEventListener('message', (event) => {
  if (!event.data || !event.data.type) return;
  const state = store.getState();

  if (event.data.type === 'TETRIS_ADD_GARBAGE') {
    // Only add garbage when a piece is falling (cur exists) and not locked/paused/over
    if (!state.get('lock') && !state.get('reset') && state.get('cur')) {
      store.dispatch({ type: 'ADD_GARBAGE', count: event.data.count });
    }
  }
});

// Signal to parent that the game is ready
window.parent.postMessage({ type: 'TETRIS_READY' }, '*');
// ────────────────────────────────────────────────────────────────────────────

render(
  <Provider store={store}>
    <App />
  </Provider>,
  document.getElementById('root')
);
