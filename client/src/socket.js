/**
 * Socket.IO client configuration for Ephemeral Chat
 */

import { io } from 'socket.io-client';

// Only allow the primary production host
const isAllowedHostname = (hostname) => {
  return hostname === 'chat.kyere.me';
};

// Get the current hostname and protocol
const getServerUrl = () => {
  // 1. Explicit environment variable (highest priority)
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // 2. Relative for the same host
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;

    // If we're on the production domain already, use it
    if (hostname === 'chat.kyere.me') {
      return `${protocol}//${hostname}`;
    }

    // For local development or other hosts, default to local if not set
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001';
    }
  }

  // 3. Fallback to same host (works for current Render monolithic setup)
  return '';
};

const SERVER_URL = getServerUrl();
console.log('🌐 Connecting to server:', SERVER_URL);

// Simple logging function
const log = (message, data = null) => {
  console.log(`[SOCKET] ${message}`, data || '');
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

    // Close existing socket if any
    if (this.socket) {
      this.socket.close();
    }

    log('🔧 Creating new socket connection...');

    try {
      this.socket = io(SERVER_URL, {
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: Infinity, // Keep trying! Useful for waking up Render
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 45000, // Longer timeout for cold starts
        transports: ['websocket', 'polling'],
        autoConnect: true,
        forceNew: true,
        path: '/socket.io/'
      });

      // Apply any listeners that were registered before connection
      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach(callback => {
          this.socket.on(event, callback);
        });
      });

      // Debug events
      this.socket.on('connect', () => {
        console.log('🔌 Socket connected:', this.socket.id);
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
        this.isConnected = false;
      });

      this.socket.on('disconnect', (reason) => {
        console.log('🔌 Socket disconnected:', reason);
        this.isConnected = false;
        if (reason === 'io server disconnect') {
          // The disconnection was initiated by the server, you need to reconnect manually
          this.socket.connect();
        }
      });
    } catch (error) {
      log('❌ Error creating socket connection:', error);
      throw error; // Re-throw to be handled by the caller
    }

    log('📡 Socket created, setting up event listeners...');

    this.socket.on('connect', () => {
      log('✅ Connected to server');
      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Force UI update after connection
      if (window.dispatchEvent) {
        window.dispatchEvent(new Event('online'));
      }
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
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    if (this.socket) {
      this.socket.on(event, callback);
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

  setRoomType(persistenceMode) {
    if (!this.socket) return;

    log(`🛠️ Setting socket mode for: ${persistenceMode}`);
    this.socket.roomType = persistenceMode;

    // Adjust reconnection settings for persistent rooms for better stability
    if (persistenceMode !== 'ephemeral') {
      this.socket.io.opts.timeout = 60000;           // 1 minute
      this.socket.io.opts.reconnectionDelay = 5000;  // 5 seconds
    } else {
      // Default ephemeral settings
      this.socket.io.opts.timeout = 45000;
      this.socket.io.opts.reconnectionDelay = 1000;
    }
  }
}

// Create singleton instance
const socketManager = new SocketManager();

export default socketManager;

