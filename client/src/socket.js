/**
 * Socket.IO client configuration for Ephemeral Chat
 */

import { io } from 'socket.io-client';

const SERVER_URL = 'https://ephemeral-chat-7j66.onrender.com';

// Add Android-specific logging
const log = (message, data = null) => {
  const logMessage = `[SOCKET] ${message}`;
  console.log(logMessage, data);
  
  // Force log to Android Logcat
  if (typeof window !== 'undefined' && window.Capacitor) {
    window.Capacitor.Plugins.Console.log({
      level: 'info',
      message: logMessage + (data ? ' ' + JSON.stringify(data) : '')
    });
  }
};

class SocketManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.listeners = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    log('SocketManager initialized');
  }

  connect() {
    log('🔌 Attempting to connect to:', SERVER_URL);
    
    if (this.socket && this.isConnected) {
      log('✅ Already connected, returning existing socket');
      return this.socket;
    }

    log('🔧 Creating new socket connection...');
    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      timeout: 10000,
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      maxReconnectAttempts: this.maxReconnectAttempts,
      autoConnect: true
    });

    log('📡 Socket created, setting up event listeners...');

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      log('✅ Connected to server successfully!');
      log('🆔 Socket ID:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      log('❌ Disconnected from server. Reason:', reason);
      
      if (reason === 'io server disconnect') {
        log('🔄 Server disconnected us, attempting to reconnect...');
        this.socket.connect();
      }
    });

    this.socket.on('connect_error', (error) => {
      this.reconnectAttempts++;
      log('❌ Connection error:', error);
      log(`🔄 Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      log('🔍 Error details:', {
        message: error.message,
        description: error.description,
        context: error.context,
        type: error.type
      });
    });

    this.socket.on('reconnect', (attemptNumber) => {
      log(`✅ Reconnected after ${attemptNumber} attempts`);
      this.isConnected = true;
    });

    this.socket.on('reconnect_error', (error) => {
      log('❌ Reconnection error:', error);
    });

    this.socket.on('reconnect_failed', () => {
      log('❌ Failed to reconnect after all attempts');
    });

    log('🎯 Socket setup complete, returning socket');
    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  emit(event, data, callback) {
    log(`📤 Attempting to emit event: ${event}`, data);
    
    if (this.socket && this.isConnected) {
      log(`✅ Socket connected, emitting ${event}`);
      this.socket.emit(event, data, callback);
    } else {
      log(`❌ Socket not connected, cannot emit: ${event}`);
      log('🔍 Socket status:', {
        socketExists: !!this.socket,
        isConnected: this.isConnected,
        socketId: this.socket?.id
      });
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
      
      // Store listener for cleanup
      if (!this.listeners.has(event)) {
        this.listeners.set(event, []);
      }
      this.listeners.get(event).push(callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
      
      // Remove from stored listeners
      if (this.listeners.has(event)) {
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    }
  }

  removeAllListeners(event) {
    if (this.socket) {
      this.socket.removeAllListeners(event);
      this.listeners.delete(event);
    }
  }

  getConnectionStatus() {
    return {
      isConnected: this.isConnected,
      socketId: this.socket?.id || null
    };
  }
}

// Create singleton instance
const socketManager = new SocketManager();

export default socketManager;
