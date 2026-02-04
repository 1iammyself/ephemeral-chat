/**
 * Ephemeral Chat - Background Service Worker
 * Handles notifications, alarms, and background tasks
 */

const CHAT_URL = 'https://chat.kyere.me';

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('Ephemeral Chat extension installed');
    
    // Set default settings
    chrome.storage.local.set({
      recentRooms: [],
      settings: {
        notifications: true,
        soundEnabled: true,
        autoOpenInNewTab: true
      }
    });
    
    // Show welcome notification
    chrome.notifications.create('welcome', {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title: 'Ephemeral Chat Installed',
      message: 'Click the extension icon to create or join a secure chat room.',
      priority: 2
    });
  }
});

// Handle messages from popup or content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'openChat':
      openChatInNewTab(message.roomCode);
      sendResponse({ success: true });
      break;
      
    case 'createRoom':
      openChatInNewTab();
      sendResponse({ success: true });
      break;
      
    case 'getRecentRooms':
      chrome.storage.local.get(['recentRooms'], (result) => {
        sendResponse({ rooms: result.recentRooms || [] });
      });
      return true; // Keep channel open for async response
      
    case 'addRecentRoom':
      addRecentRoom(message.room);
      sendResponse({ success: true });
      break;
      
    case 'removeRecentRoom':
      removeRecentRoom(message.roomCode);
      sendResponse({ success: true });
      break;
      
    case 'showNotification':
      showNotification(message.title, message.body, message.roomCode);
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ error: 'Unknown action' });
  }
});

// Open chat in new tab
function openChatInNewTab(roomCode = null) {
  const url = roomCode ? `${CHAT_URL}/room/${roomCode}` : CHAT_URL;
  chrome.tabs.create({ url });
}

// Add room to recent rooms list
async function addRecentRoom(room) {
  const result = await chrome.storage.local.get(['recentRooms']);
  let rooms = result.recentRooms || [];
  
  // Remove if already exists (to move to top)
  rooms = rooms.filter(r => r.code !== room.code);
  
  // Add to beginning
  rooms.unshift({
    code: room.code,
    name: room.name || `Room ${room.code}`,
    lastAccessed: Date.now()
  });
  
  // Keep only last 10 rooms
  rooms = rooms.slice(0, 10);
  
  await chrome.storage.local.set({ recentRooms: rooms });
}

// Remove room from recent list
async function removeRecentRoom(roomCode) {
  const result = await chrome.storage.local.get(['recentRooms']);
  let rooms = result.recentRooms || [];
  rooms = rooms.filter(r => r.code !== roomCode);
  await chrome.storage.local.set({ recentRooms: rooms });
}

// Show notification
function showNotification(title, body, roomCode) {
  chrome.notifications.create(`room-${roomCode}-${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: body,
    priority: 2,
    buttons: roomCode ? [{ title: 'Open Chat' }] : []
  });
}

// Handle notification button clicks
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId.startsWith('room-') && buttonIndex === 0) {
    const parts = notificationId.split('-');
    const roomCode = parts[1];
    if (roomCode && roomCode !== 'undefined') {
      openChatInNewTab(roomCode);
    }
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('room-')) {
    const parts = notificationId.split('-');
    const roomCode = parts[1];
    if (roomCode && roomCode !== 'undefined') {
      openChatInNewTab(roomCode);
    }
  } else {
    // Open main page
    openChatInNewTab();
  }
});

// Clean up old rooms periodically (older than 7 days)
chrome.alarms.create('cleanupRooms', { periodInMinutes: 60 * 24 }); // Daily

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanupRooms') {
    cleanupOldRooms();
  }
});

async function cleanupOldRooms() {
  const result = await chrome.storage.local.get(['recentRooms']);
  let rooms = result.recentRooms || [];
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  rooms = rooms.filter(r => r.lastAccessed > sevenDaysAgo);
  await chrome.storage.local.set({ recentRooms: rooms });
}
