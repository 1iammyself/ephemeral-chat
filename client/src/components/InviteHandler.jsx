import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

/**
 * Component to handle invite link processing
 * This component is mounted when a user visits an invite URL
 */
function InviteHandler() {
  const { token } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [status, setStatus] = useState('Verifying invite link...');
  const [error, setError] = useState(null);
  const [roomCode, setRoomCode] = useState(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [isPermanent, setIsPermanent] = useState(false);
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // Process the invite token when component mounts
  useEffect(() => {
    if (!token) {
      setError('No invite token provided');
      return;
    }

    const processInvite = async () => {
      try {
        setStatus('Validating invite token...');
        
        // Exchange the token for room credentials
        const response = await axios.get(`/api/invite/${token}`);
        console.log('Invite validation response:', response.data);
        
        if (response.data?.success && response.data.roomCode) {
          setRoomCode(response.data.roomCode);
          setRequiresPassword(response.data.requiresPassword || false);
          setIsPermanent(response.data.isPermanent || false);
          setStatus('');
          
          // Auto-focus the nickname input when the form is ready
          document.getElementById('nickname')?.focus();
        } else {
          throw new Error(response.data?.error || 'Invalid response from server');
        }
      } catch (err) {
        console.error('Error processing invite:', err);
        const errorMessage = err.response?.data?.error || 'Invalid or expired invite link';
        setError(errorMessage);
        setStatus('');
      }
    };

    processInvite();
    
    // Clean up function to cancel any pending requests
    return () => {
      // Any cleanup if needed
    };
  }, [token]);

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    
    // Validate nickname
    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      setError('Please enter a nickname');
      document.getElementById('nickname')?.focus();
      return;
    }
    
    // Validate password if required
    if (requiresPassword && !password.trim()) {
      setError('This room requires a password');
      document.getElementById('password')?.focus();
      return;
    }
    
    setIsJoining(true);
    setError(null);
    
    try {
      // First, validate the invite token to check if it points to a different room
      const response = await axios.get(`/api/invite/${token}`);
      
      if (response.data?.success && response.data.roomCode) {
        const targetRoomCode = response.data.roomCode;
        const isPermanent = response.data.isPermanent || false;
        const requiresPassword = response.data.requiresPassword || false;
        
        // If the token points to a different room than the current one, redirect
        if (targetRoomCode !== roomCode) {
          console.log(`Redirecting to room ${targetRoomCode} based on token`);
          navigate(`/room/${targetRoomCode}`, {
            state: {
              fromInvite: true,
              nickname: trimmedNickname,
              password: requiresPassword ? password.trim() : undefined,
              inviteToken: token
            }
          });
          return;
        }
      }
      
      // If we're still here, proceed with the current room
      navigate(`/room/${roomCode}`, {
        state: {
          fromInvite: true,
          nickname: trimmedNickname,
          password: requiresPassword ? password.trim() : undefined,
          inviteToken: token
        }
      });
    } catch (err) {
      console.error('Error processing invite:', err);
      const errorMessage = err.response?.data?.error || 'Failed to process invite. Please try again.';
      setError(errorMessage);
      setIsJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4 dark:text-white">Join Chat Room</h2>
        
        {error ? (
          <div className="text-red-600 dark:text-red-400 mb-4">{error}</div>
        ) : status ? (
          <div className="mb-4 text-gray-700 dark:text-gray-300">{status}</div>
        ) : (
          <form onSubmit={handleJoinRoom} className="space-y-4">
            <div>
              <label htmlFor="nickname" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Your Nickname
              </label>
              <input
                type="text"
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                placeholder="Enter your nickname"
                autoFocus
                required
              />
            </div>
            
            {requiresPassword && (
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Room Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  placeholder="Enter room password"
                />
              </div>
            )}
            
            <div className="flex space-x-2">
              <button
                type="submit"
                disabled={isJoining}
                className={`flex-1 bg-blue-500 dark:bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors ${isJoining ? 'opacity-50' : ''}`}
              >
                {isJoining ? 'Joining...' : 'Join Room'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                className="px-4 py-2 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 dark:border-gray-600 dark:text-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default InviteHandler;
