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

// Block print screen
document.addEventListener('keyup', (e) => {
  if (e.key === 'PrintScreen') {
    navigator.clipboard.writeText('');
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
