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
  const [newMessages, setNewMessages] = useState(new Set());

  // Listen for message-viewed events from server
  useEffect(() => {
    const handleMessageViewed = ({ messageId, userId }) => {
      // console.log(`Event: message-viewed`, { messageId, userId, currentUserId: currentUser?.id, currentUserSocket: currentUser?.socketId });

      // Only mark as viewed locally if WE viewed it
      if (currentUser && (userId === currentUser.id || userId === currentUser.socketId)) {
        setViewedMessages(prev => new Set([...prev, messageId]));
      }
    };

    socketManager.on('message-viewed', handleMessageViewed);

    return () => {
      socketManager.off('message-viewed', handleMessageViewed);
    };
  }, [currentUser]);

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
              // Start vanishing animation
              setMessageTimers(prev => {
                const newMap = new Map(prev);
                newMap.set(message.id, 'vanishing');
                return newMap;
              });

              // Truly expire after animation
              setTimeout(() => {
                setMessageTimers(prev => {
                  const newMap = new Map(prev);
                  newMap.set(message.id, 'expired');
                  return newMap;
                });
              }, 500); // Match CSS animation duration
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
  }, [messages, messageTTL, messageTimers]);

  // Track new messages for delivery glow
  useEffect(() => {
    messages.forEach(msg => {
      if (!newMessages.has(msg.id)) {
        setNewMessages(prev => new Set([...prev, msg.id]));
        // Remove from newMessages after animation
        setTimeout(() => {
          setNewMessages(prev => {
            const next = new Set(prev);
            next.delete(msg.id);
            return next;
          });
        }, 2000);
      }
    });
  }, [messages]);

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

  const isMessageVanishing = (message) => {
    return messageTimers.get(message.id) === 'vanishing';
  };

  const isMessageViewed = useCallback((message) => {
    // Check if we have viewed it locally OR if the server says we viewed it
    const myId = currentUser?.id || currentUser?.socketId;
    const serverSaysViewed = message.viewedBy && Array.isArray(message.viewedBy) && message.viewedBy.includes(myId);

    // Debug logging
    // if (message.isViewOnce) {
    //   console.log(`Msg ${message.id} check: MyID=${myId}, ViewedBy=${JSON.stringify(message.viewedBy)}, ServerSays=${serverSaysViewed}, Local=${viewedMessages.has(message.id)}`);
    // }

    return viewedMessages.has(message.id) || serverSaysViewed;
  }, [viewedMessages, currentUser]);

  const handleImageClick = useCallback((message) => {
    // Don't allow viewing if already viewed
    if (isMessageViewed(message)) {
      return;
    }

    // IMPORTANT: Save the image URL FIRST before any state changes
    const imageUrl = message.content;

    // Save both the message reference and the actual image URL
    setViewingImage(message);
    setCurrentImageUrl(message.isViewOnce ? message.id : imageUrl);

    // Emit message-viewed event to server
    socketManager.emit('message-viewed', { messageId: message.id });

    // Mark as viewed locally
    setViewedMessages(prev => new Set([...prev, message.id]));

    // If it's view-once, we'll trigger the vanish animation when the viewer closes
    // or immediately if it's not an image
  }, [isMessageViewed]);

  const handleAudioPlay = useCallback((message) => {
    if (isMessageViewed(message)) return;
    setPlayingAudioId(message.id);
  }, [isMessageViewed]);

  const handleAudioEnded = useCallback((message) => {
    // Mark viewed and request deletion for view-once audio once playback finishes
    socketManager.emit('message-viewed', { messageId: message.id });
    socketManager.emit('delete-message', { messageId: message.id });
    setViewedMessages(prev => new Set([...prev, message.id]));
    setPlayingAudioId(null);

    // Trigger vanish animation for audio
    if (message.isViewOnce) {
      setMessageTimers(prev => {
        const newMap = new Map(prev);
        newMap.set(message.id, 'vanishing');
        return newMap;
      });
      setTimeout(() => {
        setMessageTimers(prev => {
          const newMap = new Map(prev);
          newMap.set(message.id, 'expired');
          return newMap;
        });
      }, 500);
    }
  }, []);

  const handleViewerClose = useCallback(() => {
    if (viewingImage && viewingImage.isViewOnce) {
      const msgId = viewingImage.id;
      // Trigger vanish animation for the image message in the list
      setMessageTimers(prev => {
        const newMap = new Map(prev);
        newMap.set(msgId, 'vanishing');
        return newMap;
      });
      setTimeout(() => {
        setMessageTimers(prev => {
          const newMap = new Map(prev);
          newMap.set(msgId, 'expired');
          return newMap;
        });
      }, 500);
    }
    setViewingImage(null);
    setCurrentImageUrl(null);
  }, [viewingImage]);

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
            return null;
          }

          // View-once content that has been viewed
          // For audio, we keep showing the player if it's currently playing (or just unlocked for this session)
          if ((isImage || isAudio) && isViewOnce) {
            // If I sent it, I can't view it
            if (isOwnMessage) {
              return (
                <div
                  key={message.id}
                  className={`flex justify-end`}
                >
                  <div className="max-w-xs lg:max-w-md px-4 py-3 rounded-lg bg-gray-300 dark:bg-gray-600 text-gray-600 dark:text-gray-200">
                    <div className="flex items-center space-x-2 text-sm italic">
                      {isImage ? <Eye className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      <span>View Once {isImage ? 'Photo' : 'Audio'} Sent</span>
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

            // If I viewed it, show placeholder for images; for audio we rely on deletion on end
            if (hasBeenViewed) {
              // If it's audio and we are currently playing it, don't show the "viewed" placeholder yet
              if (isAudio && playingAudioId === message.id) {
                // Pass through to render the player
              } else if (!isAudio) {
                return null;
              }
            }
          }

          return (
            <div
              key={message.id}
              className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'} ${isMessageVanishing(message) ? 'message-vanishing' : ''} ${newMessages.has(message.id) ? 'message-new' : ''}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg transition-all duration-300 ${isOwnMessage
                  ? 'bg-primary-600 dark:bg-primary-700 text-white'
                  : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 dark:text-gray-100'
                  } ${isOwnMessage && newMessages.has(message.id) ? 'message-delivered-glow' : ''}`}
              >
                {/* Sender name (only for others' messages) */}
                {!isOwnMessage && (
                  <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    {message.sender.nickname}
                  </div>
                )}

                {/* Message content */}
                <div className="break-words no-copy" onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onPaste={(e) => e.preventDefault()}>
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
                          className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors ${isOwnMessage
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
                      ) : isOwnMessage && isViewOnce ? (
                        // Sender cannot play their own view-once audio
                        <div className="px-3 py-2 rounded-lg bg-gray-200/60 dark:bg-gray-700/60 text-xs text-gray-700 dark:text-gray-200">
                          You sent a view-once voice note
                        </div>
                      ) : (
                        <AudioPlayer
                          src={fixAudioContentForPlayback(message.content)}
                          isOwnMessage={isOwnMessage}
                          autoPlay={playingAudioId === message.id}
                          onEnded={() => handleAudioEnded(message)}
                        />
// ...existing code...
// --- Utility: Fix audio content for Safari/desktop playback ---
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

// --- Utility: Fix audio content for Safari/desktop playback ---
function fixAudioContentForPlayback(content) {
  // If already a data URL or blob, return as is
  if (typeof content !== 'string' || content.startsWith('http') || content.startsWith('blob:') || content.startsWith('data:')) {
    return content;
  }
  // Try to detect and wrap as data URL with best guess at MIME type
  // Default to WAV for Safari, WebM for others
  let mimeType = 'audio/webm;codecs=opus';
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  if (isSafari) {
    mimeType = 'audio/wav';
  }
  // Heuristic: if base64 starts with 'UklGR' it's likely WAV
  if (content.startsWith('UklGR')) {
    mimeType = 'audio/wav';
  } else if (content.startsWith('SUQz')) {
    mimeType = 'audio/mp3';
  } else if (content.startsWith('AAAA')) {
    mimeType = 'audio/mp4';
  } else if (content.startsWith('T2dn')) {
    mimeType = 'audio/ogg';
  }
  return `data:${mimeType};base64,${content}`;
}
