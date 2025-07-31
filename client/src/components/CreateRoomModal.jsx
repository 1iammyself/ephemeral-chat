import React, { useState } from 'react';
import { X, Settings, Clock, Lock } from 'lucide-react';

const CreateRoomModal = ({ onClose, onRoomCreated }) => {
  const [settings, setSettings] = useState({
    messageTTL: 'none',
    password: ''
  });
  const [isCreating, setIsCreating] = useState(false);

  const ttlOptions = [
    { value: 'none', label: 'Never (Default)', description: 'Messages stay until room expires' },
    { value: '30sec', label: '30 Seconds', description: 'Messages disappear after 30 seconds' },
    { value: '1min', label: '1 Minute', description: 'Messages disappear after 1 minute' },
    { value: '5min', label: '5 Minutes', description: 'Messages disappear after 5 minutes' },
    { value: '30min', label: '30 Minutes', description: 'Messages disappear after 30 minutes' },
    { value: '1hour', label: '1 Hour', description: 'Messages disappear after 1 hour' }
  ];

  const handleCreate = async (e) => {
    e.preventDefault();
    setIsCreating(true);

    try {
      const response = await fetch('/api/rooms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageTTL: settings.messageTTL !== 'none' ? settings.messageTTL : undefined,
          password: settings.password.trim() || undefined
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.roomCode) {
        onRoomCreated(data.roomCode);
      } else {
        alert('Failed to create room. Please try again.');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center space-x-3">
            <div className="bg-primary-100 p-2 rounded-lg">
              <Settings className="w-5 h-5 text-primary-600" />
            </div>
            <h2 className="text-xl font-semibold">Room Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="p-6 space-y-6">
          {/* Message TTL Setting */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Clock className="w-5 h-5 text-gray-600" />
              <label className="font-medium text-gray-900">
                Message Auto-Delete
              </label>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Choose when messages should automatically disappear for privacy
            </p>
            <div className="space-y-2">
              {ttlOptions.map((option) => (
                <label
                  key={option.value}
                  className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    settings.messageTTL === option.value
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
                  <div>
                    <div className="font-medium text-sm">{option.label}</div>
                    <div className="text-xs text-gray-600">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Password Setting */}
          <div>
            <div className="flex items-center space-x-2 mb-3">
              <Lock className="w-5 h-5 text-gray-600" />
              <label className="font-medium text-gray-900">
                Room Password (Optional)
              </label>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Set a password to restrict access to your room
            </p>
            <input
              type="password"
              placeholder="Enter password (optional)"
              value={settings.password}
              onChange={(e) => setSettings(prev => ({ ...prev, password: e.target.value }))}
              className="input-field"
              maxLength={50}
            />
          </div>

          {/* Actions */}
          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary flex-1"
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={isCreating}
            >
              {isCreating ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateRoomModal;
