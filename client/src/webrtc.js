/**
 * WebRTC Service for Ephemeral Chat
 * Handles peer-to-peer audio/video calls using WebRTC
 * Re-implemented based on reference implementation
 */

import socketManager from './socket-simple';
import { EXPRESS_TURN, AGORA, METERED } from './utils/credentials';
// Agora SDK will be loaded dynamically when needed
let AgoraRTC = null;

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

    // Use secure credentials for ExpressTURN and Agora
    // Metered is kept as a redundant backup
    this.iceServers = configuredIceServers.length > 0 ? configuredIceServers : [
            // Google STUN (priority)
            { urls: "stun:stun.l.google.com:19302" },

            // ExpressTURN (UDP then TCP)
            {
                urls: "turn:free.expressturn.com:3478?transport=udp",
                username: EXPRESS_TURN.username,
                credential: EXPRESS_TURN.credential
            },
            {
                urls: "turn:free.expressturn.com:3478?transport=tcp",
                username: EXPRESS_TURN.username,
                credential: EXPRESS_TURN.credential
            },

            // Metered (legacy, doomsday backup)
            {
                urls: "turn:relay.metered.ca:80",
                username: METERED.username,
                credential: METERED.credential
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

            // If group call (>3 total participants), bypass P2P and use Agora
            if (recipients.length > 2) {
                console.log('Group call detected, switching to Agora');
                await this.switchToAgora('group-call', { roomCode, recipients });
                return;
            }

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

            // Attach and play remote audio stream for this peer
            if (stream && event.track && event.track.kind === 'audio') {
                let audioElem = document.getElementById(`remote-audio-${socketId}`);
                if (!audioElem) {
                    audioElem = document.createElement('audio');
                    audioElem.id = `remote-audio-${socketId}`;
                    audioElem.autoplay = true;
                    audioElem.style.display = 'none';
                    document.body.appendChild(audioElem);
                }
                audioElem.srcObject = stream;
                audioElem.play().catch(e => console.warn('Remote audio play failed:', e));
            }

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

        // Handle connection state changes and detect firewall blocks
        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log(`Connection state for ${socketId}: ${state}`);
            if (state === 'failed' || state === 'disconnected' || state === 'closed') {
                // If P2P failed, attempt to switch to Agora
                if (!this._switchedToAgora) {
                    console.warn('P2P connection failure detected, switching to Agora');
                    this.switchToAgora('connection-failure');
                }

                // Remove this peer
                this.peers.delete(socketId);

                const newStreams = new Map(this.currentCallState.remoteStreams);
                newStreams.delete(socketId);
                this.updateCallState({ remoteStreams: newStreams });

                // If no peers left, end call
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

// --- Hybrid failover helpers ---

// Monitor network quality for P2P calls
WebRTCService.prototype._startStatsMonitor = function() {
    if (this._statsInterval || this._switchedToAgora) return;

    this._statsInterval = setInterval(async () => {
        if (!this.peers || this.peers.size === 0 || this._switchedToAgora) return;

        for (const [socketId, peer] of this.peers) {
            const pc = peer.connection;
            if (!pc) continue;

            try {
                const stats = await pc.getStats();
                stats.forEach(report => {
                    if (report.type === 'inbound-rtp' && (report.kind === 'video' || report.mediaType === 'video')) {
                        const packetsLost = report.packetsLost || 0;
                        const packetsReceived = report.packetsReceived || 0;
                        const lossRatio = packetsReceived > 0 ? packetsLost / packetsReceived : 0;
                        if (lossRatio > 0.05) {
                            console.warn('High packet loss detected for', socketId, lossRatio);
                            this.switchToAgora('poor-network');
                        }
                    }
                });
            } catch (e) {
                console.warn('Failed to get stats for', socketId, e);
            }
        }
    }, 5000);
};

WebRTCService.prototype._stopStatsMonitor = function() {
    if (this._statsInterval) {
        clearInterval(this._statsInterval);
        this._statsInterval = null;
    }
};

// Switch to Agora: clean up P2P and start Agora SDK
WebRTCService.prototype.switchToAgora = async function(reason, opts = {}) {
    if (this._switchedToAgora) return;
    this._switchedToAgora = true;

    console.log('Switching to Agora due to:', reason);
    this.updateCallState({ isCallActive: false });

    // Stop stats monitor
    this._stopStatsMonitor();

    // Close and cleanup P2P
    if (this.localStream) {
        this.localStream.getTracks().forEach(t => t.stop());
        this.localStream = null;
    }

    this.peers.forEach(peer => {
        if (peer.connection) try { peer.connection.close(); } catch(e) {}
    });
    this.peers.clear();

    // Dynamically import Agora (browser-ready SDK expected)
    try {
        if (!AgoraRTC) {
            AgoraRTC = await import('agora-rtc-sdk-ng');
        }

        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

        // Use appId from credentials
        const appId = AGORA.appId;
        const channel = this.currentRoomCode || (opts.roomCode || `room_${Date.now()}`);
        const token = AGORA.token || null;
        const uid = AGORA.uid || null;

        await client.join(appId, channel, token, uid);

        // Create and publish local audio/video tracks
        const [microphoneTrack, cameraTrack] = await AgoraRTC.createMicrophoneAndCameraTracks();
        await client.publish([microphoneTrack, cameraTrack]);

        console.log('Agora joined and published tracks');
        this.updateCallState({ isCallActive: true, isConnected: true });

        // Optionally, setup remote user subscribed handlers
        client.on('user-published', async (user, mediaType) => {
            await client.subscribe(user, mediaType);
            let stream = null;
            if (mediaType === 'audio' && user.audioTrack) {
                stream = new MediaStream([user.audioTrack.getMediaStreamTrack()]);
                user.audioTrack.play();
            }
            if (mediaType === 'video' && user.videoTrack) {
                stream = new MediaStream([user.videoTrack.getMediaStreamTrack()]);
            }
            if (stream) {
                const newStreams = new Map(this.currentCallState.remoteStreams);
                newStreams.set(`agora_${user.uid}`, stream);
                this.updateCallState({ remoteStreams: newStreams });
            }
        });

        // Store agora client for potential future use
        this._agoraClient = client;

    } catch (e) {
        console.error('Failed to initialize Agora fallback', e);
        // In case Agora fails, there's nothing more we can do here; keep state updated
        this.updateCallState({ isCallActive: false, isConnected: false });
    }
};


// Create singleton instance
export const webRTCService = new WebRTCService();
export default webRTCService;