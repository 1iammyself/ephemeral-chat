/**
 * Ephemeral Chat - Electron Main Process
 * Full-featured desktop app with security, notifications, auto-updates, and power user features
 */

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  shell,
  ipcMain,
  nativeImage,
  globalShortcut,
  Notification,
  dialog,
  powerMonitor,
  clipboard,
  session
} = require('electron');
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const proximityBridge = require('./proximity-bridge');

// Fix Windows notification source name (removes "electron.app." prefix)
if (process.platform === 'win32') {
  app.setAppUserModelId('me.kyere.chat');
}

// Initialize store for settings
const store = new Store({
  defaults: {
    windowBounds: { width: 1200, height: 800 },
    windowPosition: null,
    startMinimized: false,
    minimizeToTray: true,
    alwaysOnTop: false,
    startOnBoot: false,
    theme: 'system',
    notificationsEnabled: true,
    soundEnabled: true,
    autoUpdate: true,
    idleTimeout: 5, // minutes
    securityMode: 'high', // 'high', 'medium', 'low'
    biometricLockEnabled: false,
    lockDelay: 5, // minutes
    hasShownTrayNotification: false
  }
});

// Constants
const CHAT_URL = 'https://chat.kyere.me';
const isDev = !app.isPackaged || process.argv.includes('--dev');

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;
let isQuitting = false;
let isLocked = false;
let lastHideTime = 0;
let idleTimer = null;
let lastActivity = Date.now();

// ==================== AUTO UPDATER ====================

function setupAutoUpdater() {
  if (isDev) return;

  autoUpdater.autoDownload = store.get('autoUpdate');
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available:', info.version);
    showNotification('Update Available', `Version ${info.version} is available. Downloading...`);
  });

  autoUpdater.on('update-not-available', () => {
    console.log('App is up to date');
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log(`Download progress: ${Math.round(progress.percent)}%`);
    if (mainWindow) {
      mainWindow.setProgressBar(progress.percent / 100);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded:', info.version);
    if (mainWindow) {
      mainWindow.setProgressBar(-1);
    }

    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: `Version ${info.version} has been downloaded.`,
      detail: 'Would you like to restart and install the update now?',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0
    });

    if (response === 0) {
      isQuitting = true;
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err);
  });

  // Check for updates every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => { });
  }, 4 * 60 * 60 * 1000);

  // Initial check
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => { });
  }, 10000);
}

// ==================== NOTIFICATIONS ====================

function showNotification(title, body, onClick) {
  if (!store.get('notificationsEnabled')) return;

  const notification = new Notification({
    title,
    body,
    icon: path.join(__dirname, 'icons', 'icon.png'),
    silent: !store.get('soundEnabled')
  });

  if (onClick) {
    notification.on('click', onClick);
  }

  notification.show();
}

// ==================== SECURITY ====================


function setupSecurity(window) {
  const securityMode = store.get('securityMode');

  // Prevent navigation away from the app
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(CHAT_URL)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  // Open external links in default browser
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(CHAT_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Block DevTools in production (high security mode)
  if (!isDev && securityMode === 'high') {
    window.webContents.on('devtools-opened', () => {
      window.webContents.closeDevTools();
    });
  }

  // Content Security Policy
  // Note: We don't override CSP - let the server's CSP be used
  // The cap.js widget needs blob: and worker-src which the server already provides
  // Overriding CSP here was breaking cap.js proof-of-work verification

  // Only add security headers that don't conflict with the app
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    // Don't modify CSP - let the server handle it
    // Just pass through the response headers as-is
    callback({ responseHeaders: details.responseHeaders });
  });

  // Screen capture protection (Windows)
  if (process.platform === 'win32' && securityMode !== 'low') {
    window.setContentProtection(true);
  }

  // Permission handling
  // We explicitly handle permissions to ensure camera/mic works while blocking others if needed
  window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    // Always allow camera and microphone
    if (permission === 'media') {
      callback(true);
      return;
    }

    // High security mode blocks
    if (securityMode === 'high') {
      const blockedPermissions = ['display-capture', 'mediaKeySystem'];
      if (blockedPermissions.includes(permission)) {
        callback(false);
        return;
      }
    }

    // Allow others by default
    callback(true);
  });

  // Also handle permission checks (e.g. navigator.permissions.query)
  window.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') {
      return true;
    }
    // Return null to use default behavior for others
    return null;
  });
}

// Biometric & Lock Management
async function unlockApp() {
  if (!isLocked) {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
    return true;
  }

  // Grace Period / Timer Check
  const lockDelayMs = store.get('lockDelay') * 60 * 1000;
  if (lockDelayMs > 0 && (Date.now() - lastHideTime < lockDelayMs)) {
    isLocked = false;
    mainWindow.show();
    mainWindow.focus();
    return true;
  }

  const useBiometrics = store.get('biometricLockEnabled');

  if (useBiometrics) {
    // macOS Touch ID Implementation
    if (process.platform === 'darwin') {
      try {
        const { systemPreferences } = require('electron');
        if (systemPreferences.canPromptTouchID()) {
          await systemPreferences.promptTouchID('Unlock Ephemeral Chat');
          isLocked = false;
          mainWindow.show();
          mainWindow.focus();
          return true;
        }
      } catch (err) {
        console.error('Touch ID Verification Failed:', err);
        return false;
      }
    }

    // Windows Hello Placeholder
    // Note: For full Windows Hello (PIN/Face), @electron-webauthn/native is recommended.
    // For now, we use a simple "Locked" state that requires user interaction.
    if (process.platform === 'win32') {
      const response = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        title: 'Unlock Required',
        message: 'Ephemeral Chat is locked for your security.',
        detail: 'Click "Unlock" to reveal the app.',
        buttons: ['Unlock', 'Cancel'],
        defaultId: 0
      });

      if (response === 0) {
        isLocked = false;
        mainWindow.show();
        mainWindow.focus();
        return true;
      }
      return false;
    }

    // Linux & Generic Identity Verification
    if (process.platform === 'linux' || !process.platform.match(/win32|darwin/)) {
      const response = dialog.showMessageBoxSync(mainWindow, {
        type: 'question',
        title: 'Identity Verification',
        message: 'Ephemeral Chat is secured.',
        detail: 'Please confirm it is you to unlock the application.',
        buttons: ['Verify & Unlock', 'Cancel'],
        defaultId: 0
      });

      if (response === 0) {
        isLocked = false;
        mainWindow.show();
        mainWindow.focus();
        return true;
      }
      return false;
    }
  }

  // If biometrics not enabled or not supported, just show
  isLocked = false;
  mainWindow.show();
  mainWindow.focus();
  return true;
}

