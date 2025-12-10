/**
 * WebRTC Service for Ephemeral Chat
 * Handles peer-to-peer audio/video calls using WebRTC
 */

import socketManager from './socket-simple';

// Call states
export const CallState = {
    IDLE: 'idle',
    CALLING: 'calling',
    INCOMING: 'incoming',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
    ENDED: 'ended'
};

class WebRTCService {
    constructor() {
        this.peerConnection = null;
        this.localStream = null;
        this.remoteStream = null;
        this.callStateHandlers = new Map();
        this.currentRoomCode = null;

        this.currentCallState = {
            state: CallState.IDLE,
            remoteNickname: null,
            callId: null,
            isVideoEnabled: false,
            isMuted: false
        };

        // ICE servers for NAT traversal
        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
        ];

        this.setupSocketHandlers();
    }

    /**
     * Set up Socket.IO event handlers for call signaling
     */
    setupSocketHandlers() {
        // Wait for socket to be ready
        const setupHandlers = () => {
            if (!socketManager.socket) {
                setTimeout(setupHandlers, 100);
                return;
            }

            socketManager.on('call-offer', (data) => this.handleCallOffer(data));
            socketManager.on('call-answer', (data) => this.handleCallAnswer(data));
            socketManager.on('call-ice-candidate', (data) => this.handleIceCandidate(data));
            socketManager.on('call-rejected', (data) => this.handleCallRejected(data));
            socketManager.on('call-ended', (data) => this.handleCallEnded(data));
        };

        setupHandlers();
    }

    /**
     * Subscribe to call state changes
     * @param {Function} handler - Callback function
     * @returns {Function} Unsubscribe function
     */
    onCallStateChange(handler) {
        const id = Math.random().toString(36).substr(2, 9);
        this.callStateHandlers.set(id, handler);
        // Immediately call with current state
        handler(this.currentCallState);
        return () => this.callStateHandlers.delete(id);
    }

    /**
     * Update call state and notify all handlers
     * @param {Object} updates - State updates
     */
    updateCallState(updates) {
        this.currentCallState = { ...this.currentCallState, ...updates };
        this.callStateHandlers.forEach(handler => handler(this.currentCallState));
    }

    /**
     * Get current call state
     * @returns {Object} Current call state
     */
    getCurrentCallState() {
        return this.currentCallState;
    }

    /**
     * Start an outgoing call
     * @param {string} roomCode - Room code
     * @param {string} remoteNickname - Target user's nickname
     * @param {boolean} includeVideo - Include video stream
     */
    async startCall(roomCode, remoteNickname, includeVideo = false) {
        try {
            console.log('📞 Starting call to:', remoteNickname);

            this.currentRoomCode = roomCode;
            const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            this.updateCallState({
                state: CallState.CALLING,
                remoteNickname,
                callId,
                isVideoEnabled: includeVideo
            });

            // Get local media stream
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: includeVideo
            });

            // Create peer connection
            await this.createPeerConnection();

            // Add local tracks to peer connection
            this.localStream.getTracks().forEach(track => {
                if (this.peerConnection && this.localStream) {
                    this.peerConnection.addTrack(track, this.localStream);
                }
            });

            // Create and send offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);

            socketManager.emit('call-offer', {
                roomCode,
                callId,
                offer,
                targetNickname: remoteNickname,
                includeVideo
            });

            console.log('📞 Call offer sent');
        } catch (error) {
            console.error('Failed to start call:', error);
            this.endCall();
            throw error;
        }
    }

    /**
     * Accept an incoming call
     * @param {string} callId - Call ID to accept
     */
    async acceptCall(callId) {
        try {
            console.log('📞 Accepting call:', callId);

            this.updateCallState({
                state: CallState.CONNECTING,
                callId
            });

            // Get local media stream
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: this.currentCallState.isVideoEnabled
            });

            // Add local tracks to existing peer connection
            if (this.peerConnection && this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    if (this.peerConnection && this.localStream) {
                        this.peerConnection.addTrack(track, this.localStream);
                    }
                });

                // Create and send answer
                const answer = await this.peerConnection.createAnswer();
                await this.peerConnection.setLocalDescription(answer);

                socketManager.emit('call-answer', {
                    roomCode: this.currentRoomCode,
                    callId,
                    answer
                });

                console.log('📞 Call answer sent');
            }
        } catch (error) {
            console.error('Failed to accept call:', error);
            this.rejectCall(callId);
            throw error;
        }
    }

    /**
     * Reject an incoming call
     * @param {string} callId - Call ID to reject
     */
    rejectCall(callId) {
        console.log('📞 Rejecting call:', callId);

        socketManager.emit('call-rejected', {
            roomCode: this.currentRoomCode,
            callId
        });

        this.endCall();
    }

    /**
     * End the current call
     */
    endCall() {
        console.log('📞 Ending call');

        // Send end signal if we have a call ID
        if (this.currentCallState.callId && this.currentRoomCode) {
            socketManager.emit('call-ended', {
                roomCode: this.currentRoomCode,
                callId: this.currentCallState.callId
            });
        }

        // Stop all local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Stop all remote tracks
        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        // Reset state
        this.currentRoomCode = null;
        this.updateCallState({
            state: CallState.IDLE,
            remoteNickname: null,
            callId: null,
            isVideoEnabled: false,
            isMuted: false
        });
    }

    /**
     * Toggle mute state
     */
    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                this.updateCallState({ isMuted: !audioTrack.enabled });
                return !audioTrack.enabled;
            }
        }
        return false;
    }

    /**
     * Toggle video state
     */
    toggleVideo() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.enabled = !videoTrack.enabled;
                this.updateCallState({ isVideoEnabled: videoTrack.enabled });
                return videoTrack.enabled;
            }
        }
        return false;
    }

    /**
     * Get local media stream
     * @returns {MediaStream|null}
     */
    getLocalStream() {
        return this.localStream;
    }

    /**
     * Get remote media stream
     * @returns {MediaStream|null}
     */
    getRemoteStream() {
        return this.remoteStream;
    }

    /**
     * Create RTCPeerConnection
     * @private
     */
    async createPeerConnection() {
        this.peerConnection = new RTCPeerConnection({
            iceServers: this.iceServers
        });

        // Handle ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.currentCallState.callId) {
                socketManager.emit('call-ice-candidate', {
                    roomCode: this.currentRoomCode,
                    callId: this.currentCallState.callId,
                    candidate: event.candidate
                });
            }
        };

        // Handle remote stream
        this.peerConnection.ontrack = (event) => {
            console.log('📞 Remote track received');
            this.remoteStream = event.streams[0];
            this.updateCallState({ state: CallState.CONNECTED });
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            if (this.peerConnection) {
                const state = this.peerConnection.connectionState;
                console.log('📞 Connection state:', state);

                if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                    this.endCall();
                }
            }
        };

        // Handle ICE connection state changes
        this.peerConnection.oniceconnectionstatechange = () => {
            if (this.peerConnection) {
                console.log('📞 ICE connection state:', this.peerConnection.iceConnectionState);
            }
        };
    }

    /**
     * Handle incoming call offer
     * @private
     */
    async handleCallOffer(data) {
        try {
            console.log('📞 Received call offer from:', data.fromNickname);

            this.currentRoomCode = data.roomCode;

            this.updateCallState({
                state: CallState.INCOMING,
                remoteNickname: data.fromNickname,
                callId: data.callId,
                isVideoEnabled: data.includeVideo || false
            });

            // Create peer connection
            await this.createPeerConnection();

            // Set remote description
            await this.peerConnection.setRemoteDescription(data.offer);

        } catch (error) {
            console.error('Failed to handle call offer:', error);
            this.rejectCall(data.callId);
        }
    }

    /**
     * Handle call answer
     * @private
     */
    async handleCallAnswer(data) {
        try {
            console.log('📞 Received call answer');

            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(data.answer);
                this.updateCallState({ state: CallState.CONNECTED });
            }
        } catch (error) {
            console.error('Failed to handle call answer:', error);
            this.endCall();
        }
    }

    /**
     * Handle ICE candidate
     * @private
     */
    async handleIceCandidate(data) {
        try {
            if (this.peerConnection && data.candidate) {
                await this.peerConnection.addIceCandidate(data.candidate);
            }
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }

    /**
     * Handle call rejected
     * @private
     */
    handleCallRejected(data) {
        console.log('📞 Call was rejected');
        this.endCall();
    }

    /**
     * Handle call ended
     * @private
     */
    handleCallEnded(data) {
        console.log('📞 Call ended by remote');
        this.endCall();
    }
}

// Create singleton instance
export const webRTCService = new WebRTCService();
export default webRTCService;
