import React, { useState, useEffect } from 'react';
import { Lock } from 'lucide-react';

/**
 * PrivacyOverlay Component
 * Renders a black screen when the app is not in focus or visible.
 * Optimized for iOS Safari to prevent sensitive snapshots in the app switcher.
 */
const PrivacyOverlay = () => {
    const [isLocked, setIsLocked] = useState(false);

    useEffect(() => {
        const lock = () => {
            setIsLocked(true);
            document.body.classList.add('protected-mode');
        };

        const unlock = () => {
            // Small delay when returning to prevent flickering
            setTimeout(() => {
                setIsLocked(false);
                document.body.classList.remove('protected-mode');
            }, 50);
        };

        const handleVisibilityChange = () => {
            if (document.hidden) {
                lock();
            } else {
                unlock();
            }
        };

        // Standard events
        window.addEventListener('blur', lock);
        window.addEventListener('focus', unlock);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // iOS Safari specific lifecycle events
        window.addEventListener('pagehide', lock);
        window.addEventListener('pageshow', unlock);

        // Initial check
        if (document.hidden) {
            lock();
        }

        return () => {
            window.removeEventListener('blur', lock);
            window.removeEventListener('focus', unlock);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', lock);
            window.removeEventListener('pageshow', unlock);
            document.body.classList.remove('protected-mode');
        };
    }, []);

    if (!isLocked) return null;

    return (
        <div
            className="fixed inset-0 z-[1000000] bg-black flex flex-col items-center justify-center p-6 text-center"
            style={{ pointerEvents: 'all' }}
        >
            <div className="bg-gray-900/50 backdrop-blur-xl p-8 rounded-3xl border border-white/10 flex flex-col items-center max-w-sm w-full shadow-2xl">
                <div className="w-16 h-16 bg-primary-500/20 rounded-full flex items-center justify-center mb-6">
                    <Lock className="w-8 h-8 text-primary-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Secure Session</h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                    Content is hidden for your privacy while the app is out of focus.
                </p>
            </div>
        </div>
    );
};

export default PrivacyOverlay;