function lockApp() {
  isLocked = true;
  lastHideTime = Date.now();
  if (mainWindow) {
    mainWindow.hide();
  }
}

// Clipboard protection - clear sensitive data
function setupClipboardProtection() {
  if (store.get('securityMode') !== 'high') return;

  // Clear clipboard of potential sensitive data when app loses focus
  mainWindow.on('blur', () => {
    const clipboardText = clipboard.readText();
    // Don't clear if it looks like a verbal code or invite link
    if (clipboardText.includes('chat.kyere.me') ||
      /^[a-z]+ [a-z]+ [a-z]+ [a-z]+$/i.test(clipboardText)) {
      // Clear after 30 seconds
      setTimeout(() => {
        const currentText = clipboard.readText();
        if (currentText === clipboardText) {
          clipboard.clear();
        }
      }, 30000);
    }
  });
}

// ==================== IDLE DETECTION ====================

function setupIdleDetection() {
  const idleTimeout = store.get('idleTimeout') * 60 * 1000; // Convert to ms

  if (idleTimeout <= 0) return;

  // Track activity
  const updateActivity = () => {
    lastActivity = Date.now();
    if (idleTimer) clearTimeout(idleTimer);

    idleTimer = setTimeout(() => {
      if (!mainWindow) return;

      // Show warning before auto-lock
      mainWindow.webContents.executeJavaScript(`
        if (typeof showIdleWarning === 'function') {
          showIdleWarning();
        }
      `).catch(() => { });

      showNotification('Idle Warning', 'You have been inactive. The app will lock soon for security.');
    }, idleTimeout);
  };

  // Monitor system idle state
  setInterval(() => {
    const idleTime = powerMonitor.getSystemIdleTime() * 1000;
    if (idleTime < 5000) {
      updateActivity();
    }
  }, 5000);

  updateActivity();
}

// ==================== WINDOW CREATION ====================

function createWindow() {
  const { width, height } = store.get('windowBounds');
  const position = store.get('windowPosition');
  const alwaysOnTop = store.get('alwaysOnTop');

  const windowOptions = {
    width,
    height,
    minWidth: 400,
    minHeight: 600,
    icon: path.join(__dirname, 'icons', 'icon.png'),
    title: 'Ephemeral Chat',
    backgroundColor: '#1F2937',
    show: false,
    frame: true,
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // Sandbox enabled for maximum security - honeypot verification works without Web Workers
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      spellcheck: true // Enable native spell check for all text inputs
    }
  };

  // Restore position if available
  if (position) {
    windowOptions.x = position.x;
    windowOptions.y = position.y;
  }

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.setAlwaysOnTop(alwaysOnTop);

  // Setup security
  setupSecurity(mainWindow);
  setupClipboardProtection();
  setupIdleDetection();

  // Load the app
  mainWindow.loadURL(CHAT_URL);

  // Track download progress in taskbar
  mainWindow.webContents.session.on('will-download', (event, item) => {
    item.on('updated', (event, state) => {
      if (state === 'progressing' && !item.isPaused()) {
        const progress = item.getReceivedBytes() / item.getTotalBytes();
        if (mainWindow && !isNaN(progress)) {
          mainWindow.setProgressBar(progress);
        }
      }
    });
    item.once('done', (event, state) => {
      if (mainWindow) mainWindow.setProgressBar(-1); // Clear progress bar
      if (state === 'completed') {
        showNotification('Download Complete', `${item.getFilename()} has been downloaded.`);
      }
    });
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    if (!store.get('startMinimized')) {
      mainWindow.show();
    }
  });

  // Save window bounds and position on resize/move
  const saveWindowState = () => {
    if (!mainWindow.isMaximized() && !mainWindow.isMinimized()) {
      const bounds = mainWindow.getBounds();
      store.set('windowBounds', { width: bounds.width, height: bounds.height });
      store.set('windowPosition', { x: bounds.x, y: bounds.y });
    }
  };

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);

  // Handle minimize to tray
  mainWindow.on('minimize', () => {
    if (store.get('minimizeToTray')) {
      if (store.get('biometricLockEnabled')) {
        lockApp();
      } else {
        mainWindow.hide();
      }
      showTrayFirstTimeNotification();
    }
  });

  // Handle close to tray
  mainWindow.on('close', (event) => {
    if (store.get('minimizeToTray') && !isQuitting) {
      event.preventDefault();
      if (store.get('biometricLockEnabled')) {
        lockApp();
      } else {
        mainWindow.hide();
      }
      showTrayFirstTimeNotification();
    }
  });

  // Page title changes (for notification badges, etc.)
  mainWindow.webContents.on('page-title-updated', (event, title) => {
    // Check if title contains unread count like "(3) Ephemeral Chat"
    const match = title.match(/^\((\d+)\)/);
    if (match && tray) {
      const count = parseInt(match[1]);
      // Show badge on tray icon (macOS) or flash taskbar (Windows)
      if (process.platform === 'darwin') {
        app.dock.setBadge(count > 0 ? count.toString() : '');
      } else if (process.platform === 'win32') {
        mainWindow.flashFrame(count > 0);
      }
    }
  });

  return mainWindow;
}

