/**
 * React hook for detecting user inactivity and triggering auto-logout
 * Monitors user interactions and communicates with server
 */

import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Hook to track user inactivity and trigger timeout actions
 * @param {Object} options - Configuration options
 * @param {number} options.timeoutMs - Inactivity timeout in milliseconds
 * @param {Function} options.onTimeout - Callback when user times out
 * @param {Function} options.onWarning - Callback when warning threshold is reached
 * @param {number} options.warningThresholdMs - Time before timeout to show warning (default 2 minutes)
 * @param {boolean} options.enabled - Whether tracking is enabled
 * @param {Object} options.socket - Socket.IO client instance
 * @returns {Object} { timeRemaining, isWarning, resetTimer }
 */
export function useInactivityTimeout({
  timeoutMs = 15 * 60 * 1000, // 15 minutes default
  onTimeout,
  onWarning,
  warningThresholdMs = 2 * 60 * 1000, // 2 minutes warning
  enabled = true,
  socket = null
}) {
  const [timeRemaining, setTimeRemaining] = useState(timeoutMs);
  const [isWarning, setIsWarning] = useState(false);
  const timeoutRef = useRef(null);
  const warningTimeoutRef = useRef(null);
  const intervalRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  // Reset the inactivity timer
  const resetTimer = useCallback(() => {
    if (!enabled) return;

    // Clear existing timers
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
    }
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    // Reset state
    lastActivityRef.current = Date.now();
    setTimeRemaining(timeoutMs);
    setIsWarning(false);

    // Notify server of activity
    if (socket && socket.emit) {
      socket.emit('user-activity');
    }

    // Set warning timer
    const warningTime = timeoutMs - warningThresholdMs;
    if (warningTime > 0) {
      warningTimeoutRef.current = setTimeout(() => {
        setIsWarning(true);
        if (onWarning) {
          onWarning(warningThresholdMs);
        }
      }, warningTime);
    }

    // Set timeout timer
    timeoutRef.current = setTimeout(() => {
      console.log('⏰ User inactivity timeout reached');
      if (onTimeout) {
        onTimeout();
      }
    }, timeoutMs);

    // Update time remaining every second
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const remaining = Math.max(0, timeoutMs - elapsed);
      setTimeRemaining(remaining);

      if (remaining === 0) {
        clearInterval(intervalRef.current);
      }
    }, 1000);
  }, [enabled, timeoutMs, warningThresholdMs, onTimeout, onWarning, socket]);

  // Handle user activity events
  const handleActivity = useCallback(() => {
    if (!enabled) return;
    resetTimer();
  }, [enabled, resetTimer]);

  // Set up event listeners for user activity
  useEffect(() => {
    if (!enabled) return;

    // List of events that indicate user activity
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    // Throttle activity updates to avoid excessive calls
    let throttleTimeout = null;
    const throttledHandleActivity = () => {
      if (!throttleTimeout) {
        handleActivity();
        throttleTimeout = setTimeout(() => {
          throttleTimeout = null;
        }, 5000); // Throttle to once per 5 seconds
      }
    };

    // Add event listeners
    events.forEach(event => {
      window.addEventListener(event, throttledHandleActivity, { passive: true });
    });

    // Initialize timer
    resetTimer();

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, throttledHandleActivity);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (throttleTimeout) clearTimeout(throttleTimeout);
    };
  }, [enabled, handleActivity, resetTimer]);

  // Listen for server-side timeout events
  useEffect(() => {
    if (!socket || !enabled) return;

    const handleServerTimeout = (data) => {
      console.log('🔒 Server initiated timeout:', data);
      if (onTimeout) {
        onTimeout(data);
      }
    };

    socket.on('inactivity-timeout', handleServerTimeout);

    return () => {
      socket.off('inactivity-timeout', handleServerTimeout);
    };
  }, [socket, enabled, onTimeout]);

  return {
    timeRemaining,
    isWarning,
    resetTimer,
    formatTimeRemaining: () => {
      const minutes = Math.floor(timeRemaining / 60000);
      const seconds = Math.floor((timeRemaining % 60000) / 1000);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
  };
}

/**
 * Hook to display inactivity warning modal
 * @param {Object} options - Configuration options
 * @returns {Object} Modal state and controls
 */
export function useInactivityWarning({
  isWarning,
  timeRemaining,
  onContinue,
  onLogout
}) {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    setShowWarning(isWarning);
  }, [isWarning]);

  const handleContinue = useCallback(() => {
    setShowWarning(false);
    if (onContinue) {
      onContinue();
    }
  }, [onContinue]);

  const handleLogout = useCallback(() => {
    setShowWarning(false);
    if (onLogout) {
      onLogout();
    }
  }, [onLogout]);

  return {
    showWarning,
    timeRemaining,
    handleContinue,
    handleLogout,
    closeWarning: () => setShowWarning(false)
  };
}

export default useInactivityTimeout;
