/**
 * Universal file download helper
 *
 * Handles file downloads across all platforms:
 *   1. Capacitor native app → @capacitor/share (share sheet → "Save to Files" / "Save Image")
 *   2. Mobile web (Chrome Android / Safari) → navigator.share with File
 *   3. Desktop browser → <a download> click
 *
 * The key problem: Android WebView (Capacitor) does NOT support the `download`
 * attribute on <a> elements, so `a.click()` silently fails. We must use the
 * native Share plugin to let the OS handle the file.
 */

import { isCapacitor, isMobile } from './platform';
import { toast } from 'react-toastify';

/**
 * Download / save a file on any platform.
 *
 * @param {Blob} blob       - The file data as a Blob
 * @param {string} fileName - Suggested file name (e.g. "photo.jpg")
 * @param {string} [mimeType] - Optional MIME type override
 */
export async function downloadFileOnDevice(blob, fileName, mimeType) {
  const type = mimeType || blob.type || 'application/octet-stream';

  // ── Strategy 1: Capacitor native share ──────────────────
  // On Android/iOS: writes file to Documents, then opens it with the native file viewer.
  if (isCapacitor) {
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { FileOpener } = await import('@capacitor-community/file-opener');

      // Request filesystem permissions (crucial for modern Android)
      await Filesystem.requestPermissions();

      const base64Data = await blobToBase64(blob);
      const safeFileName = fileName || 'download';

      // Write file to device's Documents directory
      const writeResult = await Filesystem.writeFile({
        path: safeFileName,
        data: base64Data,
        directory: Directory.Documents,
      });

      toast.success(`Downloaded: ${safeFileName}`);

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
      // Fall through to navigator.share or <a> fallback
    }
  }

  // ── Strategy 2: Web Share API with file (mobile browsers) ──
  if (isMobile && navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], fileName, { type });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: fileName });
        return true;
      }
    } catch (shareError) {
      if (shareError.name === 'AbortError') return false; // user cancelled
      console.warn('[downloadHelper] navigator.share failed:', shareError.message);
      // Fall through to <a> fallback
    }
  }

  // ── Strategy 3: Desktop fallback — <a download> click ──
  const url = URL.createObjectURL(new Blob([blob], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 5000);

  return true;
}

/**
 * Download / save a file from a data URL (base64 string like "data:image/png;base64,...")
 *
 * @param {string} dataUrl  - The data URL string
 * @param {string} fileName - Suggested file name
 */
export async function downloadDataUrlOnDevice(dataUrl, fileName) {
  // Convert data URL to Blob
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
