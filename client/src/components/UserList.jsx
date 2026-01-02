import React from 'react';
import { Users, Crown, User } from 'lucide-react';

const UserList = ({ users, currentUser }) => {
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
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-gray-600" />
          <h3 className="font-medium text-gray-900">
            Participants ({users.length})
          </h3>
        </div>
      </div>

      {/* User List */}
      <div className="flex-1 overflow-y-auto p-4">
        {users.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <User className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No users online</p>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user, index) => {
              const isCurrentUser = currentUser && user.socketId === currentUser.socketId;
              const isFirstUser = index === 0; // First user is considered room creator

              return (
                <div
                  key={user.socketId || user.id || index}
                  className={`flex items-center space-x-3 p-2 rounded-lg ${isCurrentUser ? 'bg-primary-50 border border-primary-200' : 'hover:bg-gray-50'
                    }`}
                >
                  {/* Avatar */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${getAvatarColor(user.nickname)}`}>
                    {getInitials(user.nickname)}
                  </div>

                  {/* User Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <p className={`text-sm font-medium truncate ${isCurrentUser ? 'text-primary-900' : 'text-gray-900'
                        }`}>
                        {user.nickname}
                        {isCurrentUser && (
                          <span className="text-xs text-primary-600 ml-1">(You)</span>
                        )}
                      </p>

                      {/* Room creator indicator */}
                      {isFirstUser && (
                        <Crown className="w-3 h-3 text-yellow-500" title="Room Creator" />
                      )}
                    </div>

                    {/* Online status */}
                    <div className="flex items-center space-x-1">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <span className="text-xs text-gray-500">Online</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <div className="text-xs text-gray-600 space-y-1">
          <p>• Users are anonymous</p>
          <p>• No data is stored permanently</p>
          <p>• Room expires after inactivity</p>
        </div>
      </div>
    </div>
  );
};

export default UserList;
