import React, { useState, useEffect, useRef } from 'react';
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
  X
} from 'lucide-react';
import InviteLinkModal from './InviteLinkModal';
import socketManager from '../socket-simple';
import JoinRoomModal from './JoinRoomModal';
import MessageList from './MessageList';
import UserList from './UserList';

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
  const messagesEndRef = useRef(null);

  // Check for invite token in location state or query params
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tokenFromUrl = searchParams.get('token');
    
    // Always prefer the token from location state if available
    if (location.state?.inviteToken) {
      console.log('Got invite token from location state:', location.state.inviteToken);
      setInviteToken(location.state.inviteToken);
    } else if (tokenFromUrl) {
      console.log('Got invite token from URL:', tokenFromUrl);
      setInviteToken(tokenFromUrl);
    }
  }, [location]);

  // Handle auto-join if we have nickname and password from invite
  useEffect(() => {
    // Disable auto-join for invite links to ensure CAPTCHA is required
    // if (location.state?.fromInvite && location.state?.nickname && !isJoined) {
    //   console.log('Auto-joining room from invite with token:', inviteToken || 'no token');
    //   // Use a small timeout to ensure state is updated
    //   const timer = setTimeout(() => {
    //     handleJoinRoom(location.state.nickname, location.state.password || '');
    //   }, 100);
    //   return () => clearTimeout(timer);
    // }
  }, [location.state, isJoined, inviteToken]);

  useEffect(() => {
    // Connect to socket
    const socket = socketManager.connect();
    
    // Connection status
    const handleConnect = () => {
      console.log('Socket connected');
      setIsConnected(true);
    };
    
    const handleDisconnect = (reason) => {
      console.log('Socket disconnected:', reason);
      setIsConnected(false);
      
      // Show error message to user
      if (reason === 'io server disconnect') {
        setError('You have been disconnected by the server');
      } else if (reason === 'transport close') {
        setError('Connection lost. Trying to reconnect...');
      }
    };
    
    // Room events
    const handleRoomJoined = (data) => {
      console.log('Room joined:', data);
      setRoom(data.room);
      setUsers(data.users || []);
      setMessages(data.messages || []);
      setCurrentUser({
        id: data.userId,
        nickname: data.nickname,
        isAdmin: data.isAdmin
      });
      setIsJoined(true);
      setShowJoinModal(false);
      setError(null);
    };
    
    // Chat events
    const handleNewMessage = (message) => {
      console.log('New message:', message);
      setMessages(prev => [...prev, message]);
    };
    
    const handleUserJoined = ({ nickname, userCount }) => {
      console.log('User joined:', nickname, 'Total users:', userCount);
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        type: 'system',
        content: `${nickname} joined the room`,
        timestamp: new Date().toISOString()
      }]);
      
      // Update user count - create a dummy user array with the right length
      setUsers(prev => {
        // If we don't have the actual user data, create placeholder
        const newUsers = [...prev];
        // Ensure we have the right number of users
        while (newUsers.length < userCount) {
          newUsers.push({ id: `user_${Date.now()}_${newUsers.length}`, nickname: 'User' });
        }
        return newUsers.slice(0, userCount);
      });
    };
    
    const handleUserLeft = ({ nickname, userCount }) => {
      console.log('User left:', nickname, 'Remaining users:', userCount);
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        type: 'system',
        content: `${nickname} left the room`,
        timestamp: new Date().toISOString()
      }]);
      
      // Update user count
      setUsers(prev => prev.slice(0, userCount));
    };
    
    const handleScreenshotNotification = ({ nickname, timestamp }) => {
      console.log(`📸 Screenshot detected by ${nickname}`);
      setMessages(prev => [...prev, {
        id: `screenshot_${Date.now()}`,
        type: 'screenshot',
        content: `${nickname} took a screenshot`,
        timestamp: timestamp,
        nickname: nickname
      }]);
    };
    
    const handleError = ({ message }) => {
      console.error('Socket error:', message);
      setError(message);
      setTimeout(() => setError(null), 5000);
      
      // If there's an error, ensure join modal is shown
      if (message.includes('Invalid') || message.includes('expired')) {
        setShowJoinModal(true);
      }
    };
    
    // Register event listeners
    socketManager.on('connect', handleConnect);
    socketManager.on('disconnect', handleDisconnect);
    socketManager.on('room-joined', handleRoomJoined);
    socketManager.on('new-message', handleNewMessage);
    socketManager.on('user-joined', handleUserJoined);
    socketManager.on('user-left', handleUserLeft);
    socketManager.on('screenshot-notification', handleScreenshotNotification);
    socketManager.on('error', handleError);
    
    return () => {
      // Clean up event listeners
      socketManager.off('connect', handleConnect);
      socketManager.off('disconnect', handleDisconnect);
      socketManager.off('room-joined', handleRoomJoined);
      socketManager.off('new-message', handleNewMessage);
      socketManager.off('user-joined', handleUserJoined);
      socketManager.off('user-left', handleUserLeft);
      socketManager.off('screenshot-notification', handleScreenshotNotification);
      socketManager.off('error', handleError);
      
      // Only disconnect if we're not in development with hot reload
      if (process.env.NODE_ENV !== 'development') {
        socketManager.disconnect();
      }
    };
  }, [roomCode]);

  const handleScreenshotDetected = () => {
    // Emit screenshot event to server
    socketManager.emit('screenshot-detected', {
      roomCode,
      nickname: currentUser?.nickname || 'Unknown'
    });
  };

  // Screenshot detection
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Detect PrintScreen key (common screenshot method)
      if (e.key === 'PrintScreen' || (e.ctrlKey && e.key === 's')) {
        handleScreenshotDetected();
      }
    };

    const handlePaste = (e) => {
      // Detect if screenshot is pasted (less reliable)
      const items = e.clipboardData?.items;
      if (items) {
        for (let item of items) {
          if (item.type.startsWith('image/')) {
            handleScreenshotDetected();
            break;
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('paste', handlePaste);
    };
  }, [roomCode, currentUser]);

  const handleJoinRoom = async (nickname, password = '', captchaAnswer = '', captchaProblem = '') => {
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }
    
    // If we're already joining or joined, don't proceed
    if (isProcessingInvite || isJoined) {
      console.log('Already joining/joined, skipping duplicate join attempt');
      return;
    }
    
    setIsProcessingInvite(true);
    setError(null);
    
    // Set a timeout to handle cases where the server doesn't respond
    const joinTimeout = setTimeout(() => {
      if (!isJoined) {
        console.log('Join room timeout - no response from server');
        setError('Connection timed out. Please try again.');
        setIsProcessingInvite(false);
      }
    }, 10000); // 10 second timeout
    
    try {
      console.log(`Joining room ${roomCode} with nickname ${nickname}`, {
        hasToken: !!inviteToken,
        token: inviteToken ? `${inviteToken.substring(0, 8)}...` : 'none',
        hasPassword: !!password,
        hasCaptcha: !!captchaAnswer
      });
      
      // Emit join-room event with the invite token if available
      const joinData = {
        roomCode,
        nickname: nickname.trim(),
        password: password.trim(),
        captchaAnswer: captchaAnswer.trim(),
        captchaProblem: captchaProblem
      };
      
      // Only include inviteToken if it exists
      if (inviteToken) {
        joinData.inviteToken = inviteToken;
      }
      
      socketManager.emit('join-room', joinData, (response) => {
        console.log('Join room response:', response);
        
        // Clear timeout immediately on any response
        clearTimeout(joinTimeout);
        
        if (!response) {
          setError('No response from server');
          setIsProcessingInvite(false);
          return;
        }
        
        // Handle redirect response
        if (response.redirect) {
          console.log(`Redirecting to room ${response.roomCode}`, response);
          
          // If password is required, show the join modal for the new room
          if (response.requiresPassword) {
            setShowJoinModal(true);
            setError(response.error || 'This room requires a password');
            navigate(`/room/${response.roomCode}`, {
              state: {
                fromInvite: true,
                nickname: nickname.trim(),
                inviteToken: inviteToken || undefined
              }
            });
          } else {
            // Auto-join the new room
            navigate(`/room/${response.roomCode}`, {
              state: {
                fromInvite: true,
                nickname: nickname.trim(),
                inviteToken: inviteToken || undefined
              }
            });
          }
          return;
        }
        
        // Handle success response
        if (response.success) {
          console.log('Successfully joined room, updating UI');
          console.log('Room data:', response.room);
          console.log('Messages:', response.messages);
          console.log('Users:', response.room?.users);
          
          setRoom(response.room);
          setMessages(response.messages || []);
          setUsers(response.room?.users || []);
          setCurrentUser({
            id: socketManager.socket?.id,
            nickname: response.nickname,
            isAdmin: false
          });
          setIsJoined(true);
          setShowJoinModal(false);
          setError(null);
          setIsProcessingInvite(false);
          
          console.log('State updated: isJoined=true, showJoinModal=false');
          return;
        }
        
        // Handle error response
        if (!response.success) {
          setError(response.error || 'Failed to join room');
          setIsProcessingInvite(false);
        }
      });
      
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Failed to join room. Please try again.');
      setIsProcessingInvite(false);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending || !isConnected) return;
    
    setIsSending(true);
    
    try {
      socketManager.emit('send-message', {
        content: newMessage.trim()
      });
      
      // Notify server of user activity to reset inactivity timer
      socketManager.emit('user-activity');
      
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(roomCode);
    // Could add a toast notification here
  };

  const getTTLDisplay = () => {
    if (!room?.settings?.messageTTL) return null;
    
    const ttl = room.settings.messageTTL;
    if (ttl < 60) return `${ttl}s`;
    if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
    return `${Math.floor(ttl / 3600)}h`;
  };

  console.log('Render state:', { showJoinModal, isJoined, isConnected, hasRoom: !!room });

  if (showJoinModal) {
    console.log('Rendering JoinRoomModal');
    return (
      <JoinRoomModal
        roomCode={roomCode}
        onJoin={handleJoinRoom}
        onCancel={() => navigate('/')}
        error={error}
      />
    );
  }

  if (showInviteModal) {
    console.log('Rendering InviteLinkModal');
    return (
      <InviteLinkModal 
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        roomCode={roomCode}
      />
    );
  }

  console.log('Rendering ChatRoom interface');
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-semibold">Room {roomCode}</h1>
                <button
                  onClick={copyRoomCode}
                  className="p-1 hover:bg-gray-100 rounded transition-colors"
                  title="Copy room code"
                >
                  <Copy className="w-4 h-4 text-gray-500" />
                </button>
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="ml-2 p-1 text-blue-500 hover:bg-blue-50 rounded transition-colors"
                  title="Invite people"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>
              
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  {isConnected ? (
                    <Wifi className="w-4 h-4 text-green-500" />
                  ) : (
                    <WifiOff className="w-4 h-4 text-red-500" />
                  )}
                  <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
                
                <div className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>{users.length} online</span>
                </div>
                
                {room?.settings?.passwordHash && (
                  <div className="flex items-center space-x-1">
                    <Lock className="w-4 h-4" />
                    <span>Protected</span>
                  </div>
                )}
                
                {getTTLDisplay() && (
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span>TTL: {getTTLDisplay()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3">
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4">
            <MessageList 
              messages={messages} 
              currentUser={currentUser}
              messageTTL={room?.settings?.messageTTL}
            />
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="border-t border-gray-200 p-4 bg-white">
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 input-field"
                disabled={!isConnected || isSending}
                maxLength={500}
              />
              <button
                type="submit"
                disabled={!newMessage.trim() || !isConnected || isSending}
                className="btn-primary px-4"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>

        {/* User List - Hidden on mobile, shown on larger screens */}
        <div className="hidden lg:block w-64 border-l border-gray-200 bg-white">
          <UserList users={users} currentUser={currentUser} />
        </div>
      </div>
    </div>
  );
};

export default ChatRoom;
