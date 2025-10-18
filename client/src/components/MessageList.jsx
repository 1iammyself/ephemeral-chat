import React, { useState, useEffect } from 'react';
import { Clock, User, Camera } from 'lucide-react';

const MessageList = ({ messages, currentUser, messageTTL }) => {
  const [messageTimers, setMessageTimers] = useState(new Map());

  useEffect(() => {
    // Set up timers for messages with TTL
    if (messageTTL && messageTTL > 0) {
      messages.forEach(message => {
        if (message.type !== 'system' && message.type !== 'screenshot' && !messageTimers.has(message.id)) {
          const messageTime = new Date(message.timestamp).getTime();
          const expiryTime = messageTime + (messageTTL * 1000);
          const timeLeft = expiryTime - Date.now();
          
          if (timeLeft > 0) {
            const timer = setTimeout(() => {
              setMessageTimers(prev => {
                const newMap = new Map(prev);
                newMap.set(message.id, 'expired');
                return newMap;
              });
            }, timeLeft);
            
            setMessageTimers(prev => {
              const newMap = new Map(prev);
              newMap.set(message.id, timer);
              return newMap;
            });
          } else {
            setMessageTimers(prev => {
              const newMap = new Map(prev);
              newMap.set(message.id, 'expired');
              return newMap;
            });
          }
        }
      });
    }

    return () => {
      // Cleanup timers
      messageTimers.forEach(timer => {
        if (typeof timer === 'object') {
          clearTimeout(timer);
        }
      });
    };
  }, [messages, messageTTL]);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTimeLeft = (message) => {
    if (!messageTTL || messageTTL === 0 || message.type === 'system' || message.type === 'screenshot') return null;
    
    const messageTime = new Date(message.timestamp).getTime();
    const expiryTime = messageTime + (messageTTL * 1000);
    const timeLeft = Math.max(0, expiryTime - Date.now());
    
    if (timeLeft === 0) return null;
    
    if (timeLeft < 60000) {
      return `${Math.ceil(timeLeft / 1000)}s`;
    } else {
      return `${Math.ceil(timeLeft / 60000)}m`;
    }
  };

  const isMessageExpired = (message) => {
    return messageTimers.get(message.id) === 'expired';
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500">
          <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">No messages yet</p>
          <p className="text-sm">Start the conversation by sending a message!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => {
        if (message.type === 'system') {
          return (
            <div key={message.id} className="text-center">
              <div className="inline-block bg-gray-100 text-gray-600 text-sm px-3 py-1 rounded-full">
                {message.content}
              </div>
            </div>
          );
        }

        if (message.type === 'screenshot') {
          return (
            <div key={message.id} className="text-center">
              <div className="inline-block bg-orange-100 text-orange-700 text-sm px-3 py-1 rounded-full flex items-center space-x-1">
                <Camera className="w-3 h-3" />
                <span>{message.content}</span>
              </div>
            </div>
          );
        }

        const isOwnMessage = currentUser && message.sender.socketId === currentUser.socketId;
        const isExpired = isMessageExpired(message);
        const timeLeft = getTimeLeft(message);

        if (isExpired) {
          return (
            <div key={message.id} className="text-center">
              <div className="inline-block bg-gray-100 text-gray-500 text-xs px-3 py-1 rounded-full italic">
                Message expired
              </div>
            </div>
          );
        }

        return (
          <div
            key={message.id}
            className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                isOwnMessage
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-gray-200'
              }`}
            >
              {/* Sender name (only for others' messages) */}
              {!isOwnMessage && (
                <div className="text-xs font-medium text-gray-600 mb-1">
                  {message.sender.nickname}
                </div>
              )}
              
              {/* Message content */}
              <div className="break-words">
                {message.content}
              </div>
              
              {/* Timestamp and TTL */}
              <div className={`flex items-center justify-between mt-2 text-xs ${
                isOwnMessage ? 'text-primary-100' : 'text-gray-500'
              }`}>
                <span>{formatTime(message.timestamp)}</span>
                {timeLeft && (
                  <div className="flex items-center space-x-1">
                    <Clock className="w-3 h-3" />
                    <span>{timeLeft}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default MessageList;
