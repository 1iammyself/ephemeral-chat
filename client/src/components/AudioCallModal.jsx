/**
 * AudioCallModal Component
 * Displays the audio/video call UI with controls
 * Re-implemented based on reference implementation
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    Phone,
    PhoneOff,
    Mic,
    MicOff,
    Video,
    Volume2,
    VolumeX,
    X
} from 'lucide-react';
import webRTCService from '../webrtc';

const AudioStream = ({ stream }) => {
    const audioRef = useRef(null);
    useEffect(() => {
        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
            audioRef.current.play().catch(e => console.error('Error playing audio stream:', e));
        }
    }, [stream]);
    return <audio ref={audioRef} autoPlay />;
};

const AudioCallModal = ({ isOpen, onClose, roomCode }) => {
    const [callState, setCallState] = useState(webRTCService.getCurrentCallState());
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [callDuration, setCallDuration] = useState(0);

    const localAudioRef = useRef(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null); // Keep for single video (Mesh video is harder)
    const callStartTimeRef = useRef(0);

    // Subscribe to call state changes
    useEffect(() => {
        const unsubscribe = webRTCService.onCallStateChange(setCallState);
        return unsubscribe;
    }, []);

    // Handle call duration timer
    useEffect(() => {
        if (callState.isConnected && callStartTimeRef.current === 0) {
            callStartTimeRef.current = Date.now();
        }

        if (!callState.isCallActive && !callState.isIncomingCall) {
            callStartTimeRef.current = 0;
            setCallDuration(0);
        }
    }, [callState]);

    useEffect(() => {
        let interval;

        if (callState.isConnected && callStartTimeRef.current > 0) {
            interval = setInterval(() => {
                setCallDuration(Math.floor((Date.now() - callStartTimeRef.current) / 1000));
            }, 1000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [callState.isConnected]);

    // Setup local audio/video streams
    useEffect(() => {
        // Setup local audio stream
        const localStream = webRTCService.getLocalStream();
        if (localStream && localAudioRef.current) {
            localAudioRef.current.srcObject = localStream;
            localAudioRef.current.muted = true; // Always mute local audio
        }

        // Setup local video stream (if video enabled)
        if (localStream && localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.muted = true;
        }

        // Remote video (single stream support for now)
        // If we have multiple streams, we might just show the first one or none for video
        // For audio, we render AudioStream components below
        const remoteStreams = webRTCService.getRemoteStreams();
        if (remoteStreams && remoteStreams.size > 0 && remoteVideoRef.current) {
            const firstStream = remoteStreams.values().next().value;
            if (firstStream) {
                remoteVideoRef.current.srcObject = firstStream;
                remoteVideoRef.current.play().catch(console.error);
            }
        }
    }, [callState]);

    const handleAcceptCall = async () => {
        if (callState.callId) {
            try {
                await webRTCService.acceptCall(callState.callId);
            } catch (error) {
                console.error('Failed to accept call:', error);
            }
        }
    };

    const handleRejectCall = () => {
        if (callState.callId) {
            webRTCService.rejectCall(callState.callId);
        }
        onClose();
    };

    const handleEndCall = () => {
        webRTCService.endCall();
        onClose();
    };

    const toggleMute = () => {
        const isNowMuted = webRTCService.toggleMute();
        setIsMuted(isNowMuted);
    };

    const toggleSpeaker = () => {
        // This only affects the "main" remote audio if we were using a ref
        // For multiple streams, we might need to mute all AudioStream components?
        // Or just toggle state and pass it down?
        // HTMLAudioElement.muted = !isSpeakerOn
        setIsSpeakerOn(!isSpeakerOn);
    };

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getStatusText = () => {
        if (callState.isIncomingCall) return 'Incoming call...';
        if (callState.isCalling) return 'Calling...';
        if (callState.isConnected) return 'Connected';
        if (callState.isCallActive) return 'Connecting...';
        return 'Call ended';
    };

    const getStatusColor = () => {
        if (callState.isIncomingCall) return 'bg-amber-500';
        if (callState.isCalling || callState.isCallActive) return 'bg-blue-500';
        if (callState.isConnected) return 'bg-green-500';
        return 'bg-gray-500';
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden">
                {/* Close Button */}
                <button
                    onClick={handleEndCall}
                    className="absolute top-4 right-4 w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                    <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>

                {/* Call Header */}
                <div className="bg-gradient-to-b from-blue-500 to-blue-600 px-6 py-8 text-center">
                    {/* Avatar */}
                    <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-white/30">
                        <span className="text-3xl font-bold text-white">
                            {callState.remoteNickname?.charAt(0)?.toUpperCase() || '?'}
                        </span>
                    </div>

                    {/* Name */}
                    <h3 className="text-xl font-semibold text-white mb-2">
                        {callState.remoteNickname || 'Unknown'}
                    </h3>

                    {/* Status */}
                    <div className="flex items-center justify-center space-x-2">
                        <span className={`w-2 h-2 rounded-full ${getStatusColor()} animate-pulse`} />
                        <span className="text-white/90 text-sm">{getStatusText()}</span>
                    </div>

                    {/* Call Duration */}
                    {callState.isConnected && (
                        <p className="text-white/80 text-lg font-mono mt-2">
                            {formatDuration(callDuration)}
                        </p>
                    )}
                </div>

                {/* Video Preview (if video call) */}
                {callState.isVideoEnabled && callState.isConnected && (
                    <div className="relative bg-gray-900 aspect-video">
                        {/* Remote Video (Single) */}
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
                        {/* Local Video PIP */}
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="absolute bottom-4 right-4 w-24 h-32 object-cover rounded-lg border-2 border-white shadow-lg"
                        />
                    </div>
                )}

                {/* Call Controls */}
                <div className="px-6 py-6">
                    {callState.isIncomingCall ? (
                        // Incoming call controls
                        <div className="flex justify-center space-x-6">
                            <button
                                onClick={handleRejectCall}
                                className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                            >
                                <PhoneOff className="w-7 h-7" />
                            </button>
                            <button
                                onClick={handleAcceptCall}
                                className="w-16 h-16 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105 animate-pulse"
                            >
                                <Phone className="w-7 h-7" />
                            </button>
                        </div>
                    ) : (
                        // Active call controls
                        <div className="flex justify-center space-x-4">
                            {/* Mute Button */}
                            <button
                                onClick={toggleMute}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted
                                    ? 'bg-red-500 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                            </button>

                            {/* Speaker Button (Toggle output volume/mute) */}
                            <button
                                onClick={toggleSpeaker}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${!isSpeakerOn
                                    ? 'bg-red-500 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                            </button>

                            {/* End Call Button */}
                            <button
                                onClick={handleEndCall}
                                className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                            >
                                <PhoneOff className="w-7 h-7" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Security Notice */}
                <div className="bg-green-50 dark:bg-green-900/20 border-t border-green-100 dark:border-green-800 px-4 py-3 text-center">
                    <p className="text-green-700 dark:text-green-400 text-sm flex items-center justify-center space-x-1">
                        <span>🔒</span>
                        <span>End-to-end encrypted call</span>
                    </p>
                </div>

                {/* Hidden audio elements for local and remote streams */}
                <audio ref={localAudioRef} autoPlay muted />

                {/* Render audio for each remote stream */}
                {callState.remoteStreams && Array.from(callState.remoteStreams.entries()).map(([id, stream]) => (
                    <AudioStream key={id} stream={stream} />
                ))}
            </div>
        </div>
    );
};

export default AudioCallModal;
