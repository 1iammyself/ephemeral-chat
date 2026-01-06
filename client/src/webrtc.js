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
        this.peers = new Map(); // socketId -> { connection, stream }
        this.localStream = null;
        this.callStateHandlers = new Map();
        this.currentRoomCode = null;

        this.currentCallState = {
            isCallActive: false,
            isIncomingCall: false,
            isOutgoingCall: false,
            isCalling: false,
            isConnected: false,
            remoteNickname: null, // Keep for backward compat (display name of caller/callee)
            callId: null,
            state: CallState.IDLE,
            remoteStreams: new Map() // socketId -> stream
        };

        // ICE servers for NAT traversal
        let configuredIceServers = [];
        try {
            if (import.meta.env.VITE_ICE_SERVERS) {
                configuredIceServers = JSON.parse(import.meta.env.VITE_ICE_SERVERS);
            }
        } catch (e) {
            console.warn('Failed to parse VITE_ICE_SERVERS', e);
        }

        this.iceServers = configuredIceServers.length > 0 ? configuredIceServers : [
            { urls: "stun:stun.relay.metered.ca:80" },
            {
                urls: "turn:global.relay.metered.ca:80",
                username: "55d4dca65d669e7f334fd513",
                credential: "GMA0pbTySv4AwkH7"
            },
            {
                urls: "turn:global.relay.metered.ca:80?transport=tcp",
                username: "55d4dca65d669e7f334fd513",
                credential: "GMA0pbTySv4AwkH7"
            },
            {
                urls: "turn:global.relay.metered.ca:443",
                username: "55d4dca65d669e7f334fd513",
                credential: "GMA0pbTySv4AwkH7"
            },
            {
                urls: "turns:global.relay.metered.ca:443?transport=tcp",
                username: "55d4dca65d669e7f334fd513",
                credential: "GMA0pbTySv4AwkH7"
            }
        ];

        this.setupSocketHandlers();
    }

    /**
     * Set up Socket.IO event handlers for call signaling
     */
    setupSocketHandlers() {
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
     */
    onCallStateChange(handler) {
        const id = Math.random().toString(36).substr(2, 9);
        this.callStateHandlers.set(id, handler);
        handler(this.currentCallState);
        return () => this.callStateHandlers.delete(id);
    }

    /**
     * Update call state and notify all handlers
     */
    updateCallState(updates) {
        this.currentCallState = { ...this.currentCallState, ...updates };

        // Map boolean flags to state string for backward compatibility
        if (this.currentCallState.isIncomingCall) this.currentCallState.state = CallState.INCOMING;
        else if (this.currentCallState.isCalling) this.currentCallState.state = CallState.CALLING;
        else if (this.currentCallState.isConnected) this.currentCallState.state = CallState.CONNECTED;
        else if (this.currentCallState.isCallActive) this.currentCallState.state = CallState.CONNECTING;
        else this.currentCallState.state = CallState.IDLE;

        this.callStateHandlers.forEach(handler => handler(this.currentCallState));
    }

    getCurrentCallState() {
        return this.currentCallState;
    }

    /**
     * Start an outgoing call to multiple recipients
     * @param {string} roomCode 
     * @param {Array<{id: string, nickname: string}>} recipients 
     */
    async startCall(roomCode, recipients) {
        try {
            console.log('📞 Starting call to:', recipients.map(r => r.nickname));
            this.currentRoomCode = roomCode;
            const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            // Display name: if 1 person, use nickname. If multiple, use "Group Call" or similar.
            const remoteNickname = recipients.length === 1 ? recipients[0].nickname : `${recipients.length} people`;

            this.updateCallState({
                isOutgoingCall: true,
                isCalling: true,
                remoteNickname,
                callId,
                remoteStreams: new Map()
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

            // Initiate connection for each recipient
            for (const recipient of recipients) {
                await this.createPeerConnection(recipient.id);

                // Add local tracks
                this.localStream.getTracks().forEach(track => {
                    const peer = this.peers.get(recipient.id);
                    if (peer && peer.connection) {
                        peer.connection.addTrack(track, this.localStream);
                    }
                });

                // Create and send offer
                const pc = this.peers.get(recipient.id).connection;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);

                socketManager.emit('call-offer', {
                    roomCode,
                    callId,
                    offer,
                    targetNickname: recipient.nickname,
                    to: recipient.id
                });
            }

        } catch (error) {
            console.error('Failed to start call:', error);
            this.endCall();
            throw error;
        }
    }

    /**
     * Accept an incoming call
     * @param {string} callId 
     */
    async acceptCall(callId) {
        try {
            this.updateCallState({
                isIncomingCall: false,
                isCallActive: true,
                callId
            });

            // Get local media stream if not already available
            if (!this.localStream) {
                this.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true
                    },
                    video: false
                });
            }

            const callerId = this.currentCallState.incomingCallerId;
            if (!callerId || !this.peers.has(callerId)) {
                throw new Error('No pending call found');
            }

            const peer = this.peers.get(callerId);
            const pc = peer.connection;

            // Add local tracks
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream);
            });

            // Create and send answer
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            socketManager.emit('call-answer', {
                roomCode: this.currentRoomCode,
                callId,
                answer,
                to: callerId
            });

        } catch (error) {
            console.error('Failed to accept call:', error);
            this.rejectCall(callId);
            throw error;
        }
    }

    /**
     * Reject an incoming call
     */
    rejectCall(callId) {
        const callerId = this.currentCallState.incomingCallerId;
        if (callerId) {
            socketManager.emit('call-rejected', {
                roomCode: this.currentRoomCode,
                callId,
                to: callerId
            });
        }
        this.endCall();
    }

    /**
     * End the current call (all peers)
     */
    endCall() {
        // Notify all peers
        if (this.currentCallState.callId && this.currentRoomCode) {
            this.peers.forEach((peer, socketId) => {
                socketManager.emit('call-ended', {
                    roomCode: this.currentRoomCode,
                    callId: this.currentCallState.callId,
                    to: socketId
                });
            });
        }

        // Clean up local stream
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Close all peer connections
        this.peers.forEach(peer => {
            if (peer.connection) peer.connection.close();
        });
        this.peers.clear();

        this.currentRoomCode = null;
        this.updateCallState({
            isCallActive: false,
            isIncomingCall: false,
            isOutgoingCall: false,
            isCalling: false,
            isConnected: false,
            remoteNickname: null,
            callId: null,
            incomingCallerId: null,
            remoteStreams: new Map()
        });
    }

    /**
     * Create RTCPeerConnection for a specific peer
     */
    async createPeerConnection(socketId) {
        const pc = new RTCPeerConnection({
            iceServers: this.iceServers
        });

        // Handle ICE candidates
        pc.onicecandidate = (event) => {
            if (event.candidate && this.currentCallState.callId) {
                socketManager.emit('call-ice-candidate', {
                    roomCode: this.currentRoomCode,
                    callId: this.currentCallState.callId,
                    candidate: event.candidate,
                    to: socketId
                });
            }
        };

        // Handle remote stream
        pc.ontrack = (event) => {
            console.log(`📞 Remote track received from ${socketId}`);
            const stream = event.streams[0];

            // Update peers map
            const peer = this.peers.get(socketId);
            if (peer) {
                peer.stream = stream;
            }

            // Update state
            const newStreams = new Map(this.currentCallState.remoteStreams);
            newStreams.set(socketId, stream);

            this.updateCallState({
                isConnected: true,
                remoteStreams: newStreams
            });
        };

        // Handle connection state changes
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log(`Connection state for ${socketId}: ${state}`);
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                // Remove this peer
                this.peers.delete(socketId);

                const newStreams = new Map(this.currentCallState.remoteStreams);
                newStreams.delete(socketId);
                this.updateCallState({ remoteStreams: newStreams });

                // If no peers left, end call?
                if (this.peers.size === 0) {
                    this.endCall();
                }
            }
        };

        this.peers.set(socketId, { connection: pc, stream: null });
        return pc;
    }

    /**
     * Handle incoming call offer
     */
    async handleCallOffer(data) {
        try {
            // If busy, reject
            if (this.currentCallState.isCallActive || this.currentCallState.isIncomingCall) {
                socketManager.emit('call-rejected', {
                    roomCode: data.roomCode,
                    callId: data.callId,
                    to: data.fromSocketId,
                    reason: 'busy'
                });
                return;
            }

            this.currentRoomCode = data.roomCode;
            this.updateCallState({
                isIncomingCall: true,
                remoteNickname: data.fromNickname,
                callId: data.callId,
                incomingCallerId: data.fromSocketId
            });

            const pc = await this.createPeerConnection(data.fromSocketId);
            await pc.setRemoteDescription(data.offer);

        } catch (error) {
            console.error('Failed to handle call offer:', error);
            this.rejectCall(data.callId);
        }
    }

    /**
     * Handle call answer
     */
    async handleCallAnswer(data) {
        try {
            const peer = this.peers.get(data.fromSocketId);
            if (peer && peer.connection) {
                await peer.connection.setRemoteDescription(data.answer);

                // If this is the first answer, set active
                if (!this.currentCallState.isCallActive) {
                    this.updateCallState({
                        isOutgoingCall: false,
                        isCalling: false,
                        isCallActive: true
                    });
                }
            }
        } catch (error) {
            console.error('Failed to handle call answer:', error);
        }
    }

    /**
     * Handle ICE candidate
     */
    async handleIceCandidate(data) {
        try {
            const peer = this.peers.get(data.fromSocketId);
            if (peer && peer.connection) {
                await peer.connection.addIceCandidate(data.candidate);
            }
        } catch (error) {
            console.error('Failed to handle ICE candidate:', error);
        }
    }

    /**
     * Handle call rejected
     */
    handleCallRejected(data) {
        console.log(`Call rejected by ${data.fromSocketId}. Reason: ${data.reason || 'unknown'}`);

        // If specific peer rejected, remove them
        const peer = this.peers.get(data.fromSocketId);
        if (peer) {
            if (peer.connection) peer.connection.close();
            this.peers.delete(data.fromSocketId);
        }

        // If no peers left (or if it was the only one we were calling), end call
        if (this.peers.size === 0) {
            this.endCall();
        }
    }

    /**
     * Handle call ended
     */
    handleCallEnded(data) {
        // Same as rejected, remove specific peer
        this.handleCallRejected(data);
    }

    getLocalStream() {
        return this.localStream;
    }

    getRemoteStreams() {
        return this.currentCallState.remoteStreams;
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