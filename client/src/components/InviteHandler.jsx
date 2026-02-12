import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { validateInviteToken } from '../utils/api';
import { Loader2 } from 'lucide-react';

/**
 * Component to handle invite link processing
 * This component is mounted when a user visits an invite URL
 */
function InviteHandler() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Verifying...');
  const [error, setError] = useState(null);
  const [isApp, setIsApp] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroidDevice = /android/i.test(userAgent);
    setIsAndroid(isAndroidDevice);

    const checkEnvironment = () => {
      // 1. Desktop/Electron
      const isDesktopApp = !!(window.electronAPI ||
        window.process?.versions?.electron ||
        document.body.classList.contains('electron-app') ||
        window.location.search.includes('desktop=true'));

      // 2. Android Native Environment
      const isAndroidApp = !!(window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true ||
        document.referrer.includes('android-app://') ||
        window.Capacitor?.isNative ||
        userAgent.includes('version/4.0'));

      const currentIsApp = isDesktopApp || isAndroidApp;

      if (currentIsApp) {
        setIsApp(true);
        return true;
      }
      return false;
    };

    // Initial check
    const confirmed = checkEnvironment();

    // If not confirmed, poll if it's Android (bridge might take time)
    if (!confirmed && isAndroidDevice) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (checkEnvironment() || attempts > 20) {
          clearInterval(interval);
        }
      }, 100);
      return () => clearInterval(interval);
    } else if (!confirmed) {
      // For desktop browsers, attempt launch logic
      setStatus('Launching Ephemeral Chat Desktop...');
      const protocolUrl = `ephemeral-chat://invite/${token}`;

      if (!window.electronAPI) {
        window.location.href = protocolUrl;
        setTimeout(() => setShowDownload(true), 3000);
      }
    }
  }, [token]);

  // Process the invite token when component mounts or environment is confirmed
  useEffect(() => {
    if (!token) {
      setError('No invite token provided');
      return;
    }

    if (!isApp) return; // Stop here if in browser

    const processInvite = async () => {
      try {
        setStatus('Validating invite token...');
        const data = await validateInviteToken(token);

        if (data.roomCode) {
          navigate(`/room/${data.roomCode}`, {
            state: {
              inviteToken: token,
              requiresPassword: data.requiresPassword
            }
          });
        } else {
          throw new Error('Invalid response from server');
        }
      } catch (err) {
        console.error('Error processing invite:', err);
        setError(typeof err === 'string' ? err : 'Invalid or expired invite link');
        setStatus('');
      }
    };

    processInvite();
  }, [token, navigate, isApp]);

  const getDownloadUrl = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    const repoBase = 'https://github.com/1iammyself/ephemeral-chat/releases/download/v1.1.2';

    // Using hyphenated filenames seen in the GitHub release image
    if (userAgent.indexOf('win') !== -1) {
      return `${repoBase}/Ephemeral-Chat-1.1.2-win.exe`;
    }
    if (userAgent.indexOf('mac') !== -1) {
      return `${repoBase}/Ephemeral-Chat-1.1.2-mac-arm64.dmg`;
    }
    if (userAgent.indexOf('linux') !== -1) {
      return `${repoBase}/Ephemeral-Chat-1.1.2-linux-x86_64.AppImage`;
    }
    return 'https://github.com/1iammyself/ephemeral-chat/releases/tag/v1.1.2';
  };

  return (
    <div className="fixed inset-0 bg-slate-900 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-3xl font-bold text-white">E</span>
          </div>
        </div>

        <h2 className="text-2xl font-bold mb-2 text-white">
          {isApp ? 'Joining Chat...' : 'Redirecting to App'}
        </h2>

        {!isApp && (
          <p className="text-slate-400 mb-6">
            For your security, chat rooms can only be accessed via the official Ephemeral Chat {isAndroid ? 'Android' : 'Desktop'} application.
          </p>
        )}

        {error ? (
          <div className="text-red-400 mb-4 bg-red-400/10 p-4 rounded-xl border border-red-400/20">
            <p>{error}</p>
            <button
              onClick={() => {
                setError(null);
                navigate('/', { replace: true });
              }}
              className="mt-4 px-6 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
            >
              Go Home
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center">
            {isApp ? (
              <>
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                <p className="text-slate-300 font-medium">{status}</p>
              </>
            ) : (
              <div className="w-full space-y-4">
                <div className="flex items-center justify-center space-x-2 text-blue-400 mb-6">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>{status}</span>
                </div>

                {showDownload && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <p className="text-sm text-slate-500">App not opening? It might not be installed.</p>
                    <a
                      href={getDownloadUrl()}
                      className="block w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                      Download App & Join
                    </a>
                    <button
                      onClick={() => window.location.reload()}
                      className="text-slate-400 hover:text-white text-sm underline underline-offset-4"
                    >
                      Try Launching Again
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default InviteHandler;
