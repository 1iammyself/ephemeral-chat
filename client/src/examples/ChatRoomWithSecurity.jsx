/**
 * Example: Chat Room Component with Security Features
 * Copy this pattern to integrate security into your existing chat components
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';
import InactivityWarning from '../components/InactivityWarning';
import { clearAllSensitiveData } from '../utils/security';
import socketManager from '../socket';

function ChatRoomWithSecurity() {
  const navigate = useNavigate();
  
  // State
  const [messages, setMessages] = useState([]);
  const [showWarning, setShowWarning] = useState(false);
  const [inactivityTimeoutMs, setInactivityTimeoutMs] = useState(15 * 60 * 1000);
  const [isConnected, setIsConnected] = useState(false);

  // Logout handler
  const handleLogout = useCallback(() => {
    console.log('🔒 Logging out user due to inactivity...');
    
    // Clear all sensitive data
    clearAllSensitiveData();
    
    // Disconnect socket
    socketManager.disconnect();
    
    // Navigate to home with message
    navigate('/', { 
      state: { 
        message: 'You have been logged out due to inactivity',
        type: 'info'
      } 
    });
  }, [navigate]);

  // Inactivity timeout hook
  const { 
    timeRemaining, 
    isWarning, 
    resetTimer, 
    formatTimeRemaining 
  } = useInactivityTimeout({
    timeoutMs: inactivityTimeoutMs,
    socket: socketManager.socket,
    enabled: isConnected,
    onTimeout: handleLogout,
    onWarning: () => {
      console.log('⚠️ Inactivity warning triggered');
      setShowWarning(true);
    },
    warningThresholdMs: 2 * 60 * 1000 // 2 minutes warning
  });

  // Socket connection setup
  useEffect(() => {
    const socket = socketManager.connect();
    
    socket.on('connect', () => {
      setIsConnected(true);
      console.log('✅ Connected to server');
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      console.log('❌ Disconnected from server');
    });

    // Handle server-initiated timeout
    socket.on('inactivity-timeout', (data) => {
      console.log('⏰ Server timeout:', data);
      handleLogout();
    });

    // Handle new messages
    socket.on('new-message', (message) => {
      setMessages(prev => [...prev, message]);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('inactivity-timeout');
      socket.off('new-message');
    };
  }, [handleLogout]);

  // Handle continue from warning
  const handleContinue = useCallback(() => {
    console.log('✅ User chose to stay connected');
    setShowWarning(false);
    resetTimer();
  }, [resetTimer]);

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Secure Chat Room
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
            </p>
          </div>
          
          <button
            onClick={handleLogout}
            className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
          >
            Leave Room
          </button>
        </div>
      </header>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-12">
              <p>No messages yet. Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900 dark:text-white">
                    {msg.sender.nickname}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-gray-700 dark:text-gray-300">
                  {msg.content}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Message Input */}
      <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 shadow-lg">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={(e) => {
            e.preventDefault();
            const input = e.target.elements.message;
            if (input.value.trim()) {
              socketManager.emit('send-message', { content: input.value });
              input.value = '';
            }
          }}>
            <div className="flex gap-2">
              <input
                name="message"
                type="text"
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                maxLength={500}
                disabled={!isConnected}
              />
              <button
                type="submit"
                disabled={!isConnected}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded-lg transition-colors"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Inactivity Warning Modal */}
      <InactivityWarning 
        isOpen={showWarning}
        timeRemaining={timeRemaining}
        onContinue={handleContinue}
        onLogout={handleLogout}
      />

      {/* Time Remaining Indicator (shows when warning is active) */}
      {isWarning && (
        <div className="fixed bottom-20 right-4 bg-yellow-100 dark:bg-yellow-900 px-4 py-3 rounded-lg shadow-xl border-2 border-yellow-400 dark:border-yellow-600 animate-pulse">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Session Expiring Soon
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                Time remaining: <strong>{formatTimeRemaining()}</strong>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatRoomWithSecurity;
