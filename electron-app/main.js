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
      label: 'Security Actions',
      submenu: [
        { label: 'Panic Burn', accelerator: 'CmdOrCtrl+Z', click: () => { if (mainWindow) mainWindow.webContents.send('panic-burn'); } },
        { label: 'Toggle Internal Anonymous', accelerator: 'CmdOrCtrl+Y', click: () => { if (mainWindow) mainWindow.webContents.send('toggle-anonymous'); } },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
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
  const fs = require('fs');
  const licensePath = path.join(__dirname, 'LICENSE-E2ECP.txt');
  let licenseText = '';

  try {
    licenseText = fs.readFileSync(licensePath, 'utf8');
  } catch (err) {
    console.error('Failed to read license file:', err);
    licenseText = 'License file reference: LICENSE-E2ECP.txt (included in application root)';
  }

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Third-Party Licenses',
    message: 'Third-Party Licenses',
    detail: `This product includes software developed by schollz/e2ecp licensed under the MIT License.\n\n${licenseText}`,
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