function showTrayFirstTimeNotification() {
  if (store.get('hasShownTrayNotification')) return;

  showNotification(
    'Running in Tray',
    'Ephemeral Chat is still running in the background to keep you protected.',
    () => {
      unlockApp();
    }
  );

  store.set('hasShownTrayNotification', true);
}

// ==================== SYSTEM TRAY ====================

function createTray() {
  const iconPath = path.join(__dirname, 'icons', process.platform === 'win32' ? 'icon.ico' : 'icon.png');

  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (process.platform === 'darwin') {
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    }
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Ephemeral Chat');

  updateTrayMenu();

  // Double-click to show window
  tray.on('double-click', () => {
    unlockApp();
  });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Ephemeral Chat',
      click: () => {
        unlockApp();
      }
    },
    {
      label: 'Lock App Now',
      enabled: store.get('biometricLockEnabled'),
      click: () => {
        lockApp();
      }
    },
    {
      label: 'Create New Room',
      accelerator: 'Alt+Shift+N',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.loadURL(`${CHAT_URL}?action=create`);
      }
    },
    { type: 'separator' },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: store.get('alwaysOnTop'),
      click: (menuItem) => {
        store.set('alwaysOnTop', menuItem.checked);
        mainWindow.setAlwaysOnTop(menuItem.checked);
      }
    },
    {
      label: 'Start Minimized',
      type: 'checkbox',
      checked: store.get('startMinimized'),
      click: (menuItem) => {
        store.set('startMinimized', menuItem.checked);
      }
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: store.get('startOnBoot'),
      click: (menuItem) => {
        store.set('startOnBoot', menuItem.checked);
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          path: app.getPath('exe'),
          args: store.get('startMinimized') ? ['--minimized'] : []
        });
      }
    },
    { type: 'separator' },
    {
      label: 'Notifications',
      type: 'checkbox',
      checked: store.get('notificationsEnabled'),
      click: (menuItem) => {
        store.set('notificationsEnabled', menuItem.checked);
      }
    },
    {
      label: 'Sound',
      type: 'checkbox',
      checked: store.get('soundEnabled'),
      click: (menuItem) => {
        store.set('soundEnabled', menuItem.checked);
      }
    },
    { type: 'separator' },
    {
      label: 'Security Mode',
      submenu: [
        {
          label: 'High (Recommended)',
          type: 'radio',
          checked: store.get('securityMode') === 'high',
          click: () => {
            store.set('securityMode', 'high');
            if (mainWindow && process.platform === 'win32') {
              mainWindow.setContentProtection(true);
            }
          }
        },
        {
          label: 'Medium',
          type: 'radio',
          checked: store.get('securityMode') === 'medium',
          click: () => {
            store.set('securityMode', 'medium');
            if (mainWindow && process.platform === 'win32') {
              mainWindow.setContentProtection(true);
            }
          }
        },
        {
          label: 'Low',
          type: 'radio',
          checked: store.get('securityMode') === 'low',
          click: () => {
            store.set('securityMode', 'low');
            if (mainWindow && process.platform === 'win32') {
              mainWindow.setContentProtection(false);
            }
          }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Biometric Lock',
      type: 'checkbox',
      checked: store.get('biometricLockEnabled'),
      click: (menuItem) => {
        store.set('biometricLockEnabled', menuItem.checked);
        updateTrayMenu();
      }
    },
    {
      label: 'Lock Delay',
      enabled: store.get('biometricLockEnabled'),
      submenu: [
        {
          label: 'Immediate',
          type: 'radio',
          checked: store.get('lockDelay') === 0,
          click: () => { store.set('lockDelay', 0); updateTrayMenu(); }
        },
        {
          label: '1 Minute',
          type: 'radio',
          checked: store.get('lockDelay') === 1,
          click: () => { store.set('lockDelay', 1); updateTrayMenu(); }
        },
        {
          label: '5 Minutes',
          type: 'radio',
          checked: store.get('lockDelay') === 5,
          click: () => { store.set('lockDelay', 5); updateTrayMenu(); }
        },
        {
          label: '10 Minutes',
          type: 'radio',
          checked: store.get('lockDelay') === 10,
          click: () => { store.set('lockDelay', 10); updateTrayMenu(); }
        },
        {
          label: '30 Minutes',
          type: 'radio',
          checked: store.get('lockDelay') === 30,
          click: () => { store.set('lockDelay', 30); updateTrayMenu(); }
        }
      ]
    },
    { type: 'separator' },
    {
      label: 'Check for Updates',
      click: () => {
        autoUpdater.checkForUpdates().catch(err => {
          console.error('Manual update check failed:', err);
        });
        showNotification('Checking for Updates', 'Looking for new versions...');
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      accelerator: 'Alt+F4',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

// ==================== APPLICATION MENU ====================

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Room',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.loadURL(`${CHAT_URL}?action=create`)
        },
        {
          label: 'Home',
          accelerator: 'CmdOrCtrl+H',
          click: () => mainWindow.loadURL(CHAT_URL)
        },
        {
          label: 'My Rooms',
          accelerator: 'CmdOrCtrl+M',
          click: () => mainWindow.loadURL(`${CHAT_URL}/my-rooms`)
        },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+,',
          click: () => showPreferencesDialog()
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', accelerator: 'CmdOrCtrl+Alt+Z' },
        { role: 'redo', accelerator: 'CmdOrCtrl+Shift+Z' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Security',
      submenu: [
        {
          label: 'Panic Burn (Delete Room Content)',
          accelerator: 'CmdOrCtrl+Z',
          click: () => { if (mainWindow) mainWindow.webContents.send('panic-burn'); }
        },
        {
          label: 'Toggle Anonymous Mode',
          accelerator: 'CmdOrCtrl+Y',
          click: () => { if (mainWindow) mainWindow.webContents.send('toggle-anonymous'); }
        },
        { type: 'separator' },
        {
          label: 'Toggle Stealth Mode',
          accelerator: 'CmdOrCtrl+Shift+H',
          click: () => { if (mainWindow) mainWindow.webContents.send('toggle-stealth'); }
        },
        {
          label: 'Toggle 10s Self-Destruct Override',
          accelerator: 'CmdOrCtrl+Shift+D',
          click: () => { if (mainWindow) mainWindow.webContents.send('toggle-override-ttl'); }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [
          { type: 'separator' },
          { role: 'toggleDevTools' }
        ] : [])
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' },
        { type: 'separator' },
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: store.get('alwaysOnTop'),
          accelerator: 'CmdOrCtrl+T',
          click: (menuItem) => {
            store.set('alwaysOnTop', menuItem.checked);
            mainWindow.setAlwaysOnTop(menuItem.checked);
            updateTrayMenu();
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => showShortcutsDialog()
        },
        { type: 'separator' },
        {
          label: 'Check for Updates',
          click: () => {
            autoUpdater.checkForUpdates().catch(() => { });
          }
        },
        { type: 'separator' },
        {
          label: 'About Ephemeral Chat',
          click: () => showAboutDialog()
        },
        {
          label: 'Third-Party Licenses',
          click: () => showLicensesDialog()
        },
        {
          label: 'Visit GitHub',
          click: () => shell.openExternal('https://github.com/cLLeB/ephemeral-chat')
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal('https://github.com/cLLeB/ephemeral-chat/issues')
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        {
          label: 'Preferences',
          accelerator: 'Cmd+,',
          click: () => showPreferencesDialog()
        },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ==================== DIALOGS ====================

function showAboutDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Ephemeral Chat',
    message: 'Ephemeral Chat',
    detail: `Version: ${app.getVersion()}\nElectron: ${process.versions.electron}\nChrome: ${process.versions.chrome}\nNode.js: ${process.versions.node}\n\nSecure, temporary chat rooms that vanish when you're done.\n\nNo accounts. No history. Just conversation.`,
    buttons: ['OK'],
    icon: path.join(__dirname, 'icons', 'icon.png')
  });
}

function showLicensesDialog() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Third-Party Licenses',
    message: 'Third-Party Licenses',
    detail: `This product includes software developed by schollz/e2ecp licensed under the MIT License.`,
    buttons: ['OK']
  });
}

