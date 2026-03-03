import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { validateInviteToken } from '../utils/api';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';

function InviteHandler() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Verifying invite link...');
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (!token) {
      setError('No invite token found in the URL.');
      setStatus('');
      return;
    }

    // Prevent double-fire in React StrictMode
    if (started.current && retryCount === 0) return;
    started.current = true;

    let cancelled = false;

    async function process() {
      setError(null);
      setStatus('Validating invite link...');

      try {
        console.log('[InviteHandler] Validating token:', token.substring(0, 8) + '...');
        const data = await validateInviteToken(token);
        if (cancelled) return;

        console.log('[InviteHandler] Success, room:', data.roomCode);
        navigate('/room/' + data.roomCode, {
          replace: true,
          state: {
            inviteToken: token,
            requiresPassword: !!data.requiresPassword,
          },
        });
      } catch (err) {
        if (cancelled) return;
        console.error('[InviteHandler] Failed:', err);
        const message = typeof err === 'string' ? err : (err?.message || 'Something went wrong');
        setError(message);
        setStatus('');
      }
    }

    process();
    return function cleanup() { cancelled = true; };
  }, [token, navigate, retryCount]);

  function handleRetry() {
    setRetryCount(function (c) { return c + 1; });
  }

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-3xl font-bold text-white">E</span>
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-4 text-white">
          {error ? 'Invite Link Error' : 'Joining Chat...'}
        </h2>

        {error ? (
          <div className="space-y-4">
            <div className="bg-red-400/10 border border-red-400/20 rounded-xl p-4 text-left">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleRetry}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
              <button
                onClick={function () { navigate('/', { replace: true }); }}
                className="w-full px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-colors"
              >
                Go Home
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-2">
              Invite links expire after 25 minutes. Ask the room creator to generate a new one.
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
            <p className="text-slate-300 font-medium">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default InviteHandler;
