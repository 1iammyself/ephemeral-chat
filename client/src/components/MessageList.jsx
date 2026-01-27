import React, { useState, useEffect, useCallback } from 'react';
import { Clock, User, Eye, Lock, Image as ImageIcon, Mic, Reply, Smile, Plus, FileText, Download, Check, CheckCheck, Pencil, X } from 'lucide-react';
import ImageViewer from './ImageViewer';
import AudioPlayer from './AudioPlayer';
import PollMessage from './PollMessage';
import socketManager from '../socket-simple';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '😡'];

const MessageList = ({ messages, currentUser, messageTTL, onVote, onReply, onReact, onEdit }) => {
  const [activeReactionId, setActiveReactionId] = useState(null);
  const [messageTimers, setMessageTimers] = useState(new Map());
  const [viewingImage, setViewingImage] = useState(null);
  const [currentImageUrl, setCurrentImageUrl] = useState(null);
  const [viewedMessages, setViewedMessages] = useState(new Set());
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [newMessages, setNewMessages] = useState(new Set());

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

  // Set up timers for messages with TTL
  useEffect(() => {
    if (messageTTL && messageTTL > 0) {
      messages.forEach(message => {
        if (message.type !== 'system' && !messageTimers.has(message.id)) {
          const messageTime = new Date(message.timestamp).getTime();
          const expiryTime = messageTime + (messageTTL * 1000);
          const timeLeft = expiryTime - Date.now();

          if (timeLeft > 0) {
            const timer = setTimeout(() => {
              setMessageTimers(prev => new Map(prev).set(message.id, 'vanishing'));
              setTimeout(() => {
                setMessageTimers(prev => new Map(prev).set(message.id, 'expired'));
              }, 500);
            }, timeLeft);
            setMessageTimers(prev => new Map(prev).set(message.id, timer));
          } else {
            setMessageTimers(prev => new Map(prev).set(message.id, 'expired'));
          }
        }
      });
    }
    return () => {
      messageTimers.forEach(timer => { if (typeof timer === 'object') clearTimeout(timer); });
    };
  }, [messages, messageTTL]);

  // Read Receipt Observer
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const msgId = entry.target.dataset.id;
          if (msgId && !viewedMessages.has(msgId)) {
            const msg = messages.find(m => m.id === msgId);
            const isOwn = msg && currentUser && (msg.sender.id === currentUser.id || msg.sender.socketId === currentUser.socketId);

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
    if (!messageTTL || messageTTL === 0 || message.type === 'system') return null;
    const messageTime = new Date(message.timestamp).getTime();
    const expiryTime = messageTime + (messageTTL * 1000);
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
    if (isMessageViewed(message)) return;
    setViewingImage(message);
    setCurrentImageUrl(message.isViewOnce ? message.id : message.content);
    socketManager.emit('message-viewed', { messageId: message.id });
    setViewedMessages(prev => new Set([...prev, message.id]));
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

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center text-gray-500 dark:text-gray-400">
          <User className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium mb-1">No messages yet</p>
          <p className="text-sm opacity-60">Start the conversation!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-6 pb-4">
      {messages.map((message) => {
        const isOwnMessage = currentUser && (message.sender.socketId === currentUser.socketId || message.sender.id === currentUser.id);
        const isExpired = messageTimers.get(message.id) === 'expired';
        if (isExpired) return null;

        const isVanishing = messageTimers.get(message.id) === 'vanishing';
        const timeLeft = getTimeLeft(message);
        const isImage = message.messageType === 'image';
        const isAudio = message.messageType === 'audio';
        const isViewOnce = message.isViewOnce;
        const hasBeenViewed = isMessageViewed(message);

        // Viewed View-Once Content Layout
        if (isViewOnce && hasBeenViewed && !(isAudio && playingAudioId === message.id)) {
          return (
            <div key={message.id} className={`flex ${isOwnMessage ? 'justify-end pr-1' : 'justify-start pl-1'} mb-4`}>
              <div className="max-w-[70%] px-4 py-2 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-dashed border-gray-200 dark:border-gray-800 text-gray-400 dark:text-gray-500 italic text-xs flex items-center space-x-2">
                <Lock className="w-3 h-3" />
                <span>Opened view-once {isImage ? 'photo' : 'audio'}</span>
              </div>
            </div>
          );
        }

        return (
          <div
            id={message.id}
            key={message.id}
            data-id={message.id}
            className={`message-item group flex flex-col ${isOwnMessage ? 'items-end' : 'items-start'} ${isVanishing ? 'message-vanishing' : ''} relative`}
          >
            {/* Meta: Name and Time */}
            <div className={`flex items-center space-x-2 mb-1 px-1 text-[10px] font-bold uppercase tracking-tighter text-gray-400 dark:text-gray-500`}>
              {!isOwnMessage && <span className="text-primary-500 dark:text-primary-400">{message.sender.nickname}</span>}
              {!isOwnMessage && <span>•</span>}
              <span>{formatTime(message.timestamp)}</span>
            </div>

            <div className={`flex items-center w-full ${isOwnMessage ? 'justify-end pl-12' : 'justify-start pr-12'}`}>
              <div className="relative group/bubble">
                <div
                  className={`relative z-10 rounded-2xl shadow-sm transition-all duration-300 ${message.messageType === 'poll' ? '' : 'px-4 py-3'
                    } ${isOwnMessage
                      ? 'bg-primary-600 dark:bg-primary-700 text-white rounded-tr-none'
                      : 'bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 dark:text-gray-100 rounded-tl-none'
                    }`}
                >
                  {/* Content Container */}
                  <div className="break-words max-w-full">
                    {/* Reply Context */}
                    {message.replyTo && (
                      <div
                        className={`mb-2 p-2 rounded-lg text-[11px] border-l-4 cursor-pointer transition-colors ${isOwnMessage
                          ? 'bg-black/10 border-white/30 hover:bg-black/20'
                          : 'bg-gray-100 dark:bg-gray-700/50 border-gray-300 dark:border-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }`}
                        onClick={() => {
                          const el = document.getElementById(message.replyTo.id);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
                          (isViewOnce && !hasBeenViewed) ? handleImageClick(message) : !isViewOnce && setViewingImage(message);
                        }}
                      >
                        {isOwnMessage ? (
                          <div className="flex flex-col items-center justify-center p-4 bg-black/5 dark:bg-white/5 rounded-xl border border-dashed border-black/10 dark:border-white/10 opacity-70">
                            <ImageIcon className="w-8 h-8 mb-2 text-primary-300" />
                            <span className="text-[10px] font-bold uppercase tracking-wider">You sent a photo</span>
                            {isViewOnce && <span className="text-[9px] opacity-60 mt-1">(View Once)</span>}
                          </div>
                        ) : (isViewOnce && !hasBeenViewed) ? (
                          <div className="w-48 h-32 bg-black/5 dark:bg-white/5 rounded-xl flex flex-col items-center justify-center space-y-2 border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500"><Eye className="w-5 h-5" /></div>
                            <span className="text-xs font-bold uppercase tracking-wide">Tap to View</span>
                          </div>
                        ) : (
                          <img src={message.content} alt="shared" className="max-w-xs max-h-64 object-cover rounded-lg shadow-inner" />
                        )}
                      </div>
                    ) : isAudio ? (
                      <div className="min-w-[200px]">
                        {isOwnMessage ? (
                          <div className="flex items-center space-x-3 p-2 bg-black/5 dark:bg-white/5 rounded-xl border border-dashed border-black/10 dark:border-white/10 opacity-70">
                            <div className="w-10 h-10 bg-primary-500/10 rounded-full flex items-center justify-center text-primary-300"><Mic className="w-5 h-5" /></div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold">Voice Note Sent</span>
                              {isViewOnce && <span className="text-[10px] opacity-60">View Once</span>}
                            </div>
                          </div>
                        ) : isViewOnce && !hasBeenViewed && playingAudioId !== message.id ? (
                          <div onClick={() => handleAudioPlay(message)} className="flex items-center space-x-3 cursor-pointer p-1">
                            <div className="w-10 h-10 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-500"><Mic className="w-5 h-5" /></div>
                            <div className="flex flex-col"><span className="text-sm font-bold">Voice Note</span><span className="text-[10px] opacity-70">View Once</span></div>
                          </div>
                        ) : (
                          <AudioPlayer src={fixAudioContentForPlayback(message.content)} isOwnMessage={isOwnMessage} autoPlay={playingAudioId === message.id} onEnded={() => handleAudioEnded(message)} />
                        )}
                      </div>
                    ) : message.messageType === 'poll' ? (
                      <PollMessage message={message} currentUser={currentUser} onVote={onVote} />
                    ) : message.messageType === 'file' ? (
                      <div className="flex items-center space-x-3 min-w-[200px]">
                        <div className="p-2 bg-black/10 dark:bg-white/10 rounded-lg"><FileText className="w-6 h-6" /></div>
                        <div className="flex-1 truncate"><p className="text-sm font-bold truncate">{message.fileName}</p><p className="text-[10px] opacity-60">{formatFileSize(message.fileSize)}</p></div>
                        <a href={`data:${message.mimeType};base64,${message.content}`} download={message.fileName} className="p-2 hover:bg-black/10 dark:hover:bg-white/10 rounded-full transition-colors"><Download className="w-4 h-4" /></a>
                      </div>
                    ) : (
                      <div className="text-[15px] leading-relaxed select-text">
                        {renderMessageContent(message.content, currentUser)}
                        {message.isEdited && <span className="text-[10px] opacity-50 italic ml-1">(edited)</span>}
                      </div>
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

                {/* Hover Actions: Reply, React, Edit */}
                <div className={`absolute top-1/2 -translate-y-1/2 flex items-center space-x-1 opacity-0 group-hover/bubble:opacity-100 transition-opacity duration-200 ${isOwnMessage ? 'right-full mr-3' : 'left-full ml-3'} z-0`}>
                  <button onClick={() => onReply(message)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-primary-500 transition-colors" title="Reply"><Reply className="w-4 h-4" /></button>
                  <div className="relative">
                    <button onClick={() => setActiveReactionId(activeReactionId === message.id ? null : message.id)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-primary-500 transition-colors" title="React"><Smile className="w-4 h-4" /></button>
                    {activeReactionId === message.id && (
                      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white dark:bg-gray-800 shadow-2xl rounded-full p-1 flex items-center space-x-1 border border-gray-100 dark:border-gray-700 z-50">
                        {QUICK_REACTIONS.map(emoji => (
                          <button key={emoji} onClick={() => { onReact(message.id, emoji); setActiveReactionId(null); }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-lg hover:scale-125 transition-transform">{emoji}</button>
                        ))}
                      </div>
                    )}
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
          </div>
        );
      })}

      <ImageViewer
        isOpen={!!viewingImage}
        onClose={handleViewerClose}
        imageUrl={currentImageUrl}
        duration={(() => {
          if (!messageTTL || messageTTL === 0) return 1800; // Never = 30m
          if (messageTTL < 30) return 30; // Min 30s
          if (messageTTL > 1800) return 1800; // Max 30m
          return messageTTL;
        })()}
      />
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

function renderMessageContent(content, currentUser) {
  if (!content) return null;
  const parts = content.split(/((?:https?:\/\/[^\s]+)|(?:@[\w\-\.]+))/g);
  return parts.map((part, i) => {
    if (part.match(/^https?:\/\//)) {
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline break-all hover:text-blue-600" onClick={(e) => e.stopPropagation()}>{part}</a>;
    }
    if (part.startsWith('@') && part.length > 1) {
      const isMe = currentUser && (part.slice(1).toLowerCase() === currentUser.nickname?.toLowerCase());
      return <span key={i} className={`font-bold ${isMe ? 'bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 px-1 rounded' : 'text-primary-500'}`}>{part}</span>;
    }
    return part;
  });
}
