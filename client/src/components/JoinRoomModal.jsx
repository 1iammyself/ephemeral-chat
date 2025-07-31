import React, { useState, useEffect } from 'react';
import { MessageCircle, Lock, Users, AlertCircle } from 'lucide-react';

const JoinRoomModal = ({ roomCode, onJoin, onCancel, error }) => {
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [roomInfo, setRoomInfo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);

  useEffect(() => {
    // Check room info when component mounts
    const checkRoom = async () => {
      try {
        const response = await fetch(`/api/rooms/${roomCode}`);
        const data = await response.json();
        
        if (response.ok && data.exists) {
          setRoomInfo(data);
        } else {
          // Room doesn't exist, redirect to home
          onCancel();
        }
      } catch (error) {
        console.error('Error checking room:', error);
        onCancel();
      } finally {
        setIsLoading(false);
      }
    };

    if (roomCode) {
      checkRoom();
    }
  }, [roomCode, onCancel]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nickname.trim()) {
      return;
    }

    setIsJoining(true);
    await onJoin(nickname.trim(), password.trim() || null);
    setIsJoining(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="bg-white rounded-xl p-8 shadow-lg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Checking room...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="bg-white rounded-xl max-w-md w-full shadow-lg">
        {/* Header */}
        <div className="text-center p-8 border-b">
          <div className="bg-primary-600 p-3 rounded-2xl w-fit mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Join Room {roomCode}
          </h1>
          <div className="flex items-center justify-center space-x-4 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              <Users className="w-4 h-4" />
              <span>{roomInfo?.userCount || 0} online</span>
            </div>
            {roomInfo?.requiresPassword && (
              <div className="flex items-center space-x-1">
                <Lock className="w-4 h-4" />
                <span>Protected</span>
              </div>
            )}
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-red-800 text-sm font-medium">Error</p>
                <p className="text-red-700 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Nickname Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Choose a Nickname
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Enter your nickname..."
              className="input-field"
              maxLength={20}
              required
              disabled={isJoining}
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave blank for a random nickname
            </p>
          </div>

          {/* Password Input (if required) */}
          {roomInfo?.requiresPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Room Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter room password..."
                className="input-field"
                required
                disabled={isJoining}
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="btn-secondary flex-1"
              disabled={isJoining}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={isJoining}
            >
              {isJoining ? 'Joining...' : 'Join Room'}
            </button>
          </div>
        </form>

        {/* Footer */}
        <div className="px-8 pb-8 text-center">
          <p className="text-xs text-gray-500">
            Your messages are temporary and will be deleted when you leave or the room expires.
          </p>
        </div>
      </div>
    </div>
  );
};

export default JoinRoomModal;
