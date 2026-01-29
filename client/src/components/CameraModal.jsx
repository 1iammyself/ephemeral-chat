import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, Check, AlertCircle } from 'lucide-react';

const CameraModal = ({ isOpen, onClose, onCapture }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const [facingMode, setFacingMode] = useState('user'); // 'user' for front, 'environment' for back
    const [previewImage, setPreviewImage] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const streamRef = useRef(null);

    const startCamera = useCallback(async () => {
        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            setError(null);
            const constraints = {
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false // Pictures only
            };

            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = newStream;
            setStream(newStream);
            if (videoRef.current) {
                videoRef.current.srcObject = newStream;
            }
            setIsReady(true);
        } catch (err) {
            console.error('Camera Error:', err);
            if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                setError('Camera permission denied. Please enable camera access in your browser settings.');
            } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                setError('No camera found on this device.');
            } else {
                setError('Failed to access camera. It might be used by another app.');
            }
        }
    }, [facingMode]);

    useEffect(() => {
        if (isOpen) {
            startCamera();
        } else {
            // Clean up when explicitly closed
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            setStream(null);
            setPreviewImage(null);
            setIsReady(false);
            setError(null);
        }
        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, [isOpen, startCamera]);

    const toggleCamera = () => {
        setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
        setIsReady(false);
    };

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current || !isReady) return;

        setIsCapturing(true);
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const context = canvas.getContext('2d');

        // Set canvas dimensions to match video stream
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw video frame to canvas
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Convert to Base64
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        setPreviewImage(dataUrl);
        setIsCapturing(false);
    };

    const handleConfirm = () => {
        if (previewImage) {
            onCapture(previewImage);
            onClose();
        }
    };

    const handleRetake = () => {
        setPreviewImage(null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="relative w-full max-w-2xl bg-gray-900 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col aspect-[4/3] sm:aspect-video">

                {/* Header */}
                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/60 to-transparent">
                    <h3 className="text-white font-bold text-lg hidden sm:block">Camera</h3>
                    <button
                        onClick={onClose}
                        className="p-2 bg-black/40 hover:bg-black/60 rounded-full text-white transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Viewfinder / Preview */}
                <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden">
                    {error ? (
                        <div className="p-8 text-center max-w-sm">
                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                                <AlertCircle className="w-10 h-10" />
                            </div>
                            <p className="text-white font-medium mb-4">{error}</p>
                            <button
                                onClick={startCamera}
                                className="btn-primary px-6 py-2 rounded-xl text-sm"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : previewImage ? (
                        <img
                            src={previewImage}
                            alt="Capture Preview"
                            className="w-full h-full object-contain animate-in zoom-in-95 duration-200"
                        />
                    ) : (
                        <>
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                className={`w-full h-full object-cover transition-opacity duration-500 ${isReady ? 'opacity-100' : 'opacity-0'}`}
                            />
                            {!isReady && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                                </div>
                            )}
                        </>
                    )}
                    <canvas ref={canvasRef} className="hidden" />
                </div>

                {/* Controls Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8 bg-gradient-to-t from-black/80 to-transparent z-20">
                    <div className="flex items-center justify-around max-w-md mx-auto">
                        {previewImage ? (
                            <>
                                <button
                                    onClick={handleRetake}
                                    className="flex flex-col items-center group"
                                >
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white mb-2 transition-all">
                                        <X className="w-6 h-6" />
                                    </div>
                                    <span className="text-[10px] sm:text-xs text-white/70 font-bold uppercase tracking-widest">Retake</span>
                                </button>
                                <button
                                    onClick={handleConfirm}
                                    className="flex flex-col items-center group scale-110"
                                >
                                    <div className="w-16 h-16 sm:w-18 sm:h-18 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white mb-2 shadow-lg shadow-green-500/40 transition-all">
                                        <Check className="w-8 h-8" />
                                    </div>
                                    <span className="text-[10px] sm:text-xs text-green-400 font-bold uppercase tracking-widest">Send</span>
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={toggleCamera}
                                    disabled={!isReady || error}
                                    className="flex flex-col items-center group disabled:opacity-30"
                                >
                                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white mb-2 transition-all group-active:scale-95">
                                        <RefreshCw className="w-6 h-6" />
                                    </div>
                                    <span className="text-[10px] sm:text-xs text-white/70 font-bold uppercase tracking-widest">Flip</span>
                                </button>

                                <button
                                    onClick={capturePhoto}
                                    disabled={!isReady || error || isCapturing}
                                    className="relative group disabled:opacity-50"
                                >
                                    {/* Ring */}
                                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full border-4 border-white flex items-center justify-center transition-all group-active:scale-95">
                                        {/* Shutter Button */}
                                        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white group-hover:bg-white/90 scale-90 transition-all" />
                                    </div>
                                </button>

                                <div className="w-12 h-12 sm:w-14 sm:h-14" /> {/* Spacer */}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CameraModal;
