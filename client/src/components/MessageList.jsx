import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, User, Eye, Lock, Image as ImageIcon, Mic, Reply, Smile, Plus, FileText, Download, Check, CheckCheck, Pencil, X, Pin, MessageSquare } from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useTheme } from '../context/ThemeContext';
import ImageViewer from './ImageViewer';
import AudioPlayer from './AudioPlayer';
import PollMessage from './PollMessage';
import socketManager from '../socket';
import { getVibeById } from '../utils/vibes';
import LinkPreviewModal, { isDomainTrusted } from './LinkPreviewModal';
import LinkPreviewCard from './LinkPreviewCard';
import { toast } from 'react-toastify';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🔥', '🙏', '💯', '👌', '😍', '😒', '😘', '😁', '😊', '💕', '🎶', '🤷‍♂️', '😑', '😶‍🌫️', '😉', '✨', '⚡', '🎉', '👏', '👀', '🤔', '😎', '🙌', '🎈', '⭐', '🌈', '🥳', '🤯', '💎', '🎨', '🍕', '🐱', '🦋', '🍀', '🍕', '🍔', '🍦', '🍩', '🍺', '🎸', '🎮', '🚀', '🌈', '🍄'];

const MessageList = ({ messages, currentUser, messageTTL, onVote, onReply, onReact, onEdit, onDelete, onPin, onViewThread, isHost, pinnedMessageId, roomVibe, linkPreviews = {}, onOpenEmojiPicker, highlightMap = {}, focusedMessageId = null, onStegoExtract }) => {
  const [activeReactionId, setActiveReactionId] = useState(null);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { messageId, x, y, messageText, senderNickname }
  const { theme } = useTheme();
  const currentVibe = getVibeById(roomVibe);
  const [messageTimers, setMessageTimers] = useState(new Map());
  const ttlTimerIdsRef = React.useRef({});
  const [viewingImage, setViewingImage] = useState(null);
  const [currentImageUrl, setCurrentImageUrl] = useState(null);
  const [viewedMessages, setViewedMessages] = useState(new Set());
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [newMessages, setNewMessages] = useState(new Set());
  const [linkPreviewUrl, setLinkPreviewUrl] = useState(null);

  // Swipe to reply / Long press to react states
  const touchState = React.useRef({
    startX: 0,
    startY: 0,
    messageId: null,
    longPressTimer: null,
    isSwipe: false
  });

  // Click away listener for reaction bar and context menu
  useEffect(() => {
    const handleClickAway = (e) => {
      if (activeReactionId && !e.target.closest('.reaction-container')) {
        setActiveReactionId(null);
        setShowFullPicker(false);
      }
      if (contextMenu && !e.target.closest('.msg-context-menu')) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('touchstart', handleClickAway, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('touchstart', handleClickAway);
    };
  }, [activeReactionId, contextMenu]);

  // Listen for message-viewed events from server
  useEffect(() => {
    const handleMessageViewed = ({ messageId, userId }) => {
      if (currentUser && (userId === currentUser.id || userId === currentUser.socketId)) {
        setViewedMessages(prev => new Set([...prev, messageId]));
      }
    };
    socketManager.on('message-viewed', handleMessageViewed);
    return () => socketManager.off('message-viewed', handleMessageViewed);
  }, [currentUser]);

  // Set up TTL timers for new messages.
  // No cleanup here — cancelling timers on every messages update would prevent expiry.
  // Unmount cleanup is handled by the separate effect below.
  useEffect(() => {
    messages.forEach(message => {
      const ttl = message.overrideTtl || messageTTL;
      if (!ttl || ttl <= 0 || message.type === 'system') return;
      if (messageTimers.has(message.id)) return;
      if (ttlTimerIdsRef.current[message.id]) return;

      const messageTime = new Date(message.timestamp).getTime();
      const expiryTime = messageTime + (ttl * 1000);
      const timeLeft = expiryTime - Date.now();

      if (timeLeft > 0) {
        const timerId = setTimeout(() => {
          setMessageTimers(prev => new Map(prev).set(message.id, 'vanishing'));
          setTimeout(() => {
            setMessageTimers(prev => new Map(prev).set(message.id, 'expired'));
            delete ttlTimerIdsRef.current[message.id];
          }, 500);
        }, timeLeft);
        ttlTimerIdsRef.current[message.id] = timerId;
        setMessageTimers(prev => new Map(prev).set(message.id, timerId));
      } else {
        setMessageTimers(prev => new Map(prev).set(message.id, 'expired'));
      }
    });
  }, [messages, messageTTL]);

  // Cancel all pending TTL timers on unmount
  useEffect(() => {
    return () => {
      Object.values(ttlTimerIdsRef.current).forEach(id => clearTimeout(id));
    };
  }, []);

  // Read Receipt Observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const msgId = entry.target.dataset.id;
          if (msgId && !viewedMessages.has(msgId)) {
            const msg = messages.find(m => m.id === msgId);
            const isOwn = msg && currentUser && (
              msg.sender.id === currentUser.id ||
              msg.sender.socketId === currentUser.socketId ||
              (currentUser.nickname && msg.sender.nickname === currentUser.nickname)
            );

            // BUG FIX: Don't auto-read view-once images/audio
            const isAutoViewable = msg && !(msg.isViewOnce && (msg.messageType === 'image' || msg.messageType === 'audio'));

            if (!isOwn && isAutoViewable) {
              socketManager.emit('message-viewed', { messageId: msgId });
              setViewedMessages(prev => new Set([...prev, msgId]));
            }
          }
        }
      });
    }, { threshold: 0.5 });

    const elements = document.querySelectorAll('.message-item');
    elements.forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, [messages, viewedMessages, currentUser]);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getTimeLeft = (message) => {
  const ttl = message.overrideTtl || messageTTL;
    if (!ttl || ttl === 0 || message.type === 'system') return null;
    const messageTime = new Date(message.timestamp).getTime();
    const expiryTime = messageTime + (ttl * 1000);
    const timeLeft = Math.max(0, expiryTime - Date.now());
    if (timeLeft === 0) return null;
    return timeLeft < 60000 ? `${Math.ceil(timeLeft / 1000)}s` : `${Math.ceil(timeLeft / 60000)}m`;
  };

  const isMessageViewed = useCallback((message) => {
    const myId = currentUser?.id || currentUser?.socketId;
    const serverSaysViewed = message.viewedBy && Array.isArray(message.viewedBy) && message.viewedBy.includes(myId);
    return viewedMessages.has(message.id) || serverSaysViewed;
  }, [viewedMessages, currentUser]);

  const handleImageClick = useCallback((message) => {
    // For view-once, prevent re-opening if already viewed
    if (message.isViewOnce && isMessageViewed(message)) return;

    setViewingImage(message);
    setCurrentImageUrl(message.content);

    // Only mark as viewed/burned if it is actually view-once
    if (message.isViewOnce) {
      socketManager.emit('message-viewed', { messageId: message.id });
      setViewedMessages(prev => new Set([...prev, message.id]));
    }
  }, [isMessageViewed]);

  const handleAudioPlay = useCallback((message) => {
    if (isMessageViewed(message)) return;
    setPlayingAudioId(message.id);
  }, [isMessageViewed]);

  const handleAudioEnded = useCallback((message) => {
    if (message.isViewOnce) {
      socketManager.emit('message-viewed', { messageId: message.id });
      socketManager.emit('delete-message', { messageId: message.id });
      setMessageTimers(prev => new Map(prev).set(message.id, 'vanishing'));
      setTimeout(() => setMessageTimers(prev => new Map(prev).set(message.id, 'expired')), 500);
    }
    setViewedMessages(prev => new Set([...prev, message.id]));
    setPlayingAudioId(null);
  }, []);

  const handleViewerClose = useCallback(() => {
    if (viewingImage && viewingImage.isViewOnce) {
      const msgId = viewingImage.id;
      setMessageTimers(prev => new Map(prev).set(msgId, 'vanishing'));
      setTimeout(() => setMessageTimers(prev => new Map(prev).set(msgId, 'expired')), 500);
      socketManager.emit('delete-message', { messageId: msgId });
    }
    setViewingImage(null);
    setCurrentImageUrl(null);
  }, [viewingImage]);

  // Handle link click — check if domain is trusted, otherwise show modal
  const handleLinkClick = useCallback((url, e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const hostname = new URL(url).hostname;
      if (isDomainTrusted(hostname)) {
        // Trusted domain — open directly
        if (window.electronAPI?.openUrlExternal) {
          window.electronAPI.openUrlExternal(url);
        } else {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
        return;
      }
    } catch { /* invalid URL, show modal */ }
  }, []);

  // Touch handlers for mobile swipe-to-reply and long-press-to-react
  const handleTouchStart = (e, message) => {
    if (e.touches.length > 1) return;
    const touch = e.touches[0];
    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      messageId: message.id,
      isSwipe: false,
      longPressTimer: setTimeout(() => {
        if (!touchState.current.isSwipe) {
          navigator.vibrate?.(50);
          setActiveReactionId(message.id);
          setShowFullPicker(false);
          touchState.current.messageId = null;
        }
      }, 500)
    };
  };

  const handleTouchMove = (e, message) => {
    if (!touchState.current.messageId || touchState.current.messageId !== message.id) return;
    const touch = e.touches[0];
    const diffX = touch.clientX - touchState.current.startX;
    const diffY = Math.abs(touch.clientY - touchState.current.startY);

    if (diffY > 20) {
      clearTimeout(touchState.current.longPressTimer);
      touchState.current.messageId = null;
      return;
    }

    if (Math.abs(diffX) > 10) {
      touchState.current.isSwipe = true;
      clearTimeout(touchState.current.longPressTimer);
      const el = document.getElementById(message.id)?.querySelector('.group\\\\/bubble');
      if (el) {
        const boundedDiff = Math.max(-60, Math.min(60, diffX));
        el.style.transform = `translateX(${boundedDiff}px)`;
      }
    }
  };

  const handleTouchEnd = (e, message) => {
    if (!touchState.current.messageId || touchState.current.messageId !== message.id) return;
    clearTimeout(touchState.current.longPressTimer);
    const touch = e.changedTouches[0];
    const diffX = touch.clientX - touchState.current.startX;

    if (touchState.current.isSwipe && Math.abs(diffX) > 40) {
      navigator.vibrate?.(50);
      onReply(message);
    }

    const el = document.getElementById(message.id)?.querySelector('.group\\\\/bubble');
    if (el) {
      el.style.transform = '';
      el.style.transition = 'transform 0.2s ease-out';
      setTimeout(() => { if (el) el.style.transition = ''; }, 200);
    }
    touchState.current.messageId = null;
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <User className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-1">No messages yet</p>
          <p className="text-sm opacity-60">Start the conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-2 sm:space-y-3 pb-4 px-2 sm:px-4">
      {messages.filter(m => messageTimers.get(m.id) !== 'expired' && !m.parentId).map((message, index) => {
        const isOwnMessage = currentUser && (
          message.sender.socketId === currentUser.socketId ||
          message.sender.id === currentUser.id ||
          (currentUser.nickname && message.sender.nickname === currentUser.nickname)
        );

        const isVanishing = messageTimers.get(message.id) === 'vanishing';
        const timeLeft = getTimeLeft(message);
        const isImage = message.messageType === 'image';
        const isAudio = message.messageType === 'audio';
        const isViewOnce = message.isViewOnce;
        const hasBeenViewed = isMessageViewed(message);

        // Adaptive Picker Logic for Desktop Overlay
        let desktopPickerClass = '';
        if (isOwnMessage) {
          desktopPickerClass = 'sm:right-full sm:mr-2';
        } else {
          desktopPickerClass = 'sm:left-full sm:ml-2';
        }

        // Viewed View-Once Content Layout
        if (isViewOnce && hasBeenViewed && !(isAudio && playingAudioId === message.id)) {
          return (
            <div key={message.id} className={`flex ${isOwnMessage ? 'justify-end pr-1' : 'justify-start pl-1'} mb-1 sm:mb-2`}>
              <div className="max-w-[70%] px-4 py-2 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500 italic text-xs flex items-center space-x-2">
                <Lock className="w-3 h-3" />
                <span>Opened view-once {isImage ? 'photo' : 'audio'}</span>
              </div>
            </div>
          );
        }

        // Dynamic accent color for UI elements
        const uiAccentColor = currentVibe.accent || 'primary';

        return (
          <div
            id={message.id}
            key={message.id}
            data-id={message.id}
            className={`message-item group flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} ${isVanishing ? 'message-vanishing' : ''} relative ${activeReactionId === message.id ? 'z-[60]' : 'z-auto'}`}
            onTouchStart={(e) => handleTouchStart(e, message)}
            onTouchMove={(e) => handleTouchMove(e, message)}
            onTouchEnd={(e) => handleTouchEnd(e, message)}
            onContextMenu={isHost && message.type !== 'system' ? (e) => {
              e.preventDefault();
              setContextMenu({ messageId: message.id, messageText: message.content || '', senderNickname: message.sender.nickname, x: e.clientX, y: e.clientY });
            } : undefined}
          >
            <div className={`flex items-center space-x-2 mb-1 px-1 text-[10px] font-bold uppercase tracking-tighter text-gray-400 dark:text-gray-500`}>
              {!isOwnMessage && (
                <div className="flex items-center space-x-1">
                  <span className={message.isAnonymous ? 'text-purple-500 dark:text-purple-400' : `text-${uiAccentColor}-500 dark:text-${uiAccentColor}-400`}>{message.sender.nickname}</span>
                </div>
              )}
              {!isOwnMessage && <span>•</span>}
              <span>{formatTime(message.timestamp)}</span>
              {message.recipients && message.recipients.length > 0 && (
                <>
                  <span>•</span>
                  <span className="text-amber-500 dark:text-amber-400 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" />
                    Private
                  </span>
                </>
              )}
            </div>

            <div className={`flex items-center w-full ${isOwnMessage ? 'justify-end pl-8 sm:pl-12' : 'justify-start pr-8 sm:pr-12'}`}>
              <div className="relative group/bubble w-fit max-w-[80%] sm:max-w-lg md:max-w-xl">
                <div
                  className={`relative z-10 w-fit rounded-2xl transition-all duration-300 ${message.messageType === 'poll' ? 'shadow-sm' :
                    'shadow-sm px-2.5 py-1.5 sm:px-3 sm:py-2 box-border'
                    } ${isOwnMessage
                      ? currentVibe.messageClass
                      : `bg-blue-50 dark:bg-gray-800 border border-${uiAccentColor}-300 dark:border-${uiAccentColor}-500/10 dark:text-gray-100 rounded-tl-none`
                    }`}
                >
                  {/* Content Container */}
                  <div className="break-words w-fit max-w-full">
                    {/* Reply Context */}
                    {message.replyTo && (
                      <div
                        className={`mb-2 p-2 rounded-lg text-[11px] border-l-4 cursor-pointer transition-colors ${isOwnMessage
                          ? 'bg-black/10 border-white/30 hover:bg-black/20'
                          : 'bg-gray-100 dark:bg-gray-700/50 border-gray-300 dark:border-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }`}
                        onClick={() => {
                          const el = document.getElementById(message.replyTo.id);
                          if (el) el.scrollIntoView({ behavior: 'auto', block: 'center' });
                        }}
                      >
                        <div className="font-bold opacity-80 mb-0.5">{message.replyTo.sender}</div>
                        <div className="truncate opacity-70 italic">{message.replyTo.content}</div>
                      </div>
                    )}
                    {isImage ? (
                      <div
                        className={isOwnMessage ? "" : "cursor-pointer"}
                        onClick={() => {
                          if (isOwnMessage) return;
                          handleImageClick(message);
                        }}
                      >
                        {isOwnMessage ? (
                          <div className="flex flex-col items-center justify-center p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-dashed border-black/10 dark:border-white/10 opacity-70">
                            <ImageIcon className="w-8 h-8 mb-2 text-white/50" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">You sent a photo</span>
                            {isViewOnce && <span className="text-[9px] opacity-60 mt-1">(View Once)</span>}
                          </div>
                        ) : (isViewOnce && !hasBeenViewed) ? (
                          <div className="w-48 h-32 bg-black/5 dark:bg-white/5 rounded-xl flex flex-col items-center justify-center space-y-2 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500"><Eye className="w-5 h-5" /></div>
                            <span className="text-xs font-bold uppercase tracking-wide">Tap to View</span>
                          </div>
                        ) : (
                          <div className="relative inline-block">
                            <img src={message.content} alt="shared" className="max-w-[160px] sm:max-w-md max-h-40 sm:max-h-96 object-cover rounded-xl sm:rounded-2xl shadow-inner" />
                            {onStegoExtract && (
                              <button
                                onClick={(e) => { e.stopPropagation(); onStegoExtract(message.content); }}
                                className="absolute bottom-2 right-2 flex items-center gap-1 bg-black/60 hover:bg-indigo-600 text-white text-[10px] font-bold px-2 py-1 rounded-full backdrop-blur-sm transition-colors"
                                title="Extract hidden message"
                              >
                                <Lock className="w-2.5 h-2.5" />
                                Decode
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : isAudio ? (
                      <div className="w-full min-w-[140px] max-w-xs">
                        {isOwnMessage ? (
                          <div className="flex items-center space-x-3 p-2 bg-black/5 dark:bg-white/5 rounded-xl border border-dashed border-black/10 dark:border-white/10 opacity-70">
                            <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center text-white/50"><Mic className="w-5 h-5" /></div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold">Voice Note Sent</span>
                              {isViewOnce && <span className="text-[10px] opacity-60">View Once</span>}
                            </div>
                          </div>
                        ) : isViewOnce && !hasBeenViewed && playingAudioId === message.id ? (
                          <div onClick={() => handleAudioPlay(message)} className="flex items-center space-x-3 cursor-pointer p-1">
                            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500"><Mic className="w-5 h-5" /></div>
                            <div className="flex flex-col"><span className="text-sm font-bold">Voice Note</span><span className="text-[10px] opacity-70">View Once</span></div>
                          </div>
                        ) : (
                          <AudioPlayer src={fixAudioContentForPlayback(message.content)} isOwnMessage={isOwnMessage} autoPlay={playingAudioId === message.id} onEnded={() => handleAudioEnded(message)} />
                        )}
                      </div>
                    ) : message.messageType === 'poll' ? (
                      <PollMessage message={message} currentUser={currentUser} onVote={onVote} roomVibe={roomVibe} />
                    ) : message.messageType === 'file' ? (
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 w-full max-w-[260px]">
                        <div className="p-1.5 sm:p-2 bg-black/10 dark:bg-white/10 rounded-lg shrink-0"><FileText className="w-4 h-4 sm:w-5 sm:h-5" /></div>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <p className="text-[11px] sm:text-sm font-bold truncate leading-none">{message.fileName}</p>
                          <p className="text-[9px] sm:text-[10px] opacity-70 leading-none">{formatFileSize(message.fileSize)}</p>
                        </div>
                        <button
                          onClick={() => downloadFile(message.content, message.mimeType, message.fileName)}
                          className="p-1.5 sm:p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors shrink-0"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-[15px] leading-[1.35] select-text whitespace-pre-wrap break-words">
                        {highlightMap[message.id]
                          ? renderHighlightedContent(message.content, highlightMap[message.id], message.id === focusedMessageId, currentUser, handleLinkClick)
                          : renderMessageContent(message.content, currentUser, handleLinkClick)}
                        {message.isEdited && <span className="text-[10px] opacity-50 italic ml-1">(edited)</span>}
                      </div>
                    )}

                    {/* Link Preview Cards */}
                    {message.messageType === 'text' && linkPreviews[message.id] && linkPreviews[message.id].length > 0 && (
                      <LinkPreviewCard
                        previews={linkPreviews[message.id]}
                        isOwnMessage={isOwnMessage}
                      />
                    )}
                  </div>

                  {/* Reactions Display */}
                  {message.reactions && Object.keys(message.reactions).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(message.reactions).map(([emoji, userIds]) => (
                        <button key={emoji} onClick={() => onReact(message.id, emoji)} className={`text-[10px] px-1.5 py-0.5 rounded-full border flex items-center space-x-1 ${userIds.includes(currentUser?.id || currentUser?.socketId) ? 'bg-primary-500/20 border-primary-500/50' : 'bg-black/5 dark:bg-white/5 border-transparent'} hover:scale-105 transition-transform`}>
                          <span>{emoji}</span><span>{userIds.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {message.type !== 'system' && Array.isArray(message.seenBy) && message.seenBy.length > 0 && (
                  <div className={`mt-1 flex items-center gap-1 ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                    {renderSeenBy(message.seenBy)}
                  </div>
                )}

                {/* Mobile / Desktop Reaction Menu overlayed absolutely relative to the message bubble */}
                {activeReactionId === message.id && (
                  <div className={`reaction-container absolute z-50 flex flex-col items-center top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 sm:top-1/2 sm:left-auto sm:-translate-x-0 ${desktopPickerClass}`}>
                    {!showFullPicker ? (
                      <div
                        className="bg-white/90 dark:bg-gray-800/95 backdrop-blur-md shadow-2xl rounded-full p-1.5 flex items-center space-x-1 border border-gray-100/50 dark:border-gray-700/50 whitespace-nowrap animate-in fade-in zoom-in slide-in-from-top-2 duration-300 max-w-[200px] sm:max-w-xs overflow-x-auto scrollbar-none no-scrollbar touch-pan-x"
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                        onTouchEnd={(e) => e.stopPropagation()}
                        onWheel={(e) => e.stopPropagation()}
                      >
                        {QUICK_REACTIONS.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => { onReact(message.id, emoji); setActiveReactionId(null); }}
                            className="w-10 h-10 flex items-center justify-center hover:bg-primary-500/10 dark:hover:bg-primary-500/20 rounded-full text-2xl transition-all duration-200 hover:scale-125 hover:-translate-y-1 flex-shrink-0"
                          >
                            {emoji}
                          </button>
                        ))}
                        <div className="w-[1px] h-6 bg-gray-200 dark:bg-gray-700 mx-1 flex-shrink-0" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenEmojiPicker(message.id);
                            setActiveReactionId(null);
                          }}
                          className="w-10 h-10 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 hover:text-primary-500 transition-all duration-200 flex-shrink-0 border-none outline-none focus:outline-none focus:ring-0 shadow-none"
                        >
                          <Plus className="w-5 h-5" />
                        </button>
                      </div>
                    ) : (
                      <div className="bg-white dark:bg-gray-900 shadow-2xl rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in fade-in zoom-in slide-in-from-top-4 duration-300 ring-1 ring-black/5 dark:ring-white/5">
                        <div className="p-2 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">All Emojis</span>
                          <button onClick={() => setShowFullPicker(false)} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"><X className="w-3 h-3 text-gray-400" /></button>
                        </div>
                        <EmojiPicker
                          theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                          onEmojiClick={(emojiData) => {
                            onReact(message.id, emojiData.emoji);
                            setActiveReactionId(null);
                            setShowFullPicker(false);
                          }}
                          width={280}
                          height={350}
                          skinTonesDisabled
                          autoFocusSearch={false}
                          searchPlaceholder="Search..."
                          previewConfig={{ showPreview: false }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Hover Actions: Reply, React, Edit */}
                <div className={`absolute top-1/2 -translate-y-1/2 flex items-center space-x-1 ${activeReactionId === message.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity duration-200 ${isOwnMessage ? 'right-full mr-3' : 'left-full ml-3'} z-20 select-none`}>
                  <button onClick={() => onReply(message)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-primary-500 transition-colors" title="Reply"><Reply className="w-4 h-4" /></button>
                  <div className="relative reaction-container">
                    <button
                      onClick={() => {
                        if (activeReactionId === message.id) {
                          setActiveReactionId(null);
                          setShowFullPicker(false);
                        } else {
                          setActiveReactionId(message.id);
                          setShowFullPicker(false);
                        }
                      }}
                      className={`p-1.5 rounded-lg transition-all duration-200 border-none outline-none focus:outline-none focus:ring-0 shadow-none ${activeReactionId === message.id ? 'bg-primary-500 text-white scale-110' : 'text-gray-400 hover:text-primary-500 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                      title="React"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                  </div>
                  {isOwnMessage && message.messageType === 'text' && (
                    <button onClick={() => onEdit(message)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-primary-500 transition-colors" title="Edit"><Pencil className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Meta: TTL indicator */}
            {timeLeft && (
              <div className="mt-1 px-1 flex items-center space-x-1 text-[9px] font-bold uppercase text-amber-500 animate-pulse">
                <Clock className="w-2.5 h-2.5" />
                <span>{timeLeft}</span>
              </div>
            )}

            {/* Thread replies badge — opens ThreadView side panel */}
            {(() => {
              const replyCount = messages.filter(m => m.parentId === message.id).length;
              if (replyCount === 0) return null;
              return (
                <button
                  onClick={() => onViewThread?.(message)}
                  className={`mt-1 px-2 py-0.5 text-[10px] font-bold text-${uiAccentColor}-500 dark:text-${uiAccentColor}-400 hover:text-${uiAccentColor}-600 dark:hover:text-${uiAccentColor}-300 hover:bg-${uiAccentColor}-50 dark:hover:bg-${uiAccentColor}-900/20 rounded-full transition-colors flex items-center gap-1`}
                >
                  <span>💬 {replyCount} {replyCount === 1 ? 'reply' : 'replies'}</span>
                </button>
              );
            })()}
          </div>
        );
      })}

      {/* Context menu — available to all users */}
      {contextMenu && (
        <div
          className="msg-context-menu fixed z-[200] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
          style={{ top: contextMenu.y, left: Math.min(contextMenu.x, window.innerWidth - 180) }}
        >
          {onViewThread && (
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-gray-700 dark:text-gray-200 transition-colors"
              onClick={() => {
                const msg = messages.find(m => m.id === contextMenu.messageId);
                if (msg) onViewThread(msg);
                setContextMenu(null);
              }}
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-500" />
              Reply in thread
            </button>
          )}
          {isHost && (
            <button
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 text-gray-700 dark:text-gray-200 transition-colors"
              onClick={() => {
                onPin?.({ messageId: contextMenu.messageId, text: contextMenu.messageText, senderNickname: contextMenu.senderNickname });
                setContextMenu(null);
              }}
            >
              <Pin className="w-3.5 h-3.5 text-amber-500" />
              {pinnedMessageId === contextMenu.messageId ? 'Unpin' : 'Pin message'}
            </button>
          )}
        </div>
      )}

      <ImageViewer
        isOpen={!!viewingImage}
        onClose={handleViewerClose}
        imageUrl={currentImageUrl}
        isViewOnce={viewingImage?.isViewOnce}
        duration={(() => {
          if (!messageTTL || messageTTL === 0) return 1800; // Never = 30m
          if (messageTTL < 30) return 30; // Min 30s
          if (messageTTL > 1800) return 1800; // Max 30m
          return messageTTL;
        })()}
      />

      {/* Link Preview Modal */}
      {linkPreviewUrl && (
        <LinkPreviewModal
          url={linkPreviewUrl}
          onClose={() => setLinkPreviewUrl(null)}
        />
      )}
    </div>
  );
};

export default MessageList;

// --- Helpers ---

function fixAudioContentForPlayback(content) {
  if (typeof content !== 'string' || content.startsWith('http') || content.startsWith('blob:') || content.startsWith('data:')) return content;
  let mimeType = 'audio/webm;codecs=opus';
  if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) mimeType = 'audio/wav';
  if (content.startsWith('UklGR')) mimeType = 'audio/wav';
  else if (content.startsWith('SUQz')) mimeType = 'audio/mp3';
  else if (content.startsWith('AAAA')) mimeType = 'audio/mp4';
  else if (content.startsWith('T2dn')) mimeType = 'audio/ogg';
  return `data:${mimeType};base64,${content}`;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Cross-platform file download.
 *
 * On Android/iOS (Capacitor): writes file to Documents, then opens it with the native file viewer.
 * On web/Electron: uses blob URL + hidden anchor for a standard browser download.
 */
async function downloadFile(base64Content, mimeType, fileName) {
  const safeType = mimeType || 'application/octet-stream';
  const safeFileName = fileName || 'download';

  try {
    // 1️⃣ Capacitor native path (Android / iOS)
    if (Capacitor.getPlatform() !== 'web') {
      try {
        // Request filesystem permissions (crucial for modern Android)
        await Filesystem.requestPermissions();

        // Write file to device's Documents directory
        const writeResult = await Filesystem.writeFile({
          path: safeFileName,
          data: base64Content,
          directory: Directory.Documents,
        });

        toast.success(`Downloaded: ${safeFileName}`);

        // Open the saved file with the native file viewer (so user can view it after downloading)
        await FileOpener.open({
          filePath: writeResult.uri,
          contentType: safeType,
        });
        return;
      } catch (capErr) {
        // User cancelled the file opener — not an error
        if (capErr?.message?.toLowerCase().includes('cancel')) return;
        if (capErr?.message?.toLowerCase().includes('no activity')) {
          // No app installed to open this file type — still saved successfully
          console.warn('[downloadFile] File saved but no viewer app for this type');
          return;
        }
        console.warn('[downloadFile] Capacitor path failed:', capErr.message);
        // fall through to web methods
      }
    }

    // 2️⃣ Blob URL + hidden anchor — Electron + desktop browsers
    const byteChars = atob(base64Content);
    const byteNums = new Uint8Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
    const blob = new Blob([byteNums], { type: safeType });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeFileName;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

  } catch (err) {
    console.error('[downloadFile] All methods failed:', err);
    try {
      window.open(`data:${safeType};base64,${base64Content}`, '_blank');
    } catch (_) { /* silent */ }
  }
}

function renderHighlightedContent(content, { start, end }, isFocused, currentUser, onLinkClick) {
  if (!content || start == null) return renderMessageContent(content, currentUser, onLinkClick);
  const before = content.slice(0, start);
  const match = content.slice(start, end);
  const after = content.slice(end);
  return (
    <>
      {renderMessageContent(before, currentUser, onLinkClick)}
      <mark className={`rounded px-px ${isFocused ? 'bg-orange-400 text-white' : 'bg-yellow-200 dark:bg-yellow-700/60 text-inherit'}`}>{match}</mark>
      {renderMessageContent(after, currentUser, onLinkClick)}
    </>
  );
}

function renderMessageContent(content, currentUser, onLinkClick) {
  if (!content) return null;
  const parts = content.split(/((?:https?:\/\/[^\s]+)|(?:@[\w\-\.]+))/g);
  return parts.map((part, i) => {
    if (part.match(/^https?:\/\//)) {
      return <a key={i} href={part} rel="noopener noreferrer" className="text-blue-500 underline break-all hover:text-blue-600" onClick={(e) => { if (onLinkClick) onLinkClick(part, e); else e.stopPropagation(); }}>{part}</a>;
    }
    if (part.startsWith('@') && part.length > 1) {
      const isMe = currentUser && (part.slice(1).toLowerCase() === currentUser.nickname?.toLowerCase());
      return <span key={i} className={`font-bold ${isMe ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 px-1 rounded' : 'text-primary-500'}`}>{part}</span>;
    }
    return part;
  });
}

function renderSeenBy(names) {
  const unique = Array.from(new Set((names || []).filter(n => typeof n === 'string' && n.trim().length > 0)));
  const shown = unique.slice(0, 3);
  const extra = unique.length - shown.length;

  return (
    <>
      {shown.map((n) => (
        <span
          key={n}
          className="w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center border border-white/70 dark:border-gray-900/70 shadow-sm"
          style={{
            background: `hsl(${hashHue(n)} 70% 45% / 0.16)`,
            color: `hsl(${hashHue(n)} 70% 40% / 1)`,
          }}
          title={n}
        >
          {getInitials(n)}
        </span>
      ))}
      {extra > 0 && (
        <span className="px-1.5 h-5 rounded-full text-[9px] font-black flex items-center justify-center bg-black/5 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-white/70 dark:border-gray-900/70">
          +{extra}
        </span>
      )}
    </>
  );
}

function getInitials(nickname) {
  const parts = String(nickname).replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function hashHue(input) {
  let h = 0;
  const s = String(input);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 360;
}
