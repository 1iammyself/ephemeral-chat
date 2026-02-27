/**
 * WebRTC Service for Ephemeral Chat
 * Handles peer-to-peer audio/video calls using WebRTC
 * Re-implemented based on the working branch implementation
 */

import socketManager from './socket';

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

        // Voice scrambler state
        this._scramblerEnabled = false;
        this._scramblerCtx = null;       // AudioContext
        this._scramblerSource = null;     // MediaStreamSource
        this._scramblerDest = null;       // MediaStreamDestination
        this._scramblerOsc = null;        // OscillatorNode for ring modulation
        this._scramblerGain = null;       // GainNode
        this._originalAudioTrack = null;  // Original track to restore later

        this.currentCallState = {
            isCallActive: false,
            isIncomingCall: false,
            isOutgoingCall: false,
            isCalling: false,
            isConnected: false,
            isVoiceScramblerOn: false,
            remoteNickname: null,
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
            { urls: "stun:stun.relay.metered.ca:80" }
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

        // Map boolean flags to state string
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
     */
    async startCall(roomCode, recipients) {
        try {
            console.log('📞 Starting call to:', recipients.map(r => r.nickname));
            this.currentRoomCode = roomCode;
            const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

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
                const pc = await this.createPeerConnection(recipient.id);

                // Add local tracks
                this.localStream.getTracks().forEach(track => {
                    pc.addTrack(track, this.localStream);
                });

                // Create and send offer
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
     */
    async acceptCall(callId) {
        try {
            this.updateCallState({
                isIncomingCall: false,
                isCallActive: true,
                callId
            });

            // Get local media stream
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
        if (this.currentCallState.callId && this.currentRoomCode) {
            this.peers.forEach((peer, socketId) => {
                socketManager.emit('call-ended', {
                    roomCode: this.currentRoomCode,
                    callId: this.currentCallState.callId,
                    to: socketId
                });
            });
        }

        // Clean up voice scrambler
        this.disableVoiceScrambler();

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

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
            isVoiceScramblerOn: false,
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

        // Initialize candidate buffer
        const pcData = this.peers.get(socketId);
        if (pcData) pcData.pendingCandidates = [];

        pc.ontrack = (event) => {
            console.log(`\uD83D\uDCDE Remote track received from ${socketId}`);
            const stream = event.streams[0];

            const peer = this.peers.get(socketId);
            if (peer) {
                peer.stream = stream;
            }

            const newStreams = new Map(this.currentCallState.remoteStreams);
            newStreams.set(socketId, stream);

            this.updateCallState({
                isConnected: true,
                remoteStreams: newStreams
            });
        };

        pc.onconnectionstatechange = () => {
            const state = pc.connectionState;
            console.log(`Connection state for ${socketId}: ${state}`);
            if (state === 'failed' || state === 'closed') {
                this.peers.delete(socketId);

                const newStreams = new Map(this.currentCallState.remoteStreams);
                newStreams.delete(socketId);
                this.updateCallState({ remoteStreams: newStreams });

                if (this.peers.size === 0) {
                    this.endCall();
                }
            }
        };

        this.peers.set(socketId, { connection: pc, stream: null, pendingCandidates: [] });
        return pc;
    }

    async handleCallOffer(data) {
        try {
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

            // Process any buffered candidates
            const peer = this.peers.get(data.fromSocketId);
            if (peer && peer.pendingCandidates) {
                while (peer.pendingCandidates.length > 0) {
                    const candidate = peer.pendingCandidates.shift();
                    await pc.addIceCandidate(candidate).catch(e => console.warn('Delayed ICE candidate failed:', e));
                }
            }

        } catch (error) {
            console.error('Failed to handle call offer:', error);
            this.rejectCall(data.callId);
        }
    }

    async handleCallAnswer(data) {
        try {
            const peer = this.peers.get(data.fromSocketId);
            if (peer && peer.connection) {
                await peer.connection.setRemoteDescription(data.answer);

                // Process any buffered candidates
                if (peer.pendingCandidates) {
                    while (peer.pendingCandidates.length > 0) {
                        const candidate = peer.pendingCandidates.shift();
                        await peer.connection.addIceCandidate(candidate).catch(e => console.warn('Delayed ICE candidate failed:', e));
                    }
                }

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

    async handleIceCandidate(data) {
        try {
            const peer = this.peers.get(data.fromSocketId);
            if (peer && peer.connection) {
                if (peer.connection.remoteDescription) {
                    await peer.connection.addIceCandidate(data.candidate);
                } else {
                    // Buffer candidate until remote description is set
                    peer.pendingCandidates.push(data.candidate);
                    console.log(`⏳ Buffered ICE candidate for ${data.fromSocketId}`);
                }
            }
        } catch (error) {
            console.error('Failed to handle ICE candidate:', error);
        }
    }

    handleCallRejected(data) {
        console.log(`Call rejected by ${data.fromSocketId}. Reason: ${data.reason || 'unknown'}`);

        const peer = this.peers.get(data.fromSocketId);
        if (peer) {
            if (peer.connection) peer.connection.close();
            this.peers.delete(data.fromSocketId);
        }

        if (this.peers.size === 0) {
            this.endCall();
        }
    }

    handleCallEnded(data) {
        this.handleCallRejected(data);
    }

    getLocalStream() {
        return this.localStream;
    }

    getRemoteStreams() {
        return this.currentCallState.remoteStreams;
    }

    // ==================== VOICE SCRAMBLER ====================

    /**
     * Enable voice scrambler — processes local audio through a ring modulation
     * + bandpass filter pipeline and replaces the audio track on all peer connections.
     */
    enableVoiceScrambler() {
        if (this._scramblerEnabled || !this.localStream) return;

        try {
            const audioTrack = this.localStream.getAudioTracks()[0];
            if (!audioTrack) return;

            this._originalAudioTrack = audioTrack;

            // Create AudioContext and nodes
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
            const dest = ctx.createMediaStreamDestination();

            // Ring modulation: multiply signal with a sine wave to shift pitch
            const oscillator = ctx.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.value = 400; // Hz shift — gives a "robotic" effect

            const modGain = ctx.createGain();
            modGain.gain.value = 0.8;

            // Bandpass filter to shape the scrambled output
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1800;
            filter.Q.value = 0.7;

            // Additional pitch-warping filter
            const distortion = ctx.createBiquadFilter();
            distortion.type = 'highshelf';
            distortion.frequency.value = 3000;
            distortion.gain.value = 8;

            // Connect: source -> modGain <- oscillator, modGain -> filter -> distortion -> dest
            oscillator.connect(modGain.gain); // Modulate the gain with the oscillator
            source.connect(modGain);
            modGain.connect(filter);
            filter.connect(distortion);
            distortion.connect(dest);
            oscillator.start();

            // Store references for cleanup
            this._scramblerCtx = ctx;
            this._scramblerSource = source;
            this._scramblerDest = dest;
            this._scramblerOsc = oscillator;
            this._scramblerGain = modGain;

            // Replace the audio track on all active peer connections
            const scrambledTrack = dest.stream.getAudioTracks()[0];
            this.peers.forEach((peer) => {
                const senders = peer.connection.getSenders();
                const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                if (audioSender) {
                    audioSender.replaceTrack(scrambledTrack).catch(e =>
                        console.warn('Failed to replace track for scrambler:', e)
                    );
                }
            });

            this._scramblerEnabled = true;
            this.updateCallState({ isVoiceScramblerOn: true });
            console.log('🔊 Voice scrambler enabled');
        } catch (error) {
            console.error('Failed to enable voice scrambler:', error);
        }
    }

    /**
     * Disable voice scrambler — restores the original audio track.
     */
    disableVoiceScrambler() {
        if (!this._scramblerEnabled) return;

        try {
            // Restore original track on all peer connections
            if (this._originalAudioTrack) {
                this.peers.forEach((peer) => {
                    const senders = peer.connection.getSenders();
                    const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                    if (audioSender) {
                        audioSender.replaceTrack(this._originalAudioTrack).catch(e =>
                            console.warn('Failed to restore original track:', e)
                        );
                    }
                });
            }

            // Clean up audio nodes
            if (this._scramblerOsc) {
                this._scramblerOsc.stop();
                this._scramblerOsc.disconnect();
            }
            if (this._scramblerSource) this._scramblerSource.disconnect();
            if (this._scramblerGain) this._scramblerGain.disconnect();
            if (this._scramblerCtx) this._scramblerCtx.close().catch(() => { });

            this._scramblerCtx = null;
            this._scramblerSource = null;
            this._scramblerDest = null;
            this._scramblerOsc = null;
            this._scramblerGain = null;
            this._originalAudioTrack = null;
            this._scramblerEnabled = false;

            this.updateCallState({ isVoiceScramblerOn: false });
            console.log('🔇 Voice scrambler disabled');
        } catch (error) {
            console.error('Failed to disable voice scrambler:', error);
        }
    }

    /**
     * Toggle voice scrambler on/off
     */
    toggleVoiceScrambler() {
        if (this._scramblerEnabled) {
            this.disableVoiceScrambler();
        } else {
            this.enableVoiceScrambler();
        }
        return this._scramblerEnabled;
    }

    isVoiceScramblerEnabled() {
        return this._scramblerEnabled;
    }

    // ==================== MUTE ====================

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

export const webRTCService = new WebRTCService();
export default webRTCService;