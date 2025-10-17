import { io } from 'socket.io-client';

// Use environment variable or default to localhost for development
const SERVER_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

class SimpleSocketManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
  }

  connect() {
    if (this.socket && this.isConnected) {
      return this.socket;
    }
    
    console.log('Connecting to:', SERVER_URL);
    
    this.socket = io(SERVER_URL, {
      transports: ['polling', 'websocket']
    });
    
    this.socket.on('connect', () => {
      console.log('Connected:', this.socket.id);
      this.isConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error);
      this.isConnected = false;
    });

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
    if (this.socket && this.isConnected) {
      this.socket.emit(event, data, callback);
    } else {
      console.error('Socket not connected');
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }
}

const socketManager = new SimpleSocketManager();
export default socketManager;