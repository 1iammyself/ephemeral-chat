import React from 'react';
import { Shield, CheckCircle2, XCircle } from 'lucide-react';

/**
 * PairingCodeModal — 6-digit verification code display
 * 
 * Shows a visual pairing code that both devices must confirm match.
 * This prevents man-in-the-middle attacks on the P2P connection.
 * The code is derived from: SHA-256(local_cert_fingerprint + remote_cert_fingerprint)[:6]
 */
const PairingCodeModal = ({ code, peerName, onConfirm, onReject }) => {
  // Split code into individual digits for display
  const digits = (code || '------').split('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 border border-gray-300 dark:border-gray-700">
        {/* Header */}
        <div className="bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold">Verify Connection</h3>
              <p className="text-white/80 text-xs">
                Confirm this code matches on both devices
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 text-center">
          {/* Pairing Code Display */}
          <div className="flex justify-center gap-2 my-6">
            {digits.map((digit, i) => (
              <React.Fragment key={i}>
                <div className="w-12 h-14 rounded-xl bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 flex items-center justify-center">
                  <span className="text-2xl font-mono font-bold text-gray-900 dark:text-white">
                    {digit}
                  </span>
                </div>
                {/* Add gap between digit groups (3-3) */}
                {i === 2 && <div className="w-2" />}
              </React.Fragment>
            ))}
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
            Connecting to <span className="font-semibold">{peerName || 'peer'}</span>
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Ask the other person to confirm this code matches on their screen.
            If it doesn't match, tap Reject — someone may be intercepting the connection.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onReject}
            className="flex-1 py-3 rounded-xl font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors border border-red-200 dark:border-red-800 flex items-center justify-center gap-2"
          >
            <XCircle className="w-4 h-4" />
            Reject
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 rounded-xl font-semibold text-white bg-green-500 hover:bg-green-600 transition-colors shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Codes Match
          </button>
        </div>
      </div>
    </div>
  );
};

export default PairingCodeModal;
