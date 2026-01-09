import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

/**
 * ImageReveal Component
 * Securely renders an image on a canvas only while the user is pressing.
 * Includes a dynamic watermark.
 */
const ImageReveal = ({ viewToken, watermarkSeed }) => {
    const canvasRef = useRef(null);
    const [revealActive, setRevealActive] = useState(false);
    const [imageBitmap, setImageBitmap] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [permissionWarning, setPermissionWarning] = useState(false);
    const navigate = useNavigate();

    const wipeCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, []);

    const drawImageWithWatermark = useCallback((bitmap, seed) => {
        const canvas = canvasRef.current;
        if (!canvas || !bitmap) return;

        const ctx = canvas.getContext('2d');
        const { width, height } = canvas;

        // Clear first
        ctx.clearRect(0, 0, width, height);

        // Draw image scaled to fit
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

        // Draw Watermark
        const watermarkText = seed.substring(0, 12).toUpperCase(); // Simplified hash for display
        ctx.save();
        ctx.globalAlpha = 0.05; // 5% opacity
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Inter, sans-serif';
        ctx.translate(width / 2, height / 2);
        ctx.rotate(-Math.PI / 4);

        // Draw repeated diagonal text
        for (let i = -10; i < 10; i++) {
            for (let j = -10; j < 10; j++) {
                ctx.fillText(watermarkText, i * 150, j * 50);
            }
        }
        ctx.restore();
    }, []);

    const startReveal = useCallback(async (e) => {
        if (e) e.stopPropagation();
        if (revealActive || isLoading) return;

        setIsLoading(true);
        setRevealActive(true);

        try {
            const res = await fetch('/api/reveal-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ viewToken })
            });

            if (!res.ok) throw new Error('Failed to fetch image');

            const blob = await res.blob();
            const bitmap = await createImageBitmap(blob);
            setImageBitmap(bitmap);

            // Use requestAnimationFrame for timing guarantee
            requestAnimationFrame(() => {
                drawImageWithWatermark(bitmap, watermarkSeed);
            });
        } catch (err) {
            console.error('Reveal error:', err);
            setRevealActive(false);
        } finally {
            setIsLoading(false);
        }
    }, [viewToken, watermarkSeed, revealActive, isLoading, drawImageWithWatermark]);

    const stopReveal = useCallback((e) => {
        if (e) e.stopPropagation();

        // Immediate state update
        setRevealActive(false);

        // Immediate canvas wipe (synchronous)
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        if (imageBitmap) {
            imageBitmap.close(); // Release memory immediately
            setImageBitmap(null);
        }
    }, [imageBitmap]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) stopReveal();
        };
        const handleBlur = () => stopReveal();

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('blur', handleBlur);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('blur', handleBlur);
            // Internal cleanup only, don't trigger external callbacks
            setRevealActive(false);
            const canvas = canvasRef.current;
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        };
    }, [stopReveal]);

    return (
        <div className="relative w-full h-full flex items-center justify-center sensitive-container">
            <canvas
                ref={canvasRef}
                width={800}
                height={600}
                className="max-w-full max-h-full object-contain rounded-lg shadow-2xl bg-gray-900/50 backdrop-blur-xl"
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
            />
            {!revealActive && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="bg-black/40 backdrop-blur-md p-6 rounded-2xl border border-white/10 text-center">
                        <p className="text-white font-medium mb-1">Press and Hold</p>
                        <p className="text-white/60 text-xs">to reveal image</p>
                    </div>
                </div>
            )}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
            )}
            {permissionWarning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4">
                    <div className="bg-red-500/90 backdrop-blur-md p-6 rounded-2xl border border-white/10 text-center max-w-xs">
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
