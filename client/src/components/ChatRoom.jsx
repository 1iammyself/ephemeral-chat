import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Send,
  Users,
  Copy,
  ArrowLeft,
  Wifi,
  WifiOff,
  Clock,
  Lock,
  X,
  Phone,
  PhoneOff,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Mic,
  UserX,
  Smile,
  BarChart2,
  Plus
} from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useTheme } from '../context/ThemeContext';
import socketManager from '../socket-simple';
import JoinRoomModal from './JoinRoomModal';
import MessageList from './MessageList';
import UserList from './UserList';
import AudioCallModal from './AudioCallModal';
import PollModal from './PollModal';
import webRTCService, { CallState } from '../webrtc';
import { encryptMessage, decryptMessage } from '../utils/security';
import { Mp3Recorder } from '../utils/mp3Recorder';
import ThemeToggle from './ThemeToggle';
import PrivacyOverlay from './PrivacyOverlay';
import GhostWatermark from './GhostWatermark';

const ChatRoom = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(true);
  const [isProcessingInvite, setIsProcessingInvite] = useState(false);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [inviteToken, setInviteToken] = useState(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [callState, setCallState] = useState({ state: CallState.IDLE });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Knock-to-Join & Host State
  const [isWaitingForHost, setIsWaitingForHost] = useState(false);
  const [pendingGuests, setPendingGuests] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [roomKey, setRoomKey] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showFeatureMenu, setShowFeatureMenu] = useState(false);
  const { theme } = useTheme();

  const emojiPickerRef = useRef(null);
  const featureMenuRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const mp3RecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const joinParamsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Check for invite token and room key
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tokenFromUrl = searchParams.get('token');
    if (location.state?.inviteToken) {
      setInviteToken(location.state.inviteToken);
    } else if (tokenFromUrl) {
      setInviteToken(tokenFromUrl);
    }
    const hash = window.location.hash.substring(1);
    if (hash) setRoomKey(hash);
  }, [location]);

  const performJoin = useCallback((params) => {
    const { nickname, password, capToken, inviteToken } = params;
    const joinData = { roomCode, nickname, password, capToken };
    if (inviteToken) joinData.inviteToken = inviteToken;

    socketManager.emit('join-room', joinData, async (response) => {
      if (!response) {
        setError('No response from server');
        setIsProcessingInvite(false);
        return;
      }
      if (response.redirect) {
        navigate(`/room/${response.roomCode}`, {
          state: { fromInvite: true, nickname, inviteToken }
        });
        return;
      }
      if (response.success) {
        setRoom(response.room);
        let msgs = response.messages || [];
        if (roomKey) {
          msgs = await Promise.all(msgs.map(async (msg) => {
            if (msg.isEncrypted) {
              try {
                const decrypted = await decryptMessage(msg.content, msg.iv, roomKey);
                return { ...msg, content: decrypted };
              } catch (e) {
                return { ...msg, content: '⚠️ Decryption failed' };
              }
            }
            return msg;
          }));
        }
        setMessages(msgs);
        setUsers(response.room?.users || []);
        setCurrentUser({ id: socketManager.socket?.id, socketId: socketManager.socket?.id, nickname: response.nickname, isAdmin: false });
        setIsJoined(true);
        setShowJoinModal(false);
        setIsProcessingInvite(false);
        setIsWaitingForHost(false);
        return;
      }
      setError(response.error || 'Failed to join room');
      setIsProcessingInvite(false);
      setIsWaitingForHost(false);
    });
  }, [roomCode, navigate, roomKey]);

  useEffect(() => {
    const socket = socketManager.connect();
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') setError('You have been disconnected by the server');
      else if (reason === 'transport close') setError('Connection lost. Trying to reconnect...');
    };

    const handleRoomJoined = async (data) => {
      setRoom(data.room);
      setUsers(data.users || []);
      let msgs = data.messages || [];
      if (roomKey) {
        msgs = await Promise.all(msgs.map(async (msg) => {
          if (msg.isEncrypted) {
            try {
              const decrypted = await decryptMessage(msg.content, msg.iv, roomKey);
              return { ...msg, content: decrypted };
            } catch (e) {
              return { ...msg, content: '⚠️ Decryption failed' };
            }
          }
          return msg;
        }));
      }
      setMessages(msgs);
      setCurrentUser({ id: socketManager.socket?.id, socketId: socketManager.socket?.id, nickname: data.nickname, isAdmin: data.isAdmin });
      setIsJoined(true);
      setShowJoinModal(false);
      setError(null);
    };

    const handleNewMessage = async (message) => {
      if (message.isEncrypted && roomKey) {
        try {
          const decrypted = await decryptMessage(message.content, message.iv, roomKey);
          message.content = decrypted;
        } catch (e) {
          message.content = '⚠️ Decryption failed';
        }
      }
      setMessages(prev => [...prev, message]);
    };

    const handleMessageDeleted = ({ messageId }) => setMessages(prev => prev.filter(m => m.id !== messageId));

    const handleUserJoined = ({ user, roomUsers }) => {
      const displayName = user?.nickname || 'Someone';
      setMessages(prev => [...prev, { id: `system_${Date.now()}`, type: 'system', content: `${displayName} joined the room`, timestamp: new Date().toISOString() }]);
      if (Array.isArray(roomUsers)) setUsers(roomUsers);
      else if (user?.socketId) setUsers(prev => prev.some(u => u.socketId === user.socketId) ? prev : [...prev, user]);
    };

    const handleUserLeft = ({ nickname, socketId, userCount }) => {
      setMessages(prev => [...prev, { id: `system_${Date.now()}`, type: 'system', content: `${nickname || 'A user'} left the room`, timestamp: new Date().toISOString() }]);
      if (socketId) setUsers(prev => prev.filter(u => u.socketId !== socketId));
      else if (typeof userCount === 'number') setUsers(prev => prev.slice(0, userCount));
    };

    const handleError = ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 5000);
      if (message.includes('Invalid') || message.includes('expired')) setShowJoinModal(true);
    };

    const handleKnockApproved = ({ isHost }) => {
      setIsWaitingForHost(false);
      if (isHost) setIsHost(true);
      if (joinParamsRef.current) performJoin(joinParamsRef.current);
    };

    const handleKnockDenied = ({ reason }) => {
      setIsWaitingForHost(false);
      setError(reason || 'Entry denied');
      setIsProcessingInvite(false);
    };

    const handleUserKnocking = (guest) => setPendingGuests(prev => prev.find(g => g.socketId === guest.socketId) ? prev : [...prev, guest]);

    const handlePromotedToHost = () => {
      setIsHost(true);
      setMessages(prev => [...prev, { id: `system_${Date.now()}`, type: 'system', content: 'You are now the host of this room', timestamp: new Date().toISOString() }]);
    };

    const handleMessageUpdated = (updatedMessage) => {
      setMessages(prev => prev.map(m => m.id === updatedMessage.id ? updatedMessage : m));
    };

    socketManager.on('connect', handleConnect);
    socketManager.on('disconnect', handleDisconnect);
    socketManager.on('room-joined', handleRoomJoined);
    socketManager.on('new-message', handleNewMessage);
    socketManager.on('message-deleted', handleMessageDeleted);
    socketManager.on('message-updated', handleMessageUpdated);
    socketManager.on('user-joined', handleUserJoined);
    socketManager.on('user-left', handleUserLeft);
    socketManager.on('error', handleError);
    socketManager.on('knock-approved', handleKnockApproved);
    socketManager.on('knock-denied', handleKnockDenied);
    socketManager.on('user-knocking', handleUserKnocking);
    socketManager.on('promoted-to-host', handlePromotedToHost);

    return () => {
      socketManager.off('connect', handleConnect);
      socketManager.off('disconnect', handleDisconnect);
      socketManager.off('room-joined', handleRoomJoined);
      socketManager.off('new-message', handleNewMessage);
      socketManager.off('message-deleted', handleMessageDeleted);
      socketManager.off('message-updated', handleMessageUpdated);
      socketManager.off('user-joined', handleUserJoined);
      socketManager.off('user-left', handleUserLeft);
      socketManager.off('error', handleError);
      socketManager.off('knock-approved', handleKnockApproved);
      socketManager.off('knock-denied', handleKnockDenied);
      socketManager.off('user-knocking', handleUserKnocking);
      socketManager.off('promoted-to-host', handlePromotedToHost);
      if (process.env.NODE_ENV !== 'development') socketManager.disconnect();
    };
  }, [roomCode, performJoin, roomKey]);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
      if (featureMenuRef.current && !featureMenuRef.current.contains(event.target)) {
        setShowFeatureMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const onEmojiClick = (emojiData) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  const handleJoinRoom = async (params) => {
    const { nickname } = params;
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }
    if (isProcessingInvite || isJoined) return;
    setIsProcessingInvite(true);
    setError(null);
    setIsWaitingForHost(true);
    joinParamsRef.current = params;
    try {
      const knockData = { roomCode, nickname: nickname.trim(), password: params.password?.trim(), capToken: params.capToken };
      if (params.inviteToken) knockData.inviteToken = params.inviteToken;
      socketManager.emit('knock', knockData);
    } catch (err) {
      setError('Failed to join room. Please try again.');
      setIsProcessingInvite(false);
      setIsWaitingForHost(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleApproveGuest = (guestId) => {
    socketManager.emit('approve-guest', { guestId, roomCode });
    setPendingGuests(prev => prev.filter(g => g.socketId !== guestId));
  };

  const handleDenyGuest = (guestId) => {
    socketManager.emit('deny-guest', { guestId, roomCode });
    setPendingGuests(prev => prev.filter(g => g.socketId !== guestId));
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending || !isConnected) return;
    setIsSending(true);
    try {
      let content = newMessage.trim();
      let isEncrypted = false;
      let iv = null;
      if (roomKey) {
        const result = await encryptMessage(content, roomKey);
        content = result.encrypted;
        iv = result.iv;
        isEncrypted = true;
      }
      socketManager.emit('send-message', { content, isEncrypted, iv, recipients: selectedRecipients });
      socketManager.emit('user-activity');
      setNewMessage('');
    } catch (error) {
      setError('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleSendPoll = (pollData) => {
    if (!isConnected) return;
    socketManager.emit('send-message', { messageType: 'poll', pollData, recipients: selectedRecipients });
  };

  const handleVote = (messageId, optionId) => {
    if (!isConnected) return;
    socketManager.emit('vote-poll', { messageId, optionId });
  };

  const handleImageUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be smaller than 5MB');
      return;
    }
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      socketManager.emit('send-message', { messageType: 'image', imageData: e.target.result, isViewOnce: true, recipients: selectedRecipients });
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  }, [selectedRecipients]);

  const handleStartCall = useCallback(async () => {
    let recipients = selectedRecipients.length > 0
      ? users.filter(u => selectedRecipients.includes(u.socketId) || selectedRecipients.includes(u.id))
      : users.filter(u => u.socketId !== currentUser?.id && u.id !== currentUser?.id);

    if (recipients.length === 0) {
      setError('No users to call');
      return;
    }
    try {
      const recipientList = recipients.map(u => ({ id: u.socketId || u.id, nickname: u.nickname }));
      await webRTCService.startCall(roomCode, recipientList);
      setShowCallModal(true);
    } catch (err) {
      setError('Failed to start call. Please check microphone permissions.');
    }
  }, [users, currentUser, roomCode, selectedRecipients]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      let mimeType = '';
      // Robust MIME type selection
      if (isSafari) {
        if (MediaRecorder.isTypeSupported('audio/wav')) {
          mimeType = 'audio/wav';
        } else if (MediaRecorder.isTypeSupported('audio/mp3')) {
          mimeType = 'audio/mp3';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      } else {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }
      mediaRecorderRef.current = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 29) { handleStopRecording(); return 30; }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      setError('Could not access microphone.');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType });
        // Check for empty or truncated blob
        if (audioBlob.size === 0) {
          setError('Recorded audio is empty. Please try again.');
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
          return;
        }
        // Warn if blob is suspiciously small (<1KB)
        if (audioBlob.size < 1024) {
          setError('Audio recording may be too short or truncated.');
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
          return;
        }
        sendAudioMessage(audioBlob);
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  };

  const handleCancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingDuration(0);
    clearInterval(recordingTimerRef.current);
  };

  const sendAudioMessage = (audioBlob) => {
    if (audioBlob.size > 5 * 1024 * 1024) {
      setError('Voice note is too large (max 5MB).');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Audio = reader.result.split(',')[1];
      socketManager.emit('send-message', { messageType: 'audio', content: base64Audio, isViewOnce: true, recipients: selectedRecipients });
    };
    reader.readAsDataURL(audioBlob);
  };

  useEffect(() => {
    const unsubscribe = webRTCService.onCallStateChange((state) => {
      setCallState(state);
      if (state.state === CallState.INCOMING) setShowCallModal(true);
      if (state.state === CallState.IDLE && showCallModal) setTimeout(() => setShowCallModal(false), 1000);
    });
    return unsubscribe;
  }, [showCallModal]);

  const getTTLDisplay = () => {
    if (!room?.settings?.messageTTL) return null;
    const ttl = room.settings.messageTTL;
    if (ttl < 60) return `${ttl}s`;
    if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
    return `${Math.floor(ttl / 3600)}h`;
  };

  const toggleRecipient = (socketId) => setSelectedRecipients(prev => prev.includes(socketId) ? prev.filter(id => id !== socketId) : [...prev, socketId]);

  if (error && !isJoined) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
            <p className="font-bold">Error</p><p>{error}</p>
          </div>
          <button onClick={() => navigate('/')} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Go Back to Home</button>
        </div>
      </div>
    );
  }

  if (showJoinModal) return <JoinRoomModal roomCode={roomCode} onJoin={handleJoinRoom} onCancel={() => navigate('/')} error={error} isProcessingInvite={isProcessingInvite} isWaitingForHost={isWaitingForHost} />;

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <h1 className="text-lg font-semibold truncate text-gray-900 dark:text-white">Secure Chat</h1>
              <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                <div className="flex items-center space-x-1">{isConnected ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}<span>{isConnected ? 'Connected' : 'Disconnected'}</span></div>
                <div className="flex items-center space-x-1"><Users className="w-4 h-4" /><span>{users.length}</span></div>
                {room?.settings?.passwordHash && <div className="flex items-center space-x-1"><Lock className="w-4 h-4" /><span>Protected</span></div>}
                {getTTLDisplay() && <div className="flex items-center space-x-1"><Clock className="w-4 h-4" /><span>TTL: {getTTLDisplay()}</span></div>}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <ThemeToggle />
            <button onClick={() => setShowMobileMenu(true)} className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300 relative">
              <Users className="w-5 h-5" />
              {isHost && pendingGuests.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-800" />}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-100 dark:bg-red-900 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-3"><p className="text-sm">{error}</p></div>}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            <MessageList messages={messages} currentUser={currentUser} messageTTL={room?.settings?.messageTTL} onVote={handleVote} />
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            {selectedRecipients.length > 0 && (
              <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center justify-between">
                <span className="text-xs text-blue-600 dark:text-blue-300 font-medium flex items-center"><Users className="w-3 h-3 mr-1.5" />Sending to {selectedRecipients.length} specific user{selectedRecipients.length !== 1 ? 's' : ''}</span>
                <button onClick={() => setSelectedRecipients([])} className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-200 underline">Clear selection</button>
              </div>
            )}
            <div className="p-4">
              <form onSubmit={handleSendMessage} className="flex items-center space-x-2 sm:space-x-3">
                {isRecording ? (
                  <div className="flex-1 flex items-center justify-between bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2">
                    <div className="flex items-center space-x-3"><div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" /><span className="text-red-600 dark:text-red-400 font-medium font-mono">{formatDuration(recordingDuration)} / 0:30</span></div>
                    <div className="flex items-center space-x-2">
                      <button type="button" onClick={handleCancelRecording} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-full text-red-500"><Trash2 className="w-5 h-5" /></button>
                      <button type="button" onClick={handleStopRecording} className="p-2 bg-red-500 hover:bg-red-600 rounded-full text-white shadow-sm"><Send className="w-5 h-5" /></button>
                    </div>
                  </div>
                ) : (
                  <>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="image-upload" />
                    <div className="relative" ref={featureMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowFeatureMenu(!showFeatureMenu)}
                        disabled={!isConnected}
                        className={`p-3 rounded-lg transition-all duration-200 ${showFeatureMenu ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 rotate-45' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
                      >
                        <Plus className="w-5 h-5" />
                      </button>

                      {showFeatureMenu && (
                        <div className="absolute bottom-full mb-2 left-0 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2 flex flex-col space-y-1 min-w-[160px] animate-in slide-in-from-bottom-2 duration-200">
                          <button
                            type="button"
                            onClick={() => {
                              fileInputRef.current?.click();
                              setShowFeatureMenu(false);
                            }}
                            disabled={!isConnected || isUploading}
                            className="flex items-center space-x-3 w-full p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                          >
                            <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                              {isUploading ? <Loader2 className="w-4 h-4 text-blue-500 animate-spin" /> : <ImageIcon className="w-4 h-4 text-blue-500" />}
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Photo</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleStartCall();
                              setShowFeatureMenu(false);
                            }}
                            disabled={!isConnected || users.length < 2}
                            className="flex items-center space-x-3 w-full p-3 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
                          >
                            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                              <Phone className="w-4 h-4 text-green-500" />
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Voice Call</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setShowPollModal(true);
                              setShowFeatureMenu(false);
                            }}
                            disabled={!isConnected}
                            className="flex items-center space-x-3 w-full p-3 rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors disabled:opacity-50"
                          >
                            <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                              <BarChart2 className="w-4 h-4 text-purple-500" />
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Poll</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              startRecording();
                              setShowFeatureMenu(false);
                            }}
                            disabled={!isConnected}
                            className="flex items-center space-x-3 w-full p-3 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                          >
                            <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                              <Mic className="w-4 h-4 text-red-500" />
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Voice Note</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="relative" ref={emojiPickerRef}>
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        disabled={!isConnected}
                        className={`p-3 rounded-lg transition-colors ${showEmojiPicker ? 'bg-gray-100 dark:bg-gray-700 text-blue-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute bottom-full mb-2 left-0 z-50">
                          <EmojiPicker
                            onEmojiClick={onEmojiClick}
                            theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                            lazyLoadEmojis={true}
                            skinTonesDisabled
                            searchPlaceHolder="Search emojis..."
                            width={320}
                            height={400}
                          />
                        </div>
                      )}
                    </div>
                    <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onCopy={(e) => e.preventDefault()} onCut={(e) => e.preventDefault()} onPaste={(e) => e.preventDefault()} placeholder="Type your message..." className="flex-1 input-field py-3 px-4 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600" disabled={!isConnected || isSending} maxLength={500} />
                    <button type="submit" disabled={!newMessage.trim() || !isConnected || isSending} className="btn-primary px-4 py-3"><Send className="w-5 h-5" /></button>
                  </>
                )}
              </form>
            </div>
          </div>
        </div>
        <div className="hidden lg:block w-64 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <UserList users={users} currentUser={currentUser} pendingGuests={pendingGuests} isHost={isHost} onApprove={handleApproveGuest} onDeny={handleDenyGuest} selectedRecipients={selectedRecipients} onToggleRecipient={toggleRecipient} />
        </div>
      </div>

      {
        showMobileMenu && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)} />
            <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-gray-800 shadow-xl flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Room Details</h2><button onClick={() => setShowMobileMenu(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400"><X className="w-5 h-5" /></button></div>
              <div className="flex-1 overflow-y-auto"><UserList users={users} currentUser={currentUser} pendingGuests={pendingGuests} isHost={isHost} onApprove={handleApproveGuest} onDeny={handleDenyGuest} selectedRecipients={selectedRecipients} onToggleRecipient={toggleRecipient} /></div>
            </div>
          </div>
        )
      }

      {showCallModal && <AudioCallModal isOpen={showCallModal} onClose={() => setShowCallModal(false)} roomCode={roomCode} />}
      <PollModal isOpen={showPollModal} onClose={() => setShowPollModal(false)} onSend={handleSendPoll} />
      <PrivacyOverlay />
      {
        isJoined && currentUser && (
          <GhostWatermark
            nickname={currentUser.nickname}
          />
        )
      }
    </div >
  );
};

export default ChatRoom;
