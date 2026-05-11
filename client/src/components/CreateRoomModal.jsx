import React, { useState, useCallback, useEffect, useRef } from 'react';
import { hapticSuccess } from '../utils/platform';
import { X, Check, Copy, Users, Lock, Unlock, Timer, Zap, PartyPopper, Sun, Sunset, Settings, Clock, Shield, Share2, Hash, ToggleLeft, ToggleRight, Upload, Plus, Trash2, ClipboardList, MapPin, Locate, ChevronDown } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import ShareSheet from './ShareSheet';
import { sanitizeInput, generateRoomKey } from '../utils/security';
import { getCreatorId } from '../utils/creator';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { secureFetch } from '../utils/secure-fetch.js';
import { API_BASE } from '../utils/resolve-url.js';
import { IntegrityPlugin } from '../capacitor/security-plugins';
import { useGeofence } from '../hooks/useGeofence';

const CreateRoomModal = ({ onClose, onRoomCreated }) => {

  const { theme } = useTheme();
  const [roomSettings, setSettings] = useState({
    messageTTL: '30sec',
    password: '',
    maxUsers: 1,
    persistenceMode: 'ephemeral'
  });
  const [honeypot, setHoneypot] = useState({
    hp_email: '',
    hp_website: '',
    hp_timestamp: Date.now().toString()
  });
  const [isCreating, setIsCreating] = useState(false);
  const [createdRoom, setCreatedRoom] = useState(null);
  const [inviteLink, setInviteLink] = useState('');
  const [verbalCode, setVerbalCode] = useState('');
  const [isCopied, setIsCopied] = useState({
    roomCode: false,
    password: false,
    inviteLink: false,
    verbalCode: false
  });
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [showShareSheet, setShowShareSheet] = useState(false);
  const [formData, setFormData] = useState(null);
  const [roomKey, setRoomKey] = useState(null);
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [customCodeError, setCustomCodeError] = useState('');
  const [autoApproveEnabled, setAutoApproveEnabled] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [preApprovedText, setPreApprovedText] = useState('');
  const [preApprovedEntries, setPreApprovedEntries] = useState([]);
  const preApprovedFileRef = useRef(null);
  const [geofenceEnabled, setGeofenceEnabled] = useState(false);
  const [geofenceCenter, setGeofenceCenter] = useState(null);
  const [geofenceRadius, setGeofenceRadius] = useState(500);
  const { fetchPosition, loading: geoLoading, error: geoError } = useGeofence();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setHoneypot(prev => ({ ...prev, hp_timestamp: Date.now().toString() }));
  }, []);

  const ttlOptions = [
    { value: 'none',   label: 'Never',             short: 'Never', description: 'Messages stay until room expires' },
    { value: '30sec',  label: '30 Seconds (Default)', short: '30s', description: 'Messages disappear after 30 seconds' },
    { value: '1min',   label: '1 Minute',           short: '1m',   description: 'Messages disappear after 1 minute' },
    { value: '5min',   label: '5 Minutes',          short: '5m',   description: 'Messages disappear after 5 minutes' },
    { value: '30min',  label: '30 Minutes',         short: '30m',  description: 'Messages disappear after 30 minutes' },
    { value: '1hour',  label: '1 Hour',             short: '1h',   description: 'Messages disappear after 1 hour' }
  ];

  const generateInviteLink = async (roomCode, password) => {
    try {
      setIsGeneratingInvite(true);
      const response = await secureFetch(`${API_BASE}/api/rooms/${roomCode}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password || undefined }),
      });

      let data;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error('Server returned an invalid response');
      }

      if (response.ok && data.inviteLink) {
        setInviteLink(data.inviteLink);
        if (data.verbalCode) setVerbalCode(data.verbalCode);
        return data.inviteLink;
      } else {
        throw new Error(data.error || 'Failed to generate invite link');
      }
    } catch (error) {
      console.error('Error generating invite link:', error);
      alert('Failed to generate invite link. You can still share the room code and password.');
      return null;
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();

    if (useCustomCode) {
      const normalized = customCode.trim().toLowerCase().replace(/\s+/g, '-');
      if (!normalized || normalized.length < 3 || normalized.length > 30 || !/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(normalized)) {
        setCustomCodeError('Please enter a valid custom phrase (3-30 chars, letters, numbers, hyphens)');
        setShowAdvanced(true);
        return;
      }
    }

    if (geofenceEnabled && !geofenceCenter) return;

    setIsCreating(true);

    try {
      const key = generateRoomKey();
      setRoomKey(key);

      const creatorId = getCreatorId();

      const integrityHeaders = {};
      if (Capacitor.getPlatform() === 'android') {
        try {
          const nonceRes = await secureFetch(`${API_BASE}/api/integrity/nonce`);
          if (nonceRes.ok) {
            const { nonce } = await nonceRes.json();
            const { token: attToken } = await IntegrityPlugin.requestIntegrityToken({ nonce });
            integrityHeaders['x-device-attestation'] = attToken;
            integrityHeaders['x-attestation-nonce'] = nonce;
          }
        } catch {
          // Play Integrity unavailable — proceed without
        }
      }

      let response;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await secureFetch(`${API_BASE}/api/rooms`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...integrityHeaders },
            body: JSON.stringify({
              messageTTL: roomSettings.messageTTL !== 'none' ? roomSettings.messageTTL : undefined,
              password: roomSettings.password.trim() || undefined,
              maxUsers: roomSettings.maxUsers,
              customCode: useCustomCode && customCode.trim() ? customCode.trim() : undefined,
              hp_email: honeypot.hp_email,
              hp_website: honeypot.hp_website,
              hp_timestamp: honeypot.hp_timestamp,
              creatorId: creatorId,
              persistenceMode: roomSettings.persistenceMode,
              autoApprove: autoApproveEnabled,
              preApprovedList: preApprovedEntries.length > 0 ? preApprovedEntries : undefined,
              scheduledFor: scheduleEnabled && scheduledFor ? new Date(scheduledFor).toISOString() : undefined,
              geofence: geofenceEnabled && geofenceCenter
                ? { lat: geofenceCenter.lat, lng: geofenceCenter.lng, radiusMeters: geofenceRadius }
                : undefined,
            }),
          });
          break;
        } catch (fetchError) {
          lastError = fetchError.message;
          if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }

      if (!response || !response.ok) {
        let errorData = {};
        if (response) {
          try {
            const text = await response.text();
            errorData = text ? JSON.parse(text) : {};
          } catch {
            errorData = { error: `Server error (${response.status})` };
          }
        }
        throw new Error(errorData.error || lastError || 'Failed to create room');
      }

      let data;
      try {
        const text = await response.text();
        data = JSON.parse(text);
      } catch {
        throw new Error('Server returned an invalid response. Please try again.');
      }

      if (data.roomCode) {
        setCreatedRoom({ roomCode: data.roomCode, password: roomSettings.password.trim() || '' });
        const link = await generateInviteLink(data.roomCode, roomSettings.password.trim() || undefined);
        if (link) setInviteLink(`${link}#${key}`);
      } else {
        throw new Error(data.error || 'Failed to create room');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      alert(`Failed to create room: ${error.message}`);
      setIsCreating(false);
    }
  };

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    hapticSuccess();
    setIsCopied(prev => ({ ...prev, [type]: true }));
    setTimeout(() => setIsCopied(prev => ({ ...prev, [type]: false })), 2000);
  };

  const handleShare = async () => {
    if (!inviteLink) return;

    const platform = Capacitor.getPlatform();
    const isMobile = platform === 'ios' || platform === 'android';

    if (isMobile) {
      const shareText = `Join my private, secure chat room!\n\nVerbal Code: ${verbalCode || 'N/A'}`;
      const shareData = { title: 'Ephemeral Chat', text: shareText, url: inviteLink, dialogTitle: 'Share Invite' };
      try {
        const canShareResult = await Share.canShare();
        if (canShareResult.value) {
          await Share.share(shareData);
        } else {
          throw new Error('Sharing not supported');
        }
      } catch (error) {
        if (error.message !== 'Share canceled' && error.name !== 'AbortError') {
          copyToClipboard(`${shareText}\n\nLink: ${inviteLink}`, 'inviteLink');
        }
      }
    } else {
      setShowShareSheet(true);
    }
  };

  const handleJoinRoom = () => {
    if (createdRoom) {
      if (roomKey) window.location.hash = roomKey;
      onRoomCreated(createdRoom.roomCode);
    }
  };

  const handleNewRoom = () => {
    setCreatedRoom(null);
    setIsCreating(false);
    setInviteLink('');
    setVerbalCode('');
    setIsCopied({ roomCode: false, password: false, inviteLink: false, verbalCode: false });
    setSettings({ messageTTL: '30sec', password: '', maxUsers: 1, persistenceMode: 'ephemeral' });
    setUseCustomCode(false);
    setCustomCode('');
    setCustomCodeError('');
    setShowAdvanced(false);
  };

  // Success view (after room created)
  if (createdRoom) {
    return (
      <>
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg w-full max-w-md relative border border-gray-300 dark:border-gray-700">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4 text-green-600 dark:text-green-400">
                Room Created Successfully!
              </h2>

              <div className="space-y-4 mb-6">
                {createdRoom.password && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Key</label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        readOnly
                        inputMode="none"
                        autoComplete="off"
                        spellCheck={false}
                        data-ms-formignored="true"
                        data-ms-editor="false"
                        data-lpignore="true"
                        data-1p-ignore="true"
                        data-form-type="other"
                        onCopy={(e) => e.preventDefault()}
                        onCut={(e) => e.preventDefault()}
                        value={createdRoom.password}
                        className="flex-1 p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono input-no-echo"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center justify-between">
                    Invite Link
                    <span className="text-[10px] text-gray-500 font-normal">Expires in 25 min</span>
                  </label>
                  <div className="flex items-center w-full">
                    <div className="flex-1 min-w-0">
                      <input
                        type="text"
                        readOnly
                        value={inviteLink || 'Generating...'}
                        data-allow-copy="true"
                        className="w-full p-2 border rounded-l-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-xs sm:text-sm truncate m-0"
                      />
                    </div>
                    <button
                      onClick={() => inviteLink && copyToClipboard(inviteLink, 'inviteLink')}
                      disabled={!inviteLink}
                      className={`shrink-0 p-2 sm:px-3 sm:py-2 transition-colors border border-l-0 ${inviteLink ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-700 hover:bg-blue-100' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 cursor-not-allowed'}`}
                      title="Copy link"
                    >
                      {isCopied.inviteLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={handleShare}
                      disabled={!inviteLink}
                      className={`shrink-0 p-2 sm:px-3 sm:py-2 rounded-r-md transition-colors border border-l-0 ${inviteLink ? 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 border-green-200 dark:border-green-700 hover:bg-green-100' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 cursor-not-allowed'}`}
                      title="Share link"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="mt-1 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">Share this link with others to join easily</p>
                </div>

                {verbalCode && (
                  <div className="pt-3">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
                      <label className="block text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">Verbal Join Code</label>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-lg font-semibold text-blue-700 dark:text-blue-200 tracking-wide">
                          {verbalCode}
                        </span>
                        <button
                          onClick={() => copyToClipboard(verbalCode, 'verbalCode')}
                          className={`ml-2 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${isCopied.verbalCode ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-200 hover:bg-blue-200 dark:hover:bg-blue-700'}`}
                        >
                          {isCopied.verbalCode ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-2">
                        Share this code, others can type it to join.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-4">
                <button
                  onClick={handleNewRoom}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors order-2 sm:order-1"
                >
                  Create Another
                </button>
                <button
                  onClick={handleJoinRoom}
                  className="w-full sm:w-auto px-4 py-2 text-sm font-bold bg-blue-500 dark:bg-blue-600 text-white rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors order-1 sm:order-2"
                >
                  Join Room Now
                </button>
              </div>
            </div>
          </div>
        </div>

        {inviteLink && (
          <ShareSheet
            isOpen={showShareSheet}
            onClose={() => setShowShareSheet(false)}
            shareData={{
              title: 'Ephemeral Chat',
              text: `Join my private, secure chat room!\n\nVerbal Code: ${verbalCode || 'N/A'}`,
              url: inviteLink
            }}
          />
        )}
      </>
    );
  }

  // Creation form
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl w-full max-w-md relative shadow-2xl overflow-hidden border border-gray-300 dark:border-gray-700">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="p-4 sm:p-6 max-h-[90vh] overflow-y-auto no-scrollbar">
          <h2 className="text-xl font-bold mb-5 flex items-center gap-2 dark:text-white">
            <Settings className="w-5 h-5" />
            Create a New Room
          </h2>

          <form onSubmit={handleCreate} autoComplete="off" className="space-y-5">

            {/* Room Duration */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Timer className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <label className="font-medium text-gray-900 dark:text-white text-sm">Room Duration</label>
                <span className="ml-auto text-[11px] text-gray-400 dark:text-gray-500">Max 5 active rooms</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'ephemeral', title: 'Quick Chat',  duration: '10 min',   icon: Zap,         desc: 'Vanishes when empty' },
                  { id: 'gathering', title: 'Gathering',   duration: '3 hours',  icon: PartyPopper, desc: 'Stays when empty' },
                  { id: 'social',    title: 'Social',      duration: '6 hours',  icon: Sun,         desc: 'Perfect for hangouts' },
                  { id: 'extended',  title: 'Extended',    duration: '24 hours', icon: Sunset,      desc: 'All-day event' }
                ].map(mode => {
                  const Icon = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, persistenceMode: mode.id }))}
                      className={`p-3 border-2 rounded-lg transition-all text-left ${
                        roomSettings.persistenceMode === mode.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <div className="flex items-center mb-0.5">
                        <Icon className="w-4 h-4 mr-1.5 text-blue-500 dark:text-blue-400" />
                        <span className="font-semibold text-sm dark:text-white">{mode.title}</span>
                      </div>
                      <div className="text-xs font-medium text-blue-600 dark:text-blue-400">{mode.duration}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{mode.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message Auto-Delete */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <label className="font-medium text-gray-900 dark:text-white text-sm">Message Auto-Delete</label>
              </div>
              <div className="space-y-1">
                {ttlOptions.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 cursor-pointer p-2 rounded-lg transition-colors ${
                      roomSettings.messageTTL === opt.value
                        ? 'bg-blue-50 dark:bg-blue-900/20'
                        : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="messageTTL"
                      value={opt.value}
                      checked={roomSettings.messageTTL === opt.value}
                      onChange={() => setSettings(prev => ({ ...prev, messageTTL: opt.value }))}
                      className="mt-0.5 accent-blue-500"
                    />
                    <div>
                      <div className="text-sm font-medium dark:text-white">{opt.label}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{opt.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Access Key */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <label className="font-medium text-gray-900 dark:text-white text-sm">
                  Access Key <span className="font-normal text-gray-400 dark:text-gray-500 text-xs">(optional)</span>
                </label>
              </div>
              <input
                type="password"
                autoComplete="off"
                spellCheck={false}
                data-ms-formignored="true"
                data-ms-editor="false"
                data-lpignore="true"
                data-1p-ignore="true"
                data-bwignore="true"
                data-form-type="other"
                name={`new_room_key_${Math.random().toString(36).substring(7)}`}
                id="create-room-key-field"
                placeholder="Set a private access key"
                value={roomSettings.password}
                onChange={(e) => setSettings(prev => ({ ...prev, password: e.target.value }))}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                onPaste={(e) => e.preventDefault()}
                className="input-field text-sm py-2 px-3 dark:bg-gray-700 dark:border-gray-600 text-transparent dark:text-transparent placeholder:text-gray-500 dark:placeholder:text-gray-400 caret-blue-500 selection:bg-transparent selection:text-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={50}
              />
            </div>

            {/* Max Users */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                <label className="font-medium text-gray-900 dark:text-white text-sm">Max Users</label>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <button
                  type="button"
                  onClick={() => setSettings(prev => ({ ...prev, maxUsers: Math.max(1, prev.maxUsers - 1) }))}
                  disabled={roomSettings.maxUsers <= 1}
                  className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 rounded-full text-xl font-bold dark:text-white border border-gray-200 dark:border-gray-600 transition-colors"
                >
                  −
                </button>
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400 w-8 text-center">
                  {roomSettings.maxUsers}
                </span>
                <button
                  type="button"
                  onClick={() => setSettings(prev => ({ ...prev, maxUsers: Math.min(10, prev.maxUsers + 1) }))}
                  disabled={roomSettings.maxUsers >= 10}
                  className="w-9 h-9 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 rounded-full text-xl font-bold dark:text-white border border-gray-200 dark:border-gray-600 transition-colors"
                >
                  +
                </button>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">people (max 10)</span>
              </div>
              <input
                type="range"
                min={1}
                max={10}
                step={1}
                value={roomSettings.maxUsers}
                onChange={(e) => setSettings(prev => ({ ...prev, maxUsers: Number(e.target.value) }))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1">
                <span>1</span>
                <span>10</span>
              </div>
            </div>

            {/* Advanced Options accordion */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(s => !s)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4 text-gray-400" />
                  Advanced Options
                </span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">

                  {/* Custom Room Code */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Hash className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <label className="font-medium text-gray-900 dark:text-white text-sm">Custom Room Code</label>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setUseCustomCode(!useCustomCode); setCustomCode(''); setCustomCodeError(''); }}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useCustomCode ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useCustomCode ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {useCustomCode && (
                      <>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          Use a memorable phrase instead of a random code (e.g. "friday-hangout")
                        </p>
                        <input
                          type="text"
                          autoComplete="off"
                          placeholder="e.g. movie-night, study-group"
                          value={customCode}
                          onChange={(e) => {
                            const val = e.target.value;
                            setCustomCode(val);
                            const normalized = val.trim().toLowerCase().replace(/\s+/g, '-');
                            if (normalized.length > 0 && normalized.length < 3) {
                              setCustomCodeError('Must be at least 3 characters');
                            } else if (normalized.length > 30) {
                              setCustomCodeError('Must be 30 characters or less');
                            } else if (normalized.length > 0 && !/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(normalized)) {
                              setCustomCodeError('Only letters, numbers, and hyphens allowed');
                            } else {
                              setCustomCodeError('');
                            }
                          }}
                          className={`w-full input-field text-sm py-2 px-3 dark:bg-gray-700 dark:border-gray-600 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 ${customCodeError ? 'focus:ring-red-500 border-red-300 dark:border-red-500' : 'focus:ring-blue-500'}`}
                          maxLength={30}
                        />
                        {customCode.trim() && !customCodeError && (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                            Code: <span className="font-mono font-semibold">{customCode.trim().toLowerCase().replace(/\s+/g, '-')}</span>
                          </p>
                        )}
                        {customCodeError && <p className="text-xs text-red-500 dark:text-red-400 mt-1">{customCodeError}</p>}
                      </>
                    )}
                  </div>

                  {/* Access Control */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Shield className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <label className="font-medium text-gray-900 dark:text-white text-sm">Access Control</label>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 mb-3">
                      <div>
                        <div className="font-medium text-sm dark:text-white">Auto-Approve Users</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Skip the waiting room for all joiners</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAutoApproveEnabled(!autoApproveEnabled)}
                        className={`flex-shrink-0 transition-all active:scale-95 ${autoApproveEnabled ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}`}
                      >
                        {autoApproveEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                      </button>
                    </div>

                    <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <ClipboardList className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                        <span className="font-medium text-sm dark:text-white">Pre-Approved List</span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                        Users on this list bypass the waiting room. Assign optional roles.
                      </p>
                      <textarea
                        value={preApprovedText}
                        onChange={(e) => {
                          setPreApprovedText(e.target.value);
                          const entries = e.target.value.split(',')
                            .map(s => s.trim()).filter(s => s.length > 0)
                            .map(s => {
                              const match = s.match(/^([^(]+?)(?:\(([^)]+)\))?$/);
                              if (!match) return null;
                              return { name: match[1].trim(), role: (match[2] || 'none').trim().toLowerCase() };
                            }).filter(Boolean);
                          setPreApprovedEntries(entries);
                        }}
                        placeholder="user1(admin), user2, user3(mod)"
                        className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        rows={2}
                      />
                      <div className="flex items-center justify-between mt-2">
                        <button
                          type="button"
                          onClick={() => preApprovedFileRef.current?.click()}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-gray-100 dark:bg-gray-700 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 transition-all active:scale-[0.98]"
                        >
                          <Upload className="w-3 h-3" />
                          Import .txt
                        </button>
                        <input
                          ref={preApprovedFileRef}
                          type="file"
                          accept=".txt"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => {
                              const text = ev.target.result;
                              setPreApprovedText(text);
                              const entries = text.split(',')
                                .map(s => s.trim()).filter(s => s.length > 0)
                                .map(s => {
                                  const match = s.match(/^([^(]+?)(?:\(([^)]+)\))?$/);
                                  if (!match) return null;
                                  return { name: match[1].trim(), role: (match[2] || 'none').trim().toLowerCase() };
                                }).filter(Boolean);
                              setPreApprovedEntries(entries);
                            };
                            reader.readAsText(file);
                            e.target.value = '';
                          }}
                          className="hidden"
                        />
                        {preApprovedEntries.length > 0 && (
                          <span className="text-[10px] text-green-600 dark:text-green-400 font-semibold">
                            {preApprovedEntries.length} user{preApprovedEntries.length !== 1 ? 's' : ''} added
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Schedule for Later */}
                  <div className="flex flex-col gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm dark:text-white flex items-center gap-1.5">
                          <Clock className="w-4 h-4 text-gray-400" />
                          Schedule for Later
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Room opens at a future time; link is shareable now</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setScheduleEnabled(s => !s)}
                        className={`flex-shrink-0 transition-all active:scale-95 ${scheduleEnabled ? 'text-indigo-500' : 'text-gray-400 dark:text-gray-500'}`}
                      >
                        {scheduleEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                      </button>
                    </div>
                    {scheduleEnabled && (
                      <input
                        type="datetime-local"
                        value={scheduledFor}
                        min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                        onChange={(e) => setScheduledFor(e.target.value)}
                        className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                        required={scheduleEnabled}
                      />
                    )}
                  </div>

                  {/* Geofenced Room */}
                  <div className="flex flex-col gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm dark:text-white flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          Geofenced Room
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Only users within the set radius can join</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setGeofenceEnabled(s => !s)}
                        className={`flex-shrink-0 transition-all active:scale-95 ${geofenceEnabled ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}`}
                      >
                        {geofenceEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                      </button>
                    </div>
                    {geofenceEnabled && (
                      <div className="flex flex-col gap-3">
                        <button
                          type="button"
                          onClick={async () => {
                            const pos = await fetchPosition();
                            if (pos) setGeofenceCenter(pos);
                          }}
                          disabled={geoLoading}
                          className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                        >
                          <Locate className={`w-4 h-4 ${geoLoading ? 'animate-spin text-blue-500' : 'text-gray-500'}`} />
                          {geoLoading ? 'Getting location…' : geofenceCenter ? 'Location set — tap to update' : 'Use my current location'}
                        </button>
                        {geoError && <p className="text-xs text-red-500">{geoError}</p>}
                        {geofenceCenter && (
                          <p className="text-xs text-green-600 dark:text-green-400">
                            Centre locked ({geofenceCenter.lat.toFixed(4)}, {geofenceCenter.lng.toFixed(4)})
                          </p>
                        )}
                        <div className="flex flex-col gap-1">
                          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                            <span>Radius</span>
                            <span className="font-medium">{geofenceRadius >= 1000 ? `${(geofenceRadius / 1000).toFixed(1)} km` : `${geofenceRadius} m`}</span>
                          </div>
                          <input
                            type="range"
                            min={50}
                            max={5000}
                            step={50}
                            value={geofenceRadius}
                            onChange={(e) => setGeofenceRadius(Number(e.target.value))}
                            className="w-full accent-green-500"
                          />
                          <div className="flex justify-between text-xs text-gray-400">
                            <span>50 m</span>
                            <span>5 km</span>
                          </div>
                        </div>
                        {geofenceEnabled && !geofenceCenter && (
                          <p className="text-xs text-amber-500">Set a location before creating the room</p>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>

            {/* Honeypot fields — invisible to users, bots fill these */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', opacity: 0, height: 0, overflow: 'hidden' }}>
              <label htmlFor="hp_email">Email (leave empty)</label>
              <input
                type="email"
                id="hp_email"
                name="hp_email"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot.hp_email}
                onChange={(e) => setHoneypot(prev => ({ ...prev, hp_email: e.target.value }))}
              />
              <label htmlFor="hp_website">Website (leave empty)</label>
              <input
                type="url"
                id="hp_website"
                name="hp_website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot.hp_website}
                onChange={(e) => setHoneypot(prev => ({ ...prev, hp_website: e.target.value }))}
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-sm min-h-[44px]"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm min-h-[44px] font-medium"
              >
                {isCreating ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Waking up secure server...
                  </>
                ) : 'Create Room'}
              </button>
            </div>
          </form>
        </div>
      </div>

      {inviteLink && (
        <ShareSheet
          isOpen={showShareSheet}
          onClose={() => setShowShareSheet(false)}
          shareData={{
            title: 'Ephemeral Chat',
            text: `Join my private, secure chat room!\n\nVerbal Code: ${verbalCode || 'N/A'}`,
            url: inviteLink
          }}
        />
      )}
    </div>
  );
};

export default CreateRoomModal;
