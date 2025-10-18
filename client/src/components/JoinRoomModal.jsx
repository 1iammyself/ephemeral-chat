import React, { useState, useEffect } from 'react';
import { MessageCircle, Lock, Users, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

const JoinRoomModal = ({ roomCode, onJoin, onCancel, error, isProcessingInvite = false }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [fromInvite, setFromInvite] = useState(false);
  const [inviteValid, setInviteValid] = useState(false);
  const [isCheckingInvite, setIsCheckingInvite] = useState(false);
  const [inviteToken, setInviteToken] = useState(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [captcha, setCaptcha] = useState({ problem: '', answer: '' });
  const [captchaInput, setCaptchaInput] = useState('');

  // Fetch CAPTCHA function
  const fetchCaptcha = async () => {
    try {
      const response = await fetch('/api/captcha');
      const data = await response.json();
      setCaptcha(data);
    } catch (error) {
      console.error('Error fetching CAPTCHA:', error);
    }
  };

  // Check for invite token in URL or location state
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tokenFromUrl = searchParams.get('token');
    
    if (location.state?.inviteToken) {
      setInviteToken(location.state.inviteToken);
      setFromInvite(true);
    } else if (tokenFromUrl) {
      setInviteToken(tokenFromUrl);
      setFromInvite(true);
    }
    
    // If we have a nickname from location state, use it
    if (location.state?.nickname) {
      setNickname(location.state.nickname);
    }
    
    // If we have a password from location state, use it
    if (location.state?.password) {
      setPassword(location.state.password);
    }
  }, [location]);

  // Fetch CAPTCHA on component mount
  useEffect(() => {
    fetchCaptcha();
  }, []);

  // Check room info and validate invite token when component mounts or roomCode changes
  useEffect(() => {
    let isMounted = true;
    
    const checkRoomAndInvite = async () => {
      try {
        // First, check room info
        const roomResponse = await fetch(`/api/rooms/${roomCode}`);
        const roomData = await roomResponse.json();
        
        if (!isMounted) return;
        
        if (roomResponse.ok && roomData.exists) {
          setRoomInfo(roomData);
          setRequiresPassword(roomData.requiresPassword || false);
          
          // If we have an invite token, validate it
          if (inviteToken) {
            await validateInviteToken();
          } else {
            setFromInvite(false);
          }
        } else {
          // Room doesn't exist, redirect to home
          console.error('Room not found or error:', roomData);
          onCancel();
        }
      } catch (error) {
        console.error('Error checking room:', error);
        if (isMounted) {
          onCancel();
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
          setIsCheckingInvite(false);
        }
      }
    };
    
    const validateInviteToken = async () => {
      if (!inviteToken) return;
      
      try {
        setIsCheckingInvite(true);
        const response = await fetch(`/api/invite/${inviteToken}?roomCode=${roomCode}`);
        const data = await response.json();
        
        if (!isMounted) return;
        
        if (response.ok && data.success) {
          setInviteValid(true);
          setRequiresPassword(data.requiresPassword || false);
          
          // If the room code in the invite is different, redirect
          if (data.roomCode && data.roomCode !== roomCode) {
            navigate(`/room/${data.roomCode}`, { 
              state: { 
                fromInvite: true,
                inviteToken,
                nickname: nickname || undefined,
                password: password || undefined
              },
              replace: true
            });
            return;
          }
        } else {
          setInviteValid(false);
          console.error('Invalid invite token:', data.error);
        }
      } catch (error) {
        console.error('Error validating invite:', error);
        setInviteValid(false);
      } finally {
        if (isMounted) {
          setIsCheckingInvite(false);
        }
      }
    };
    
    if (roomCode) {
      checkRoomAndInvite();
    }
    
    return () => {
      isMounted = false;
    };
  }, [roomCode, inviteToken, navigate, onCancel]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate form
    if (!nickname.trim()) {
      return;
    }
    
    if (requiresPassword && !password.trim()) {
      return;
    }
    
    if (!captchaInput.trim()) {
      return;
    }
    
    setIsJoining(true);
    
    try {
      // Call the parent's onJoin handler with the form data
      await onJoin(nickname.trim(), password.trim() || '', captchaInput.trim(), captcha.problem);
    } catch (error) {
      console.error('Error in join handler:', error);
      // Error handling is done by the parent component
    } finally {
      setIsJoining(false);
    }
  };

  if (isLoading || isCheckingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-xl p-8 shadow-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Checking room...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-800">
              {fromInvite ? 'Join Private Room' : 'Join Room'}
            </h2>
            <button
              onClick={onCancel}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Close"
              disabled={isJoining || isProcessingInvite}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-start">
              <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          
          {/* Room Info */}
          <div className="mb-6 bg-blue-50 p-4 rounded-lg">
            <div className="flex items-center mb-2">
              <MessageCircle className="h-5 w-5 text-blue-600 mr-2" />
              <span className="font-medium">{roomInfo?.name || `Room: ${roomCode}`}</span>
              
              {fromInvite && inviteValid && (
                <span className="ml-2 px-2 py-0.5 text-xs bg-green-100 text-green-800 rounded-full flex items-center">
                  <Check className="h-3 w-3 mr-1" />
                  Invited
                </span>
              )}
            </div>
            
            {roomInfo?.isPrivate && (
              <div className="flex items-center text-sm text-gray-600">
                <Lock className="h-4 w-4 mr-1" />
                <span>Private Room</span>
              </div>
            )}
            
            {roomInfo?.userCount !== undefined && (
              <div className="flex items-center text-sm text-gray-600">
                <Users className="h-4 w-4 mr-1" />
                <span>{roomInfo.userCount} {roomInfo.userCount === 1 ? 'person' : 'people'} in room</span>
              </div>
            )}
            
            {roomInfo?.expiresAt && (
              <div className="flex items-center text-sm text-gray-600 mt-1">
                <Clock className="h-4 w-4 mr-1" />
                <span>Expires in {formatTimeRemaining(roomInfo.expiresAt)}</span>
              </div>
            )}
          </div>
          
          {/* Join Form */}
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 mb-1">
                Your Nickname {!fromInvite && '(required)'}
              </label>
              <input
                type="text"
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                placeholder="Enter your nickname"
                autoComplete="off"
                autoFocus
                required={!fromInvite}
                disabled={isJoining || isProcessingInvite}
              />
            </div>
            
            {(roomInfo?.hasPassword || requiresPassword) && (
              <div className="mb-6">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Room Password {!fromInvite && '(required)'}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-10 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Enter room password"
                    autoComplete="current-password"
                    required={!fromInvite && (roomInfo?.hasPassword || requiresPassword)}
                    disabled={isJoining || isProcessingInvite}
                  />
                  <Lock className="h-4 w-4 text-gray-400 absolute right-3 top-1/2 transform -translate-y-1/2" />
                </div>
                {fromInvite && requiresPassword && !password && (
                  <p className="mt-1 text-sm text-yellow-600">This room requires a password</p>
                )}
              </div>
            )}
            
            {/* CAPTCHA */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Solve the Math Problem
              </label>
              <div className="mb-3">
                <div className="p-3 bg-gray-50 border rounded-lg text-center font-mono text-lg">
                  {captcha.problem || 'Loading...'}
                </div>
              </div>
              <input
                type="text"
                placeholder="Enter your answer"
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
                disabled={isJoining || isProcessingInvite}
              />
            </div>
            
            <div className="flex flex-col space-y-3">
              <button
                type="submit"
                disabled={isJoining || isProcessingInvite}
                className={`w-full py-2 px-4 rounded-lg font-medium text-white ${
                  isJoining || isProcessingInvite ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
                } transition-colors flex items-center justify-center disabled:opacity-70 disabled:cursor-not-allowed`}
              >
                {isJoining || isProcessingInvite ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4 mr-2" />
                    {isProcessingInvite ? 'Joining...' : 'Verifying...'}
                  </>
                ) : (
                  'Join Room'
                )}
              </button>
              
              <button
                type="button"
                onClick={onCancel}
                disabled={isJoining || isProcessingInvite}
                className="w-full py-2 px-4 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

// Helper function to format time remaining
function formatTimeRemaining(expiryDate) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffMs = expiry - now;
  
  if (diffMs <= 0) return 'Expired';
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
  return `${diffMins} minute${diffMins !== 1 ? 's' : ''}`;
}

export default JoinRoomModal;
