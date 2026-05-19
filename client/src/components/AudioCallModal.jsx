/**
 * AudioCallModal Component
 * Displays the audio/video call UI with controls
 * Re-implemented based on working branch implementation
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Phone,
    PhoneOff,
    Mic,
    MicOff,
    Video,
    Volume2,
    VolumeX,
    Activity,
    X
} from 'lucide-react';
import webRTCService from '../webrtc';

const AudioStream = ({ stream }) => {
    const audioRef = useRef(null);
    useEffect(() => {
        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
        }
    }, [stream]);
    return <audio ref={audioRef} autoPlay />;
};

const AudioCallModal = ({ isOpen, onClose, roomCode }) => {
    const { t } = useTranslation();
    const [callState, setCallState] = useState(webRTCService.getCurrentCallState());
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [isScrambled, setIsScrambled] = useState(false);
    const [callDuration, setCallDuration] = useState(0);

    const localAudioRef = useRef(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
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
        const localStream = webRTCService.getLocalStream();
        if (localStream && localAudioRef.current) {
            localAudioRef.current.srcObject = localStream;
            localAudioRef.current.muted = true; // Always mute local audio
        }

        if (localStream && localVideoRef.current) {
            localVideoRef.current.srcObject = localStream;
            localVideoRef.current.muted = true;
        }

        const remoteStreams = webRTCService.getRemoteStreams();
        if (remoteStreams && remoteStreams.size > 0 && remoteVideoRef.current) {
            const firstStream = remoteStreams.values().next().value;
            if (firstStream) {
                remoteVideoRef.current.srcObject = firstStream;
            }
        }
    }, [callState]);

    const handleAcceptCall = async () => {
        if (callState.callId) {
            try {
                await webRTCService.acceptCall(callState.callId);
            } catch (error) {
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
        setIsSpeakerOn(!isSpeakerOn);
    };

    const toggleScrambler = () => {
        const nowScrambled = webRTCService.toggleVoiceScrambler();
        setIsScrambled(nowScrambled);
    };

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    const getStatusText = () => {
        if (callState.isIncomingCall) return t('audio.incoming');
        if (callState.isCalling) return t('audio.calling');
        if (callState.isConnected) return t('audio.connected');
        if (callState.isCallActive) return t('audio.connecting');
        return t('audio.ended');
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
            <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden border border-gray-300 dark:border-gray-700">
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
                        <video
                            ref={remoteVideoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                        />
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
                        <div className="flex justify-center space-x-4">
                            <button
                                onClick={toggleMute}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted
                                    ? 'bg-red-500 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                            </button>

                            <button
                                onClick={toggleSpeaker}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${!isSpeakerOn
                                    ? 'bg-red-500 text-white'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                            </button>

                            <button
                                onClick={toggleScrambler}
                                title={isScrambled ? t('audio.disableScrambler') : t('audio.enableScrambler')}
                                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isScrambled
                                    ? 'bg-purple-500 text-white ring-2 ring-purple-400/50 animate-pulse shadow-lg shadow-purple-500/30'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                <Activity className="w-6 h-6" />
                            </button>

                            <button
                                onClick={handleEndCall}
                                className="w-16 h-16 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
                            >
                                <PhoneOff className="w-7 h-7" />
                            </button>
                        </div>
                    )}
                </div>

                <div className="bg-green-50 dark:bg-green-900/20 border-t border-green-100 dark:border-green-800 px-4 py-3 text-center">
                    <p className="text-green-700 dark:text-green-400 text-sm flex items-center justify-center space-x-1">
                        <span>🔒</span>
                        <span>{t('audio.encrypted')}</span>
                    </p>
                </div>

                <audio ref={localAudioRef} autoPlay muted />

                {callState.remoteStreams && Array.from(callState.remoteStreams.entries()).map(([id, stream]) => (
                    <AudioStream key={id} stream={stream} />
                ))}
            </div>
        </div>
    );
};

export default AudioCallModal;
