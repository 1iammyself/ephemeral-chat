import { useState, useEffect, useCallback } from 'react';
import { X, MessageCircle, Lock, ChevronRight, AlertCircle, Send, Shield } from 'lucide-react';
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

function initials(name) {
  return (name || '?').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  'bg-violet-600', 'bg-indigo-600', 'bg-blue-600',
  'bg-teal-600',   'bg-emerald-600', 'bg-rose-600',
  'bg-amber-600',  'bg-pink-600',
];
function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function WhisperModal({ isOpen, onClose, users, currentUser, roomCode, isAnonymous = false, embedded = false, whisperMaxHops, onWhisperMaxHopsChange }) {
  const [tab, setTab] = useState('inbox');

  const [recipient,       setRecipient]       = useState('');
  const [message,         setMessage]         = useState('');
  const [maxHopsInternal, setMaxHopsInternal] = useState(3);
  const maxHops = whisperMaxHops !== undefined ? whisperMaxHops : maxHopsInternal;
  const setMaxHops = (v) => { setMaxHopsInternal(v); onWhisperMaxHopsChange?.(v); };
  const [isSending,       setIsSending]       = useState(false);
  const [sendError,       setSendError]       = useState('');
  const [sendOk,          setSendOk]          = useState(false);

  const [inbox,           setInbox]           = useState([]);
  const [selected,        setSelected]        = useState(null);
  const [isForwarding,    setIsForwarding]    = useState(false);
  const [forwardRecipient,setForwardRecipient]= useState('');
  const [forwardError,    setForwardError]    = useState('');
  const [peerKeys,        setPeerKeys]        = useState({});

  useEffect(() => {
    if ((!isOpen && !embedded) || !roomCode) return;
    const handleRoster = ({ bundles }) => {
      const map = {};
      for (const { socketId, bundle, nickname } of (bundles || [])) {
        if (nickname && bundle?.ik) map[nickname] = { ik: bundle.ik, isNative: bundle.isNative ?? true, socketId };
      }
      setPeerKeys(map);
    };
    socketManager.on('key-bundle-roster', handleRoster);
    socketManager.emit('request-key-bundles', { roomCode });
    return () => socketManager.off('key-bundle-roster', handleRoster);
  }, [isOpen, embedded, roomCode]);

  useEffect(() => {
    const handleWhisper = async ({ from, ephPubKey, ciphertext, iv, isNative, fromNickname }) => {
      try {
        const myBundle = getKeyBundle(roomCode);
        if (!myBundle) return;
        const decrypted = await decryptWhisper(ephPubKey, ciphertext, iv, myBundle.identityKey.privateKey, isNative ?? true);
        setInbox(prev => [{ id: decrypted.chainId + '-' + decrypted.hop, decrypted, from: fromNickname || 'Anonymous', raw: { from, ephPubKey, ciphertext, iv, isNative, fromNickname } }, ...prev]);
        setTab('inbox');
      } catch { /* wrong key or tampered */ }
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
    setIsSending(true); setSendError('');
    try {
      const chainId = newChainId();
      const { ephPubKey, ciphertext, iv, isNative } = await encryptWhisper(message.trim(), peer.ik, peer.isNative, chainId, 1, maxHops);
      socketManager.emit('whisper-send', { to: peer.socketId, ephPubKey, ciphertext, iv, isNative, ...(isAnonymous ? {} : { fromNickname: currentUser?.nickname }) });
      setSendOk(true); setMessage('');
      setTimeout(() => setSendOk(false), 3000);
    } catch (e) { setSendError('Encryption failed: ' + e.message); }
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
    setIsForwarding(true); setForwardError('');
    try {
      const { ephPubKey, ciphertext, iv, isNative } = await encryptWhisper(content, peer.ik, peer.isNative, chainId, hop + 1, mh);
      socketManager.emit('whisper-send', { to: peer.socketId, ephPubKey, ciphertext, iv, isNative, ...(isAnonymous ? {} : { fromNickname: currentUser?.nickname }) });
      setSelected(null); setForwardRecipient('');
    } catch (e) { setForwardError('Forward failed: ' + e.message); }
    setIsForwarding(false);
  }, [selected, forwardRecipient, peerKeys, roomCode, currentUser, isAnonymous]);

  const otherUsers = users.filter(u => u.nickname !== currentUser?.nickname);
  const unread = inbox.filter(w => !w.read).length;

  if (!isOpen && !embedded) return null;

  /* ─── embedded: inbox-only dark layout ──────────────────────────────── */
  if (embedded) return (
    <div className="w-full h-full flex flex-col overflow-hidden">

      {/* Hop setting — persistent at top */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex-shrink-0 bg-white/[0.02]">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <Shield className="w-3 h-3 text-violet-400" />
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Whisper hops: <span className="text-violet-400 normal-case font-bold">{maxHops}</span>
            </p>
          </div>
          <span className="text-[10px] text-gray-600">
            {otherUsers.length <= 1
              ? 'Direct only — no one to forward to'
              : `forwardable ${maxHops - 1} time${maxHops - 1 !== 1 ? 's' : ''}`}
          </span>
        </div>
        <input
          type="range" min={1} max={5} step={1} value={maxHops}
          onChange={e => setMaxHops(Number(e.target.value))}
          className="w-full accent-violet-500 h-1"
        />
        <p className="mt-1.5 text-[10px] text-gray-600 leading-snug">
          {otherUsers.length <= 1
            ? 'Only 2 people in this room — whispers go directly, hops have no effect.'
            : 'Controls how many times your whisper can be forwarded by the recipient.'}
        </p>
      </div>

      {/* Inbox */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {selected ? (
              /* Message detail */
              <div className="flex flex-col h-full">
                <div className="px-4 pt-3 pb-2 border-b border-white/[0.07] flex-shrink-0">
                  <button onClick={() => setSelected(null)} className="text-xs text-violet-400 font-bold flex items-center gap-1 hover:text-violet-300">
                    ← Back
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  {/* Sender avatar + metadata */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${avatarColor(selected.from)}`}>
                      {initials(selected.from)}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-white">{selected.from}</p>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        <span>Hop {selected.decrypted.hop}/{selected.decrypted.maxHops}</span>
                        {selected.decrypted.ts && <><span>·</span><span>{formatWhisperTime(selected.decrypted.ts)}</span></>}
                        <span>·</span>
                        <span className="text-violet-500 flex items-center gap-0.5"><Lock className="w-2.5 h-2.5" /> E2EE</span>
                      </div>
                    </div>
                  </div>

                  {/* Message bubble */}
                  <div className="rounded-2xl rounded-tl-sm bg-violet-900/30 border border-violet-500/20 px-4 py-3">
                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{selected.decrypted.content}</p>
                  </div>

                  {/* Forward section */}
                  {selected.decrypted.hop < selected.decrypted.maxHops ? (
                    <div className="mt-4 space-y-2">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Forward to</p>
                      <div className="flex flex-wrap gap-2">
                        {otherUsers.filter(u => u.nickname !== selected.from).map(u => (
                          <button
                            key={u.nickname}
                            onClick={() => { setForwardRecipient(u.nickname); setForwardError(''); }}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                              forwardRecipient === u.nickname
                                ? 'bg-violet-600 text-white ring-2 ring-violet-400/40'
                                : 'bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10'
                            }`}
                          >
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${avatarColor(u.nickname)}`}>
                              {initials(u.nickname)}
                            </span>
                            {u.nickname}
                          </button>
                        ))}
                      </div>
                      {forwardError && <p className="text-xs text-red-400">{forwardError}</p>}
                      <button
                        onClick={handleForward}
                        disabled={isForwarding || !forwardRecipient}
                        className="w-full py-2.5 rounded-xl bg-violet-600/80 text-white text-sm font-bold disabled:opacity-30 hover:bg-violet-600 transition-colors flex items-center justify-center gap-2 active:scale-95"
                      >
                        <ChevronRight className="w-4 h-4" />
                        {isForwarding ? 'Forwarding…' : 'Forward Whisper'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-center text-gray-600 mt-4">Chain complete — no more forwards</p>
                  )}
                </div>
              </div>
            ) : inbox.length === 0 ? (
              /* Empty state */
              <div className="h-full flex flex-col items-center justify-center gap-3 opacity-40 px-4">
                <MessageCircle className="w-10 h-10 text-gray-500" />
                <p className="text-sm text-gray-400 text-center">No whispers yet.<br />Your inbox is empty.</p>
              </div>
            ) : (
              /* Message list */
              <div className="divide-y divide-white/[0.05]">
                {inbox.map(w => (
                  <button
                    key={w.id}
                    onClick={() => setSelected(w)}
                    className="w-full text-left px-4 py-3 hover:bg-white/[0.04] transition-colors flex items-center gap-3"
                  >
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${avatarColor(w.from)}`}>
                      {initials(w.from)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-semibold text-white truncate">{w.from}</span>
                        <span className="text-[10px] text-gray-600 ml-2 flex-shrink-0">{formatWhisperTime(w.decrypted.ts)}</span>
                      </div>
                      <p className="text-xs text-gray-500 truncate">{w.decrypted.content}</p>
                    </div>
                    <div className="flex-shrink-0 text-[10px] text-gray-700 font-mono">{w.decrypted.hop}/{w.decrypted.maxHops}</div>
                  </button>
                ))}
              </div>
            )}
      </div>
    </div>
  );

  /* ─── non-embedded: original modal layout ────────────────────────────── */
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
          <button onClick={() => setTab('send')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'send' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>Send Whisper</button>
          <button onClick={() => { setTab('inbox'); setInbox(p => p.map(w => ({ ...w, read: true }))); }} className={`relative flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === 'inbox' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}>
            Inbox
            {unread > 0 && <span className="absolute top-1 right-2 w-4 h-4 rounded-full bg-violet-500 text-white text-[9px] font-bold flex items-center justify-center">{unread}</span>}
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {tab === 'send' ? (
            <>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Recipient</label>
                <select value={recipient} onChange={e => { setRecipient(e.target.value); setSendError(''); setSendOk(false); }} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-400/40">
                  <option value="">Select someone…</option>
                  {otherUsers.map(u => <option key={u.nickname} value={u.nickname}>{u.nickname}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Message</label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Your secret message…" rows={3} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-400/40 resize-none" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Max hops: <span className="text-violet-500">{maxHops}</span></label>
                <input type="range" min={1} max={5} step={1} value={maxHops} onChange={e => setMaxHops(Number(e.target.value))} className="w-full accent-violet-500" />
              </div>
              {sendError && <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl"><AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" /><p className="text-xs text-red-600 dark:text-red-400">{sendError}</p></div>}
              {sendOk && <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-400 font-medium text-center">Whisper sent</div>}
              <button onClick={handleSend} disabled={isSending || !recipient || !message.trim()} className="w-full py-3 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-violet-700 transition-colors active:scale-95">{isSending ? 'Encrypting…' : 'Send Whisper'}</button>
            </>
          ) : (
            <>
              {inbox.length === 0 ? (
                <div className="py-8 flex flex-col items-center gap-2 opacity-40"><MessageCircle className="w-8 h-8 text-gray-400" /><p className="text-xs text-gray-400">No whispers yet</p></div>
              ) : selected ? (
                <div className="space-y-3">
                  <button onClick={() => setSelected(null)} className="text-xs text-violet-500 font-bold">← Back</button>
                  <div className="bg-violet-50 dark:bg-violet-900/20 rounded-2xl p-4 space-y-2">
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 flex-wrap">
                      <span className="font-bold text-gray-600 dark:text-gray-300">{selected.from}</span>
                      <span>·</span><span>Hop {selected.decrypted.hop}/{selected.decrypted.maxHops}</span>
                      {selected.decrypted.ts && <><span>·</span><span>{formatWhisperTime(selected.decrypted.ts)}</span></>}
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{selected.decrypted.content}</p>
                  </div>
                  {selected.decrypted.hop < selected.decrypted.maxHops && (
                    <div className="space-y-2">
                      <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Forward to</label>
                      <select value={forwardRecipient} onChange={e => { setForwardRecipient(e.target.value); setForwardError(''); }} className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 px-3 py-2.5 outline-none focus:ring-2 focus:ring-violet-400/40">
                        <option value="">Select someone…</option>
                        {otherUsers.filter(u => u.nickname !== selected.from).map(u => <option key={u.nickname} value={u.nickname}>{u.nickname}</option>)}
                      </select>
                      {forwardError && <p className="text-xs text-red-500">{forwardError}</p>}
                      <button onClick={handleForward} disabled={isForwarding || !forwardRecipient} className="w-full py-2.5 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-violet-700 transition-colors flex items-center justify-center gap-2">
                        <ChevronRight className="w-4 h-4" />{isForwarding ? 'Forwarding…' : 'Forward Whisper'}
                      </button>
                    </div>
                  )}
                  {selected.decrypted.hop >= selected.decrypted.maxHops && <p className="text-[10px] text-center text-gray-400">Chain complete — no more forwards.</p>}
                </div>
              ) : (
                <div className="space-y-2">
                  {inbox.map(w => (
                    <button key={w.id} onClick={() => setSelected(w)} className="w-full text-left rounded-xl border border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/40 hover:border-violet-200 dark:hover:border-violet-800 px-3 py-2.5 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{w.from}</span>
                        <div className="flex items-center gap-1.5">
                          {w.decrypted.ts && <span className="text-[10px] text-gray-400">{formatWhisperTime(w.decrypted.ts)}</span>}
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
