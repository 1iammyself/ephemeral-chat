/**
 * Agora RTC (Real-Time Communication) Service
 * Handles voice/video calls using Agora RTC SDK
 */

import AgoraRTC from 'agora-rtc-sdk-ng';
import { SERVER_URL } from '../socket';

// Agora App ID from environment
const APP_ID = import.meta.env.VITE_AGORA_APP_ID || '735073b2cbd64774be053647ca7b2a1b';

// Call states
export const CallState = {
    IDLE: 'idle',
    CALLING: 'calling',
    INCOMING: 'incoming',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ENDED: 'ended'
};

class AgoraRTCService {
    constructor() {
        this.client = null;
        this.localAudioTrack = null;
        this.remoteUsers = new Map();
        this.currentChannel = null;
        this.callStateHandlers = new Set();

        this.currentCallState = {
            isCallActive: false,
            isIncomingCall: false,
            isOutgoingCall: false,
            isCalling: false,
            isConnected: false,
            remoteNickname: null,
            callId: null,
            state: CallState.IDLE,
            remoteStreams: new Map()
        };

        // Create RTC client
        this.initClient();
    }

    /**
     * Initialize the RTC client
     */
    initClient() {
        this.client = AgoraRTC.createClient({
            mode: 'rtc',
            codec: 'vp8'
        });

        // Set up event listeners
        this.client.on('user-published', async (user, mediaType) => {
            console.log(`📞 Remote user published: ${user.uid}, mediaType: ${mediaType}`);

            // Subscribe to the remote user
            await this.client.subscribe(user, mediaType);

            if (mediaType === 'audio') {
                const remoteAudioTrack = user.audioTrack;
                remoteAudioTrack.play();

                // Store remote user
                this.remoteUsers.set(user.uid, user);

                // Update state with remote stream
                const newStreams = new Map(this.currentCallState.remoteStreams);
                newStreams.set(user.uid, { audio: remoteAudioTrack });

                this.updateCallState({
                    isConnected: true,
                    remoteStreams: newStreams
                });
            }
        });

        this.client.on('user-unpublished', (user, mediaType) => {
            console.log(`📞 Remote user unpublished: ${user.uid}`);

            if (mediaType === 'audio') {
                const newStreams = new Map(this.currentCallState.remoteStreams);
                newStreams.delete(user.uid);
                this.updateCallState({ remoteStreams: newStreams });
            }
        });

        this.client.on('user-left', (user) => {
            console.log(`📞 Remote user left: ${user.uid}`);
            this.remoteUsers.delete(user.uid);

            const newStreams = new Map(this.currentCallState.remoteStreams);
            newStreams.delete(user.uid);
            this.updateCallState({ remoteStreams: newStreams });

            // If no more remote users, end call
            if (this.remoteUsers.size === 0 && this.currentCallState.isCallActive) {
                this.endCall();
            }
        });

        this.client.on('connection-state-change', (curState, prevState) => {
            console.log(`📞 Connection state: ${prevState} -> ${curState}`);
        });
    }

    /**
     * Subscribe to call state changes
     */
    onCallStateChange(handler) {
        this.callStateHandlers.add(handler);
        handler(this.currentCallState);
        return () => this.callStateHandlers.delete(handler);
    }

    /**
     * Update call state and notify handlers
     */
    updateCallState(updates) {
        this.currentCallState = { ...this.currentCallState, ...updates };

        // Map boolean flags to state string
        if (this.currentCallState.isIncomingCall) this.currentCallState.state = CallState.INCOMING;
        else if (this.currentCallState.isCalling) this.currentCallState.state = CallState.CALLING;
        else if (this.currentCallState.isConnected) this.currentCallState.state = CallState.CONNECTED;
        else if (this.currentCallState.isCallActive) this.currentCallState.state = CallState.CONNECTING;
        else this.currentCallState.state = CallState.IDLE;

        this.callStateHandlers.forEach(handler => handler(this.currentCallState));
    }