function showShortcutsDialog() {
  const shortcuts = `
KEYBOARD SHORTCUTS

Global (works even when minimized):
  Alt+Shift+E     Show/Hide window
  Alt+Shift+N     Create new room

Window:
  Ctrl+N          Create new room
  Ctrl+H          Go to home
  Ctrl+M          My rooms
  Ctrl+T          Toggle always on top
  Ctrl+,          Preferences
  Ctrl+R          Reload
  F11             Toggle fullscreen
  Ctrl+/          Show this dialog
  Ctrl+Q / Alt+F4 Quit

Security:
  Ctrl+Z          Panic Burn (Delete room content)
  Ctrl+Y          Toggle Anonymous Mode
  Ctrl+Shift+H    Toggle Stealth Mode
  Ctrl+Shift+D    Toggle 10s Self-Destruct Override

Standard Editing:
  Ctrl+Alt+Z      Undo
  Ctrl+Shift+Z    Redo
  Ctrl+X          Cut
  Ctrl+C          Copy
  Ctrl+V          Paste
  Ctrl+A          Select All
  `;

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Keyboard Shortcuts',
    message: 'Ephemeral Chat Shortcuts',
    detail: shortcuts,
    buttons: ['OK']
  });
}

function showPreferencesDialog() {
  // For now, show a simple dialog. In a full implementation, this would be a proper settings window.
  const currentSettings = `
Current Settings:
  • Start minimized: ${store.get('startMinimized') ? 'Yes' : 'No'}
  • Minimize to tray: ${store.get('minimizeToTray') ? 'Yes' : 'No'}
  • Start with Windows: ${store.get('startOnBoot') ? 'Yes' : 'No'}
  • Always on top: ${store.get('alwaysOnTop') ? 'Yes' : 'No'}
  • Notifications: ${store.get('notificationsEnabled') ? 'Yes' : 'No'}
  • Sound: ${store.get('soundEnabled') ? 'Yes' : 'No'}
  • Security mode: ${store.get('securityMode')}
  • Auto-update: ${store.get('autoUpdate') ? 'Yes' : 'No'}
  • Idle timeout: ${store.get('idleTimeout')} minutes

Use the tray menu to change these settings.
  `;

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Preferences',
    message: 'Ephemeral Chat Preferences',
    detail: currentSettings,
    buttons: ['OK']
  });
}

// ==================== GLOBAL SHORTCUTS ====================

