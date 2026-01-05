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
  UserCheck, // Add UserCheck icon
  UserX // Add UserX icon
} from 'lucide-react';
import socketManager from '../socket-simple';
import JoinRoomModal from './JoinRoomModal';
import MessageList from './MessageList';
import UserList from './UserList';
import AudioCallModal from './AudioCallModal';
import webRTCService, { CallState } from '../webrtc';
import { encryptMessage, decryptMessage } from '../utils/security'; // Import E2EE helpers
import ThemeToggle from './ThemeToggle';

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
  const [joinParams, setJoinParams] = useState(null);
  const [roomKey, setRoomKey] = useState(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState([]);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const joinParamsRef = useRef(null);

  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Check for invite token in location state or query params
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tokenFromUrl = searchParams.get('token');

    if (location.state?.inviteToken) {
      setInviteToken(location.state.inviteToken);
    } else if (tokenFromUrl) {
      setInviteToken(tokenFromUrl);
    }

    // Extract E2EE key from hash
    const hash = window.location.hash.substring(1);
    if (hash) {
      setRoomKey(hash);
    }
  }, [location]);

  // Helper to perform the actual join after approval
  const performJoin = useCallback((params) => {
    const { nickname, password, capToken, inviteToken } = params;
    
    const joinData = {
      roomCode,
      nickname,
      password,
      capToken
    };
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

    const handleConnect = () => {
      setIsConnected(true);
    };

    const handleDisconnect = (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        setError('You have been disconnected by the server');
      } else if (reason === 'transport close') {
        setError('Connection lost. Trying to reconnect...');
      }
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

      setCurrentUser({
        id: socketManager.socket?.id,
        socketId: socketManager.socket?.id,
        nickname: data.nickname,
        isAdmin: data.isAdmin
      });
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

    const handleMessageDeleted = ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
    };

    const handleUserJoined = ({ user, roomUsers }) => {
      const displayName = user?.nickname || 'Someone';
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        type: 'system',
        content: `${displayName} joined the room`,
        timestamp: new Date().toISOString()
      }]);

      if (Array.isArray(roomUsers)) {
        setUsers(roomUsers);
      } else if (user?.socketId) {
        setUsers(prev => {
          if (prev.some(u => u.socketId === user.socketId)) return prev;
          return [...prev, user];
        });
      }
    };

    const handleUserLeft = ({ nickname, socketId, userCount }) => {
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        type: 'system',
        content: `${nickname || 'A user'} left the room`,
        timestamp: new Date().toISOString()
      }]);

      if (socketId) {
        setUsers(prev => prev.filter(u => u.socketId !== socketId));
      } else if (typeof userCount === 'number') {
        setUsers(prev => prev.slice(0, userCount));
      }
    };

    const handleError = ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 5000);
      if (message.includes('Invalid') || message.includes('expired')) {
        setShowJoinModal(true);
      }
    };

    // Knock-to-Join Events
    const handleKnockApproved = ({ isHost }) => {
      setIsWaitingForHost(false);
      if (isHost) setIsHost(true);
      
      if (joinParamsRef.current) {
        performJoin(joinParamsRef.current);
      }
    };

    const handleKnockDenied = ({ reason }) => {
      setIsWaitingForHost(false);
      setError(reason || 'Entry denied');
      setIsProcessingInvite(false);
    };

    const handleUserKnocking = (guest) => {
      setPendingGuests(prev => {
        if (prev.find(g => g.socketId === guest.socketId)) return prev;
        return [...prev, guest];
      });
    };

    const handlePromotedToHost = () => {
      setIsHost(true);
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        type: 'system',
        content: 'You are now the host of this room',
        timestamp: new Date().toISOString()
      }]);
    };

    socketManager.on('connect', handleConnect);
    socketManager.on('disconnect', handleDisconnect);
    socketManager.on('room-joined', handleRoomJoined);
    socketManager.on('new-message', handleNewMessage);
  socketManager.on('message-deleted', handleMessageDeleted);
    socketManager.on('user-joined', handleUserJoined);
    socketManager.on('user-left', handleUserLeft);
    socketManager.on('error', handleError);
    
    // Register new events
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
      socketManager.off('user-joined', handleUserJoined);
      socketManager.off('user-left', handleUserLeft);
      socketManager.off('error', handleError);
      
      socketManager.off('knock-approved', handleKnockApproved);
      socketManager.off('knock-denied', handleKnockDenied);
      socketManager.off('user-knocking', handleUserKnocking);
      socketManager.off('promoted-to-host', handlePromotedToHost);

      if (process.env.NODE_ENV !== 'development') {
        socketManager.disconnect();
      }
    };
  }, [roomCode, performJoin]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoinRoom = async (params) => {
    const { nickname, password = '', capToken = null, inviteToken } = params;
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }
    if (isProcessingInvite || isJoined) return;

    setIsProcessingInvite(true);
    setError(null);
    setIsWaitingForHost(true); // Show waiting UI

    // Store params for later use
    joinParamsRef.current = params;

    try {
      const knockData = {
        roomCode,
        nickname: nickname.trim(),
        password: password.trim(),
        capToken: capToken
      };
      if (inviteToken) knockData.inviteToken = inviteToken;

      // Emit knock event
      socketManager.emit('knock', knockData);
      
      // We don't use a callback here because the server emits events back
      // But we should set a timeout in case the server doesn't respond
      setTimeout(() => {
        if (isWaitingForHost) {
           // Still waiting? Maybe server is down or logic failed.
           // But we stay in waiting state as per user request "Waiting for host..."
        }
      }, 10000);

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

      socketManager.emit('send-message', { 
          content,
          isEncrypted,
          iv,
          recipients: selectedRecipients
      });
      socketManager.emit('user-activity');
      setNewMessage('');
    } catch (error) {
      setError('Failed to send message');
    } finally {
      setIsSending(false);
    }
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
    try {
      const reader = new FileReader();
      reader.onload = (e) => {
        socketManager.emit('send-message', { 
          messageType: 'image', 
          imageData: e.target.result, 
          isViewOnce: true,
          recipients: selectedRecipients
        });
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError('Failed to upload image');
      setIsUploading(false);
    }
  }, [selectedRecipients]);

  const handleStartCall = useCallback(async () => {
    if (users.length < 2) {
      setError('Need at least 2 users to start a call');
      return;
    }
    const otherUser = users.find(u => u.socketId !== currentUser?.id && u.id !== currentUser?.id);
    if (otherUser) {
      try {
        await webRTCService.startCall(roomCode, otherUser.nickname);
        setShowCallModal(true);
      } catch (err) {
        setError('Failed to start call. Please check microphone permissions.');
      }
    }
  }, [users, currentUser, roomCode]);

  const startRecording = async () => {
    // iOS/Safari: getUserMedia must be called directly in the tap handler, with no async hops before.
    // Also feature-detect MediaRecorder and pick a supported mime type (iOS often prefers audio/mp4).
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Audio recording is not supported in this browser.');
        return;
      }

      if (typeof window.MediaRecorder === 'undefined') {
        setError('Audio recording is not supported on this device.');
        return;
      }

      // Choose the first supported mime type in priority order
      const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4'
      ];
      const selectedMimeType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';

      // Optimize constraints for voice: Mono, lower sample rate
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 22050, // Lower sample rate for voice
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      const options = {
        mimeType: selectedMimeType,
        audioBitsPerSecond: 16000 
      };

      mediaRecorderRef.current = new MediaRecorder(stream, options);
      audioChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingDuration(0);
      
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 29) { 
            handleStopRecording();
            return 30;
          }
          return prev + 1;
        });
      }, 1000);

    } catch (err) {
      // Surface more actionable errors on iOS (NotAllowedError / NotSupportedError)
      if (err?.name === 'NotAllowedError') {
        setError('Microphone access was denied. Please allow mic access in Safari settings and try again.');
      } else if (err?.name === 'NotSupportedError') {
        setError('Audio recording is not supported on this device/browser.');
      } else {
        setError('Could not access microphone.');
      }
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        // Create the final blob with a guaranteed mime type
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mediaRecorderRef.current.mimeType 
        });
        
        if (audioBlob.size > 0) {
          sendAudioMessage(audioBlob);
        }
        
        // Clean up tracks immediately
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  };

  const handleCancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.onstop = () => {
             mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingDuration(0);
    clearInterval(recordingTimerRef.current);
  };

  const sendAudioMessage = (audioBlob) => {
    // Client-side size check (5MB limit)
    if (audioBlob.size > 5 * 1024 * 1024) {
      setError('Voice note is too large (max 5MB). Please record a shorter message.');
      return;
    }

    const reader = new FileReader();
    reader.readAsArrayBuffer(audioBlob); // Read as raw binary
    
    reader.onloadend = () => {
      const arrayBuffer = reader.result;
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Efficiently convert binary to base64 string
      let binary = '';
      const len = uint8Array.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64Audio = btoa(binary);


      socketManager.emit('send-message', { 
        messageType: 'audio', 
        content: base64Audio, // Sending raw base64 ONLY
        isViewOnce: true,
        recipients: selectedRecipients
      });
    };
  };

  useEffect(() => {
    const unsubscribe = webRTCService.onCallStateChange((state) => {
      setCallState(state);
      if (state.state === CallState.INCOMING) setShowCallModal(true);
      if (state.state === CallState.IDLE && showCallModal) setTimeout(() => setShowCallModal(false), 1000);
    });
    return unsubscribe;
  }, [showCallModal]);

  const copyRoomCode = () => navigator.clipboard.writeText(roomCode);

  const getTTLDisplay = () => {
    if (!room?.settings?.messageTTL) return null;
    const ttl = room.settings.messageTTL;
    if (ttl < 60) return `${ttl}s`;
    if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
    return `${Math.floor(ttl / 3600)}h`;
  };

  const toggleRecipient = (socketId) => {
    setSelectedRecipients(prev => {
      if (prev.includes(socketId)) {
        return prev.filter(id => id !== socketId);
      } else {
        return [...prev, socketId];
      }
    });
  };

  if (error && !isJoined) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <div className="text-center">
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
            <p className="font-bold">Error</p>
            <p>{error}</p>
          </div>
          <button onClick={() => navigate('/')} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Go Back to Home</button>
        </div>
      </div>
    );
  }

  if (showJoinModal) return (
    <JoinRoomModal 
      roomCode={roomCode} 
      onJoin={handleJoinRoom} 
      onCancel={() => navigate('/')} 
      error={error} 
      isProcessingInvite={isProcessingInvite}
      isWaitingForHost={isWaitingForHost}
    />
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 transition-colors duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-semibold truncate text-gray-900 dark:text-white">Secure Chat</h1>
              </div>
              <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                <div className="flex items-center space-x-1">
                  {isConnected ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
                  <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
                <div className="flex items-center space-x-1"><Users className="w-4 h-4" /><span>{users.length}</span></div>
                {room?.settings?.passwordHash && <div className="flex items-center space-x-1"><Lock className="w-4 h-4" /><span>Protected</span></div>}
                {getTTLDisplay() && <div className="flex items-center space-x-1"><Clock className="w-4 h-4" /><span>TTL: {getTTLDisplay()}</span></div>}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
             <ThemeToggle />
             <button 
               onClick={() => setShowMobileMenu(true)}
               className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300 relative"
             >
               <Users className="w-5 h-5" />
               {isHost && pendingGuests.length > 0 && (
                 <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-800" />
               )}
             </button>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-100 dark:bg-red-900 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-3"><p className="text-sm">{error}</p></div>}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
            <MessageList messages={messages} currentUser={currentUser} messageTTL={room?.settings?.messageTTL} />
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors duration-200">
              {selectedRecipients.length > 0 && (
                <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center justify-between animate-in slide-in-from-bottom-2 duration-200">
                  <span className="text-xs text-blue-600 dark:text-blue-300 font-medium flex items-center">
                    <Users className="w-3 h-3 mr-1.5" />
                    Sending to {selectedRecipients.length} specific user{selectedRecipients.length !== 1 ? 's' : ''}
                  </span>
                  <button 
                    onClick={() => setSelectedRecipients([])}
                    className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-200 underline"
                  >
                    Clear selection (Send to all)
                  </button>
                </div>
              )}
              <div className="p-4">
              <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                {isRecording ? (
                  <div className="flex-1 flex items-center justify-between bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2 animate-in fade-in duration-200">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-red-600 dark:text-red-400 font-medium font-mono">{formatDuration(recordingDuration)} / 0:30</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button type="button" onClick={handleCancelRecording} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-full text-red-500 transition-colors" title="Cancel">
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button type="button" onClick={handleStopRecording} className="p-2 bg-red-500 hover:bg-red-600 rounded-full text-white transition-colors shadow-sm" title="Send">
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="image-upload" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!isConnected || isUploading} className="p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"><Loader2 className={`w-5 h-5 text-gray-500 dark:text-gray-400 ${isUploading ? 'animate-spin' : ''}`} style={{ display: isUploading ? 'block' : 'none' }} /><ImageIcon className="w-5 h-5 text-gray-500 dark:text-gray-400" style={{ display: isUploading ? 'none' : 'block' }} /></button>
                    <button type="button" onClick={handleStartCall} disabled={!isConnected || users.length < 2} className="p-3 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"><Phone className="w-5 h-5 text-green-500" /></button>
                    <button type="button" onClick={startRecording} disabled={!isConnected} className="p-3 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"><Mic className="w-5 h-5 text-red-500" /></button>
                    <input
                      type="text"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      onCopy={(e) => e.preventDefault()}
                      onCut={(e) => e.preventDefault()}
                      onPaste={(e) => e.preventDefault()}
                      placeholder="Type your message..."
                      className="flex-1 input-field py-3 px-4 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600"
                      disabled={!isConnected || isSending}
                      maxLength={500}
                    />
                    <button type="submit" disabled={!newMessage.trim() || !isConnected || isSending} className="btn-primary px-4 py-3"><Send className="w-5 h-5" /></button>
                  </>
                )}
              </form>
              </div>
          </div>
        </div>
        <div className="hidden lg:block w-64 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 transition-colors duration-200">
          <UserList 
            users={users} 
            currentUser={currentUser} 
            pendingGuests={pendingGuests}
            isHost={isHost}
            onApprove={handleApproveGuest}
            onDeny={handleDenyGuest}
            selectedRecipients={selectedRecipients}
            onToggleRecipient={toggleRecipient}
          />
        </div>
      </div>

      {/* Mobile User List Overlay */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowMobileMenu(false)}
          />
          {/* Drawer */}
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-[85vw] bg-white dark:bg-gray-800 shadow-xl transform transition-transform duration-200 ease-in-out flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Room Details</h2>
              <button 
                onClick={() => setShowMobileMenu(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
               <UserList 
                users={users} 
                currentUser={currentUser} 
                pendingGuests={pendingGuests}
                isHost={isHost}
                onApprove={handleApproveGuest}
                onDeny={handleDenyGuest}
                selectedRecipients={selectedRecipients}
                onToggleRecipient={toggleRecipient}
              />
            </div>
          </div>
        </div>
      )}

      {showCallModal && <AudioCallModal isOpen={showCallModal} onClose={() => setShowCallModal(false)} roomCode={roomCode} />}
    </div>
  );
};

export default ChatRoom;