    /**
     * Get current call state
     */
    getCurrentCallState() {
        return this.currentCallState;
    }

    /**
     * Start a voice call
     * @param {string} channelName - Channel/room name to join
     * @param {string} displayName - Display name for the call
     * @param {string} [token] - Optional Agora token (null for testing)
     */
    async startCall(channelName, displayName, token = null) {
        try {
            console.log(`📞 Starting call in channel: ${channelName}`);

            const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            this.updateCallState({
                isOutgoingCall: true,
                isCalling: true,
                isCallActive: true,
                remoteNickname: displayName,
                callId,
                remoteStreams: new Map()
            });

            // Fetch token if not provided
            let rtcToken = token;
            if (!rtcToken) {
                try {
                    const response = await fetch(`${SERVER_URL}/api/tokens/agora/rtc?channelName=${channelName}`);
                    const data = await response.json();
                    if (data.token) {
                        rtcToken = data.token;
                        console.log('📞 Received RTC token from server');
                    }
                } catch (tokenError) {
                    console.warn('⚠️ Failed to fetch RTC token, will attempt to join without it:', tokenError);
                }
            }

            // Join the Agora channel
            const uid = await this.client.join(APP_ID, channelName, rtcToken, null);
            console.log(`📞 Joined channel with UID: ${uid}`);
            this.currentChannel = channelName;

            // Create and publish local audio track
            this.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack({
                encoderConfig: 'speech_low_quality',
                AEC: true,
                ANS: true,
                AGC: true
            });

            await this.client.publish([this.localAudioTrack]);
            console.log('📞 Local audio published');

            this.updateCallState({
                isCalling: false,
                isConnected: true
            });

            return { uid, callId };
        } catch (error) {
            console.error('❌ Failed to start call:', error);
            this.endCall();
            throw error;
        }
    }

    /**
     * Join an existing call
     * @param {string} channelName - Channel/room name to join
     * @param {string} displayName - Display name for the call
     * @param {string} [token] - Optional Agora token
     */
    async joinCall(channelName, displayName, token = null) {
        return this.startCall(channelName, displayName, token);
    }

    /**
     * End the current call
     */
    async endCall() {
        try {
            console.log('📞 Ending call...');

            // Stop and close local audio track
            if (this.localAudioTrack) {
                this.localAudioTrack.stop();
                this.localAudioTrack.close();
                this.localAudioTrack = null;
            }

            // Leave the channel
            if (this.client && this.currentChannel) {
                await this.client.leave();
                this.currentChannel = null;
            }

            // Clear remote users
            this.remoteUsers.clear();

            // Reset call state
            this.updateCallState({
                isCallActive: false,
                isIncomingCall: false,
                isOutgoingCall: false,
                isCalling: false,
                isConnected: false,
                remoteNickname: null,
                callId: null,
                remoteStreams: new Map()
            });

            console.log('📞 Call ended');
        } catch (error) {
            console.error('Error ending call:', error);
        }
    }

    /**
     * Toggle mute for local audio
     */
    toggleMute() {
        if (this.localAudioTrack) {
            const isEnabled = this.localAudioTrack.enabled;
            this.localAudioTrack.setEnabled(!isEnabled);
            return !isEnabled; // Return new mute state (true = muted)
        }
        return false;
    }

    /**
     * Get mute status
     */
    isMuted() {
        return this.localAudioTrack ? !this.localAudioTrack.enabled : false;
    }

    /**
     * Get local audio track for visualization
     */
    getLocalAudioTrack() {
        return this.localAudioTrack;
    }

    /**
     * Get all remote users
     */
    getRemoteUsers() {
        return this.remoteUsers;
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            isConnected: this.currentCallState.isConnected,
            channelName: this.currentChannel,
            remoteUserCount: this.remoteUsers.size
        };
    }
}

// Create singleton instance
export const agoraRTCService = new AgoraRTCService();
export default agoraRTCService;
