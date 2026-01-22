import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ShieldAlert } from 'lucide-react';

/**
 * ImageReveal Component
 * Securely renders an image on a canvas only while the user is pressing.
 */
const ImageReveal = ({ viewToken }) => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [revealActive, setRevealActive] = useState(false);
    const [imageBitmap, setImageBitmap] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isHolding, setIsHolding] = useState(false);
    const [permissionWarning, setPermissionWarning] = useState(false);

    // Wipe canvas helper
    const wipeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, []);

    // Draw image helper
    const drawImage = useCallback((bitmap) => {
        const canvas = canvasRef.current;
        if (!canvas || !bitmap) return;

        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;
        ctx.clearRect(0, 0, width, height);

        const imgAspect = bitmap.width / bitmap.height;
        const canvasAspect = width / height;
        let drawWidth, drawHeight, x, y;

        if (imgAspect > canvasAspect) {
            drawWidth = width;
            drawHeight = width / imgAspect;
            x = 0;
            y = (height - drawHeight) / 2;
        } else {
            drawHeight = height;
            drawWidth = height * imgAspect;
            x = (width - drawWidth) / 2;
            y = 0;
        }

        ctx.drawImage(bitmap, x, y, drawWidth, drawHeight);
    }, []);

    // PRE-FETCH IMAGE DATA
    useEffect(() => {
        if (!viewToken) return;

        let active = true;
        const fetchImage = async () => {
            setIsLoading(true);
            try {
                const res = await fetch('/api/reveal-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ viewToken })
                });

                if (!res.ok) throw new Error('Failed to fetch image');

                const blob = await res.blob();
                const bitmap = await createImageBitmap(blob);

                if (active) {
                    setImageBitmap(bitmap);
                } else {
                    bitmap.close();
                }
            } catch (err) {
                if (process.env.NODE_ENV !== 'production') {
                    console.error('Reveal fetch error:', err);
                }
            } finally {
                if (active) setIsLoading(false);
            }
        };

        fetchImage();
        return () => {
            active = false;
        };
    }, [viewToken]);

    // Update reveal state based on holding and readiness
    useEffect(() => {
        if (isHolding && imageBitmap && !isLoading) {
            setRevealActive(true);
        } else {
            setRevealActive(false);
        }
    }, [isHolding, imageBitmap, isLoading]);

    // Handle Reveal Logic
    const startReveal = useCallback((e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            try {
                if (e.target.setPointerCapture) {
                    e.target.setPointerCapture(e.pointerId);
                }
            } catch (err) { }
        }
        setIsHolding(true);
    }, []);

    const stopReveal = useCallback((e) => {
        if (e) {
            e.stopPropagation();
            try {
                if (e.target.releasePointerCapture) {
                    e.target.releasePointerCapture(e.pointerId);
                }
            } catch (err) { }
        }
        setIsHolding(false);
    }, []);

    // Update canvas based on reveal state
    useEffect(() => {
        if (revealActive && imageBitmap) {
            drawImage(imageBitmap);
        } else {
            wipeCanvas();
        }
    }, [revealActive, imageBitmap, drawImage, wipeCanvas]);

    // Cleanup resources
    useEffect(() => {
        return () => {
            if (imageBitmap) {
                imageBitmap.close();
            }
        };
    }, [imageBitmap]);

    // Handle visibility/blur interrupts
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) setIsHolding(false);
        };
        const handleBlur = () => setIsHolding(false);

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleBlur);
        };
    }, []);

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full flex items-center justify-center sensitive-container cursor-pointer bg-gray-900/40"
            onPointerDown={startReveal}
            onPointerUp={stopReveal}
            onPointerCancel={stopReveal}
            onPointerLeave={stopReveal}
            onContextMenu={(e) => e.preventDefault()}
            style={{
                touchAction: 'none',
                userSelect: 'none',
                WebkitUserSelect: 'none',
                WebkitTouchCallout: 'none'
            }}
        >
            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-black/20 backdrop-blur-xl pointer-events-none transition-opacity duration-300"
                style={{ opacity: revealActive ? 1 : 0 }}
            />

            {!revealActive && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-end pb-12 pointer-events-none">
                    <div className="bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 text-center animate-pulse">
                        <p className="text-white font-medium text-sm">
                            {isHolding ? 'Preparing image...' : 'Press and Hold to reveal image'}
                        </p>
                    </div>
                </div>
            )}

            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}

            {permissionWarning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4">
                    <div className="bg-red-500/90 backdrop-blur-md p-6 rounded-2xl border border-white/10 text-center max-w-xs transition-all duration-300">
                        <ShieldAlert className="w-10 h-10 text-white mx-auto mb-3" />
                        <p className="text-white font-bold mb-1">Security Lockdown</p>
                        <p className="text-white/80 text-xs leading-relaxed">
                            Clipboard permission is required to verify your environment. Please reset site permissions to continue.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ImageReveal;
