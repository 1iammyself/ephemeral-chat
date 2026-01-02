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
  Share2,
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
import InviteLinkModal from './InviteLinkModal';
import socketManager from '../socket-simple';
import JoinRoomModal from './JoinRoomModal';
import MessageList from './MessageList';
import UserList from './UserList';
import AudioCallModal from './AudioCallModal';
import webRTCService, { CallState } from '../webrtc';
import { encryptMessage, decryptMessage } from '../utils/security'; // Import E2EE helpers

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
  const [showInviteModal, setShowInviteModal] = useState(false);
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
        setCurrentUser({ id: socketManager.socket?.id, nickname: response.nickname, isAdmin: false });
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

    const handleUserJoined = ({ nickname, userCount }) => {
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        type: 'system',
        content: `${nickname} joined the room`,
        timestamp: new Date().toISOString()
      }]);
      setUsers(prev => {
        const newUsers = [...prev];
        while (newUsers.length < userCount) {
          newUsers.push({ id: `user_${Date.now()}_${newUsers.length}`, nickname: 'User' });
        }
        return newUsers.slice(0, userCount);
      });
    };

    const handleUserLeft = ({ nickname, userCount }) => {
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        type: 'system',
        content: `${nickname} left the room`,
        timestamp: new Date().toISOString()
      }]);
      setUsers(prev => prev.slice(0, userCount));
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
          iv
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
        socketManager.emit('send-message', { messageType: 'image', imageData: e.target.result, isViewOnce: true });
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError('Failed to upload image');
      setIsUploading(false);
    }
  }, []);

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
    try {
      // Optimize constraints for voice: Mono, lower sample rate
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 22050, // Lower sample rate for voice
          echoCancellation: true,
          noiseSuppression: true
        } 
      });
      
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';

      // AGGRESSIVE COMPRESSION: 
      // 16kbps is very efficient for voice while maintaining clarity
      const options = {
        mimeType,
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
      setError('Could not access microphone.');
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

      console.log('🚀 Sending sanitized audio. Length:', base64Audio.length);

      socketManager.emit('send-message', { 
        messageType: 'audio', 
        content: base64Audio, // Sending raw base64 ONLY
        isViewOnce: true 
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

  if (error && !isJoined) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
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
  if (showInviteModal) return <InviteLinkModal isOpen={showInviteModal} onClose={() => setShowInviteModal(false)} roomCode={roomCode} />;

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-100 rounded-lg transition-colors"><ArrowLeft className="w-5 h-5" /></button>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-semibold truncate">Room {roomCode}</h1>
                <button onClick={copyRoomCode} className="p-1 hover:bg-gray-100 rounded transition-colors"><Copy className="w-4 h-4 text-gray-500" /></button>
              </div>
              <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
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
        </div>
      </div>

      {error && <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3"><p className="text-sm">{error}</p></div>}

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col">
          <div className="flex-1 overflow-y-auto p-4">
            <MessageList messages={messages} currentUser={currentUser} messageTTL={room?.settings?.messageTTL} />
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t border-gray-200 p-4 bg-white">
              <form onSubmit={handleSendMessage} className="flex items-center space-x-3">
                {isRecording ? (
                  <div className="flex-1 flex items-center justify-between bg-red-50 rounded-lg px-4 py-2 animate-in fade-in duration-200">
                    <div className="flex items-center space-x-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                      <span className="text-red-600 font-medium font-mono">{formatDuration(recordingDuration)} / 0:30</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button type="button" onClick={handleCancelRecording} className="p-2 hover:bg-red-100 rounded-full text-red-500 transition-colors" title="Cancel">
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
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={!isConnected || isUploading} className="p-3 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50">{isUploading ? <Loader2 className="w-5 h-5 text-gray-500 animate-spin" /> : <ImageIcon className="w-5 h-5 text-gray-500" />}</button>
                    <button type="button" onClick={handleStartCall} disabled={!isConnected || users.length < 2} className="p-3 rounded-lg hover:bg-green-50 transition-colors disabled:opacity-50"><Phone className="w-5 h-5 text-green-500" /></button>
                    <button type="button" onClick={startRecording} disabled={!isConnected} className="p-3 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"><Mic className="w-5 h-5 text-red-500" /></button>
                    <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type your message..." className="flex-1 input-field py-3 px-4" disabled={!isConnected || isSending} maxLength={500} />
                    <button type="submit" disabled={!newMessage.trim() || !isConnected || isSending} className="btn-primary px-4 py-3"><Send className="w-5 h-5" /></button>
                  </>
                )}
              </form>
          </div>
        </div>
        <div className="hidden lg:block w-64 border-l border-gray-200 bg-white">
          <UserList 
            users={users} 
            currentUser={currentUser} 
            pendingGuests={pendingGuests}
            isHost={isHost}
            onApprove={handleApproveGuest}
            onDeny={handleDenyGuest}
          />
        </div>
      </div>
      {showCallModal && <AudioCallModal isOpen={showCallModal} onClose={() => setShowCallModal(false)} roomCode={roomCode} />}
    </div>
  );
};

export default ChatRoom;
