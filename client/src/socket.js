/**
 * Socket.IO client configuration for Ephemeral Chat
 */

import { io } from 'socket.io-client';

// Determine the server URL based on the current environment
let SERVER_URL = import.meta.env.VITE_API_URL || '';

// If we're in the browser, use the current origin for API requests
if (typeof window !== 'undefined') {
  const isVercel = window.location.hostname.includes('vercel.app');
  const isRender = window.location.hostname.includes('onrender.com');
  
  if (!SERVER_URL) {
    if (isVercel) {
      SERVER_URL = 'https://ephemeral-chat-iota.vercel.app';
    } else if (isRender) {
      SERVER_URL = 'https://ephemeral-chat-7j66.onrender.com';
    } else {
      // Default to local development
      SERVER_URL = 'http://localhost:3001';
    }
  }
}

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

    log('🔧 Creating new socket connection...');
    
    try {
      this.socket = io(SERVER_URL, {
        path: '/socket.io/',
        transports: ['websocket', 'polling'],
        upgrade: true,
        secure: true,
        rejectUnauthorized: false,
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        autoConnect: true,
        forceNew: true,
        extraHeaders: {
          'Access-Control-Allow-Origin': window.location.origin,
          'Access-Control-Allow-Credentials': 'true'
        }
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
        this.handleReconnect();
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
    
      // Add error handling
      this.socket.on('connect_error', (error) => {
        log('❌ Connection Error:', error.message);
        this.isConnected = false;
        
        // Force UI update on error
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new Event('offline'));
        }
        
        // Attempt to reconnect with exponential backoff
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          log(`⏳ Reconnecting in ${delay/1000} seconds... (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
          
          setTimeout(() => {
            this.reconnectAttempts++;
            this.socket.connect();
          }, delay);
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
