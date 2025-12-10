/**
 * WebRTC Service for Ephemeral Chat
 * Handles peer-to-peer audio/video calls using WebRTC
 * Re-implemented based on reference implementation
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

        this.currentCallState = {
            isCallActive: false,
            isIncomingCall: false,
            isOutgoingCall: false,
            isCalling: false,
            isConnected: false,
            remoteNickname: null,
            callId: null,
            state: CallState.IDLE // Mapped for backward compatibility
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

        // Map boolean flags to state string for backward compatibility with UI
        if (this.currentCallState.isIncomingCall) this.currentCallState.state = CallState.INCOMING;
        else if (this.currentCallState.isCalling) this.currentCallState.state = CallState.CALLING;
        else if (this.currentCallState.isConnected) this.currentCallState.state = CallState.CONNECTED;
        else if (this.currentCallState.isCallActive) this.currentCallState.state = CallState.CONNECTING;
        else this.currentCallState.state = CallState.IDLE;

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
     */
    async startCall(roomCode, remoteNickname) {
        try {
            console.log('📞 Starting call to:', remoteNickname);
            this.currentRoomCode = roomCode;

            this.updateCallState({
                isOutgoingCall: true,
                isCalling: true,
                remoteNickname,
                callId: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            });

            // Get local media stream
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
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
                callId: this.currentCallState.callId,
                offer,
                targetNickname: remoteNickname
            });

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
            this.updateCallState({
                isIncomingCall: false,
                isCallActive: true,
                callId
            });

            // Get local media stream
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            // Add local tracks to existing peer connection
            // Note: In reference, peerConnection might not exist yet if handleCallOffer created it?
            // Actually handleCallOffer creates it.

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
        if (this.currentCallState.callId && this.currentRoomCode) {
            socketManager.emit('call-ended', {
                roomCode: this.currentRoomCode,
                callId: this.currentCallState.callId
            });
        }

        // Clean up streams
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.remoteStream) {
            this.remoteStream.getTracks().forEach(track => track.stop());
            this.remoteStream = null;
        }

        // Close peer connection
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.currentRoomCode = null;
        this.updateCallState({
            isCallActive: false,
            isIncomingCall: false,
            isOutgoingCall: false,
            isCalling: false,
            isConnected: false,
            remoteNickname: null,
            callId: null
        });
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
            this.updateCallState({ isConnected: true });
        };

        // Handle connection state changes
        this.peerConnection.onconnectionstatechange = () => {
            if (this.peerConnection) {
                const state = this.peerConnection.connectionState;
                if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                    this.endCall();
                }
            }
        };
    }

    /**
     * Handle incoming call offer
     * @private
     */
    async handleCallOffer(data) {
        try {
            this.currentRoomCode = data.roomCode;

            this.updateCallState({
                isIncomingCall: true,
                remoteNickname: data.fromNickname,
                callId: data.callId
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
            if (this.peerConnection) {
                await this.peerConnection.setRemoteDescription(data.answer);
                this.updateCallState({
                    isOutgoingCall: false,
                    isCalling: false,
                    isCallActive: true
                });
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
            if (this.peerConnection) {
                await this.peerConnection.addIceCandidate(data.candidate);
            }
        } catch (error) {
            console.error('Failed to handle ICE candidate:', error);
        }
    }

    /**
     * Handle call rejected
     * @private
     */
    handleCallRejected(data) {
        this.endCall();
    }

    /**
     * Handle call ended
     * @private
     */
    handleCallEnded(data) {
        this.endCall();
    }

    getLocalStream() {
        return this.localStream;
    }

    getRemoteStream() {
        return this.remoteStream;
    }

    toggleMute() {
        if (this.localStream) {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (audioTrack) {
                audioTrack.enabled = !audioTrack.enabled;
                return !audioTrack.enabled;
            }
        }
        return false;
    }
}

// Create singleton instance
export const webRTCService = new WebRTCService();
export default webRTCService;
