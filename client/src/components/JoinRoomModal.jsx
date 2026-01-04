import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageCircle, Lock, Users, AlertCircle, Check, Loader2, Shield, Clock, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import '@cap.js/widget';

const JoinRoomModal = ({ roomCode, onJoin, onCancel, error, isProcessingInvite = false, isWaitingForHost = false }) => {
  const API_BASE = process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '';
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
  const [capToken, setCapToken] = useState(null);
  const [isCapVerified, setIsCapVerified] = useState(false);

  // Use callback ref to ensure listener is attached when element mounts
  const setCapWidgetRef = useCallback((node) => {
    if (node) {
      const handleSuccess = (event) => {
        if (event.detail && event.detail.token) {
          setCapToken(event.detail.token);
          setIsCapVerified(true);
        }
      };
      const handleError = (e) => console.error('Cap widget error:', e);

      // Listen for various possible event names to be safe
      node.addEventListener('cap:success', handleSuccess);
      node.addEventListener('success', handleSuccess);
      node.addEventListener('solve', handleSuccess);
      node.addEventListener('token', handleSuccess);

      node.addEventListener('cap:error', handleError);
      node.addEventListener('error', handleError);
    }
  }, []);

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
      try {
        setIsCheckingInvite(true);
        const response = await fetch(`${API_BASE}/api/rooms/${roomCode}/validate-invite`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: inviteToken }),
        });

        const data = await response.json();

        if (response.ok && data.valid) {
          setInviteValid(true);
        } else {
          setInviteValid(false);
          setFromInvite(false); // Treat as normal join if invite invalid
        }
      } catch (error) {
        console.error('Error validating invite token:', error);
        setInviteValid(false);
        setFromInvite(false);
      }
    };

    checkRoomAndInvite();

    return () => {
      isMounted = false;
    };
  }, [roomCode, inviteToken, onCancel, API_BASE]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!isCapVerified && !capToken) {
      // If we have an invite token, maybe we skip captcha? 
      // But for now let's enforce it unless logic says otherwise.
      // Assuming invite token bypasses password but maybe not captcha?
      // Let's enforce captcha for all joins to be safe.
      return;
    }

    setIsJoining(true);

    // Prepare join data
    const joinData = {
      nickname: nickname.trim(),
      password: password.trim(),
      capToken: capToken
    };

    if (fromInvite && inviteValid) {
      joinData.inviteToken = inviteToken;
    }

    onJoin(joinData);
  };

  if (isWaitingForHost) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 flex flex-col items-center max-w-md w-full text-center">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
          <h3 className="text-xl font-bold mb-2 dark:text-white">Waiting for Host</h3>
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            The host has been notified of your arrival. Please wait for them to let you in.
          </p>
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel Request
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 flex flex-col items-center">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-2" />
          <p className="text-gray-600 dark:text-gray-300">Loading room info...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md relative">
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          disabled={isJoining || isProcessingInvite}
        >
          <X className="w-6 h-6" />
        </button>

        <div className="p-6">
          <h2 className="text-2xl font-bold mb-6 flex items-center dark:text-white">
            <MessageCircle className="w-6 h-6 mr-2 text-blue-600 dark:text-blue-400" />
            Join Room
          </h2>

          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Room Code</span>
              <span className="font-mono font-bold text-lg dark:text-white">{roomCode}</span>
            </div>
            {roomInfo && (
              <>
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-300 mb-1">
                  <Users className="w-4 h-4 mr-2" />
                  {roomInfo.activeUsers} / {roomInfo.maxUsers} Users
                </div>
                {roomInfo.expiresAt && (
                  <div className="flex items-center text-sm text-gray-600 dark:text-gray-300">
                    <Clock className="w-4 h-4 mr-2" />
                    Expires in {formatTimeRemaining(roomInfo.expiresAt)}
                  </div>
                )}
              </>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md flex items-start text-sm">
              <AlertCircle className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nickname
              </label>
              <input
                type="text"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="input-field w-full p-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                placeholder="Enter your nickname"
                maxLength={20}
                required
                disabled={isJoining || isProcessingInvite}
              />
            </div>

            {requiresPassword && !inviteValid && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Room Access Key
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text" /* text to avoid password manager prompts */
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    inputMode="none"
                    autoComplete="off"
                    spellCheck={false}
                    data-ms-formignored="true"
                    data-ms-editor="false"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-form-type="other"
                    name="room-access-key-join"
                    onCopy={(e) => e.preventDefault()}
                    onCut={(e) => e.preventDefault()}
                    onPaste={(e) => e.preventDefault()}
                    className="input-field input-no-echo w-full p-2 pl-9 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
                    placeholder="Enter room access key"
                    required
                    disabled={isJoining || isProcessingInvite}
                  />
                </div>
              </div>
            )}

            {fromInvite && inviteValid && (
              <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md flex items-center text-sm">
                <Check className="w-4 h-4 mr-2" />
                Valid invite link applied
              </div>
            )}

            {/* Cap Verification Widget */}
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-2">
                <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Verification
                </label>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                Complete this quick verification to prove you're human
              </p>
              <div className="flex justify-center">
                <cap-widget
                  ref={setCapWidgetRef}
                  data-cap-api-endpoint={`${API_BASE}/api/cap/`}
                  className="w-full"
                />
              </div>
              {isCapVerified && (
                <div className="mt-2 flex items-center justify-center text-green-600 dark:text-green-400 text-sm">
                  <Check className="w-4 h-4 mr-1" />
                  Verified
                </div>
              )}
            </div>

            <div className="flex flex-col space-y-3">
              <button
                type="submit"
                disabled={isJoining || isProcessingInvite || (!isCapVerified && !capToken)}
                className={`w-full py-2 px-4 rounded-lg font-medium text-white ${isJoining || isProcessingInvite || (!isCapVerified && !capToken) ? 'bg-blue-400 dark:bg-blue-500' : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700'
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
                className="w-full py-2 px-4 rounded-lg font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

// Missing X import was causing issues, added it to imports at top.
// Also added X to lucide-react import list.

export default JoinRoomModal;
