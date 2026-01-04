import React from 'react';
import { Users, Crown, User, Check, X } from 'lucide-react';

const UserList = ({ users, currentUser, pendingGuests = [], isHost = false, onApprove, onDeny, selectedRecipients = [], onToggleRecipient }) => {
  const getInitials = (nickname) => {
    return nickname
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (nickname) => {
    // Generate a consistent color based on nickname
    const colors = [
      'bg-red-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500'
    ];

    let hash = 0;
    for (let i = 0; i < nickname.length; i++) {
      hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="h-full flex flex-col">
      {/* Pending Guests Section (Host Only) */}
      {isHost && pendingGuests.length > 0 && (
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-yellow-50 dark:bg-yellow-900/20 transition-colors duration-200">
          <h3 className="font-medium text-yellow-800 dark:text-yellow-400 mb-3 text-xs uppercase tracking-wider flex items-center">
            <Users className="w-3 h-3 mr-1" />
            Waiting Room ({pendingGuests.length})
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-thin">
            {pendingGuests.map(guest => (
              <div key={guest.socketId} className="flex items-center justify-between bg-white dark:bg-gray-800 p-2 rounded border border-yellow-100 dark:border-yellow-900/30 shadow-sm transition-colors duration-200">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-medium ${getAvatarColor(guest.nickname)}`}>
                    {getInitials(guest.nickname)}
                  </div>
                  <span className="font-medium text-sm truncate text-gray-900 dark:text-gray-200">{guest.nickname}</span>
                </div>
                <div className="flex space-x-1 flex-shrink-0">
                  <button 
                    onClick={() => onApprove(guest.socketId)} 
                    className="p-1.5 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                    title="Approve"
                  >
                    <Check className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => onDeny(guest.socketId)} 
                    className="p-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                    title="Deny"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="font-medium text-gray-900 dark:text-white">
            Participants ({users.length})
          </h3>
        </div>
      </div>

      {/* User List */}
      <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
        {users.length === 0 ? (
          <div className="text-center text-gray-500 dark:text-gray-400 py-8">
            <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No users online</p>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user, index) => {
              const isCurrentUser = currentUser && (user.socketId === currentUser.socketId || user.socketId === currentUser.id || user.id === currentUser.id);
              const isFirstUser = index === 0; // First user is considered room creator

              return (
                <div
                  key={user.socketId || user.id || index}
                  className={`flex items-center space-x-3 p-2 rounded-lg transition-colors duration-200 cursor-pointer ${
                    isCurrentUser 
                      ? 'bg-indigo-50 dark:bg-indigo-900/20' 
                      : selectedRecipients.includes(user.socketId)
                        ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                  }`}
                  onClick={() => !isCurrentUser && onToggleRecipient && onToggleRecipient(user.socketId)}
                >
                  <div className="relative">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm text-white font-medium shadow-sm ${getAvatarColor(user.nickname)}`}>
                      {getInitials(user.nickname)}
                    </div>
                    {!isCurrentUser && onToggleRecipient && (
                      <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center ${
                        selectedRecipients.includes(user.socketId) ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-600'
                      }`}>
                        {selectedRecipients.includes(user.socketId) && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center">
                      <p className={`text-sm font-medium truncate ${
                        isCurrentUser ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-gray-200'
                      }`}>
                        {user.nickname}
                        {isCurrentUser && ' (You)'}
                      </p>
                      {isFirstUser && (
                        <Crown className="w-3 h-3 text-yellow-500 ml-1.5 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserList;
