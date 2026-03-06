/**
 * Universal file download helper for E2ECP
 *
 * Handles file downloads across all platforms:
 *   1. Capacitor native app (iframe inside Capacitor WebView)
 *      → postMessage to parent window, which uses Filesystem + FileOpener
 *   2. Mobile web (Chrome Android / Safari) → navigator.share with File
 *   3. Desktop browser → <a download> click
 *
 * KEY INSIGHT: The e2ecp web app runs inside an iframe in the Capacitor app.
 * The Capacitor bridge is NOT available inside the iframe. So we detect the
 * Capacitor WebView via the custom user agent string "EphemeralChatApp" and
 * use postMessage to delegate the download to the parent window which HAS
 * the Capacitor bridge and native filesystem access.
 */

import toast from 'react-hot-toast';

// ─── Platform detection ───────────────────────────────────
// Detect if we're inside the Capacitor app's WebView (works even in iframes)
const isInsideCapacitorApp = /EphemeralChatApp/i.test(navigator.userAgent);
const isInIframe = window !== window.parent;
const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// When inside the Capacitor app iframe, we MUST use postMessage to parent
const shouldDelegateToParent = isInsideCapacitorApp && isInIframe;

// Pending download promise resolvers (keyed by requestId)
const pendingDownloadResolvers = new Map();

// Listen for download responses from the parent window
if (shouldDelegateToParent) {
    window.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'e2ecp-download-response') return;

        const { requestId, success, error } = event.data;
        const resolver = pendingDownloadResolvers.get(requestId);
        if (resolver) {
            pendingDownloadResolvers.delete(requestId);
            if (success) {
                resolver.resolve({ confirmed: true });
            } else {
                resolver.reject(new Error(error || 'Download failed in parent'));
            }
        }
    });
}

/**
 * Generate a unique request ID for postMessage round-trips
 */
function generateRequestId() {
    return `dl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Download / save a file on any platform.
 *
 * @param {Blob} blob       - The file data as a Blob
 * @param {string} fileName - Suggested file name (e.g. "photo.jpg")
 * @param {string} [mimeType] - Optional MIME type override
 */
export async function downloadFileOnDevice(blob, fileName, mimeType) {
    const type = mimeType || blob.type || 'application/octet-stream';
    const safeFileName = fileName || 'download';

    // ── Strategy 1: Delegate to parent Capacitor app via postMessage ──
    // This is the ONLY reliable way to save files when running inside an
    // iframe in the Capacitor WebView. The parent has the native bridge.
    if (shouldDelegateToParent) {
        try {
            const base64Data = await blobToBase64(blob);
            const requestId = generateRequestId();

            // Create a promise that resolves on parent response OR assumes
            // success after 5 seconds (the response back from the cross-origin
            // parent may not arrive in some Android WebView versions, but the
            // download itself succeeds on the parent side).
            const downloadPromise = new Promise((resolve, reject) => {
                pendingDownloadResolvers.set(requestId, { resolve, reject });

                // After 5 seconds with no response, assume the parent handled
                // the download (the message was sent; the parent has the native
                // bridge and will download the file even if the response is lost)
                setTimeout(() => {
                    if (pendingDownloadResolvers.has(requestId)) {
                        pendingDownloadResolvers.delete(requestId);
                        resolve({ confirmed: false }); // optimistic success
                    }
                }, 5000);
            });

            // Send the file data to the parent window
            window.parent.postMessage({
                type: 'e2ecp-download-request',
                requestId,
                fileName: safeFileName,
                mimeType: type,
                base64Data,
            }, '*');

            console.log('[downloadHelper] Sent download request to parent:', requestId);
            toast.loading(`Saving ${safeFileName}...`, { id: 'download' });

            const result = await downloadPromise;
            if (result.confirmed) {
                toast.success(`Downloaded: ${safeFileName}`, { id: 'download' });
            } else {
                // Parent didn't respond but likely downloaded — show success
                toast.success(`Saved: ${safeFileName}`, { id: 'download' });
            }
            return true;
        } catch (parentErr) {
            console.warn('[downloadHelper] Parent postMessage download failed:', parentErr.message);
            toast.error(`Download failed: ${parentErr.message}`, { id: 'download' });
            // Fall through to other strategies
        }
    }

    // ── Strategy 2: Web Share API with file (mobile browsers) ──
    if (isMobile && navigator.share && navigator.canShare) {
        try {
            const file = new File([blob], safeFileName, { type });
            if (navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: safeFileName });
                return true;
            }
        } catch (shareError) {
            if (shareError.name === 'AbortError') return false; // user cancelled
            console.warn('[downloadHelper] navigator.share failed:', shareError.message);
            // Fall through to <a> fallback
        }
    }

    // ── Strategy 3: Desktop fallback — <a download> click ──
    try {
        const url = URL.createObjectURL(new Blob([blob], { type }));
        const a = document.createElement('a');
        a.href = url;
        a.download = safeFileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 5000);

        toast.success('File downloaded successfully!', { id: 'download' });
        return true;
    } catch (webErr) {
        console.error('[downloadHelper] Web download error:', webErr);
        toast.error('Failed to download file.', { id: 'download' });
        return false;
    }
}

/**
 * Download / save a file from a data URL (base64 string like "data:image/png;base64,...")
 *
 * @param {string} dataUrl  - The data URL string
 * @param {string} fileName - Suggested file name
 */
export async function downloadDataUrlOnDevice(dataUrl, fileName) {
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    return downloadFileOnDevice(blob, fileName, blob.type);
}

/**
 * Download / save a file from an object URL (blob:http://...)
 *
 * @param {string} objectUrl - The blob URL
 * @param {string} fileName  - Suggested file name
 * @param {string} [mimeType] - Optional MIME type
 */
export async function downloadObjectUrlOnDevice(objectUrl, fileName, mimeType) {
    const response = await fetch(objectUrl);
    const blob = await response.blob();
    return downloadFileOnDevice(blob, fileName, mimeType || blob.type);
}

// ─── Helpers ──────────────────────────────────────────────

/**
 * Convert a Blob to a pure base64 string (no data: prefix)
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            // reader.result is "data:<mime>;base64,XXXX"
            const base64 = reader.result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}