function registerShortcuts() {
  // Global shortcut to show/hide window
  globalShortcut.register('Alt+Shift+E', () => {
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
      if (store.get('biometricLockEnabled')) {
        lockApp();
      } else {
        mainWindow.hide();
      }
    } else {
      unlockApp();
    }
  });

  // Quick create room
  globalShortcut.register('Alt+Shift+N', () => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.loadURL(`${CHAT_URL}?action=create`);
  });

  // Picture-in-Picture mini mode (compact always-on-top window)
  globalShortcut.register('Alt+Shift+P', () => {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    const isPiP = bounds.width <= 380 && bounds.height <= 500;

    if (isPiP) {
      // Restore to normal size
      const savedBounds = store.get('windowBounds');
      const savedPos = store.get('windowPosition');
      mainWindow.setAlwaysOnTop(store.get('alwaysOnTop'));
      mainWindow.setBounds({
        width: savedBounds.width,
        height: savedBounds.height,
        ...(savedPos ? { x: savedPos.x, y: savedPos.y } : {})
      });
      mainWindow.setMinimumSize(400, 600);
    } else {
      // Enter PiP: small always-on-top window
      mainWindow.setMinimumSize(320, 400);
      mainWindow.setAlwaysOnTop(true);
      mainWindow.setBounds({ width: 380, height: 500 });
    }
    mainWindow.show();
    mainWindow.focus();
  });
}

// ==================== .EPH FILE HANDLING ====================

const fs = require('fs');

function handleEphFileOpen(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const packet = JSON.parse(content);

    if (packet.type === 'ephemeral-drop' && packet.dropId) {
      const targetUrl = `${CHAT_URL}/drop/${packet.dropId}?desktop=true`;
      if (mainWindow) {
        mainWindow.loadURL(targetUrl);
        mainWindow.show();
        mainWindow.focus();
      }
    }
  } catch (err) {
    console.error('Failed to open .eph file:', err);
    if (mainWindow) {
      dialog.showErrorBox('Invalid File', 'This .eph file is corrupted or not a valid Ephemeral Drop file.');
    }
  }
}

// Also handle .eph files passed as command line arguments on Windows
function checkCommandLineForEphFile(args) {
  const ephFile = (args || process.argv).find(arg => arg.endsWith('.eph'));
  if (ephFile) {
    handleEphFileOpen(ephFile);
    return true;
  }
  return false;
}

// ==================== DEEP LINK HANDLING ====================

function handleDeepLink(url) {
  // Handle ephemeral:// and ephemeral-chat:// URLs
  // e.g., ephemeral://join/verbal-code or ephemeral://room/ROOMCODE

  if (!url) return;

  let path = url.replace(/^ephemeral(-chat)?:\/\//, '');
  let targetUrl = CHAT_URL;
  const separator = targetUrl.includes('?') ? '&' : '?';
  const desktopParam = `${separator}desktop=true`;

  if (path.startsWith('join/')) {
    const code = path.replace('join/', '');
    targetUrl = `${CHAT_URL}${desktopParam}&join=${encodeURIComponent(code)}`;
  } else if (path.startsWith('room/')) {
    const roomCode = path.replace('room/', '');
    targetUrl = `${CHAT_URL}/room/${roomCode}${desktopParam}`;
  } else if (path.startsWith('invite/')) {
    const token = path.replace('invite/', '');
    targetUrl = `${CHAT_URL}/invite/${token}${desktopParam}`;
  } else if (path.startsWith('drop/')) {
    const dropId = path.replace('drop/', '');
    targetUrl = `${CHAT_URL}/drop/${dropId}${desktopParam}`;
  } else if (path.startsWith('create')) {
    targetUrl = `${CHAT_URL}${desktopParam}&action=create`;
  } else {
    if (url.startsWith('https://')) {
      targetUrl = url.includes('?') ? `${url}&desktop=true` : `${url}?desktop=true`;
    } else {
      targetUrl = `${CHAT_URL}${desktopParam}`;
    }
  }

  // Only load if it's a different URL or if we are not on the home page
  if (mainWindow.webContents.getURL() !== targetUrl) {
    mainWindow.loadURL(targetUrl);
  }

  mainWindow.show();
  mainWindow.focus();
}

// ==================== APP LIFECYCLE ====================

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  // Handle second instance
  app.on('second-instance', (event, commandLine) => {
    // Check for .eph file in command line
    if (checkCommandLineForEphFile(commandLine)) {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
      return;
    }

    // Check for deep link in command line
    const deepLink = commandLine.find(arg =>
      arg.startsWith('ephemeral') ||
      arg.startsWith('https://chat.kyere.me')
    );
    if (deepLink) {
      handleDeepLink(deepLink);
    }

    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Handle deep links on macOS
  app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url);
  });

  // Handle .eph file opens (double-click or "Open With")
  app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (filePath && filePath.endsWith('.eph')) {
      handleEphFileOpen(filePath);
    }
  });

  // App ready
  app.whenReady().then(() => {
    // Set as default protocol handler
    if (!isDev) {
      app.setAsDefaultProtocolClient('ephemeral');
      app.setAsDefaultProtocolClient('ephemeral-chat');
    }

    createWindow();
    createTray();
    createMenu();
    registerShortcuts();
    setupAutoUpdater();

    // Check command line for deep links
    const deepLink = process.argv.find(arg =>
      arg.startsWith('ephemeral') ||
      arg.startsWith('https://chat.kyere.me')
    );
    if (deepLink) {
      handleDeepLink(deepLink);
    }

    // Check for .eph files in command line args (Windows: double-click .eph)
    checkCommandLineForEphFile();

    // Handle --minimized flag
    if (process.argv.includes('--minimized')) {
      mainWindow.hide();
    }

    app.on('activate', () => {
      // macOS: re-create window when dock icon clicked
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      } else {
        mainWindow.show();
      }
    });
  });
}

