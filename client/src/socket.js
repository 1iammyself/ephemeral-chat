import { io } from 'socket.io-client';

/**
 * Simplified Socket.IO Manager based on working branch implementation
 */
class SocketManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.roomType = 'ephemeral';
    this.listeners = new Map();
  }

  getServerUrl() {
    // 1. Explicit env
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;

    // 2. Production fallback
    if (import.meta.env.PROD) return '/';

    // 3. Local desarrollo
    return 'http://localhost:3001';
  }

  connect() {
    if (this.socket && this.isConnected) return this.socket;

    const SERVER_URL = this.getServerUrl();
    console.log(`🔌 Connecting to socket server: ${SERVER_URL}`);

    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket.id);
      this.isConnected = true;

      // Re-apply listeners
      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach(callback => {
          this.socket.off(event, callback); // Prevent duplicates
          this.socket.on(event, callback);
        });
      });
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('⚠️ Socket connection error:', error);
      this.isConnected = false;
    });

    return this.socket;
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
    if (this.listeners.has(event)) {
      if (callback) {
        this.listeners.set(event, this.listeners.get(event).filter(cb => cb !== callback));
      } else {
        this.listeners.delete(event);
      }
    }

    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    }
  }

  emit(event, data, callback) {
    if (this.socket) {
      this.socket.emit(event, data, callback);
    } else {
      console.warn(`⚠️ Cannot emit ${event} - socket not initialized`);
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  setRoomType(type) {
    this.roomType = type;
  }
}

const socketManager = new SocketManager();
export default socketManager;
