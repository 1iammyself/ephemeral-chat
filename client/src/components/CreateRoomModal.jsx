import React, { useState, useCallback } from 'react';
import { X, Settings, Clock, Lock, Copy, Check, Users, Shield } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '@cap.js/widget';
import { generateRoomKey } from '../utils/security';

const CreateRoomModal = ({ onClose, onRoomCreated }) => {
  const API_BASE = process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '';

  const [settings, setSettings] = useState({
    messageTTL: 'none',
    password: '',
    maxUsers: 1
  });
  const [capToken, setCapToken] = useState(null);
  const [isCapVerified, setIsCapVerified] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createdRoom, setCreatedRoom] = useState(null);
  const [inviteLink, setInviteLink] = useState('');
  const [isCopied, setIsCopied] = useState({
    roomCode: false,
    password: false,
    inviteLink: false
  });
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [roomKey, setRoomKey] = useState(null);
  const navigate = useNavigate();

  // Use callback ref to ensure listener is attached when element mounts
  const setCapWidgetRef = useCallback((node) => {
    if (node) {
      const handleSuccess = (event) => {
        if (event.detail && event.detail.token) {
          setCapToken(event.detail.token);
          setIsCapVerified(true);
        }
      };
      const handleError = (e) => console.error('Cap widget error:', e);

      // Listen for various possible event names to be safe
      node.addEventListener('cap:success', handleSuccess);
      node.addEventListener('success', handleSuccess);
      node.addEventListener('solve', handleSuccess);
      node.addEventListener('token', handleSuccess);

      node.addEventListener('cap:error', handleError);
      node.addEventListener('error', handleError);
    }
  }, []);

  const ttlOptions = [
    { value: 'none', label: 'Never (Default)', description: 'Messages stay until room expires' },
    { value: '30sec', label: '30 Seconds', description: 'Messages disappear after 30 seconds' },
    { value: '1min', label: '1 Minute', description: 'Messages disappear after 1 minute' },
    { value: '5min', label: '5 Minutes', description: 'Messages disappear after 5 minutes' },
    { value: '30min', label: '30 Minutes', description: 'Messages disappear after 30 minutes' },
    { value: '1hour', label: '1 Hour', description: 'Messages disappear after 1 hour' }
  ];

  const generateInviteLink = async (roomCode, password) => {
    try {
      setIsGeneratingInvite(true);
      const response = await fetch(`${API_BASE}/api/rooms/${roomCode}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password || undefined }),
      });

      const data = await response.json();

      if (response.ok && data.inviteLink) {
        setInviteLink(data.inviteLink);
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

    if (!isCapVerified && !capToken) {
      alert('Please complete the verification first.');
      return;
    }

    setIsCreating(true);

    try {
      // Generate E2EE Key
      const key = generateRoomKey();
      setRoomKey(key);

      const response = await fetch(`${API_BASE}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageTTL: settings.messageTTL !== 'none' ? settings.messageTTL : undefined,
          password: settings.password.trim() || undefined,
          maxUsers: settings.maxUsers,
          capToken: capToken
        }),
      });

      const data = await response.json();

      if (response.ok && data.roomCode) {
        setCreatedRoom({
          roomCode: data.roomCode,
          password: settings.password.trim() || ''
        });

        // Generate invite link automatically
        const link = await generateInviteLink(data.roomCode, settings.password.trim() || undefined);
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
    setIsCopied(prev => ({ ...prev, [type]: true }));
    setTimeout(() => {
      setIsCopied(prev => ({ ...prev, [type]: false }));
    }, 2000);
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
    setIsCopied({
      roomCode: false,
      password: false,
      inviteLink: false
    });
    setSettings({
      messageTTL: 'none',
      password: '',
      maxUsers: 1
    });
    setCapToken(null);
    setIsCapVerified(false);
  };

  // If room was created, show success message with invite options
  if (createdRoom) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md relative">
          <div className="p-6">
            <h2 className="text-2xl font-bold mb-4 text-green-600 dark:text-green-400">
              Room Created Successfully!
            </h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Room Code</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    readOnly
                    value={createdRoom.roomCode}
                     data-allow-copy="true"
                     className="flex-1 p-2 border rounded-l-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(createdRoom.roomCode, 'roomCode')}
                    className="bg-blue-500 dark:bg-blue-600 text-white p-2 rounded-r-md hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
                  >
                    {isCopied.roomCode ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Invite Link (Expires in 5 min)</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink || 'Generating...'}
                     data-allow-copy="true"
                     className="flex-1 p-2 border rounded-l-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white text-sm truncate"
                  />
                  <button
                    onClick={() => inviteLink && copyToClipboard(inviteLink, 'inviteLink')}
                    disabled={!inviteLink}
                    className={`p-2 rounded-r-md transition-colors ${inviteLink ? 'bg-blue-500 dark:bg-blue-600 text-white hover:bg-blue-600 dark:hover:bg-blue-700' : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'}`}
                  >
                    {isCopied.inviteLink ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Share this link with others to join easily</p>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={handleNewRoom}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white"
              >
                Create Another Room
              </button>
              <button
                onClick={handleJoinRoom}
                className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
              >
                Join Room Now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show the room creation form
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
          <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center dark:text-white">
            <Settings className="w-5 h-5 mr-2" />
            Create a New Room
          </h2>

          <form onSubmit={handleCreate} autoComplete="off" className="space-y-4 sm:space-y-6">
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
                    className={`flex items-start space-x-2 sm:space-x-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-colors ${settings.messageTTL === option.value
                      ? 'border-primary-500 dark:border-primary-400 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                      }`}
                  >
                    <input
                      type="radio"
                      name="messageTTL"
                      value={option.value}
                      checked={settings.messageTTL === option.value}
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
                type="text" /* text to avoid password manager hooks */
                inputMode="none"
                autoComplete="off"
                spellCheck={false}
                data-ms-formignored="true"
                data-ms-editor="false"
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                name="room-access-key-create"
                placeholder="Enter access key (optional)"
                value={settings.password}
                onChange={(e) => setSettings(prev => ({ ...prev, password: e.target.value }))}
                onCopy={(e) => e.preventDefault()}
                onCut={(e) => e.preventDefault()}
                onPaste={(e) => e.preventDefault()}
                className="input-field input-no-echo text-sm sm:text-base py-2 sm:py-3 px-3 sm:px-4 dark:bg-gray-700 dark:border-gray-600 dark:text-white dark:placeholder-gray-400"
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
                Set the maximum number of people who can join this room (1-200)
              </p>
              <div className="px-2 sm:px-3">
                {/* +/- buttons with current value */}
                <div className="flex items-center justify-center space-x-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, maxUsers: Math.max(1, prev.maxUsers - 1) }))}
                    disabled={settings.maxUsers <= 1}
                    className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-300 dark:disabled:text-gray-600 rounded-full text-xl font-bold transition-colors dark:text-white"
                  >
                    −
                  </button>
                  <span className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 w-16 text-center">
                    {settings.maxUsers}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, maxUsers: Math.min(200, prev.maxUsers + 1) }))}
                    disabled={settings.maxUsers >= 200}
                    className="w-10 h-10 flex items-center justify-center bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-300 dark:disabled:text-gray-600 rounded-full text-xl font-bold transition-colors dark:text-white"
                  >
                    +
                  </button>
                </div>
                {/* Slider */}
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">1</span>
                  <input
                    type="range"
                    min="1"
                    max="200"
                    value={settings.maxUsers}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      setSettings(prev => ({ ...prev, maxUsers: value }));
                    }}
                    className="flex-1 h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">200</span>
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 dark:text-blue-400" />
                <label className="font-medium text-gray-900 dark:text-white text-sm sm:text-base">
                  Verification
                </label>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-2 sm:mb-3">
                Complete this quick verification to prove you're human
              </p>
              <div className="flex justify-center">
                <cap-widget
                  ref={setCapWidgetRef}
                  data-cap-api-endpoint={`${API_BASE}/api/cap/`}
                  className="w-full"
                />
              </div>
              {isCapVerified && (
                <div className="mt-2 flex items-center justify-center text-green-600 dark:text-green-400 text-sm">
                  <Check className="w-4 h-4 mr-1" />
                  Verified
                </div>
              )}
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
                    Creating...
                  </>
                ) : 'Create Room'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateRoomModal;
