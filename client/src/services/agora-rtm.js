/**
 * Agora RTM (Real-Time Messaging) Service
 * Handles text messaging, image/audio sharing via Agora Signaling SDK 2.x
 */

import AgoraRTM from 'agora-rtm-sdk';
import { SERVER_URL } from '../socket';

// Agora App ID from environment
const APP_ID = import.meta.env.VITE_AGORA_APP_ID || '735073b2cbd64774be053647ca7b2a1b';

class AgoraRTMService {
    constructor() {
        this.client = null;
        this.currentChannel = null;
        this.currentRoomCode = null;
        this.messageHandlers = new Set();
        this.presenceHandlers = new Set();
        this.isConnected = false;
        this.userId = null;
        this.nickname = null;
    }

    /**
     * Initialize the RTM client
     * @param {string} userId - Unique user identifier
     * @param {string} nickname - User's display name
     */
    async initialize(userId, nickname) {
        try {
            // If already connected with same info, just return
            if (this.client && this.isConnected && this.userId === userId) {
                console.log('🔄 Agora RTM already connected');
                this.nickname = nickname; // Update nickname just in case
                return true;
            }

            // If connected with different info, disconnect first
            if (this.client || this.isConnected) {
                await this.disconnect();
            }

            console.log('🔌 Initializing Agora RTM client...');

            this.userId = userId;
            this.nickname = nickname;

            // Fetch Token for login
            let token = null;
            let dynamicAppId = APP_ID;
            try {
                const response = await fetch(`${SERVER_URL}/api/tokens/agora/rtm?userId=${userId}`);
                const data = await response.json();
                if (data.token) {
                    token = data.token;
                    if (data.appId) dynamicAppId = data.appId;
                    console.log('🔌 Received RTM token and appId from server');
                }
            } catch (tokenError) {
                console.warn('⚠️ Failed to fetch RTM token, attempting login without it:', tokenError);
            }

            // Create RTM client instance (SDK 2.x)
            this.client = new AgoraRTM.RTM(dynamicAppId, userId, {
                token: token,
                logLevel: 'warn'
            });

            // Set up global event listeners
            this.setupEventListeners();

            // Login to RTM
            await this.client.login();
            this.isConnected = true;

            console.log('✅ Agora RTM connected');
            return true;
        } catch (error) {
            console.error('❌ Failed to initialize Agora RTM:', error);
            throw error;
        }
    }

    /**
     * Set up RTM event listeners
     */
    setupEventListeners() {
        if (!this.client) return;

        // Message received in channel
        this.client.addEventListener('message', (event) => {
            console.log('📨 RTM message received:', event);
            const { channelName, publisher, message } = event;

            try {
                // Parse the message payload
                const payload = JSON.parse(message);

                // Add metadata
                payload.sender = {
                    id: publisher,
                    nickname: payload.senderNickname || publisher
                };
                payload.timestamp = payload.timestamp || new Date().toISOString();

                // Notify all handlers
                this.messageHandlers.forEach(handler => handler(payload, channelName));
            } catch (e) {
                console.error('Failed to parse RTM message:', e);
            }
        });

        // Presence events (user join/leave)
        this.client.addEventListener('presence', (event) => {
            console.log('👤 RTM presence event:', event);
            const { channelName, type, publisher } = event;

            this.presenceHandlers.forEach(handler => handler({
                type,
                userId: publisher,
                channelName
            }));
        });

        // Connection state changes
        this.client.addEventListener('status', (event) => {
            console.log('🔗 RTM status:', event.state);
            this.isConnected = event.state === 'CONNECTED';
        });
    }

    /**
     * Join a channel (room)
     * @param {string} roomCode - The room code to join
     */
    async joinChannel(roomCode) {
        if (!this.client || !this.isConnected) {
            throw new Error('RTM client not initialized');
        }

        try {
            console.log(`📍 Joining RTM channel: ${roomCode}`);

            // Subscribe to the channel with message and presence
            await this.client.subscribe(roomCode, {
                withMessage: true,
                withPresence: true
            });

            this.currentChannel = roomCode;
            this.currentRoomCode = roomCode;

            console.log(`✅ Joined RTM channel: ${roomCode}`);
            return true;
        } catch (error) {
            console.error('❌ Failed to join RTM channel:', error);
            throw error;
        }
    }

    /**
     * Leave the current channel
     */
    async leaveChannel() {
        if (!this.client || !this.currentChannel) return;

        try {
            await this.client.unsubscribe(this.currentChannel);
            console.log(`👋 Left RTM channel: ${this.currentChannel}`);
            this.currentChannel = null;
            this.currentRoomCode = null;
        } catch (error) {
            console.error('Failed to leave channel:', error);
        }
    }

    /**
     * Send a text message to the channel
     * @param {Object} messageData - Message data
     */
    async sendMessage(messageData) {
        if (!this.client || !this.currentChannel) {
            throw new Error('Not connected to a channel');
        }

        try {
            const payload = {
                id: messageData.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                content: messageData.content,
                messageType: messageData.messageType || 'text',
                senderNickname: this.nickname,
                timestamp: new Date().toISOString(),
                isViewOnce: messageData.isViewOnce || false,
                ttl: messageData.ttl || null,
                recipients: messageData.recipients || [] // For private messages
            };

            await this.client.publish(this.currentChannel, JSON.stringify(payload));

            console.log('📤 Message sent via RTM');
            return payload;
        } catch (error) {
            console.error('Failed to send message:', error);
            throw error;
        }
    }

    /**
     * Send an image message
     * @param {string} base64Data - Base64 encoded image data
     * @param {Object} options - Additional options
     */
    async sendImage(base64Data, options = {}) {
        return this.sendMessage({
            content: base64Data,
            messageType: 'image',
            isViewOnce: options.isViewOnce || false,
            ...options
        });
    }

    /**
     * Send an audio message
     * @param {string} base64Data - Base64 encoded audio data
     * @param {Object} options - Additional options
     */
    async sendAudio(base64Data, options = {}) {
        return this.sendMessage({
            content: base64Data,
            messageType: 'audio',
            ...options
        });
    }

    /**
     * Subscribe to message events
     * @param {Function} handler - Callback for message events
     */
    onMessage(handler) {
        this.messageHandlers.add(handler);
        return () => this.messageHandlers.delete(handler);
    }

    /**
     * Subscribe to presence events
     * @param {Function} handler - Callback for presence events
     */
    onPresence(handler) {
        this.presenceHandlers.add(handler);
        return () => this.presenceHandlers.delete(handler);
    }

    /**
     * Get users currently in the channel
     */
    async getChannelMembers() {
        if (!this.client || !this.currentChannel) return [];

        try {
            const result = await this.client.presence.getOnlineUsers(this.currentChannel, 'MESSAGE', {
                includedUserId: true
            });
            return result.occupants || [];
        } catch (error) {
            console.error('Failed to get channel members:', error);
            return [];
        }
    }

    /**
     * Disconnect from RTM
     */
    async disconnect() {
        try {
            if (this.currentChannel) {
                await this.leaveChannel();
            }

            if (this.client) {
                await this.client.logout();
                this.client = null;
            }

            this.isConnected = false;
            this.messageHandlers.clear();
            this.presenceHandlers.clear();

            console.log('👋 Disconnected from Agora RTM');
        } catch (error) {
            console.error('Error disconnecting from RTM:', error);
        }
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.isConnected,
            userId: this.userId,
            currentChannel: this.currentChannel
        };
    }
}

// Create singleton instance
export const agoraRTMService = new AgoraRTMService();
export default agoraRTMService;
