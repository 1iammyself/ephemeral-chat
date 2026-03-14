/**
 * Ephemeral Chat - Preload Script
 * Securely exposes limited APIs to the renderer
 */

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods to the renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // App info
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // Notifications
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),

  // Updates
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // System
  getSystemIdleTime: () => ipcRenderer.invoke('get-system-idle-time'),
  setBadge: (count) => ipcRenderer.invoke('set-badge', count),

  // Link handling
  openUrlExternal: (url) => ipcRenderer.invoke('open-url-external', url),
  openUrlInApp: (url) => ipcRenderer.invoke('open-url-in-app', url),

  // Platform detection
  platform: process.platform,
  isElectron: true,

  // Event listeners
  onUpdateAvailable: (callback) => {
    ipcRenderer.on('update-available', (event, info) => callback(info));
  },
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, info) => callback(info));
  },
  onToggleStealth: (callback) => {
    ipcRenderer.on('toggle-stealth', () => callback());
  },
  onToggleOverrideTtl: (callback) => {
    ipcRenderer.on('toggle-override-ttl', () => callback());
  },
  onPanicBurn: (callback) => {
    ipcRenderer.on('panic-burn', () => callback());
  },
  onToggleAnonymous: (callback) => {
    ipcRenderer.on('toggle-anonymous', () => callback());
  },

  // Proximity / Nearby Transfer
  proximity: {
    getNetworkInfo: () => ipcRenderer.invoke('proximity-get-network-info'),
    getLocalIp: () => ipcRenderer.invoke('proximity-get-local-ip'),
    getDeviceId: () => ipcRenderer.invoke('proximity-get-device-id'),
    getDeviceName: () => ipcRenderer.invoke('proximity-get-device-name'),
    saveFile: (fileData) => ipcRenderer.invoke('proximity-save-file', fileData),
    showInFolder: (filePath) => ipcRenderer.invoke('proximity-show-in-folder', filePath),
    openFile: (filePath) => ipcRenderer.invoke('proximity-open-file', filePath)
  },

  // Native QUIC Proximity (Rust engine)
  proximityNative: {
    init: (options) => ipcRenderer.invoke('proximity-native-init', options),
    start: () => ipcRenderer.invoke('proximity-native-start'),
    stop: () => ipcRenderer.invoke('proximity-native-stop'),
    isAvailable: () => ipcRenderer.invoke('proximity-native-is-available'),
    getPeers: () => ipcRenderer.invoke('proximity-native-get-peers'),
    connect: (address) => ipcRenderer.invoke('proximity-native-connect', address),
    getPairingCode: (peerId) => ipcRenderer.invoke('proximity-native-pairing-code', peerId),
    sendFile: (peerId, filePath) => ipcRenderer.invoke('proximity-native-send-file', peerId, filePath),
    acceptTransfer: (transferId) => ipcRenderer.invoke('proximity-native-accept-transfer', transferId),
    rejectTransfer: (transferId) => ipcRenderer.invoke('proximity-native-reject-transfer', transferId),
    cancelTransfer: (transferId) => ipcRenderer.invoke('proximity-native-cancel-transfer', transferId),
    // Swarm
    createSwarm: () => ipcRenderer.invoke('proximity-native-create-swarm'),
    joinSwarm: (swarmId, knownPeers) => ipcRenderer.invoke('proximity-native-join-swarm', swarmId, knownPeers),
    leaveSwarm: () => ipcRenderer.invoke('proximity-native-leave-swarm'),
    getSwarmInfo: () => ipcRenderer.invoke('proximity-native-swarm-info'),
    calculateRoute: (source, dest, parallelPaths) => ipcRenderer.invoke('proximity-native-swarm-route', source, dest, parallelPaths),
    // Event listener
    onEvent: (callback) => {
      ipcRenderer.on('proximity-native-event', (event, data) => callback(data));
    },
    offEvent: () => {
      ipcRenderer.removeAllListeners('proximity-native-event');
    },
  },

  // ─── Security Stack (MASQUE, OHTTP, Privacy Pass, Crypto) ───
  security: {
    // MASQUE / QUIC tunnel
    masqueInit: (proxyUrl) => ipcRenderer.invoke('security-masque-init', { proxyUrl }),
    masqueIsAvailable: () => ipcRenderer.invoke('security-masque-is-available'),
    masqueSend: (target, payload) => ipcRenderer.invoke('security-masque-send', { target, payload }),

    // OHTTP config (fetched via Node net — no browser fingerprint)
    ohttpFetchConfig: (configUrl) => ipcRenderer.invoke('security-ohttp-fetch-config', { configUrl }),

    // Privacy Pass token management (backed by main process memory)
    ppStoreTokens: (tokens) => ipcRenderer.invoke('security-pp-store-tokens', tokens),
    ppGetToken: () => ipcRenderer.invoke('security-pp-get-token'),
    ppGetCount: () => ipcRenderer.invoke('security-pp-get-count'),

    // Crypto RNG (Node CSPRNG fallback)
    randomBytes: (size) => ipcRenderer.invoke('security-random-bytes', size),
  },

  // ─── Now Playing (System Media Detection) ───
  nowPlaying: {
    getStatus: () => ipcRenderer.invoke('now-playing-get-status'),
    startPolling: (intervalMs) => ipcRenderer.invoke('now-playing-start-polling', intervalMs || 3000),
    stopPolling: () => ipcRenderer.invoke('now-playing-stop-polling'),
    onUpdate: (callback) => {
      ipcRenderer.on('now-playing-update', (event, data) => callback(data));
    },
    offUpdate: () => {
      ipcRenderer.removeAllListeners('now-playing-update');
    },
  }
});

// Security: Block dangerous keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Block DevTools shortcuts
  if (e.key === 'F12' ||
    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
    (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) ||
    (e.ctrlKey && (e.key === 'U' || e.key === 'u'))) {
    e.preventDefault();
    return false;
  }

  // Block print
  if (e.ctrlKey && (e.key === 'P' || e.key === 'p')) {
    e.preventDefault();
    return false;
  }
});

// Block print screen and notify renderer of screenshot attempt
document.addEventListener('keyup', (e) => {
  if (e.key === 'PrintScreen') {
    navigator.clipboard.writeText('');
    // Dispatch a custom event so the renderer's DesktopSecurityGuard can detect this
    window.dispatchEvent(new CustomEvent('electron-screenshot-attempt'));
  }
});

// Block right-click context menu on images
document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'IMG') {
    e.preventDefault();
  }
});

// Notify web app that we're in Electron
document.addEventListener('DOMContentLoaded', () => {
  // Add electron class to body for CSS targeting
  document.body.classList.add('electron-app');

  // Dispatch custom event that the web app can listen to
  window.dispatchEvent(new CustomEvent('electron-ready', {
    detail: {
      platform: process.platform,
      version: process.versions.electron
    }
  }));
});

// Block drag and drop of files (security)
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();
});
