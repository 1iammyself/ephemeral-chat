/**
 * Ephemeral Chat - Popup Script
 * Handles UI interactions in the extension popup
 */

const CHAT_URL = 'https://chat.kyere.me';

// DOM Elements
const createRoomBtn = document.getElementById('createRoomBtn');
const openWebBtn = document.getElementById('openWebBtn');
const verbalCodeInput = document.getElementById('verbalCodeInput');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const recentRoomsList = document.getElementById('recentRoomsList');
const settingsBtn = document.getElementById('settingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const backBtn = document.getElementById('backBtn');
const notificationsToggle = document.getElementById('notificationsToggle');
const soundToggle = document.getElementById('soundToggle');
const newTabToggle = document.getElementById('newTabToggle');
const clearDataBtn = document.getElementById('clearDataBtn');
const themeToggle = document.getElementById('themeToggle');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadRecentRooms();
  loadSettings();
  loadTheme();
  setupEventListeners();
});

// Event Listeners
function setupEventListeners() {
  // Create Room - opens web app with create modal trigger
  createRoomBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: `${CHAT_URL}?action=create` });
    window.close();
  });

  // Open Web App
  openWebBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: CHAT_URL });
    window.close();
  });

  // Join Room with verbal code
  joinRoomBtn.addEventListener('click', joinRoom);
  verbalCodeInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') joinRoom();
  });

  // Format verbal code as lowercase
  verbalCodeInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.toLowerCase();
  });

  // Theme toggle
  themeToggle.addEventListener('click', toggleTheme);

  // Settings
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
  });

  backBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  // Settings toggles
  notificationsToggle.addEventListener('change', saveSettings);
  soundToggle.addEventListener('change', saveSettings);
  newTabToggle.addEventListener('change', saveSettings);

  // Clear data
  clearDataBtn.addEventListener('click', clearAllData);
}

// Join Room with verbal code (4 words)
function joinRoom() {
  const verbalCode = verbalCodeInput.value.trim().toLowerCase();
  
  if (!verbalCode) {
    verbalCodeInput.focus();
    verbalCodeInput.style.borderColor = '#EF4444';
    setTimeout(() => {
      verbalCodeInput.style.borderColor = '';
    }, 1000);
    return;
  }

  // Validate: should be 4 words
  const words = verbalCode.split(/\s+/).filter(w => w.length > 0);
  if (words.length !== 4) {
    alert('Please enter 4 words (e.g., "round build eagle small")');
    return;
  }

  // Open the join page with verbal code - the web app will handle validation
  const formattedCode = words.join(' ');
  chrome.tabs.create({ url: `${CHAT_URL}?join=${encodeURIComponent(formattedCode)}` });
  window.close();
}

// Load Recent Rooms
async function loadRecentRooms() {
  const result = await chrome.storage.local.get(['recentRooms']);
  const rooms = result.recentRooms || [];

  if (rooms.length === 0) {
    recentRoomsList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
        <p>No recent rooms</p>
      </div>
    `;
    return;
  }

  recentRoomsList.innerHTML = rooms.map(room => `
    <div class="room-item" data-code="${room.code}">
      <div class="room-info">
        <span class="room-code">${room.code}</span>
        <span class="room-time">${formatTime(room.lastAccessed)}</span>
      </div>
      <div class="room-actions">
        <button class="room-btn open" title="Open room">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        </button>
        <button class="room-btn delete" title="Remove">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  // Add click handlers
  recentRoomsList.querySelectorAll('.room-item').forEach(item => {
    const code = item.dataset.code;

    // Open room on click
    item.addEventListener('click', (e) => {
      if (!e.target.closest('.room-btn')) {
        openRoom(code);
      }
    });

    // Open button
    item.querySelector('.room-btn.open').addEventListener('click', (e) => {
      e.stopPropagation();
      openRoom(code);
    });

    // Delete button
    item.querySelector('.room-btn.delete').addEventListener('click', (e) => {
      e.stopPropagation();
      removeRoom(code);
    });
  });
}

// Open Room
function openRoom(code) {
  // Update last accessed time
  chrome.runtime.sendMessage({
    action: 'addRecentRoom',
    room: { code: code, name: `Room ${code}` }
  });

  chrome.tabs.create({ url: `${CHAT_URL}/room/${code}` });
  window.close();
}

// Remove Room
async function removeRoom(code) {
  await chrome.runtime.sendMessage({
    action: 'removeRecentRoom',
    roomCode: code
  });
  loadRecentRooms();
}

// Format time
function formatTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

// Load Settings
async function loadSettings() {
  const result = await chrome.storage.local.get(['settings']);
  const settings = result.settings || {
    notifications: true,
    soundEnabled: true,
    autoOpenInNewTab: true
  };

  notificationsToggle.checked = settings.notifications;
  soundToggle.checked = settings.soundEnabled;
  newTabToggle.checked = settings.autoOpenInNewTab;
}

// Save Settings
async function saveSettings() {
  const settings = {
    notifications: notificationsToggle.checked,
    soundEnabled: soundToggle.checked,
    autoOpenInNewTab: newTabToggle.checked
  };

  await chrome.storage.local.set({ settings });
}

// Clear All Data
async function clearAllData() {
  if (confirm('This will clear all recent rooms and settings. Continue?')) {
    await chrome.storage.local.clear();
    await chrome.storage.local.set({
      recentRooms: [],
      settings: {
        notifications: true,
        soundEnabled: true,
        autoOpenInNewTab: true
      }
    });
    loadRecentRooms();
    loadSettings();
  }
}

// Load Theme
async function loadTheme() {
  const result = await chrome.storage.local.get(['theme']);
  const theme = result.theme || 'light';
  applyTheme(theme);
}

// Toggle Theme
async function toggleTheme() {
  const result = await chrome.storage.local.get(['theme']);
  const currentTheme = result.theme || 'light';
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  await chrome.storage.local.set({ theme: newTheme });
  applyTheme(newTheme);
}

// Apply Theme
function applyTheme(theme) {
  const html = document.documentElement;
  const themeIcon = document.getElementById('themeIcon');
  
  if (theme === 'dark') {
    html.setAttribute('data-theme', 'dark');
    if (themeIcon) {
      // Sun icon for dark mode (click to switch to light)
      themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>';
    }
  } else {
    html.setAttribute('data-theme', 'light');
    if (themeIcon) {
      // Moon icon for light mode (click to switch to dark)
      themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>';
    }
  }
}