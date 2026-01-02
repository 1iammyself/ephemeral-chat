import React, { useState, useEffect, useCallback } from 'react';
import { Clock, User, Eye, Lock, Image as ImageIcon, Mic } from 'lucide-react';
import ImageViewer from './ImageViewer';
import AudioPlayer from './AudioPlayer';
import socketManager from '../socket-simple';

const MessageList = ({ messages, currentUser, messageTTL }) => {
  const [messageTimers, setMessageTimers] = useState(new Map());
  const [viewingImage, setViewingImage] = useState(null);
  const [currentImageUrl, setCurrentImageUrl] = useState(null); // Save image URL separately
  const [viewedMessages, setViewedMessages] = useState(new Set());
  const [playingAudioId, setPlayingAudioId] = useState(null);

  // Listen for message-viewed events from server
  useEffect(() => {
    const handleMessageViewed = ({ messageId }) => {
      setViewedMessages(prev => new Set([...prev, messageId]));
    };

    socketManager.on('message-viewed', handleMessageViewed);

    return () => {
      socketManager.off('message-viewed', handleMessageViewed);
    };
  }, []);

  useEffect(() => {
    // Set up timers for messages with TTL
    if (messageTTL && messageTTL > 0) {
      messages.forEach(message => {
        if (message.type !== 'system' && !messageTimers.has(message.id)) {
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
    if (!messageTTL || messageTTL === 0 || message.type === 'system') return null;

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

  const isMessageViewed = useCallback((message) => {
    return message.hasBeenViewed || viewedMessages.has(message.id);
  }, [viewedMessages]);

  const handleImageClick = useCallback((message) => {
    // Don't allow viewing if already viewed
    if (isMessageViewed(message)) {
      return;
    }

    // IMPORTANT: Save the image URL FIRST before any state changes
    const imageUrl = message.content;
    // console.log('Opening image viewer with URL length:', imageUrl?.length);

    // Save both the message reference and the actual image URL
    setViewingImage(message);
    setCurrentImageUrl(imageUrl);

    // Emit message-viewed event to server
    socketManager.emit('message-viewed', { messageId: message.id });

    // Mark as viewed locally
    setViewedMessages(prev => new Set([...prev, message.id]));
  }, [isMessageViewed]);

  const handleAudioPlay = useCallback((message) => {
    if (isMessageViewed(message)) return;
    
    // Set this audio as playing to reveal the player
    setPlayingAudioId(message.id);
    
    // Don't mark as viewed immediately, wait for playback to start or end?
    // For now, let's mark as viewed when they click to listen, similar to image
    socketManager.emit('message-viewed', { messageId: message.id });
    setViewedMessages(prev => new Set([...prev, message.id]));
  }, [isMessageViewed]);

  const handleViewerClose = useCallback(() => {
    setViewingImage(null);
    setCurrentImageUrl(null);
  }, []);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium mb-2">No messages yet</p>
          <p className="text-sm">Start the conversation by sending a message!</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {messages.map((message) => {
          if (message.type === 'system') {
            return (
              <div key={message.id} className="text-center">
                <div className="inline-block bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-sm px-3 py-1 rounded-full">
                  {message.content}
                </div>
              </div>
            );
          }

          const isOwnMessage = currentUser && (
            message.sender.socketId === currentUser.socketId ||
            message.sender.socketId === currentUser.id
          );
          const isExpired = isMessageExpired(message);
          const timeLeft = getTimeLeft(message);
          const isImage = message.messageType === 'image';
          const isAudio = message.messageType === 'audio';
          const isViewOnce = message.isViewOnce;
          const hasBeenViewed = isMessageViewed(message);

          if (isExpired) {
            return (
              <div key={message.id} className="text-center">
                <div className="inline-block bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-xs px-3 py-1 rounded-full italic">
                  Message expired
                </div>
              </div>
            );
          }

          // View-once content that has been viewed
          // For audio, we keep showing the player if it's currently playing (or just unlocked for this session)
          if ((isImage || isAudio) && isViewOnce && hasBeenViewed) {
            // If it's audio and we are currently playing it, don't show the "viewed" placeholder yet
            if (isAudio && playingAudioId === message.id) {
               // Pass through to render the player
            } else {
              return (
                <div
                  key={message.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${isOwnMessage
                      ? 'bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-200'
                      : 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                      }`}
                  >
                    {!isOwnMessage && (
                      <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        {message.sender.nickname}
                      </div>
                    )}
                    <div className="flex items-center space-x-2 text-sm italic">
                      {isImage ? <Eye className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      <span>This {isImage ? 'image' : 'audio'} has been viewed</span>
                    </div>
                    <div className={`flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400`}>
                      <span>{formatTime(message.timestamp)}</span>
                      <div className="flex items-center space-x-1">
                        <Lock className="w-3 h-3 text-green-500" />
                        <span>View once</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }
          }

          return (
            <div
              key={message.id}
              className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${isOwnMessage
                  ? 'bg-primary-600 dark:bg-primary-700 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 dark:text-gray-100'
                  }`}
              >
                {/* Sender name (only for others' messages) */}
                {!isOwnMessage && (
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {message.sender.nickname}
                  </div>
                )}

                {/* Message content */}
                <div className="break-words">
                  {isImage ? (
                    // Image message
                    <div
                      className={`relative cursor-pointer ${isViewOnce && !hasBeenViewed ? 'group' : ''}`}
                      onClick={() => isViewOnce && !hasBeenViewed && handleImageClick(message)}
                    >
                      {isViewOnce && !hasBeenViewed ? (
                        // View-once image placeholder
                        <div className="w-48 h-32 bg-gray-200 dark:bg-gray-700 rounded-lg flex flex-col items-center justify-center hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                          <div className="w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center mb-2 group-hover:animate-pulse">
                            <Eye className="w-6 h-6 text-amber-500" />
                          </div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tap to view</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">Disappears after viewing</p>
                        </div>
                      ) : (
                        // Regular image preview
                        <img
                          src={message.content}
                          alt="Shared image"
                          className="max-w-48 max-h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => setViewingImage(message)}
                        />
                      )}
                    </div>
                  ) : isAudio ? (
                    // Audio message
                    <div className="min-w-[200px]">
                      {isViewOnce && !hasBeenViewed && playingAudioId !== message.id ? (
                        <div 
                          className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors ${
                            isOwnMessage 
                              ? 'bg-white/10 hover:bg-white/20' 
                              : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                          onClick={() => handleAudioPlay(message)}
                        >
                          <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center">
                            <Mic className="w-5 h-5 text-amber-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">Voice Message</p>
                            <p className="text-xs opacity-70">Tap to listen (View Once)</p>
                          </div>
                        </div>
                      ) : (
                        <AudioPlayer 
                          src={message.content} 
                          isOwnMessage={isOwnMessage}
                          autoPlay={playingAudioId === message.id}
                          onEnded={() => {
                            // Optional: do something when audio ends
                          }}
                        />
                      )}
                    </div>
                  ) : (
                    // Text message
                    message.content
                  )}
                </div>

                {/* Timestamp, TTL, and view-once indicator */}
                <div className={`flex items-center justify-between mt-2 text-xs ${isOwnMessage ? 'text-primary-100' : 'text-gray-500 dark:text-gray-400'
                  }`}>
                  <span>{formatTime(message.timestamp)}</span>
                  <div className="flex items-center space-x-2">
                    {isViewOnce && (
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3 text-amber-500" />
                        <span className="text-amber-500">View once</span>
                      </div>
                    )}
                    {timeLeft && (
                      <div className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{timeLeft}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Image Viewer Modal */}
      <ImageViewer
        isOpen={!!viewingImage}
        onClose={handleViewerClose}
        imageUrl={currentImageUrl}
        duration={20}
      />
    </>
  );
};

export default MessageList;
