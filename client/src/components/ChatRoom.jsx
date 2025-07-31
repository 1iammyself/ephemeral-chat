import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Send, 
  Users, 
  Copy, 
  ArrowLeft, 
  Wifi, 
  WifiOff,
  Clock,
  Lock
} from 'lucide-react';
import socketManager from '../socket';
import JoinRoomModal from './JoinRoomModal';
import MessageList from './MessageList';
import UserList from './UserList';

const ChatRoom = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [isJoined, setIsJoined] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(true);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    // Connect to socket
    const socket = socketManager.connect();
    
    // Connection status
    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);
    
    socketManager.on('connect', handleConnect);
    socketManager.on('disconnect', handleDisconnect);
    
    // Chat events
    const handleNewMessage = (message) => {
      setMessages(prev => [...prev, message]);
    };
    
    const handleUserJoined = ({ nickname, userCount }) => {
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        type: 'system',
        content: `${nickname} joined the room`,
        timestamp: new Date().toISOString()
      }]);
      
      // Update user count if we have room data
      setRoom(prev => prev ? { ...prev, users: { length: userCount } } : null);
    };
    
    const handleUserLeft = ({ nickname }) => {
      setMessages(prev => [...prev, {
        id: `system_${Date.now()}`,
        type: 'system',
        content: `${nickname} left the room`,
        timestamp: new Date().toISOString()
      }]);
    };
    
    const handleError = ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 5000);
    };
    
    socketManager.on('new-message', handleNewMessage);
    socketManager.on('user-joined', handleUserJoined);
    socketManager.on('user-left', handleUserLeft);
    socketManager.on('error', handleError);
    
    return () => {
      socketManager.off('connect', handleConnect);
      socketManager.off('disconnect', handleDisconnect);
      socketManager.off('new-message', handleNewMessage);
      socketManager.off('user-joined', handleUserJoined);
      socketManager.off('user-left', handleUserLeft);
      socketManager.off('error', handleError);
      socketManager.disconnect();
    };
  }, []);

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleJoinRoom = async (nickname, password) => {
    try {
      socketManager.emit('join-room', {
        roomCode,
        nickname,
        password
      }, (response) => {
        if (response.success) {
          setIsJoined(true);
          setShowJoinModal(false);
          setRoom(response.room);
          setMessages(response.messages || []);
          setUsers(response.room.users || []);
          setCurrentUser({ nickname: response.nickname });
        } else {
          setError(response.error);
        }
      });
    } catch (error) {
      setError('Failed to join room');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending || !isConnected) return;

    setIsSending(true);
    socketManager.emit('send-message', { content: newMessage.trim() });
    setNewMessage('');
    setIsSending(false);
  };

  const copyRoomCode = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      // Could add a toast notification here
    } catch (error) {
      console.error('Failed to copy room code:', error);
    }
  };

  const getTTLDisplay = () => {
    if (!room?.settings?.messageTTL) return null;
    
    const ttl = room.settings.messageTTL;
    if (ttl < 60) return `${ttl}s`;
    if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
    return `${Math.floor(ttl / 3600)}h`;
  };

  if (showJoinModal) {
    return (
      <JoinRoomModal
        roomCode={roomCode}
        onJoin={handleJoinRoom}
        onCancel={() => navigate('/')}
        error={error}
      />
    );
  }

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
