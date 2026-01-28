import React, { useState, useEffect } from 'react';
import { Loader2, ServerCrash, Wifi, WifiOff } from 'lucide-react';
import socketManager from '../socket';

const ServerStatus = () => {
    const [isConnected, setIsConnected] = useState(socketManager.isConnected);
    const [showWaking, setShowWaking] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        // Initial check
        setIsConnected(socketManager.isConnected);

        const handleConnect = () => {
            setIsConnected(true);
            setShowWaking(false);
            setError(null);
        };

        const handleDisconnect = () => {
            setIsConnected(false);
        };

        const handleError = (err) => {
            setError(err.message || 'Connection error');
        };

        socketManager.on('connect', handleConnect);
        socketManager.on('disconnect', handleDisconnect);
        socketManager.on('connect_error', handleError);

        // If not connected after 2 seconds, show "Waking server" message
        const timer = setTimeout(() => {
            if (!socketManager.isConnected) {
                setShowWaking(true);
            }
        }, 2000);

        return () => {
            socketManager.off('connect', handleConnect);
            socketManager.off('disconnect', handleDisconnect);
            socketManager.off('connect_error', handleError);
            clearTimeout(timer);
        };
    }, []);

    if (isConnected) return null;

    return (
        <div className="fixed bottom-4 left-4 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center space-x-3">
                {showWaking ? (
                    <>
                        <div className="relative">
                            <Loader2 className="h-5 w-5 text-indigo-500 animate-spin" />
                            <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                Waking server...
                            </span>
                            <span className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                                Render cold start takes ~30s
                            </span>
                        </div>
                    </>
                ) : (
                    <>
                        <WifiOff className="h-5 w-5 text-amber-500" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Connecting...
                        </span>
                    </>
                )}
            </div>
        </div>
    );
};

export default ServerStatus;