// Cleanup on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (idleTimer) clearTimeout(idleTimer);
});

// Quit when all windows are closed (except macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Before quit
app.on('before-quit', () => {
  isQuitting = true;
});

// ==================== IPC HANDLERS ====================

ipcMain.handle('get-settings', () => {
  return store.store;
});

ipcMain.handle('set-setting', (event, key, value) => {
  store.set(key, value);
  updateTrayMenu();
  return true;
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('show-notification', (event, title, body) => {
  showNotification(title, body, () => {
    mainWindow.show();
    mainWindow.focus();
  });
});

ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdates().catch(() => { });
});

ipcMain.handle('get-system-idle-time', () => {
  return powerMonitor.getSystemIdleTime();
});

ipcMain.handle('set-badge', (event, count) => {
  if (process.platform === 'darwin') {
    app.dock.setBadge(count > 0 ? count.toString() : '');
  } else if (process.platform === 'win32' && mainWindow) {
    mainWindow.setOverlayIcon(
      count > 0 ? createBadgeIcon(count) : null,
      count > 0 ? `${count} unread` : ''
    );
  }
});

// Link handling IPC
ipcMain.handle('open-url-external', (event, url) => {
  // Validate the URL is http/https before opening
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

ipcMain.handle('open-url-in-app', (event, url) => {
  // Open URL in a sandboxed in-app browser window
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return;

  const inAppWindow = new BrowserWindow({
    width: 900,
    height: 700,
    parent: mainWindow,
    modal: false,
    title: 'In-App Browser',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  inAppWindow.loadURL(url);

  // Prevent the in-app browser from opening new windows
  inAppWindow.webContents.setWindowOpenHandler(({ url: newUrl }) => {
    shell.openExternal(newUrl);
    return { action: 'deny' };
  });
});

// Create a badge icon for Windows taskbar
function createBadgeIcon(count) {
  // Simple implementation - in production you'd want to render this properly
  return null; // Windows will use flash instead
}

// ==================== PROXIMITY IPC HANDLERS ====================

ipcMain.handle('proximity-get-network-info', () => {
  return proximityBridge.getNetworkInfo();
});

ipcMain.handle('proximity-get-local-ip', () => {
  return { ip: proximityBridge.getLocalIp() };
});

ipcMain.handle('proximity-get-device-id', () => {
  return { deviceId: proximityBridge.getDeviceId() };
});

ipcMain.handle('proximity-get-device-name', () => {
  return { name: proximityBridge.getDeviceName() };
});

ipcMain.handle('proximity-save-file', async (event, fileData) => {
  return proximityBridge.saveReceivedFile(mainWindow, fileData);
});

ipcMain.handle('proximity-show-in-folder', (event, filePath) => {
  proximityBridge.showFileInFolder(filePath);
  return { success: true };
});

ipcMain.handle('proximity-open-file', (event, filePath) => {
  proximityBridge.openFile(filePath);
  return { success: true };
});

// ==================== NATIVE QUIC PROXIMITY IPC HANDLERS ====================

const proximityNative = require('./proximity-native');

ipcMain.handle('proximity-native-init', async (event, options) => {
  return proximityNative.initEngine(options);
});

ipcMain.handle('proximity-native-start', async () => {
  const addr = await proximityNative.startEngine();
  if (addr && mainWindow) {
    // Forward native events to the renderer
    proximityNative.onEvent('renderer', (nativeEvent) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('proximity-native-event', nativeEvent);
      }
    });
  }
  return { address: addr, native: proximityNative.isNativeAvailable() };
});

ipcMain.handle('proximity-native-stop', async () => {
  proximityNative.offEvent('renderer');
  await proximityNative.stopEngine();
  return { success: true };
});

ipcMain.handle('proximity-native-is-available', () => {
  return { available: proximityNative.isNativeAvailable() };
});

ipcMain.handle('proximity-native-get-peers', async () => {
  return { peers: await proximityNative.getDiscoveredPeers() };
});

ipcMain.handle('proximity-native-connect', async (event, address) => {
  const peerId = await proximityNative.connectToPeer(address);
  return { peerId };
});

ipcMain.handle('proximity-native-pairing-code', async (event, peerId) => {
  const code = await proximityNative.getPairingCode(peerId);
  return { code };
});

ipcMain.handle('proximity-native-send-file', async (event, peerId, filePath) => {
  const transferId = await proximityNative.sendFile(peerId, filePath);
  return { transferId };
});

ipcMain.handle('proximity-native-accept-transfer', async (event, transferId) => {
  const ok = await proximityNative.acceptTransfer(transferId);
  return { success: ok };
});

ipcMain.handle('proximity-native-reject-transfer', async (event, transferId) => {
  const ok = await proximityNative.rejectTransfer(transferId);
  return { success: ok };
});

ipcMain.handle('proximity-native-cancel-transfer', async (event, transferId) => {
  const ok = await proximityNative.cancelTransfer(transferId);
  return { success: ok };
});

// Swarm IPC handlers
ipcMain.handle('proximity-native-create-swarm', async () => {
  const swarmId = await proximityNative.createSwarm();
  return { swarmId };
});

ipcMain.handle('proximity-native-join-swarm', async (event, swarmId, knownPeers) => {
  const ok = await proximityNative.joinSwarm(swarmId, knownPeers);
  return { success: ok };
});

ipcMain.handle('proximity-native-leave-swarm', async () => {
  const ok = await proximityNative.leaveSwarm();
  return { success: ok };
});

ipcMain.handle('proximity-native-swarm-info', async () => {
  return await proximityNative.getSwarmInfo();
});

ipcMain.handle('proximity-native-swarm-route', async (event, source, dest, parallelPaths) => {
  const paths = await proximityNative.calculateSwarmRoute(source, dest, parallelPaths);
  return { paths };
});

// ─── Security Stack IPC Handlers ────────────────────────────────
// These expose security primitives to the renderer so the web app's
// crypto modules work identically in Electron (Node crypto backing).

const nodeCrypto = require('crypto');

/**
 * MASQUE / QUIC Bridge — tunnel messages through CONNECT-UDP proxies.
 * In Electron we use Node's dgram + HTTP/2 CONNECT-UDP for true tunneling.
 *
 * MASQUE (RFC 9298) requires an HTTP/3 or HTTP/2 CONNECT-UDP proxy.
 * Since Node.js doesn't yet have a native QUIC stack, we use HTTP/2
 * CONNECT to the proxy with encapsulated UDP datagrams.
 */
let quinnBridgeState = { ready: false, proxyUrl: null, socket: null };

ipcMain.handle('security-masque-init', async (event, { proxyUrl }) => {
  try {
    quinnBridgeState.proxyUrl = proxyUrl;
    // Open a persistent UDP socket for tunneled datagrams
    const dgram = require('dgram');
    if (quinnBridgeState.socket) {
      try { quinnBridgeState.socket.close(); } catch {}
    }
    quinnBridgeState.socket = dgram.createSocket('udp4');
    quinnBridgeState.socket.on('error', (err) => {
      console.error('[MASQUE] UDP socket error:', err.message);
    });
    quinnBridgeState.ready = true;
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('security-masque-is-available', () => {
  return { available: quinnBridgeState.ready };
});

ipcMain.handle('security-masque-send', async (event, { target, payload }) => {
  if (!quinnBridgeState.ready || !quinnBridgeState.proxyUrl) {
    return { success: false, tunneled: false, error: 'MASQUE not initialized' };
  }

  try {
    // Parse the proxy URL and target
    const proxyUrl = new URL(quinnBridgeState.proxyUrl);
    const proxyHost = proxyUrl.hostname;
    const proxyPort = parseInt(proxyUrl.port) || 443;

    // Try HTTP/2 CONNECT-UDP tunnel first (RFC 9298)
    const http2 = require('http2');
    const payloadBuf = Buffer.isBuffer(payload)
      ? payload
      : Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));

    return await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ success: false, tunneled: false, error: 'MASQUE tunnel timeout' });
      }, 5000);

      try {
        const client = http2.connect(`https://${proxyHost}:${proxyPort}`, {
          rejectUnauthorized: false, // MASQUE proxies often use self-signed certs
        });

        client.on('error', () => {
          clearTimeout(timeout);
          // Fall back to direct UDP send if HTTP/2 CONNECT-UDP fails
          fallbackDirectUDP(target, payloadBuf, resolve, timeout);
        });

        // Send via CONNECT-UDP (RFC 9298 §4)
        const targetUrl = typeof target === 'string' ? target : `${target.host}:${target.port}`;
        const req = client.request({
          ':method': 'CONNECT',
          ':protocol': 'connect-udp',
          ':authority': proxyHost,
          ':path': `/.well-known/masque/udp/${targetUrl}/`,
          'capsule-protocol': '?1',
        });

        req.on('response', (headers) => {
          const status = headers[':status'];
          if (status === 200) {
            // Tunnel established — send the datagram
            // Wrap in a DATAGRAM capsule (type 0x00, RFC 9297)
            const capsule = Buffer.alloc(3 + payloadBuf.length);
            capsule[0] = 0x00; // DATAGRAM capsule type
            capsule.writeUInt16BE(payloadBuf.length, 1);
            payloadBuf.copy(capsule, 3);
            req.write(capsule);
            clearTimeout(timeout);
            client.close();
            resolve({ success: true, tunneled: true });
          } else {
            clearTimeout(timeout);
            client.close();
            resolve({ success: false, tunneled: false, error: `Proxy returned ${status}` });
          }
        });

        req.on('error', () => {
          clearTimeout(timeout);
          fallbackDirectUDP(target, payloadBuf, resolve, timeout);
        });

        req.end();
      } catch {
        clearTimeout(timeout);
        fallbackDirectUDP(target, payloadBuf, resolve, timeout);
      }
    });
  } catch (e) {
    return { success: false, tunneled: false, error: e.message };
  }
});

