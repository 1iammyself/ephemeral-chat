import React, { useState, useEffect } from 'react';
import { X, Settings, Clock, Lock, Copy, Check, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const CreateRoomModal = ({ onClose, onRoomCreated }) => {
  const API_BASE = process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '';

  const [settings, setSettings] = useState({
    messageTTL: 'none',
    password: '',
    maxUsers: 1
  });
  const [captcha, setCaptcha] = useState({ problem: '', answer: '' });
  const [captchaInput, setCaptchaInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdRoom, setCreatedRoom] = useState(null);
  const [inviteLink, setInviteLink] = useState('');
  const [isCopied, setIsCopied] = useState({
    roomCode: false,
    password: false,
    inviteLink: false
  });
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const navigate = useNavigate();


  const ttlOptions = [
    { value: 'none', label: 'Never (Default)', description: 'Messages stay until room expires' },
    { value: '30sec', label: '30 Seconds', description: 'Messages disappear after 30 seconds' },
    { value: '1min', label: '1 Minute', description: 'Messages disappear after 1 minute' },
    { value: '5min', label: '5 Minutes', description: 'Messages disappear after 5 minutes' },
    { value: '30min', label: '30 Minutes', description: 'Messages disappear after 30 minutes' },
    { value: '1hour', label: '1 Hour', description: 'Messages disappear after 1 hour' }
  ];

  const fetchCaptcha = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/captcha`);
      const data = await response.json();
      setCaptcha(data);
    } catch (error) {
      console.error('Error fetching CAPTCHA:', error);
    }
  };

  // Fetch CAPTCHA on component mount
  useEffect(() => {
    fetchCaptcha();
  }, []);

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
    setIsCreating(true);

    try {
      const response = await fetch(`${API_BASE}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageTTL: settings.messageTTL !== 'none' ? settings.messageTTL : undefined,
          password: settings.password.trim() || undefined,
          maxUsers: settings.maxUsers,
          captchaAnswer: captchaInput.trim(),
          captchaProblem: captcha.problem
        }),
      });

      console.log('Sending room creation data:', {
        messageTTL: settings.messageTTL !== 'none' ? settings.messageTTL : undefined,
        password: settings.password.trim() || undefined,
        maxUsers: settings.maxUsers,
        captchaAnswer: captchaInput.trim(),
        captchaProblem: captcha.problem
      });

      const data = await response.json();

      if (response.ok && data.roomCode) {
        setCreatedRoom({
          roomCode: data.roomCode,
          password: settings.password.trim() || ''
        });

        // Generate invite link automatically
        await generateInviteLink(data.roomCode, settings.password.trim() || undefined);
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
      onRoomCreated(createdRoom.roomCode);
    }
  };

  const handleNewRoom = () => {
    setCreatedRoom(null);
    setInviteLink('');
    setCaptchaInput('');
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
    // Fetch new CAPTCHA
    fetchCaptcha();
  };

  // If room was created, show success message with invite options
  if (createdRoom) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-lg w-full max-w-md relative">
          <div className="p-6">
            <h2 className="text-2xl font-bold mb-4 text-green-600">
              Room Created Successfully!
            </h2>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Room Code</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    readOnly
                    value={createdRoom.roomCode}
                    className="flex-1 p-2 border rounded-l-md bg-gray-50 font-mono"
                  />
                  <button
                    onClick={() => copyToClipboard(createdRoom.roomCode, 'roomCode')}
                    className="bg-blue-500 text-white p-2 rounded-r-md hover:bg-blue-600 transition-colors"
                  >
                    {isCopied.roomCode ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {createdRoom.password && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="flex items-center">
                    <input
                      type="text"
                      readOnly
                      value={createdRoom.password}
                      className="flex-1 p-2 border rounded-l-md bg-gray-50 font-mono"
                    />
                    <button
                      onClick={() => copyToClipboard(createdRoom.password, 'password')}
                      className="bg-blue-500 text-white p-2 rounded-r-md hover:bg-blue-600 transition-colors"
                    >
                      {isCopied.password ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Invite Link (Expires in 5 min)</label>
                <div className="flex items-center">
                  <input
                    type="text"
                    readOnly
                    value={inviteLink || 'Generating...'}
                    className="flex-1 p-2 border rounded-l-md bg-gray-50 text-sm truncate"
                  />
                  <button
                    onClick={() => inviteLink && copyToClipboard(inviteLink, 'inviteLink')}
                    disabled={!inviteLink}
                    className={`p-2 rounded-r-md transition-colors ${inviteLink ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                  >
                    {isCopied.inviteLink ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">Share this link with others to join easily</p>
              </div>
            </div>

            <div className="flex justify-between pt-2">
              <button
                onClick={handleNewRoom}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Create Another Room
              </button>
              <button
                onClick={handleJoinRoom}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
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
      <div className="bg-white rounded-lg w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-700"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="p-4 sm:p-6 max-h-[90vh] overflow-y-auto">
          <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 flex items-center">
            <Settings className="w-5 h-5 mr-2" />
            Create a New Room
          </h2>

          <form onSubmit={handleCreate} className="space-y-4 sm:space-y-6">
            {/* Message TTL Setting */}
            <div>
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                <label className="font-medium text-gray-900 text-sm sm:text-base">
                  Message Auto-Delete
                </label>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
                Choose when messages should automatically disappear for privacy
              </p>
              <div className="space-y-2">
                {ttlOptions.map((option) => (
                  <label
                    key={option.value}
                    className={`flex items-start space-x-2 sm:space-x-3 p-2 sm:p-3 rounded-lg border cursor-pointer transition-colors ${settings.messageTTL === option.value
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:bg-gray-50'
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
                      <div className="font-medium text-xs sm:text-sm">{option.label}</div>
                      <div className="text-xs text-gray-600">{option.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Password Setting */}
            <div>
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <Lock className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                <label className="font-medium text-gray-900 text-sm sm:text-base">
                  Room Password (Optional)
                </label>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
                Set a password to restrict access to your room
              </p>
              <input
                type="password"
                placeholder="Enter password (optional)"
                value={settings.password}
                onChange={(e) => setSettings(prev => ({ ...prev, password: e.target.value }))}
                className="input-field text-sm sm:text-base py-2 sm:py-3 px-3 sm:px-4"
                maxLength={50}
              />
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                <label className="font-medium text-gray-900 text-sm sm:text-base">
                  Maximum Users
                </label>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
                Set the maximum number of people who can join this room (1-200)
              </p>
              <div className="px-2 sm:px-3">
                {/* +/- buttons with current value */}
                <div className="flex items-center justify-center space-x-3 mb-3">
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, maxUsers: Math.max(1, prev.maxUsers - 1) }))}
                    disabled={settings.maxUsers <= 1}
                    className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-300 rounded-full text-xl font-bold transition-colors"
                  >
                    −
                  </button>
                  <span className="text-xl sm:text-2xl font-bold text-blue-600 w-16 text-center">
                    {settings.maxUsers}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSettings(prev => ({ ...prev, maxUsers: Math.min(200, prev.maxUsers + 1) }))}
                    disabled={settings.maxUsers >= 200}
                    className="w-10 h-10 flex items-center justify-center bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-300 rounded-full text-xl font-bold transition-colors"
                  >
                    +
                  </button>
                </div>
                {/* Slider */}
                <div className="flex items-center space-x-3 sm:space-x-4">
                  <span className="text-xs sm:text-sm text-gray-600">1</span>
                  <input
                    type="range"
                    min="1"
                    max="200"
                    value={settings.maxUsers}
                    onChange={(e) => {
                      const value = parseInt(e.target.value);
                      console.log('Max users slider changed to:', value);
                      setSettings(prev => ({ ...prev, maxUsers: value }));
                    }}
                    className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <span className="text-xs sm:text-sm text-gray-600">200</span>
                </div>
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2 mb-2 sm:mb-3">
                <div className="w-4 h-4 sm:w-5 sm:h-5 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-xs sm:text-sm">?</span>
                </div>
                <label className="font-medium text-gray-900 text-sm sm:text-base">
                  Solve the Math Problem
                </label>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3">
                Prove you're human by solving this simple math problem
              </p>
              <div className="mb-3">
                <div className="p-2 sm:p-3 bg-gray-50 border rounded-lg text-center font-mono text-base sm:text-lg">
                  {captcha.problem || 'Loading...'}
                </div>
              </div>
              <input
                type="text"
                placeholder="Enter your answer"
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                className="input-field text-sm sm:text-base py-2 sm:py-3 px-3 sm:px-4"
                required
              />
            </div>

            {/* Actions */}
            <div className="mt-4 sm:mt-6 flex justify-end space-x-2 sm:space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-3 sm:px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors text-sm sm:text-base min-h-[44px]"
                disabled={isCreating}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreating}
                className="px-3 sm:px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-blue-300 disabled:cursor-not-allowed transition-colors flex items-center text-sm sm:text-base min-h-[44px]"
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
