import React, { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { RefreshCw, Download, Info } from 'lucide-react';

/**
 * Detects if the app is running as a standalone PWA on iOS
 */
export const isIOSPWA = () => {
    return (
        window.navigator.standalone === true ||
        window.matchMedia('(display-mode: standalone)').matches
    );
};

/**
 * A drop-in Refresh button that only shows in PWA standalone mode
 */
export const RefreshButton = ({ className = "" }) => {
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Show button if in standalone mode (iOS or Android) OR in development mode for testing
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone ||
        import.meta.env.DEV;

    if (!isStandalone) return null;

    const handleRefresh = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsRefreshing(true);
        // Add a small delay to show animation
        setTimeout(() => {
            window.location.reload();
        }, 500);
    };

    return (
        <button
            onClick={handleRefresh}
            className={`p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all text-gray-500 dark:text-gray-400 flex items-center justify-center group ${className}`}
            title="Refresh App"
        >
            <RefreshCw className={`w-5 h-5 transition-all duration-500 ${isRefreshing ? 'animate-spin text-blue-500 scale-110' : 'group-hover:rotate-180 group-active:scale-90'}`} />
        </button>
    );
};

/**
 * Main PWA Handler component to be placed at the root of the app
 */
const PWAHandler = () => {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [updateTrigger, setUpdateTrigger] = useState(null);

    useEffect(() => {
        if ('serviceWorker' in navigator && import.meta.env.PROD) {
            const updateSW = registerSW({
                onNeedRefresh() {
                    console.log('New version available, updating automatically...');
                    updateSW(true);
                },
            });

            // Periodic check for updates (every hour)
            const interval = setInterval(() => {
                updateSW();
            }, 60 * 60 * 1000);

            return () => clearInterval(interval);
        }
    }, []);

    // Handle iOS PWA specific behaviors
    useEffect(() => {
        if (!isIOSPWA()) return;

        let backgroundTime = 0;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                backgroundTime = Date.now();
            } else if (document.visibilityState === 'visible') {
                const timeElapsed = Date.now() - backgroundTime;

                // If the app was backgrounded for more than 5 minutes, reload to ensure fresh state
                // and bypass potential stale screenshots on iOS.
                if (backgroundTime > 0 && timeElapsed > 5 * 60 * 1000) {
                    console.log('PWA resumed after long backgrounding. Reloading for freshness...');
                    window.location.reload();
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    return null;
};

export default PWAHandler;
