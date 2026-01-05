import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Loader2 } from 'lucide-react';

/**
 * Component to handle invite link processing
 * This component is mounted when a user visits an invite URL
 */
function InviteHandler() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Verifying invite link...');
  const [error, setError] = useState(null);

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
        
        if (response.data?.success && response.data.roomCode) {
          // Automatically redirect to the room page
          // The JoinRoomModal there will handle nickname and captcha
          navigate(`/room/${response.data.roomCode}`, {
            state: {
              inviteToken: token,
              requiresPassword: response.data.requiresPassword
            }
          });
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
  }, [token, navigate]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full text-center">
        <h2 className="text-xl font-bold mb-4 dark:text-white">Joining Room</h2>
        
        {error ? (
          <div className="text-red-600 dark:text-red-400 mb-4">
            <p>{error}</p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Go Home
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-700 dark:text-gray-300">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
            <p>{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default InviteHandler;