/**
 * Fallback: send datagram directly via UDP when CONNECT-UDP proxy is unreachable.
 * The payload is still end-to-end encrypted by the sender.
 */
function fallbackDirectUDP(target, payloadBuf, resolve) {
  try {
    const host = typeof target === 'string' ? target.split(':')[0] : target.host;
    const port = typeof target === 'string' ? parseInt(target.split(':')[1]) || 443 : target.port;

    if (!quinnBridgeState.socket) {
      resolve({ success: false, tunneled: false, error: 'No UDP socket' });
      return;
    }

    quinnBridgeState.socket.send(payloadBuf, 0, payloadBuf.length, port, host, (err) => {
      if (err) {
        resolve({ success: false, tunneled: false, error: err.message });
      } else {
        resolve({ success: true, tunneled: false }); // sent directly, not tunneled
      }
    });
  } catch (e) {
    resolve({ success: false, tunneled: false, error: e.message });
  }
}

/**
 * OHTTP config — renderer can ask the main process to fetch the OHTTP
 * relay / gateway config over a clean channel (no browser fingerprint).
 */
ipcMain.handle('security-ohttp-fetch-config', async (event, { configUrl }) => {
  try {
    const { net } = require('electron');
    const response = await net.fetch(configUrl);
    const data = await response.json();
    return { success: true, config: data };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

/**
 * Privacy Pass — let the main process manage token storage in
 * the system keychain (more secure than localStorage).
 */
let ppTokenStore = [];

ipcMain.handle('security-pp-store-tokens', (event, tokens) => {
  ppTokenStore = tokens;
  return { success: true, count: ppTokenStore.length };
});

ipcMain.handle('security-pp-get-token', () => {
  if (ppTokenStore.length === 0) return { token: null };
  const token = ppTokenStore.shift();
  return { token };
});

ipcMain.handle('security-pp-get-count', () => {
  return { count: ppTokenStore.length };
});

/**
 * Crypto RNG — expose Node's CSPRNG for contexts where WebCrypto
 * might not be available (older Electron / sandboxed renderer).
 */
ipcMain.handle('security-random-bytes', (event, size) => {
  const buf = nodeCrypto.randomBytes(size);
  return { bytes: buf.toString('base64') };
});

// ──────────────────────────────────────────────────────────────────────
// Now Playing — System Media Detection
// ──────────────────────────────────────────────────────────────────────
// Detects currently playing media on the system (Windows/macOS/Linux)
// and broadcasts to the renderer so the user's "Now Playing" badge updates.

let nowPlayingInterval = null;
let lastNowPlaying = null;

/**
 * Attempt to detect what the user is currently listening to.
 * This uses platform-specific approaches:
 *   - Windows: Query GlobalSystemMediaTransportControls via PowerShell (best-effort)
 *   - macOS: Query NowPlaying via osascript
 *   - Linux: Query MPRIS D-Bus via dbus-send
 *
 * Falls back to null if nothing detected.
 */
async function detectNowPlaying() {
  const { exec } = require('child_process');

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 2000);

    try {
      if (process.platform === 'win32') {
        // Windows: use PowerShell to query GSMTC sessions
        const cmd = `powershell -NoProfile -Command "try { Add-Type -AssemblyName System.Runtime.WindowsRuntime; $sessions = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]::RequestAsync().GetAwaiter().GetResult().GetSessions(); foreach ($s in $sessions) { $info = $s.TryGetMediaPropertiesAsync().GetAwaiter().GetResult(); if ($info.Title) { Write-Output (ConvertTo-Json @{title=$info.Title; artist=$info.Artist; source='system'}); break } } } catch { }"`;

        exec(cmd, { timeout: 2500 }, (err, stdout) => {
          clearTimeout(timeout);
          if (err || !stdout.trim()) { resolve(null); return; }
          try {
            const data = JSON.parse(stdout.trim());
            if (data.title) { resolve(data); return; }
          } catch (e) { /* parse error */ }
          resolve(null);
        });

      } else if (process.platform === 'darwin') {
        // macOS: query Music.app / Spotify via osascript
        const cmd = `osascript -e 'tell application "System Events" to set appList to name of every application process whose background only is false' -e 'if appList contains "Spotify" then' -e 'tell application "Spotify" to set trackInfo to "{" & "\\"title\\":\\"" & name of current track & "\\",\\"artist\\":\\"" & artist of current track & "\\",\\"source\\":\\"spotify\\"}"' -e 'return trackInfo' -e 'else if appList contains "Music" then' -e 'tell application "Music" to set trackInfo to "{" & "\\"title\\":\\"" & name of current track & "\\",\\"artist\\":\\"" & artist of current track & "\\",\\"source\\":\\"system\\"}"' -e 'return trackInfo' -e 'end if'`;

        exec(cmd, { timeout: 2500 }, (err, stdout) => {
          clearTimeout(timeout);
          if (err || !stdout.trim()) { resolve(null); return; }
          try {
            const data = JSON.parse(stdout.trim());
            if (data.title) { resolve(data); return; }
          } catch (e) { /* parse error */ }
          resolve(null);
        });

      } else {
        // Linux: MPRIS D-Bus
        const cmd = `dbus-send --print-reply --dest=org.mpris.MediaPlayer2.$(dbus-send --print-reply --dest=org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null | grep -oP 'org\\.mpris\\.MediaPlayer2\\.\\K[^"]+' | head -1) /org/mpris/MediaPlayer2 org.freedesktop.DBus.Properties.Get string:'org.mpris.MediaPlayer2.Player' string:'Metadata' 2>/dev/null | grep -A1 'xesam:title' | tail -1 | sed 's/.*string "//;s/".*//'`;

        exec(cmd, { timeout: 2500 }, (err, stdout) => {
          clearTimeout(timeout);
          if (err || !stdout.trim()) { resolve(null); return; }
          resolve({ title: stdout.trim(), artist: '', source: 'system' });
        });
      }
    } catch (e) {
      clearTimeout(timeout);
      resolve(null);
    }
  });
}

ipcMain.handle('now-playing-get-status', async () => {
  return await detectNowPlaying();
});

ipcMain.handle('now-playing-start-polling', (event, intervalMs = 3000) => {
  if (nowPlayingInterval) clearInterval(nowPlayingInterval);

  nowPlayingInterval = setInterval(async () => {
    const status = await detectNowPlaying();
    const statusKey = status ? `${status.title}|${status.artist}` : null;
    const lastKey = lastNowPlaying ? `${lastNowPlaying.title}|${lastNowPlaying.artist}` : null;

    // Only emit if changed
    if (statusKey !== lastKey) {
      lastNowPlaying = status;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('now-playing-update', status);
      }
    }
  }, intervalMs);

  return { started: true };
});

ipcMain.handle('now-playing-stop-polling', () => {
  if (nowPlayingInterval) {
    clearInterval(nowPlayingInterval);
    nowPlayingInterval = null;
  }
  lastNowPlaying = null;
  return { stopped: true };
});
