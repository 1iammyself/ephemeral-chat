import { useEffect, useState, useCallback } from 'react';
import { ShieldAlert, X } from 'lucide-react';
import socketManager from '../socket';

/**
 * DesktopSecurityGuard Component
 * Provides additional security measures for desktop browsers:
 * 1. Blocks keyboard shortcuts that could expose content (F12, Ctrl+Shift+I, Ctrl+U, etc.)
 * 2. Detects DevTools opening and shows a warning
 * 3. Blocks print functionality (Ctrl+P)
 * 4. Blocks right-click context menu
 * 5. Blocks drag and drop of content out of browser
 * 6. Detects screen capture API usage
 */
const DesktopSecurityGuard = () => {
  const [showWarning, setShowWarning] = useState(false);
  const [warningMessage, setWarningMessage] = useState('');

  // Detect if running on mobile - we only want this for desktop
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  const showSecurityWarning = useCallback((message) => {
    setWarningMessage(message);
    setShowWarning(true);
  }, []);

  // Emit screenshot-attempt to notify other room members
  const notifyScreenshotAttempt = useCallback(() => {
    // Extract roomCode from current URL path: /room/:roomCode
    const match = window.location.pathname.match(/\/room\/([^/]+)/);
    if (match && match[1] && socketManager.isConnected) {
      socketManager.emit('screenshot-attempt', { roomCode: match[1] });
    }
  }, []);

  // DevTools detection using window size difference
  const detectDevToolsBySize = useCallback(() => {
    const widthThreshold = window.outerWidth - window.innerWidth > 160;
    const heightThreshold = window.outerHeight - window.innerHeight > 160;
    
    if (widthThreshold || heightThreshold) {
      showSecurityWarning('Developer tools have been detected. For your security and privacy, some features may be restricted while developer tools are open.');
    }
  }, [showSecurityWarning]);

  useEffect(() => {
    if (isMobile) return;

    // Keyboard shortcut blocker
    const handleKeyDown = (e) => {
      // F12 - DevTools
      if (e.key === 'F12') {
        e.preventDefault();
        showSecurityWarning('Developer tools access has been blocked for security reasons.');
        return false;
      }

      // PrintScreen - Screenshot attempt
      if (e.key === 'PrintScreen') {
        notifyScreenshotAttempt();
        showSecurityWarning('Screenshot attempt detected. Other users in the room have been notified.');
        return;
      }

      // Win+Shift+S - Snipping Tool (Windows)
      if (e.metaKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        notifyScreenshotAttempt();
        showSecurityWarning('Screenshot attempt detected. Other users in the room have been notified.');
        return;
      }

      // Ctrl+Shift+I or Cmd+Shift+I - DevTools
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        e.preventDefault();
        showSecurityWarning('Developer tools access has been blocked for security reasons.');
        return false;
      }

      // Ctrl+Shift+J or Cmd+Shift+J - Console
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
        e.preventDefault();
        showSecurityWarning('Console access has been blocked for security reasons.');
        return false;
      }

      // Ctrl+Shift+C or Cmd+Shift+C - Element inspector
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
        e.preventDefault();
        showSecurityWarning('Element inspector has been blocked for security reasons.');
        return false;
      }

      // Ctrl+U or Cmd+U - View source
      if ((e.ctrlKey || e.metaKey) && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        showSecurityWarning('View source has been blocked for security reasons.');
        return false;
      }

      // Ctrl+P or Cmd+P - Print
      if ((e.ctrlKey || e.metaKey) && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        showSecurityWarning('Printing has been disabled to protect chat privacy.');
        return false;
      }

      // Ctrl+S or Cmd+S - Save page
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        showSecurityWarning('Saving page has been disabled to protect chat privacy.');
        return false;
      }

      // Ctrl+A or Cmd+A - Select all (outside of inputs)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          return false;
        }
      }
    };

    // Context menu (right-click) blocker
    const handleContextMenu = (e) => {
      // Allow context menu on inputs for accessibility
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      e.preventDefault();
      return false;
    };

    // Drag start blocker - prevents dragging content out
    const handleDragStart = (e) => {
      // Allow dragging files into the app, but not content out
      if (e.target.tagName === 'IMG' || e.target.draggable) {
        e.preventDefault();
        return false;
      }
    };

    // Print blocker
    const handleBeforePrint = () => {
      document.body.style.visibility = 'hidden';
    };

    const handleAfterPrint = () => {
      document.body.style.visibility = 'visible';
    };

    // Screen capture detection - intercept getDisplayMedia
    const originalGetDisplayMedia = navigator.mediaDevices?.getDisplayMedia;
    if (navigator.mediaDevices && originalGetDisplayMedia) {
      navigator.mediaDevices.getDisplayMedia = function(...args) {
        showSecurityWarning('Screen capture has been detected. Your chat content may be at risk.');
        notifyScreenshotAttempt();
        return originalGetDisplayMedia.apply(this, args);
      };
    }

    // Add event listeners
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('dragstart', handleDragStart);
    window.addEventListener('beforeprint', handleBeforePrint);
    window.addEventListener('afterprint', handleAfterPrint);

    // Listen for Electron preload's screenshot detection (more reliable than keydown in Electron)
    const handleElectronScreenshot = () => {
      notifyScreenshotAttempt();
      showSecurityWarning('Screenshot attempt detected. Other users in the room have been notified.');
    };
    window.addEventListener('electron-screenshot-attempt', handleElectronScreenshot);

    // DevTools size detection (runs periodically)
    const sizeDetectionInterval = setInterval(detectDevToolsBySize, 2000);

    // Cleanup
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('beforeprint', handleBeforePrint);
      window.removeEventListener('afterprint', handleAfterPrint);
      window.removeEventListener('electron-screenshot-attempt', handleElectronScreenshot);
      clearInterval(sizeDetectionInterval);
      
      // Restore original getDisplayMedia
      if (navigator.mediaDevices && originalGetDisplayMedia) {
        navigator.mediaDevices.getDisplayMedia = originalGetDisplayMedia;
      }
    };
  }, [isMobile, detectDevToolsBySize, showSecurityWarning, notifyScreenshotAttempt]);

  // Don't render anything on mobile
  if (isMobile) return null;

  // Warning modal when security action is detected
  if (!showWarning) return null;

  return (
    <div className="fixed inset-0 z-[999999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-500 to-orange-500 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-white">Security Notice</h3>
            </div>
            <button
              onClick={() => setShowWarning(false)}
              className="text-white/70 hover:text-white p-1 transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
            {warningMessage || 'This action has been blocked for security reasons. Ephemeral Chat protects your conversations from being easily captured or inspected.'}
          </p>

          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4">
            <p className="text-amber-800 dark:text-amber-200 text-xs">
              <strong>Why?</strong> Developer tools, screen capture, and browser shortcuts can be used to extract sensitive chat data. This protection helps keep your conversations private.
            </p>
          </div>

          <button
            onClick={() => setShowWarning(false)}
            className="w-full bg-gray-900 dark:bg-white dark:text-gray-900 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-all hover:opacity-90"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};

export default DesktopSecurityGuard;
