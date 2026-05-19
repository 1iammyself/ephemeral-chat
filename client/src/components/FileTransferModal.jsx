import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ExternalLink, Loader2 } from 'lucide-react';
import socketManager from '../socket';
import { downloadFileOnDevice } from '../utils/downloadHelper';

const FileTransferModal = ({ onClose, roomCode, recipients = [], currentUserNickname = '' }) => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(true);

    // Construct the e2ecp URL with query parameters
    // Assuming e2ecp is served at /e2ecp or on a specific port locally
    // For dev: http://localhost:5173
    // For prod: /e2ecp (via proxy) or separate domain

    // We'll trust the plan which says "Files feature... redirects users to the @[e2ecp] interface"
    // but "potentially as a pop-up".

    // State for the dynamic file server URL
    const [fileServerUrl, setFileServerUrl] = useState(null);

    // Get stable User ID (socket ID at mount) to ensure consistent identity across reconnects
    // This prevents the iframe from reloading if the socket ID changes (e.g. mobile app switch)
    const [myId] = useState(() => socketManager.socket?.id || `user_${Math.random().toString(36).substr(2, 9)}`);

    // Construct recipients string
    const recipientsStr = recipients.length > 0 ? recipients.join(',') : '';

    // Construct the full URL only when fileServerUrl is available
    const url = fileServerUrl
        ? `${fileServerUrl}?room=${roomCode}&userId=${myId}${currentUserNickname ? `&username=${encodeURIComponent(currentUserNickname)}` : ''}${recipientsStr ? `&recipients=${recipientsStr}` : ''}`
        : '';

    useEffect(() => {
        // 1. Setup Socket Listeners
        const handleServerReady = ({ url }) => {
            setFileServerUrl(url);
            // isLoading will be handled by iframe onLoad, but we can also set it here if we want to show loading until server is up
        };

        const handleReconnect = () => {
            // If socket reconnects, re-register our intent to transfer
            // but keep the same myId for the iframe
            if (socketManager.socket) {
                socketManager.socket.emit('file-transfer-start');
            }
        };

        if (socketManager.socket) {
            socketManager.socket.on('file-server-ready', handleServerReady);
            socketManager.socket.on('connect', handleReconnect); // Re-register on reconnect

            // 2. Request File Server Start
            socketManager.socket.emit('file-transfer-start');

            // 3. Send "Wake Up" signal to chat room peers (notify intent)
            socketManager.socket.emit('file-transfer-intent', {
                roomCode,
                recipients: recipients,
                senderId: myId // Send our stable ID
            });
        }

        return () => {
            // Cleanup
            if (socketManager.socket) {
                socketManager.socket.off('file-server-ready', handleServerReady);
                socketManager.socket.off('connect', handleReconnect);
                socketManager.socket.emit('file-transfer-end');
            }
        };
    }, [roomCode, recipients]);

    // ─── Bridge: Handle download requests from e2ecp iframe ───────────
    // The e2ecp iframe can't use Capacitor plugins directly (no native bridge in iframes).
    // Instead, it sends a postMessage with the file data, and we perform the download
    // using the parent window's working Capacitor Filesystem + FileOpener.
    const iframeRef = useRef(null);

    const handleIframeDownloadRequest = useCallback(async (event) => {
        // Only handle our specific message type
        if (!event.data || event.data.type !== 'e2ecp-download-request') return;


        const { requestId, fileName, mimeType, base64Data } = event.data;

        if (!base64Data || !requestId) {
            return;
        }

        // Helper to send response back to iframe — use iframeRef (more reliable
        // than event.source which can be null for cross-origin iframes in WebView)
        const sendResponse = (payload) => {
            try {
                // Try event.source first (standard approach)
                if (event.source && typeof event.source.postMessage === 'function') {
                    event.source.postMessage(payload, '*');
                    return;
                }
            } catch (e) { /* event.source may throw in some WebViews */ }

            try {
                // Fallback: use the iframe ref
                if (iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage(payload, '*');
                    return;
                }
            } catch (e) { /* iframe contentWindow may be blocked cross-origin */ }

        };

        try {
            // Convert base64 back to Blob
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType || 'application/octet-stream' });

            // Use the working download helper (has Capacitor native bridge access)
            await downloadFileOnDevice(blob, fileName, mimeType);

            sendResponse({
                type: 'e2ecp-download-response',
                requestId,
                success: true,
            });
        } catch (err) {
            sendResponse({
                type: 'e2ecp-download-response',
                requestId,
                success: false,
                error: err.message || 'Download failed',
            });
        }
    }, []);

    useEffect(() => {
        // Always set up the download bridge listener — the handler only responds
        // to 'e2ecp-download-request' messages so it's safe on all platforms.
        // The isCapacitor check inside downloadFileOnDevice determines the actual
        // download strategy (native Filesystem vs <a download>).
        window.addEventListener('message', handleIframeDownloadRequest);
        return () => {
            window.removeEventListener('message', handleIframeDownloadRequest);
        };
    }, [handleIframeDownloadRequest]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 w-[95vw] max-w-4xl h-[85vh] sm:h-[80vh] rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-200 overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <div className="flex items-center space-x-2">
                        <span className="text-lg font-bold text-gray-900 dark:text-white">{t('fileTransfer.title')}</span>
                        {recipients.length > 0 && (
                            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full font-medium">
                                {t('fileTransfer.targeting', { count: recipients.length })}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center space-x-2">
                        <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                            title={t('fileTransfer.openTab')}
                        >
                            <ExternalLink className="w-5 h-5" />
                        </a>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 relative bg-gray-50 dark:bg-gray-950">
                    {isLoading && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                        </div>
                    )}
                    <iframe
                        ref={iframeRef}
                        src={url}
                        className="w-full h-full border-0"
                        title={t('fileTransfer.encrypted')}
                        onLoad={() => url && setIsLoading(false)}
                        allow="camera; microphone; clipboard-read; clipboard-write; display-capture"
                    />
                </div>

                {/* Footer */}
                <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-800 text-center">
                    <p className="text-xs text-gray-500 dark:text-gray-500">
                        {t('fileTransfer.zeroKnowledge')}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default FileTransferModal;
