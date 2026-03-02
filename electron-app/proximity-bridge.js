/**
 * Electron Proximity Bridge
 * 
 * Provides desktop-specific proximity/network utilities for the Nearby Transfer feature.
 * On desktop, WebRTC handles the actual P2P transfer. This bridge provides:
 * - Local network info (IP address, hostname)
 * - System share sheet (save file dialog)
 * - Network interface enumeration
 */

const os = require('os');
const path = require('path');
const fs = require('fs');
const { dialog, shell } = require('electron');

/**
 * Get local network information
 */
function getNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const results = [];

  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        results.push({
          interface: name,
          address: addr.address,
          netmask: addr.netmask,
          mac: addr.mac
        });
      }
    }
  }

  return {
    hostname: os.hostname(),
    platform: process.platform,
    interfaces: results,
    primaryIp: results.length > 0 ? results[0].address : '127.0.0.1'
  };
}

/**
 * Get just the local IP
 */
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const addrs of Object.values(interfaces)) {
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        return addr.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Save a received file to disk via save dialog
 */
async function saveReceivedFile(mainWindow, fileData) {
  const { name, data } = fileData;
  
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Received File',
    defaultPath: path.join(os.homedir(), 'Downloads', name),
    filters: [
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { saved: false, path: null };
  }

  // data is expected as a Base64 string
  const buffer = Buffer.from(data, 'base64');
  fs.writeFileSync(result.filePath, buffer);

  return { saved: true, path: result.filePath };
}

/**
 * Show a file in the system file manager
 */
function showFileInFolder(filePath) {
  shell.showItemInFolder(filePath);
}

/**
 * Open a file with system default application
 */
function openFile(filePath) {
  shell.openPath(filePath);
}

/**
 * Generate a device identifier for proximity discovery
 */
function getDeviceId() {
  const hostname = os.hostname();
  const platform = process.platform;
  const username = os.userInfo().username;
  // Simple hash of machine-specific info
  const crypto = require('crypto');
  return crypto.createHash('sha256')
    .update(`${hostname}-${platform}-${username}`)
    .digest('hex')
    .substring(0, 16);
}

/**
 * Get device display name for peer discovery
 */
function getDeviceName() {
  const hostname = os.hostname();
  const platform = process.platform;
  const platformName = platform === 'win32' ? 'Windows' 
    : platform === 'darwin' ? 'Mac' 
    : 'Linux';
  return `${hostname} (${platformName})`;
}

module.exports = {
  getNetworkInfo,
  getLocalIp,
  saveReceivedFile,
  showFileInFolder,
  openFile,
  getDeviceId,
  getDeviceName
};
