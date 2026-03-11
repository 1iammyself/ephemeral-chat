import React, { useState, useCallback, useEffect } from 'react';
import { hapticSuccess } from '../utils/platform';
import { X, Check, Copy, Users, Lock, Unlock, Timer, Zap, PartyPopper, Sun, Sunset, Settings, Clock, Shield, Share2, Hash } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';
import ShareSheet from './ShareSheet';
import { sanitizeInput, generateRoomKey } from '../utils/security';
import { getCreatorId } from '../utils/creator';
import { useTheme } from '../context/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { secureFetch } from '../utils/secure-fetch.js';
// Removed @cap.js/widget - using honeypot instead

const CreateRoomModal = ({ onClose, onRoomCreated }) => {
  const API_BASE = import.meta.env.VITE_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');

  const { theme } = useTheme();
  const [roomSettings, setSettings] = useState({
    messageTTL: '30sec',
    password: '',
    maxUsers: 1,
    persistenceMode: 'ephemeral' // NEW: Default to ephemeral mode
  });
  // Honeypot fields - bots will fill these, humans won't see them
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
  const navigate = useNavigate();

  // Set timestamp when component mounts (for timing-based bot detection)
  useEffect(() => {
    setHoneypot(prev => ({ ...prev, hp_timestamp: Date.now().toString() }));
  }, []);

  const ttlOptions = [
    { value: 'none', label: 'Never', description: 'Messages stay until room expires' },
    { value: '30sec', label: '30 Seconds (Default)', description: 'Messages disappear after 30 seconds' },
    { value: '1min', label: '1 Minute', description: 'Messages disappear after 1 minute' },
    { value: '5min', label: '5 Minutes', description: 'Messages disappear after 5 minutes' },
    { value: '30min', label: '30 Minutes', description: 'Messages disappear after 30 minutes' },
    { value: '1hour', label: '1 Hour', description: 'Messages disappear after 1 hour' }
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
        if (data.verbalCode) {
          setVerbalCode(data.verbalCode);
        }
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

    // Validate custom code if enabled
    if (useCustomCode) {
      const normalized = customCode.trim().toLowerCase().replace(/\s+/g, '-');
      if (!normalized || normalized.length < 3 || normalized.length > 30 || !/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(normalized)) {
        setCustomCodeError('Please enter a valid custom phrase (3-30 chars, letters, numbers, hyphens)');
        return;
      }
    }

    setIsCreating(true);

    try {
      // Generate E2EE Key
      const key = generateRoomKey();
      setRoomKey(key);

      // Get or generate creator ID
      const creatorId = getCreatorId();

      // Retry logic for transient network failures
      let response;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await secureFetch(`${API_BASE}/api/rooms`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messageTTL: roomSettings.messageTTL !== 'none' ? roomSettings.messageTTL : undefined,
              password: roomSettings.password.trim() || undefined,
              maxUsers: roomSettings.maxUsers,
              customCode: useCustomCode && customCode.trim() ? customCode.trim() : undefined,
              // Honeypot fields for bot detection (invisible to users)
              hp_email: honeypot.hp_email,
              hp_website: honeypot.hp_website,
              hp_timestamp: honeypot.hp_timestamp,
              creatorId: creatorId, // NEW: Include creator ID
              persistenceMode: roomSettings.persistenceMode // NEW: Include persistence mode
            }),
          });
          if (response.ok) break; // Success, exit retry loop
          lastError = `Server responded with ${response.status}`;
        } catch (fetchError) {
          lastError = fetchError.message;
          if (attempt < 2) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
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
        setCreatedRoom({
          roomCode: data.roomCode,
          password: roomSettings.password.trim() || ''
        });

        // Generate invite link automatically
        const link = await generateInviteLink(data.roomCode, roomSettings.password.trim() || undefined);
        if (link) {
          setInviteLink(`${link}#${key}`);
        }
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
    setTimeout(() => {
      setIsCopied(prev => ({ ...prev, [type]: false }));
    }, 2000);
  };

  const handleShare = async () => {
    if (!inviteLink) return;

    // Use a more explicit check for mobile platforms vs others
    const platform = Capacitor.getPlatform();
    const isMobile = platform === 'ios' || platform === 'android';

    if (isMobile) {
      // Native (Android/iOS) - Use standard Share Sheet
      const shareText = `Join my private, secure chat room!

Verbal Code: ${verbalCode || 'N/A'}`;

      const shareData = {
        title: 'Ephemeral Chat',
        text: shareText,
        url: inviteLink,
        dialogTitle: 'Share Invite'
      };

      try {
        const canShareResult = await Share.canShare();
        if (canShareResult.value) {
          await Share.share(shareData);
        } else {
          throw new Error('Sharing not supported');
        }
      } catch (error) {
        if (error.message !== 'Share canceled' && error.name !== 'AbortError') {
          const fullText = `${shareText}\n\nLink: ${inviteLink}`;
          copyToClipboard(fullText, 'inviteLink');
        }
      }
    } else {
      // Web/Electron - Show custom Share Sheet
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
    setInviteLink('');
    setVerbalCode('');
    setIsCopied({
      roomCode: false,
      password: false,
      inviteLink: false,
      verbalCode: false
    });
    setSettings({
      messageTTL: '30sec',
      password: '',
      maxUsers: 1
    });
    setUseCustomCode(false);
    setCustomCode('');
    setCustomCodeError('');
    // setCapToken(null); // This variable is not defined in the provided code
    // setIsCapVerified(false); // This variable is not defined in the provided code
  };

  // If room was created, show success message with invite options
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
                {/* Room Code display removed to enforce link-only joining */}

                {createdRoom.password && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Access Key</label>
                    <div className="flex items-center">
                      <input
                        type="text" /* keep password managers from treating this as a password */
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

                {/* Verbal Join Code */}
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

  // Show the room creation form
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
          <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center dark:text-white">
            <Settings className="w-5 h-5 mr-2" />
            Create a New Room
          </h2>

          <form onSubmit={handleCreate} autoComplete="off" className="space-y-4 sm:space-y-6">
            {/* Custom Phrase Room Code */}
            <div>
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="flex items-center space-x-2">
                  <Hash className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
                  <label className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                    Custom Room Code
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUseCustomCode(!useCustomCode);
                    setCustomCode('');
                    setCustomCodeError('');
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${useCustomCode ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'
                    }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${useCustomCode ? 'translate-x-6' : 'translate-x-1'
                      }`}
                  />
                </button>
              </div>
              {useCustomCode && (
                <>
                  <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2">
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
                      // Live validation
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
                    className={`w-full input-field text-sm sm:text-base py-2 sm:py-3 px-3 sm:px-4 dark:bg-gray-700 dark:border-gray-600 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 ${customCodeError ? 'focus:ring-red-500 border-red-300 dark:border-red-500' : 'focus:ring-blue-500'
                      }`}
                    maxLength={30}
                  />
                  {customCode.trim() && !customCodeError && (
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                      Room code: <span className="font-mono font-semibold">{customCode.trim().toLowerCase().replace(/\s+/g, '-')}</span>
                    </p>
                  )}
                  {customCodeError && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">{customCodeError}</p>
                  )}
                </>
              )}
            </div>

            {/* Persistence Mode Selection */}
            <div>
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <Timer className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
                <label className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                  Room Duration
                </label>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3">
                You can have up to 5 rooms at a time
              </p>
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                {[
                  { id: 'ephemeral', title: 'Quick Chat', duration: '10 min', icon: Zap, desc: 'Disappears when empty' },
                  { id: 'gathering', title: 'Gathering', duration: '3 hours', icon: PartyPopper, desc: 'Stays alive when empty' },
                  { id: 'social', title: 'Social', duration: '6 hours', icon: Sun, desc: 'Perfect for hangouts' },
                  { id: 'extended', title: 'Extended', duration: '24 hours', icon: Sunset, desc: 'All-day event' }
                ].map(mode => {
                  const IconComponent = mode.icon;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setSettings(prev => ({ ...prev, persistenceMode: mode.id }))}
                      className={`p-3 sm:p-4 border-2 rounded-lg transition-all text-left ${roomSettings.persistenceMode === mode.id
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                    >
                      <div className="flex items-center mb-1">
                        <IconComponent className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                        <div className="font-medium text-sm dark:text-white">{mode.title}</div>
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">{mode.duration}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">{mode.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message TTL Setting */}
            <div>
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
                <label className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                  Message Auto-Delete
                </label>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">
                Choose when messages should automatically disappear for privacy
              </p>
              <div className="space-y-2">
                {ttlOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start space-x-2 sm:space-x-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-colors ${roomSettings.messageTTL === option.value
                      ? 'border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                  >
                    <input
                      type="radio"
                      name="messageTTL"
                      value={option.value}
                      checked={roomSettings.messageTTL === option.value}
                      onChange={(e) => setSettings(prev => ({ ...prev, messageTTL: e.target.value }))}
                      className="mt-1"
                    />
                    <div className="min-w-0">
                      <div className="font-medium text-xs sm:text-sm dark:text-white">{option.label}</div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">{option.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Password Setting */}
            <div>
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
                <label className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                  Room Access Key (Optional)
                </label>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 sm:mb-3">
                Set a private access key to restrict your room (not saved by the browser)
              </p>
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
                placeholder="Enter access key (optional)"
                value={roomSettings.password}
                onChange={(e) => setSettings(prev => ({ ...prev, password: e.target.value }))}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                onPaste={(e) => e.preventDefault()}
                className="input-field text-sm sm:text-base py-2 sm:py-3 px-3 sm:px-4 dark:bg-gray-700 dark:border-gray-600 text-transparent dark:text-transparent placeholder:text-gray-500 dark:placeholder:text-gray-400 caret-blue-500 selection:bg-transparent selection:text-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                maxLength={50}
              />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
                <label className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                  Maximum Users
                </label>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 sm:mb-3">
                Set the maximum number of people who can join this room (1-10)
              </p>
              <div className="px-2 sm:px-3">
                {/* +/- buttons with current value */}
                <div className="flex items-center justify-center space-x-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, maxUsers: Math.max(1, prev.maxUsers - 1) }))}
                    disabled={roomSettings.maxUsers <= 1}
                    className="w-10 h-10 flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 rounded-full text-xl font-bold transition-colors dark:text-white border border-gray-300 dark:border-gray-600"
                  >
                    −
                  </button>
                  <span className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 w-16 text-center">
                    {roomSettings.maxUsers}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, maxUsers: Math.min(10, prev.maxUsers + 1) }))}
                    disabled={roomSettings.maxUsers >= 10}
                    className="w-10 h-10 flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 rounded-full text-xl font-bold transition-colors dark:text-white border border-gray-300 dark:border-gray-600"
                  >
                    +
                  </button>
                </div>
                {/* Slider */}
                <div className="mt-4 sm:mt-6">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    value={roomSettings.maxUsers}
                    onChange={(e) => setSettings(prev => ({ ...prev, maxUsers: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-transparent rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium pb-2">
                    <span>1</span>
                    <span>10</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Honeypot fields - invisible to humans, bots will fill them */}
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
            <div className="mt-4 sm:mt-6 flex justify-end space-x-2 sm:space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-3 sm:px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors text-sm sm:text-base min-h-[44px]"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-3 sm:px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-800 disabled:cursor-not-allowed transition-colors flex items-center text-sm sm:text-base min-h-[44px]"
              >
                {isCreating ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-3 w-3 sm:h-4 sm:w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>{createdRoom ? 'Finalizing...' : 'Waking up secure server...'}</span>
                  </>
                ) : 'Create Room'}
              </button>
            </div>
          </form>
        </div>
      </div >

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
    </div >
  );
};

export default CreateRoomModal;
