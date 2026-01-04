/**
 * ImageViewer Component
 * Displays view-once images with a countdown timer
 * Image disappears after the timer expires
 */

import React, { useState, useEffect, useCallback } from 'react';
import { X, Clock, Eye, AlertTriangle } from 'lucide-react';

const ImageViewer = ({ isOpen, onClose, imageUrl, duration = 20 }) => {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [isVisible, setIsVisible] = useState(false);

  // Handle visibility change (tab switching)
  const handleVisibilityChange = useCallback(() => {
    if (document.hidden && isOpen) {
      onClose();
    }
  }, [isOpen, onClose]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e) => {
    // Close on Escape
    if (e.key === 'Escape') {
      onClose();
    }
    // Prevent common save/screenshot shortcuts
    if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
    }
  }, [onClose]);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setTimeLeft(duration);

      // Add event listeners
      document.addEventListener('visibilitychange', handleVisibilityChange);
      document.addEventListener('keydown', handleKeyDown);

      // Start countdown timer
      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            onClose();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        document.removeEventListener('keydown', handleKeyDown);
      };
    } else {
      setIsVisible(false);
      setTimeLeft(duration);
    }
  }, [isOpen, duration, onClose, handleVisibilityChange, handleKeyDown]);

  if (!isOpen) return null;

  // Debug logging removed to avoid leaking base64 and cluttering console

  // Calculate progress percentage for timer ring
  const progressPercentage = (timeLeft / duration) * 100;
  const circumference = 2 * Math.PI * 20; // radius = 20
  const strokeDashoffset = circumference - (progressPercentage / 100) * circumference;

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex items-center justify-center"
      onClick={onClose}
    >
      {/* Timer Display */}
      <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-black/80 backdrop-blur-sm rounded-full px-5 py-3 flex items-center space-x-3">
          {/* Circular Timer */}
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 transform -rotate-90">
              {/* Background circle */}
              <circle
                cx="20"
                cy="20"
                r="18"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="3"
                fill="none"
              />
              {/* Progress circle */}
              <circle
                cx="20"
                cy="20"
                r="18"
                stroke={timeLeft <= 5 ? '#ef4444' : '#22c55e'}
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 18}
                strokeDashoffset={(2 * Math.PI * 18) - ((timeLeft / duration) * 2 * Math.PI * 18)}
                className="transition-all duration-1000"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm">
              {timeLeft}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-white font-medium text-sm">View Once</span>
            <span className="text-gray-400 text-xs">Disappears in {timeLeft}s</span>
          </div>
        </div>
      </div>

      {/* Close Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-6 right-6 w-12 h-12 bg-black/80 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/90 transition-colors z-10"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Image Content */}
      {isVisible && imageUrl && (
        <img
          src={imageUrl}
          alt="View once image"
          className="max-w-[90vw] max-h-[80vh] object-contain rounded-lg shadow-2xl"
          style={{
            userSelect: 'none',
            WebkitUserSelect: 'none',
            MozUserSelect: 'none',
            msUserSelect: 'none',
            pointerEvents: 'none'
          }}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Warning Banner */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-amber-500/90 backdrop-blur-sm rounded-lg px-4 py-2 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-white" />
          <p className="text-white text-sm font-medium">
            This image will disappear after viewing
          </p>
        </div>
      </div>
    </div>
  );
};

export default ImageViewer;
