/**
 * Ephemeral Chat - Content Script
 * Runs on chat.kyere.me to communicate with the extension
 */

// Notify extension when user joins a room
function notifyRoomJoin() {
  const match = window.location.pathname.match(/\/room\/([A-Z0-9]{10})/i);
  if (match) {
    const roomCode = match[1].toUpperCase();
    
    // Send to extension background
    chrome.runtime.sendMessage({
      action: 'addRecentRoom',
      room: {
        code: roomCode,
        name: `Room ${roomCode}`
      }
    }).catch(() => {
      // Extension might not be installed, ignore
    });
  }
}

// Listen for new messages (for notifications)
function setupMessageListener() {
  // Listen for custom events from the web app
  window.addEventListener('ephemeral-new-message', (event) => {
    const { title, body, roomCode } = event.detail;
    
    // Only notify if tab is not focused
    if (document.hidden) {
      chrome.runtime.sendMessage({
        action: 'showNotification',
        title: title,
        body: body,
        roomCode: roomCode
      }).catch(() => {});
    }
  });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  notifyRoomJoin();
  setupMessageListener();
});

// Also run on navigation within SPA
let lastPath = window.location.pathname;
const observer = new MutationObserver(() => {
  if (window.location.pathname !== lastPath) {
    lastPath = window.location.pathname;
    notifyRoomJoin();
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Listen for URL changes via History API
const originalPushState = history.pushState;
history.pushState = function(...args) {
  originalPushState.apply(this, args);
  notifyRoomJoin();
};

const originalReplaceState = history.replaceState;
history.replaceState = function(...args) {
  originalReplaceState.apply(this, args);
  notifyRoomJoin();
};

window.addEventListener('popstate', notifyRoomJoin);

console.log('Ephemeral Chat extension content script loaded');
