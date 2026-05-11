import { useState, useEffect, useCallback } from 'react';
import { X, MessageCircle, Lock, ChevronRight, AlertCircle } from 'lucide-react';
import socketManager from '../socket';
import { encryptWhisper, decryptWhisper, newChainId } from '../crypto/whisper-chain';
import { getKeyBundle } from '../crypto/key-store';
import { serializeKeyBundle } from '../crypto/pqxdh';
import { publicKeyToBase64 } from '../crypto/x25519';

/**
 * WhisperModal — send or receive encrypted one-to-one "whispers".
 *
 * Props:
 *   isOpen        — controls visibility
 *   onClose       — close callback
 *   users         — Array<{ nickname, socketId }> — room participants
 *   currentUser   — { nickname, socketId }
 *   roomCode      — string
 *   isAnonymous   — boolean — when true, omit fromNickname so sender appears as Anonymous
 */
function formatWhisperTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function WhisperModal({ isOpen, onClose, users, currentUser, roomCode, isAnonymous = false }) {
  const [tab, setTab] = useState('send');

  // Send tab state
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [maxHops, setMaxHops] = useState(3);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendOk, setSendOk] = useState(false);

  // Inbox tab state
  const [inbox, setInbox] = useState([]); // Array<{ id, decrypted, from, hop, maxHops, ts, raw }>
  const [selected, setSelected] = useState(null);
  const [isForwarding, setIsForwarding] = useState(false);
  const [forwardRecipient, setForwardRecipient] = useState('');
  const [forwardError, setForwardError] = useState('');

  // Peer key registry: nickname → { ik, isNative, socketId }
  const [peerKeys, setPeerKeys] = useState({});

  // Collect peer keys from key-bundle-roster whenever the modal opens
  useEffect(() => {
    if (!isOpen || !roomCode) return;

    const handleRoster = ({ bundles }) => {
      const map = {};
      for (const { socketId, bundle, nickname } of bundles) {
        if (nickname && bundle?.ik) {
          map[nickname] = { ik: bundle.ik, isNative: bundle.isNative ?? true, socketId };
        }
      }
      setPeerKeys(map);
    };

    socketManager.on('key-bundle-roster', handleRoster);
    socketManager.emit('request-key-bundles', { roomCode });

    return () => socketManager.off('key-bundle-roster', handleRoster);
  }, [isOpen, roomCode]);

  // Listen for incoming whispers
  useEffect(() => {
    const handleWhisper = async ({ from, ephPubKey, ciphertext, iv, isNative, fromNickname }) => {
      try {
        const myBundle = getKeyBundle(roomCode);
        if (!myBundle) return;
        const decrypted = await decryptWhisper(
          ephPubKey, ciphertext, iv,
          myBundle.identityKey.privateKey,
          isNative ?? true
        );
        const entry = {
          id: decrypted.chainId + '-' + decrypted.hop,
          decrypted,
          from: fromNickname || 'Anonymous',
          raw: { from, ephPubKey, ciphertext, iv, isNative, fromNickname },
        };
        setInbox(prev => [entry, ...prev]);
        setTab('inbox');
      } catch {
        // wrong key or tampered — silently ignore
      }
    };

    socketManager.on('whisper-incoming', handleWhisper);
    return () => socketManager.off('whisper-incoming', handleWhisper);
  }, [roomCode]);

  const handleSend = useCallback(async () => {
    if (!recipient || !message.trim()) return;
    const peer = peerKeys[recipient];
    if (!peer) { setSendError('Could not find recipient key. They may not have E2EE ready.'); return; }

    const myBundle = getKeyBundle(roomCode);
    if (!myBundle) { setSendError('Your encryption keys are not ready yet.'); return; }

    setIsSending(true);
    setSendError('');
    try {
      const chainId = newChainId();
      const { ephPubKey, ciphertext, iv, isNative } = await encryptWhisper(
        message.trim(), peer.ik, peer.isNative, chainId, 1, maxHops
      );
      socketManager.emit('whisper-send', {
        to: peer.socketId,
        ephPubKey, ciphertext, iv, isNative,
        ...(isAnonymous ? {} : { fromNickname: currentUser?.nickname }),
      });
      setSendOk(true);
      setMessage('');
      setTimeout(() => setSendOk(false), 3000);
    } catch (e) {
      setSendError('Encryption failed: ' + e.message);
    }
    setIsSending(false);
  }, [recipient, message, maxHops, peerKeys, roomCode, currentUser, isAnonymous]);

  const handleForward = useCallback(async () => {
    if (!selected || !forwardRecipient) return;
    const peer = peerKeys[forwardRecipient];
    if (!peer) { setForwardError('Could not find recipient key.'); return; }

    const myBundle = getKeyBundle(roomCode);
    if (!myBundle) { setForwardError('Encryption keys not ready.'); return; }

    const { chainId, hop, maxHops: mh, content } = selected.decrypted;
    if (hop >= mh) { setForwardError('This whisper has reached its maximum hops.'); return; }

    setIsForwarding(true);
    setForwardError('');
    try {
      const { ephPubKey, ciphertext, iv, isNative } = await encryptWhisper(
        content, peer.ik, peer.isNative, chainId, hop + 1, mh
      );
      socketManager.emit('whisper-send', {
        to: peer.socketId,
        ephPubKey, ciphertext, iv, isNative,
        ...(isAnonymous ? {} : { fromNickname: currentUser?.nickname }),
      });
      setSelected(null);
      setForwardRecipient('');
    } catch (e) {
      setForwardError('Forward failed: ' + e.message);
    }
    setIsForwarding(false);
  }, [selected, forwardRecipient, peerKeys, roomCode, currentUser, isAnonymous]);

  const otherUsers = users.filter(u => u.nickname !== currentUser?.nickname);
  const unread = inbox.filter(w => !w.read).length;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full sm:w-[440px] bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-0">
          <div className="p-2 rounded-xl bg-violet-100 dark:bg-violet-900/40">
            <Lock className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-black text-gray-900 dark:text-white">Whisper Chain</h2>
            <p className="text-[10px] text-gray-400">E2EE direct messages that self-forward</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mx-5 mt-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => setTab('send')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'send' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            Send Whisper
          </button>
          <button
            onClick={() => { setTab('inbox'); setInbox(p => p.map(w => ({ ...w, read: true }))); }}
            className={`relative flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'inbox' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
          >
            Inbox
            {unread > 0 && (
              <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center">{unread}</span>
            )}
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {tab === 'send' ? (
            <>
              {/* Recipient */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Recipient</label>
                <select
                  value={recipient}
                  onChange={e => { setRecipient(e.target.value); setSendError(''); setSendOk(false); }}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-400/40"
                >
                  <option value="">Select someone…</option>
                  {otherUsers.map(u => (
                    <option key={u.nickname} value={u.nickname}>{u.nickname}</option>
                  ))}
                </select>
              </div>

              {/* Message */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Message</label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Your secret message…"
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-400/40 resize-none"
                />
              </div>

              {/* Max hops */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                  Max hops: <span className="text-violet-500">{maxHops}</span>
                </label>
                <input
                  type="range" min={1} max={5} step={1}
                  value={maxHops}
                  onChange={e => setMaxHops(Number(e.target.value))}
                  className="w-full accent-violet-500"
                />
                <p className="text-[10px] text-gray-400 mt-1">Recipient can forward it {maxHops - 1} more time{maxHops - 1 !== 1 ? 's' : ''}.</p>
              </div>

              {sendError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-xs text-red-600 dark:text-red-400">{sendError}</p>
                </div>
              )}

              {sendOk && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-400 font-medium text-center">
                  Whisper sent
                </div>
              )}

              <button
                onClick={handleSend}
                disabled={isSending || !recipient || !message.trim()}
                className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-violet-700 transition-colors active:scale-95"
              >
                {isSending ? 'Encrypting…' : 'Send Whisper'}
              </button>
            </>
          ) : (
            <>
              {inbox.length === 0 ? (
                <div className="py-8 flex flex-col items-center gap-2 opacity-40">
                  <MessageCircle className="w-8 h-8 text-gray-400" />
                  <p className="text-xs text-gray-400">No whispers yet</p>
                </div>
              ) : selected ? (
                /* Whisper detail + forward UI */
                <div className="space-y-3">
                  <button onClick={() => setSelected(null)} className="text-xs text-violet-500 font-bold flex items-center gap-1">
                    ← Back
                  </button>
                  <div className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
                      <span className="font-bold text-gray-600 dark:text-gray-300">{selected.from}</span>
                      <span>·</span>
                      <span>Hop {selected.decrypted.hop}/{selected.decrypted.maxHops}</span>
                      {selected.decrypted.ts && (
                        <>
                          <span>·</span>
                          <span>{formatWhisperTime(selected.decrypted.ts)}</span>
                        </>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{selected.decrypted.content}</p>
                  </div>

                  {selected.decrypted.hop < selected.decrypted.maxHops && (
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Forward to</label>
                      <select
                        value={forwardRecipient}
                        onChange={e => { setForwardRecipient(e.target.value); setForwardError(''); }}
                        className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-400/40"
                      >
                        <option value="">Select someone…</option>
                        {otherUsers.filter(u => u.nickname !== selected.from).map(u => (
                          <option key={u.nickname} value={u.nickname}>{u.nickname}</option>
                        ))}
                      </select>
                      {forwardError && <p className="text-xs text-red-500">{forwardError}</p>}
                      <button
                        onClick={handleForward}
                        disabled={isForwarding || !forwardRecipient}
                        className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-violet-700 transition-colors flex items-center justify-center gap-2"
                      >
                        <ChevronRight className="w-4 h-4" />
                        {isForwarding ? 'Forwarding…' : 'Forward Whisper'}
                      </button>
                    </div>
                  )}
                  {selected.decrypted.hop >= selected.decrypted.maxHops && (
                    <p className="text-[10px] text-center text-gray-400">Chain complete — no more forwards.</p>
                  )}
                </div>
              ) : (
                /* Inbox list */
                <div className="space-y-2">
                  {inbox.map(w => (
                    <button
                      key={w.id}
                      onClick={() => setSelected(w)}
                      className="w-full text-left rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 hover:border-violet-200 dark:hover:border-violet-800 px-3 py-2.5 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{w.from}</span>
                        <div className="flex items-center gap-1.5">
                          {w.decrypted.ts && (
                            <span className="text-[10px] text-gray-400">{formatWhisperTime(w.decrypted.ts)}</span>
                          )}
                          <span className="text-[10px] text-gray-400">Hop {w.decrypted.hop}/{w.decrypted.maxHops}</span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{w.decrypted.content}</p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="pb-safe-area-inset-bottom h-4" />
      </div>
    </div>
  );
}
