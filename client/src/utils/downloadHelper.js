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
  // @capacitor/share can share files if we convert the blob to a data URI
  // or a temporary file URL. The simplest cross-platform approach is
  // converting to a base64 data URI and using the Share plugin.
  if (isCapacitor) {
    try {
      const { Share } = await import('@capacitor/share');
      const { Filesystem, Directory } = await import('@capacitor/filesystem');

      // Write blob to a temp file in the cache directory
      const base64Data = await blobToBase64(blob);
      const tempPath = `download_${Date.now()}_${fileName}`;

      const writeResult = await Filesystem.writeFile({
        path: tempPath,
        data: base64Data,
        directory: Directory.Cache,
      });

      // Share the file URI — this opens the Android/iOS share sheet
      // where the user can pick "Save to Files", "Save Image", etc.
      await Share.share({
        title: fileName,
        url: writeResult.uri,
        dialogTitle: `Save ${fileName}`,
      });

      // Clean up temp file after a delay
      setTimeout(async () => {
        try {
          await Filesystem.deleteFile({ path: tempPath, directory: Directory.Cache });
        } catch (_) { /* ignore cleanup errors */ }
      }, 30000);

      return true;
    } catch (capError) {
      console.warn('[downloadHelper] Capacitor share/filesystem failed:', capError.message);
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
