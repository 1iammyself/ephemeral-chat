import React, { useState } from 'react';
import { Users, Crown, User, Check, X, ChevronDown, Shield, UserX, Info, Zap } from 'lucide-react';
import { ROLES, ROLE_INFO, canKick, canChangeRole, canManageGuests, getAssignableRoles } from '../utils/roles';
import { hapticSuccess } from '../utils/platform';

const UserList = ({
  users,
  currentUser,
  pendingGuests = [],
  isHost = false,
  onApprove,
  onDeny,
  selectedRecipients = [],
  onToggleRecipient,
  onSetUserRole,
  onKickUser,
  currentUserRole = ROLES.USER,
  onShowActivityLogs,
  hasNewLogs = false,
  verbalCode = null,
  roomVibe
}) => {
  const [expandedUser, setExpandedUser] = useState(null);

  const vibeAccent = roomVibe === 'party' ? 'indigo' :
    roomVibe === 'chill' ? 'teal' :
      roomVibe === 'focus' ? 'orange' : 'primary';

  const getInitials = (nickname) => {
    return nickname
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getAvatarColor = (nickname) => {
    const colors = [
      'bg-red-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-blue-400',
      'bg-pink-500',
      'bg-blue-600',
      'bg-teal-500'
    ];

    let hash = 0;
    for (let i = 0; i < nickname.length; i++) {
      hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
  };

  const getUserRole = (user) => {
    return user.role || ROLES.USER;
  };

  const handleRoleChange = (userId, newRole) => {
    if (onSetUserRole) {
      onSetUserRole(userId, newRole);
    }
    setExpandedUser(null);
  };

  const handleKick = (userId, nickname) => {
    if (onKickUser) {
      onKickUser(userId);
    }
    setExpandedUser(null);
  };

  const canManageGuestsCheck = canManageGuests(currentUserRole);

  return (
    <div className="h-full flex flex-col">
      {/* Pending Guests Section (Host and Tier1 Only) */}
      {canManageGuestsCheck && pendingGuests.length > 0 && (
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
                <div className="flex space-x-2 flex-shrink-0">
                  <button
                    onClick={() => onApprove(guest.socketId)}
                    className="p-2 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors shadow-sm"
                    title="Approve"
                  >
                    <Check className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => onDeny(guest.socketId)}
                    className="p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors shadow-sm"
                    title="Deny"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 transition-colors duration-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="font-medium text-gray-900 dark:text-white">
            Participants ({users.length})
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          {isHost && verbalCode && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(verbalCode);
                hapticSuccess();
              }}
              className="lg:hidden flex items-center space-x-1 px-2 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors border border-indigo-100 dark:border-indigo-800"
              title="Click to copy join code"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="font-bold text-[10px] uppercase tracking-wider">Code</span>
            </button>
          )}
          {onShowActivityLogs && (
            <button
              onClick={onShowActivityLogs}
              className={`p-1.5 rounded-lg transition-all relative ${hasNewLogs ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              title="Activity Log"
            >
              <Info className="w-5 h-5" />
              {hasNewLogs && <span className="absolute top-1 right-1 w-2 h-2 bg-primary-500 rounded-full border-2 border-white dark:border-gray-800"></span>}
            </button>
          )}
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
          <div className="space-y-2">
            {users.map((user, index) => {
              const isCurrentUser = currentUser && (user.socketId === currentUser.socketId || user.socketId === currentUser.id || user.id === currentUser.id);
              const userRole = getUserRole(user);
              const roleInfo = ROLE_INFO[userRole];
              const canKickUser = !isCurrentUser && canKick(currentUserRole, userRole);
              const canChangeUserRole = !isCurrentUser && canChangeRole(currentUserRole);
              const assignableRoles = getAssignableRoles(currentUserRole);
              const showAdminMenu = expandedUser === user.socketId && (canKickUser || canChangeUserRole);

              return (
                <div key={user.socketId || user.id || index} className="relative">
                  <div
                    className={`flex items-center space-x-3 p-2 rounded-lg transition-colors duration-200 cursor-pointer ${isCurrentUser
                      ? `bg-${vibeAccent}-50 dark:bg-${vibeAccent}-900/20`
                      : selectedRecipients.includes(user.socketId)
                        ? `bg-${vibeAccent}-50 dark:bg-${vibeAccent}-900/20 border border-${vibeAccent}-200 dark:border-${vibeAccent}-800`
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800 border border-transparent'
                      }`}
                    onClick={() => {
                      if (!isCurrentUser && onToggleRecipient) {
                        onToggleRecipient(user.socketId);
                      }
                    }}
                  >
                    <div className="relative">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm text-white font-medium shadow-sm ${getAvatarColor(user.nickname)}`}>
                        {getInitials(user.nickname)}
                      </div>
                      {!isCurrentUser && onToggleRecipient && (
                        <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center ${selectedRecipients.includes(user.socketId) ? `bg-${vibeAccent}-500` : 'bg-gray-200 dark:bg-gray-600'
                          }`}>
                          {selectedRecipients.includes(user.socketId) && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-medium truncate ${isCurrentUser ? `text-${vibeAccent}-700 dark:text-${vibeAccent}-300` : 'text-gray-900 dark:text-gray-200'
                          }`}>
                          {user.nickname}
                          {isCurrentUser && ' (You)'}
                        </p>
                        {/* Role Badge */}
                        {roleInfo.badge && (
                          <span className={`text-xs px-1.5 py-0.5 rounded-full ${roleInfo.bgColor} ${roleInfo.color} font-medium`}>
                            {roleInfo.badge} {roleInfo.label}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Admin Controls Toggle */}
                    {(canKickUser || canChangeUserRole) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedUser(expandedUser === user.socketId ? null : user.socketId);
                        }}
                        className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors"
                      >
                        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${showAdminMenu ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Admin Actions Menu */}
                  {showAdminMenu && (
                    <div className="mt-1 ml-11 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                      {/* Role Selection */}
                      {canChangeUserRole && assignableRoles.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center">
                            <Shield className="w-3 h-3 mr-1" />
                            Change Role
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {assignableRoles.map(role => (
                              <button
                                key={role}
                                onClick={() => handleRoleChange(user.socketId, role)}
                                className={`text-xs px-2 py-1 rounded-full transition-colors ${userRole === role
                                  ? `${ROLE_INFO[role].bgColor} ${ROLE_INFO[role].color} ring-2 ring-offset-1 ring-gray-300 dark:ring-gray-600`
                                  : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                  }`}
                              >
                                {ROLE_INFO[role].badge} {ROLE_INFO[role].label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* Kick Button */}
                      {canKickUser && (
                        <button
                          onClick={() => handleKick(user.socketId, user.nickname)}
                          className="w-full flex items-center justify-center space-x-1 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors text-sm font-medium"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Kick User</span>
                        </button>
                      )}
                    </div>
                  )}
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
