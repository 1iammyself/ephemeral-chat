/**
 * Inactivity Warning Modal Component
 * Displays a warning when user is about to be logged out due to inactivity
 */

import React from 'react';
import { formatTimeRemaining } from '../utils/security';

const InactivityWarning = ({ 
  isOpen, 
  timeRemaining, 
  onContinue, 
  onLogout 
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6 animate-fade-in">
        {/* Icon */}
        <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-yellow-100 dark:bg-yellow-900 rounded-full">
          <svg 
            className="w-6 h-6 text-yellow-600 dark:text-yellow-400" 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" 
            />
          </svg>
        </div>

        {/* Title */}
        <h3 className="text-xl font-semibold text-center text-gray-900 dark:text-white mb-2">
          Still There?
        </h3>

        {/* Message */}
        <p className="text-center text-gray-600 dark:text-gray-300 mb-4">
          You've been inactive for a while. For security reasons, you'll be automatically 
          disconnected in:
        </p>

        {/* Countdown */}
        <div className="text-center mb-6">
          <div className="text-3xl font-bold text-red-600 dark:text-red-400">
            {formatTimeRemaining(timeRemaining)}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            remaining
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onLogout}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
          >
            Logout Now
          </button>
          <button
            onClick={onContinue}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Stay Connected
          </button>
        </div>

        {/* Info */}
        <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-4">
          This helps protect your privacy and security
        </p>
      </div>
    </div>
  );
};

export default InactivityWarning;
