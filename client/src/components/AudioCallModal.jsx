/**
 * AudioCallModal Component
 * Displays the audio call UI with controls - Using Agora RTC
 */

import React, { useState, useEffect, useRef } from 'react';
import {
    Phone,
    PhoneOff,
    Mic,
    MicOff,
    Volume2,
    VolumeX,
    X
} from 'lucide-react';
import agoraRTCService, { CallState } from '../services/agora-rtc';

const AudioCallModal = ({ isOpen, onClose, roomCode }) => {
    const [callState, setCallState] = useState(agoraRTCService.getCurrentCallState());
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeakerOn, setIsSpeakerOn] = useState(true);
    const [callDuration, setCallDuration] = useState(0);

    const callStartTimeRef = useRef(0);

    // Subscribe to call state changes
    useEffect(() => {
        const unsubscribe = agoraRTCService.onCallStateChange(setCallState);
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

    const handleJoinCall = async () => {
        // With Agora, joining a call is the same as starting one (join the channel)
        try {
            await agoraRTCService.joinCall(`${roomCode}_call`, 'Audio Call');
        } catch (error) {
            console.error('Failed to join call:', error);
        }
    };

    const handleEndCall = async () => {
        await agoraRTCService.endCall();
        onClose();
    };

    const toggleMute = () => {
        const isNowMuted = agoraRTCService.toggleMute();
        setIsMuted(isNowMuted);
    };

    const toggleSpeaker = () => {
        // Toggle speaker output
        setIsSpeakerOn(!isSpeakerOn);
        // Note: With Agora RTC, remote audio plays automatically
        // To mute speaker, we'd need to pause remote audio tracks
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
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden relative">
                {/* Close Button */}
                <button
                    onClick={handleEndCall}
                    className="absolute top-4 right-4 w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors z-10"
                >
                    <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </button>

                {/* Call Header */}
                <div className="bg-gradient-to-b from-blue-500 to-blue-600 px-6 py-8 text-center">
                    {/* Avatar */}
                    <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 ring-4 ring-white/30">
                        <Phone className="w-10 h-10 text-white" />
                    </div>

                    {/* Room/Call Name */}
                    <h3 className="text-xl font-semibold text-white mb-2">
                        {callState.remoteNickname || `Room: ${roomCode}`}
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

                    {/* Remote Users Count */}
                    {callState.remoteStreams && callState.remoteStreams.size > 0 && (
                        <p className="text-white/70 text-sm mt-2">
                            {callState.remoteStreams.size} participant{callState.remoteStreams.size !== 1 ? 's' : ''} in call
                        </p>
                    )}
                </div>

                {/* Call Controls */}
                <div className="px-6 py-6">
                    {!callState.isCallActive && !callState.isConnected ? (
                        // Join call button when not in a call
                        <div className="flex justify-center">
                            <button
                                onClick={handleJoinCall}
                                className="w-16 h-16 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
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

                            {/* Speaker Button */}
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
                        <span>Call powered by Agora RTC</span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AudioCallModal;
