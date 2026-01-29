import React, { useRef, useState, useEffect, useCallback } from 'react';
import { X, Camera, RefreshCw, Check, AlertCircle, Image as ImageIcon, Wand2 } from 'lucide-react';
import { FILTERS } from '../utils/cameraFilters';

const CameraModal = ({ isOpen, onClose, onCapture }) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const galleryInputRef = useRef(null);
    const [stream, setStream] = useState(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState(null);
    const [facingMode, setFacingMode] = useState('user'); // 'user' for front, 'environment' for back
    const [previewImage, setPreviewImage] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [currentFilter, setCurrentFilter] = useState(FILTERS[0]);
    const [showFilters, setShowFilters] = useState(false);
    const streamRef = useRef(null);

    const [isViewOnce, setIsViewOnce] = useState(true);

    const startCamera = useCallback(async () => {
        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }

            setError(null);
            const constraints = {
                video: {
                    facingMode: facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
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
            setError(err.name === 'NotAllowedError' ? 'Camera permission denied' : 'Could not access camera');
        }
    }, [facingMode]);

    useEffect(() => {
        if (isOpen) {
            startCamera();
        } else {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
            setStream(null);
            setPreviewImage(null);
            setIsReady(false);
            setError(null);
            setCurrentFilter(FILTERS[0]);
            setIsViewOnce(true); // Reset to default
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

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // 1. Apply CSS Filter to Context
        context.filter = currentFilter.css;

        // 2. Draw Video Frame
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // 3. Reset Filter for Overlays
        context.filter = 'none';

        // 4. Apply Overlays (if any)
        if (currentFilter.overlay) {
            currentFilter.overlay(context, canvas.width, canvas.height);
        }

        // Convert to Base64 with high quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        setPreviewImage(dataUrl);
        setIsCapturing(false);
    };

    const handleGallerySelect = (event) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            setPreviewImage(e.target.result);
        };
        reader.readAsDataURL(file);
    };

    const handleConfirm = () => {
        if (previewImage) {
            onCapture(previewImage, isViewOnce);
            onClose();
        }
    };

    const handleRetake = () => {
        setPreviewImage(null);
        if (galleryInputRef.current) {
            galleryInputRef.current.value = '';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[110] bg-black animate-in fade-in duration-300 flex flex-col">
            {/* Hidden Gallery Input */}
            <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleGallerySelect}
                className="hidden"
            />

            {/* Header Area */}
            <div className="flex justify-end p-4 safe-area-inset-top">
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
                >
                    <X className="w-8 h-8" />
                </button>
            </div>

            {/* Viewfinder Area (Centered Window) */}
            <div className="flex-1 flex items-center justify-center p-4 min-h-0 relative">
                <div className="relative w-full h-full max-w-sm sm:max-w-md max-h-[60vh] sm:max-h-[70vh] aspect-[3/4] sm:aspect-[4/5] bg-gray-950 rounded-[40px] overflow-hidden shadow-2xl border border-white/10">
                    {error ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center bg-gray-900">
                            <AlertCircle className="w-12 h-12 text-red-500/50 mb-4" />
                            <p className="text-white text-sm font-medium mb-6 leading-relaxed px-4">{error}</p>
                            <button
                                onClick={startCamera}
                                className="px-8 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-bold transition-all active:scale-95"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : (
                        <div className="absolute inset-0">
                            {/* Keep video persistent to avoid stream loss on retake */}
                            <video
                                ref={videoRef}
                                autoPlay
                                playsInline
                                muted
                                style={{ filter: currentFilter.css }}
                                className={`w-full h-full object-cover transition-all duration-500 ${isReady && !previewImage ? 'opacity-100' : 'opacity-0'}`}
                            />

                            {previewImage && (
                                <img
                                    src={previewImage}
                                    alt="Preview"
                                    className="absolute inset-0 w-full h-full object-cover animate-in zoom-in-95 duration-200"
                                />
                            )}

                            {!isReady && !previewImage && (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                                    <div className="w-10 h-10 border-4 border-white/10 border-t-blue-500 rounded-full animate-spin" />
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Filter Toggle Button & Strip Area */}
            {isReady && !previewImage && !error && (
                <div className="w-full bg-black flex flex-col animate-in slide-in-from-bottom duration-300">

                    {/* Filter Strip - Conditionally rendered */}
                    {showFilters && (
                        <div className="w-full py-4 border-b border-white/10">
                            <div className="flex overflow-x-auto no-scrollbar space-x-4 px-6 snap-x justify-start sm:justify-center items-center h-20">
                                {FILTERS.map((filter) => (
                                    <button
                                        key={filter.id}
                                        onClick={() => setCurrentFilter(filter)}
                                        className={`flex flex-col items-center space-y-2 flex-shrink-0 transition-all duration-200 snap-center ${currentFilter.id === filter.id ? 'scale-110' : 'opacity-50 hover:opacity-100 scale-95'}`}
                                    >
                                        <div className={`w-12 h-12 rounded-full border-2 overflow-hidden transition-all ${currentFilter.id === filter.id ? 'border-blue-500 ring-2 ring-blue-500/30' : 'border-white/30'}`}>
                                            <div
                                                className="w-full h-full bg-cover bg-center"
                                                style={{
                                                    backgroundImage: 'url("https://images.unsplash.com/photo-1557683316-973673baf926?w=200&h=200&fit=crop")',
                                                    filter: filter.css
                                                }}
                                            />
                                        </div>
                                        <span className={`text-[9px] font-bold uppercase tracking-wider ${currentFilter.id === filter.id ? 'text-blue-400' : 'text-white'}`}>
                                            {filter.name}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Filter Toggle Trigger (Small strip above controls) */}
                    <div className="flex justify-center -mt-3 mb-1 relative z-20">
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center space-x-2 px-4 py-1.5 rounded-full backdrop-blur-md border transition-all ${showFilters ? 'bg-blue-500/20 border-blue-500 text-blue-400' : 'bg-white/10 border-white/10 text-white hover:bg-white/20'}`}
                        >
                            <Wand2 className="w-3.5 h-3.5" />
                            <span className="text-xs font-bold uppercase tracking-wide">Filters</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Controls Bar */}
            <div className={`px-8 transition-all duration-300 bg-black flex flex-col items-center safe-area-inset-bottom ${showFilters ? 'py-4' : 'py-8 sm:py-12'}`}>
                <div className="w-full max-w-xs flex items-center justify-between">
                    {previewImage ? (
                        <>
                            <button
                                onClick={handleRetake}
                                className="flex flex-col items-center space-y-2 group flex-1"
                            >
                                <div className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all active:scale-90">
                                    <RefreshCw className="w-6 h-6" />
                                </div>
                                <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Clear</span>
                            </button>

                            <button
                                onClick={() => setIsViewOnce(!isViewOnce)}
                                className={`flex flex-col items-center space-y-2 group flex-1`}
                            >
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-all active:scale-90 ${isViewOnce ? 'bg-blue-500/20 text-blue-400 border-2 border-blue-500' : 'bg-white/10 text-white border-2 border-transparent'}`}>
                                    <div className="relative font-bold text-lg">
                                        1x
                                        {!isViewOnce && <div className="absolute inset-0 flex items-center justify-center"><div className="w-full h-0.5 bg-white/50 rotate-45 transform origin-center"></div></div>}
                                    </div>
                                </div>
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${isViewOnce ? 'text-blue-400' : 'text-white/40'}`}>
                                    {isViewOnce ? 'View Once' : 'Keep'}
                                </span>
                            </button>

                            <button
                                onClick={handleConfirm}
                                className="w-20 h-20 rounded-full bg-white flex items-center justify-center text-black shadow-[0_0_30px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-90 transition-all"
                            >
                                <Check className="w-10 h-10" />
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="flex-1 flex justify-center">
                                <button
                                    onClick={() => galleryInputRef.current?.click()}
                                    className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all active:scale-90"
                                >
                                    <ImageIcon className="w-6 h-6 opacity-80" />
                                </button>
                            </div>

                            <button
                                onClick={capturePhoto}
                                disabled={!isReady || error || isCapturing}
                                className="w-20 h-20 rounded-full border-[6px] border-white/20 flex items-center justify-center active:scale-90 transition-all disabled:opacity-30"
                            >
                                <div className="w-[60px] h-[60px] rounded-full bg-white shadow-xl" />
                            </button>

                            <button
                                onClick={toggleCamera}
                                disabled={!isReady || error}
                                className="flex flex-col items-center space-y-2 group flex-1 disabled:opacity-30"
                            >
                                <div className="w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-all active:scale-90"
                                    onClick={(e) => { e.stopPropagation(); toggleCamera(); }}
                                >
                                    <RefreshCw className="w-6 h-6" />
                                </div>
                                <span className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Flip</span>
                            </button>
                        </>
                    )}
                </div>
            </div>
            <canvas ref={canvasRef} className="hidden" />
        </div>
    );
};

export default CameraModal;
