import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { validateInviteToken } from '../utils/api';
import { Loader2 } from 'lucide-react';

/**
 * Component to handle invite link processing
 * This component is mounted when a user visits an invite URL
 * It validates the token against the server and navigates to the room.
 */
function InviteHandler() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Verifying invite...');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) {
      setError('No invite token provided');
      return;
    }

    let cancelled = false;

    const processInvite = async () => {
      try {
        setStatus('Validating invite token...');
        const data = await validateInviteToken(token);

        if (cancelled) return;

        if (data.roomCode) {
          navigate(`/room/${data.roomCode}`, {
            replace: true,
            state: {
              inviteToken: token,
              requiresPassword: data.requiresPassword
            }
          });
        } else {
          throw new Error('Invalid response from server');
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error processing invite:', err);
        setError(typeof err === 'string' ? err : (err.message || 'Invalid or expired invite link'));
        setStatus('');
      }
    };

    processInvite();

    return () => { cancelled = true; };
  }, [token, navigate]);

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-3xl font-bold text-white">E</span>
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-2 text-white">
          Joining Chat...
        </h2>

        {error ? (
          <div className="text-red-400 mb-4 bg-red-400/10 p-4 rounded-xl border border-red-400/20">
            <p>{error}</p>
            <button
              onClick={() => navigate('/', { replace: true })}
              className="mt-4 px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
            >
              Go Home
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
            <p className="text-slate-300 font-medium">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default InviteHandler;
