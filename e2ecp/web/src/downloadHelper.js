import { Capacitor } from '@capacitor/core';
import { toast } from 'react-hot-toast';

/**
 * Universal file download helper for E2ECP
 * Handles Capacitor (Android/iOS) native downloads + Web/Desktop fallback downloads.
 */
export async function downloadFileOnDevice(blob, filename, mimeType) {
    const type = mimeType || blob.type || 'application/octet-stream';

    // 1️⃣ Capacitor native path (Android / iOS)
    if (Capacitor.getPlatform() !== 'web') {
        try {
            const { Filesystem, Directory } = await import('@capacitor/filesystem');
            const { FileOpener } = await import('@capacitor-community/file-opener');

            // Convert Blob to Base64
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            const base64Data = await new Promise((resolve, reject) => {
                reader.onloadend = () => {
                    const base64 = reader.result.split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
            });

            // Request filesystem permissions (crucial for modern Android)
            await Filesystem.requestPermissions();

            const safeFileName = filename || 'download';

            // Write file to device's Documents directory
            const writeResult = await Filesystem.writeFile({
                path: safeFileName,
                data: base64Data,
                directory: Directory.Documents,
            });

            toast.success(`Downloaded: ${safeFileName}`, { id: 'download' });

            // Open the saved file with the native file viewer
            await FileOpener.open({
                filePath: writeResult.uri,
                contentType: type,
            });

            return true;
        } catch (capErr) {
            if (capErr?.message?.toLowerCase().includes('cancel')) return true;
            if (capErr?.message?.toLowerCase().includes('no activity')) {
                console.warn('[downloadHelper] File saved but no viewer app for this type');
                return true;
            }
            console.warn('[downloadHelper] Capacitor path failed:', capErr.message);
            // Fall through to <a> fallback
        }
    }

    // 2️⃣ Standard Web / Desktop browser fallback
    try {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename || 'download';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success("File downloaded successfully!", { id: "download" });
        return true;
    } catch (webErr) {
        console.error("Web download error:", webErr);
        toast.error("Failed to download file.", { id: "download" });
        return false;
    }
}
