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
    securityMode: 'high' // 'high', 'medium', 'low'
  }
});

// Constants
const CHAT_URL = 'https://chat.kyere.me';
const isDev = !app.isPackaged || process.argv.includes('--dev');

// Keep references to prevent garbage collection
let mainWindow = null;
let tray = null;
let isQuitting = false;
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
    autoUpdater.checkForUpdates();
  }, 4 * 60 * 60 * 1000);

  // Initial check
  setTimeout(() => {
    autoUpdater.checkForUpdates();
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
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["default-src 'self' https://chat.kyere.me wss://chat.kyere.me; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://chat.kyere.me; style-src 'self' 'unsafe-inline' https://chat.kyere.me https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://chat.kyere.me wss://chat.kyere.me;"]
      }
    });
  });

  // Screen capture protection (Windows)
  if (process.platform === 'win32' && securityMode !== 'low') {
    window.setContentProtection(true);
  }

  // Block screen capture API
  if (securityMode === 'high') {
    window.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      const blockedPermissions = ['media', 'display-capture', 'mediaKeySystem'];
      if (blockedPermissions.includes(permission)) {
        callback(false);
      } else {
        callback(true);
      }
    });
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
      `).catch(() => {});
      
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
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false
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
      mainWindow.hide();
    }
  });

  // Handle close to tray
  mainWindow.on('close', (event) => {
    if (store.get('minimizeToTray') && !isQuitting) {
      event.preventDefault();
      mainWindow.hide();
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
    mainWindow.show();
    mainWindow.focus();
  });
}

function updateTrayMenu() {
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Ephemeral Chat',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
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
      label: 'Check for Updates',
      click: () => {
        autoUpdater.checkForUpdates();
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
        { role: 'undo' },
        { role: 'redo' },
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
            autoUpdater.checkForUpdates();
          }
        },
        { type: 'separator' },
        {
          label: 'About Ephemeral Chat',
          click: () => showAboutDialog()
        },
        {
          label: 'Visit Website',
          click: () => shell.openExternal(CHAT_URL)
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
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Quick create room
  globalShortcut.register('Alt+Shift+N', () => {
    mainWindow.show();
    mainWindow.focus();
    mainWindow.loadURL(`${CHAT_URL}?action=create`);
  });
}

// ==================== DEEP LINK HANDLING ====================

function handleDeepLink(url) {
  // Handle ephemeral:// and ephemeral-chat:// URLs
  // e.g., ephemeral://join/verbal-code or ephemeral://room/ROOMCODE
  
  if (!url) return;
  
  let path = url.replace(/^ephemeral(-chat)?:\/\//, '');
  
  if (path.startsWith('join/')) {
    const code = path.replace('join/', '');
    mainWindow.loadURL(`${CHAT_URL}?join=${encodeURIComponent(code)}`);
  } else if (path.startsWith('room/')) {
    const roomCode = path.replace('room/', '');
    mainWindow.loadURL(`${CHAT_URL}/room/${roomCode}`);
  } else if (path.startsWith('create')) {
    mainWindow.loadURL(`${CHAT_URL}?action=create`);
  } else {
    mainWindow.loadURL(CHAT_URL);
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
    const deepLink = commandLine.find(arg => arg.startsWith('ephemeral'));
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
    const deepLink = process.argv.find(arg => arg.startsWith('ephemeral'));
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
  autoUpdater.checkForUpdates();
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

// Create a badge icon for Windows taskbar
function createBadgeIcon(count) {
  // Simple implementation - in production you'd want to render this properly
  return null; // Windows will use flash instead
}
