import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { validateInviteToken } from '../utils/api';
import { Loader2, AlertCircle, RefreshCw, Smartphone, Monitor } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

/**
 * InviteHandler — validates invite tokens and navigates to the room.
 *
 * Deep-link strategy:
 *  • Inside Capacitor app  → already inside native app, just navigate normally.
 *  • Inside Electron app   → window.electronAPI.isElectron is set by preload.js, navigate normally.
 *  • Regular browser       → click a hidden <a> with the ephemeral:// scheme so the OS can
 *                            intercept it without navigating away from this page. Show a manual
 *                            "Open App" button after 2.5s if nothing happened.
 */
function InviteHandler() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('Verifying invite link...');
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [isNative, setIsNative] = useState(false);
  // Show the manual-open banner only after giving the OS 2.5s to handle the scheme
  const [showOpenBanner, setShowOpenBanner] = useState(false);
  const hasTriedScheme = useRef(false);
  const started = useRef(false);

  // Detect native context on mount
  useEffect(() => {
    const inCapacitor = Capacitor.getPlatform() !== 'web';
    const inElectron = typeof window !== 'undefined' && !!window.electronAPI?.isElectron;
    setIsNative(inCapacitor || inElectron);

    // Only attempt deep link in plain browser context
    if (!inCapacitor && !inElectron) {
      tryNativeAppRedirect();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Click a hidden <a href="ephemeral://..."> element.
   * This lets the OS intercept the custom scheme and launch the installed app
   * WITHOUT navigating away from this page (unlike window.location.href).
   * After 2.5s, if we're still here, show the manual prompt.
   */
  function tryNativeAppRedirect() {
    if (hasTriedScheme.current) return;
    hasTriedScheme.current = true;

    const deepLinkUrl = `ephemeral://invite/${token}`;
    try {
      const a = document.createElement('a');
      a.href = deepLinkUrl;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 500);
    } catch (_) { /* ignored */ }

    // Give the OS 2.5 seconds to handle it; if still here, show the manual banner
    setTimeout(() => setShowOpenBanner(true), 2500);
  }

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
        const data = await validateInviteToken(token);
        if (cancelled) return;

        navigate('/room/' + data.roomCode, {
          replace: true,
          state: {
            inviteToken: token,
            requiresPassword: !!data.requiresPassword,
          },
        });
      } catch (err) {
        if (cancelled) return;
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
      <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl space-y-5">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-3xl font-bold text-white">E</span>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-white">
          {error ? 'Invite Link Error' : 'Joining Chat...'}
        </h2>

        {/* Native-app redirect notice — shown after 2.5s if OS didn't handle the scheme */}
        {!isNative && !error && showOpenBanner && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-left space-y-2">
            <div className="flex items-center gap-2 text-blue-300 font-semibold text-sm">
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>Open in Ephemeral Chat app?</span>
            </div>
            <p className="text-xs text-slate-400">
              If you have the app installed, tap <strong className="text-white">Open App</strong> to join directly, or continue in this browser.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { hasTriedScheme.current = false; tryNativeAppRedirect(); }}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Smartphone className="w-3.5 h-3.5" />
                Open App
              </button>
              <button
                onClick={() => setShowOpenBanner(false)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-medium rounded-lg transition-colors"
              >
                <Monitor className="w-3.5 h-3.5" />
                Use Browser
              </button>
            </div>
          </div>
        )}

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

            <p className="text-xs text-slate-500">
              Invite links expire after 25 minutes. Ask the room creator for a new one.
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
