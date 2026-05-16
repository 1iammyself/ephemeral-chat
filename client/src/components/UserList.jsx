import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Crown, User, Check, X, ChevronDown, Shield, UserX, Info, Zap, Radio, ToggleLeft, ToggleRight, Upload, Plus, Trash2, ClipboardList, GitFork } from 'lucide-react';
import { ROLES, ROLE_INFO, canKick, canChangeRole, canManageGuests, getAssignableRoles } from '../utils/roles';
import { hapticSuccess } from '../utils/platform';
import { getVibeById } from '../utils/vibes';

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
  roomVibe,
  onWatchParty,
  autoApprove = false,
  onToggleAutoApprove,
  preApprovedList = [],
  onUpdatePreApprovedList,
  onPreApprovedFileUpload,
  parsePreApprovedText,
  onForkRoom,
}) => {
  const { t } = useTranslation();
  const [expandedUser, setExpandedUser] = useState(null);
  const [showPreApprovedPanel, setShowPreApprovedPanel] = useState(false);
  const [forkMode, setForkMode] = useState(false);
  const [forkTargets, setForkTargets] = useState(new Set());
  const [newPreApprovedName, setNewPreApprovedName] = useState('');
  const [newPreApprovedRole, setNewPreApprovedRole] = useState('none');
  const fileInputRef = useRef(null);

  const vibe = getVibeById(roomVibe);
  const vibeAccent = vibe.accent || 'primary';
  const useTransparentDarkStyle = ['default', 'party', 'jazz'].includes(roomVibe);

  const canManageRoom = canManageGuests(currentUserRole);

  const getInitials = (nickname) => {
    if (!nickname) return '';
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const initials = nickname
      .split(' ')
      .filter(word => word.length > 0)
      .map(word => {
        const segments = [...segmenter.segment(word)];
        return segments.length > 0 ? segments[0].segment : '';
      })
      .join('');
    const finalSegments = [...segmenter.segment(initials)];
    return finalSegments
      .slice(0, 2)
      .map(s => s.segment)
      .join('')
      .toUpperCase();
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

  const handleKick = (userId) => {
    if (onKickUser) {
      onKickUser(userId);
    }
    setExpandedUser(null);
  };

  const handleAddPreApproved = () => {
    if (!newPreApprovedName.trim()) return;
    const updated = [...preApprovedList, { name: newPreApprovedName.trim(), role: newPreApprovedRole }];
    if (onUpdatePreApprovedList) onUpdatePreApprovedList(updated);
    setNewPreApprovedName('');
    setNewPreApprovedRole('none');
    hapticSuccess();
  };

  const handleRemovePreApproved = (index) => {
    const updated = preApprovedList.filter((_, i) => i !== index);
    if (onUpdatePreApprovedList) onUpdatePreApprovedList(updated);
  };

  const handlePreApprovedRoleChange = (index, role) => {
    const updated = preApprovedList.map((entry, i) => i === index ? { ...entry, role } : entry);
    if (onUpdatePreApprovedList) onUpdatePreApprovedList(updated);
  };

  const canManageGuestsCheck = canManageGuests(currentUserRole);

  return (
    <div className="h-full flex flex-col">
      {/* Pending Guests Section (Host and Tier1 Only) */}
      {canManageGuestsCheck && pendingGuests.length > 0 && (
        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 transition-colors duration-200">
          <h3 className="font-black text-yellow-800 dark:text-yellow-400 mb-2 text-[10px] uppercase tracking-widest flex items-center">
            <Users className="w-3 h-3 mr-1.5" />
            {t('userList.waitingRoom', { count: pendingGuests.length })}
          </h3>
          <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-thin">
            {pendingGuests.map(guest => (
              <div key={guest.socketId} className="flex items-center justify-between bg-white dark:bg-gray-800 p-1.5 sm:p-2 rounded-xl border border-yellow-300 dark:border-yellow-900/30 shadow-sm transition-colors duration-200">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <div className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center text-[10px] sm:text-xs text-white font-black tracking-tighter ${getAvatarColor(guest.nickname)}`}>
                    {getInitials(guest.nickname)}
                  </div>
                  <span className="font-bold text-[13px] sm:text-sm truncate text-gray-900 dark:text-gray-200 tracking-tight">{guest.nickname}</span>
                </div>
                <div className="flex space-x-1 sm:space-x-2 flex-shrink-0">
                  <button
                    onClick={() => onApprove(guest.socketId)}
                    className={`p-1.5 sm:p-2 ${vibe.accentClass} text-white rounded-lg sm:rounded-full hover:shadow-md transition-all shadow-sm active:scale-95`}
                    title="Approve"
                  >
                    <Check className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <button
                    onClick={() => onDeny(guest.socketId)}
                    className="p-1.5 sm:p-2 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg sm:rounded-full hover:bg-red-200 dark:hover:bg-red-900/50 transition-all shadow-sm active:scale-95"
                    title="Deny"
                  >
                    <X className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Host Controls: Auto-Approve & Pre-Approved List */}
      {canManageRoom && (
        <div className="border-b border-gray-200 dark:border-gray-700/50 transition-colors duration-200">
          {/* Auto-Approve Toggle */}
          <div className="px-3 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Shield className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300 tracking-tight truncate">{t('userList.autoApprove')}</span>
            </div>
            <button
              onClick={onToggleAutoApprove}
              className={`flex-shrink-0 transition-all active:scale-95 ${autoApprove ? 'text-green-500' : 'text-gray-400 dark:text-gray-500'}`}
              title={autoApprove ? t('userList.autoApproveOn') : t('userList.autoApproveOff')}
            >
              {autoApprove ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
            </button>
          </div>

          {/* Pre-Approved List Toggle */}
          <button
            onClick={() => setShowPreApprovedPanel(!showPreApprovedPanel)}
            className="w-full px-3 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <ClipboardList className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              <span className="text-xs font-bold text-gray-600 dark:text-gray-300 tracking-tight truncate">
                {t('userList.preApprovedList')}
              </span>
              {preApprovedList.length > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full bg-${vibeAccent}-100 dark:bg-${vibeAccent}-900/30 text-${vibeAccent}-600 dark:text-${vibeAccent}-400 font-black`}>
                  {preApprovedList.length}
                </span>
              )}
            </div>
            <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 flex-shrink-0 ${showPreApprovedPanel ? 'rotate-180' : ''}`} />
          </button>

          {/* Pre-Approved List Panel */}
          {showPreApprovedPanel && (
            <div className="px-3 pb-3 space-y-2">
              {/* Add User Input */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newPreApprovedName}
                  onChange={(e) => setNewPreApprovedName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddPreApproved(); }}
                  placeholder={t('userList.usernamePlaceholder')}
                  className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary-400"
                  maxLength={20}
                />
                <select
                  value={newPreApprovedRole}
                  onChange={(e) => setNewPreApprovedRole(e.target.value)}
                  className="w-[72px] px-1 py-1.5 text-[10px] bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
                >
                  <option value="none">{t('userList.roleUser')}</option>
                  <option value="admin">{t('userList.roleAdmin')}</option>
                  <option value="mod">{t('userList.roleMod')}</option>
                </select>
                <button
                  onClick={handleAddPreApproved}
                  disabled={!newPreApprovedName.trim()}
                  className={`p-1.5 ${vibe.accentClass} text-white rounded-lg disabled:opacity-40 transition-all active:scale-95 flex-shrink-0`}
                  title={t('userList.addUser')}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* File Upload */}
              <div className="flex gap-1.5">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-widest bg-gray-100 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-all active:scale-[0.98]"
                >
                  <Upload className="w-3 h-3" />
                  {t('userList.importTxt')}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt"
                  onChange={onPreApprovedFileUpload}
                  className="hidden"
                />
              </div>

              {/* Format Hint */}
              <p className="text-[9px] text-gray-400 dark:text-gray-500 leading-snug">
                {t('userList.formatHint')} <code className="text-[9px] bg-gray-100 dark:bg-gray-700 px-1 rounded">user1(admin),user2,user3(mod)</code>
              </p>

              {/* Current List */}
              {preApprovedList.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto scrollbar-thin">
                  {preApprovedList.map((entry, index) => (
                    <div key={`${entry.name}-${index}`} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/60 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700/50">
                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] text-white font-black ${getAvatarColor(entry.name)}`}>
                          {getInitials(entry.name)}
                        </div>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{entry.name}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <select
                          value={entry.role || 'none'}
                          onChange={(e) => handlePreApprovedRoleChange(index, e.target.value)}
                          className="w-[58px] px-0.5 py-0.5 text-[9px] bg-transparent border border-gray-200 dark:border-gray-600 rounded text-gray-600 dark:text-gray-400 focus:outline-none"
                        >
                          <option value="none">{t('userList.roleUser')}</option>
                          <option value="admin">{t('userList.roleAdmin')}</option>
                          <option value="mod">{t('userList.roleMod')}</option>
                        </select>
                        <button
                          onClick={() => handleRemovePreApproved(index)}
                          className="p-1 text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors active:scale-95"
                          title={t('userList.remove')}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {preApprovedList.length === 0 && (
                <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 py-2 italic">
                  {t('userList.noPreApproved')}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Fork Room bar */}
      {forkMode && (
        <div className="px-3 py-2 flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800/30">
          <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex-1">
            {forkTargets.size === 0 ? t('userList.selectToFork') : t('userList.selectedCount', { count: forkTargets.size })}
          </span>
          <button
            onClick={() => {
              if (forkTargets.size > 0 && onForkRoom) {
                onForkRoom([...forkTargets]);
                setForkMode(false);
                setForkTargets(new Set());
              }
            }}
            disabled={forkTargets.size === 0}
            className="px-3 py-1 text-xs font-bold rounded-lg bg-indigo-500 text-white disabled:opacity-40 hover:bg-indigo-600 transition-colors active:scale-95"
          >
            {t('userList.forkRoom')}
          </button>
          <button
            onClick={() => { setForkMode(false); setForkTargets(new Set()); }}
            className="p-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-800/40 transition-colors"
          >
            <X className="w-3.5 h-3.5 text-indigo-500" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="p-3 sm:p-4 transition-colors duration-200 flex items-center justify-between bg-black/10 dark:bg-white/5 backdrop-blur-sm border-b border-black/5 dark:border-white/5">
        <div className="flex items-center space-x-2">
          <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="font-black text-sm sm:text-base text-gray-900 dark:text-white tracking-tight">
            {t('userList.participants', { count: users.length })}
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          {isHost && onForkRoom && users.length > 1 && (
            <button
              onClick={() => { setForkMode(f => !f); setForkTargets(new Set()); }}
              className={`p-1.5 rounded-lg transition-all ${forkMode ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              title={t('userList.forkRoomTitle')}
            >
              <GitFork className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          )}
          {onShowActivityLogs && (
            <button
              onClick={onShowActivityLogs}
              className={`p-1.5 rounded-lg transition-all relative ${hasNewLogs ? 'text-primary-500 bg-primary-50 dark:bg-primary-900/20 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              title={t('userList.activityLog')}
            >
              <Info className="w-4 h-4 sm:w-5 sm:h-5" />
              {hasNewLogs && <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-primary-500 rounded-full border border-white dark:border-gray-800"></span>}
            </button>
          )}
        </div>
      </div>

      {/* User List */}
      <div className="flex-1 overflow-y-auto p-2 sm:p-4 pb-16 scrollbar-thin">
        {users.length === 0 ? (
          <div className="text-center text-gray-600 dark:text-gray-400 py-8">
            <User className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-semibold">{t('userList.noUsersOnline')}</p>
          </div>
        ) : (
          <div className="space-y-1 sm:space-y-2">
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
                    className={`flex items-center space-x-2.5 p-1.5 sm:p-2 rounded-xl transition-all duration-200 cursor-pointer ${isCurrentUser
                      ? `bg-${vibeAccent}-100 ${useTransparentDarkStyle ? 'dark:bg-transparent' : `dark:bg-${vibeAccent}-900/40`} shadow-sm border border-${vibeAccent}-200 ${useTransparentDarkStyle ? 'dark:border-transparent' : `dark:border-${vibeAccent}-800/30`}`
                      : selectedRecipients.includes(user.socketId)
                        ? `bg-${vibeAccent}-100 ${useTransparentDarkStyle ? 'dark:bg-transparent' : `dark:bg-${vibeAccent}-900/40`} border border-${vibeAccent}-400 ${useTransparentDarkStyle ? 'dark:border-transparent' : `dark:border-${vibeAccent}-600`} shadow-sm`
                        : `hover:bg-${vibeAccent}-50 dark:hover:bg-gray-800/80 border border-transparent`
                      }`}
                    onClick={() => {
                      if (forkMode && !isCurrentUser) {
                        setForkTargets(prev => {
                          const next = new Set(prev);
                          next.has(user.socketId) ? next.delete(user.socketId) : next.add(user.socketId);
                          return next;
                        });
                        return;
                      }
                      if (!isCurrentUser && onToggleRecipient) {
                        onToggleRecipient(user.socketId);
                      }
                    }}
                  >
                    <div className="relative">
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-[10px] sm:text-xs text-white font-black tracking-tighter shadow-md shadow-black/10 ring-2 ring-white/10 ${getAvatarColor(user.nickname)}`}>
                        {getInitials(user.nickname)}
                      </div>
                      {!isCurrentUser && (forkMode || onToggleRecipient) && (
                        <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center ${
                          forkMode
                            ? forkTargets.has(user.socketId) ? 'bg-indigo-500' : 'bg-gray-200 dark:bg-gray-600'
                            : selectedRecipients.includes(user.socketId) ? `bg-${vibeAccent}-500` : 'bg-gray-200 dark:bg-gray-600'
                          }`}>
                          {(forkMode ? forkTargets.has(user.socketId) : selectedRecipients.includes(user.socketId)) && <Check className="w-2 h-2 sm:w-2.5 sm:h-2.5 text-white stroke-[3]" />}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-1.5">
                        <p className={`text-[13px] sm:text-sm font-bold truncate tracking-tight ${isCurrentUser ? `text-${vibeAccent}-700 dark:text-${vibeAccent}-300` : 'text-gray-900 dark:text-gray-200'
                          }`}>
                          {user.nickname}
                          {isCurrentUser && <span className="opacity-60 font-medium ml-1">{t('userList.you')}</span>}
                        </p>
                        {/* Role Badge */}
                        {roleInfo.badge && (
                          <span className={`w-fit text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded-full ${roleInfo.bgColor} ${roleInfo.color} font-black uppercase tracking-widest`}>
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
                        className="p-1 sm:p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-all active:scale-95"
                      >
                        <ChevronDown className={`w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400 transition-transform ${showAdminMenu ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Admin Actions Menu */}
                  {showAdminMenu && (
                    <div className="mt-1 ml-11 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 space-y-2">
                      {/* Role Selection */}
                      {canChangeUserRole && assignableRoles.length > 0 && (
                        <div>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 flex items-center">
                            <Shield className="w-3 h-3 mr-1" />
                            {t('userList.changeRole')}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {assignableRoles.map(role => (
                              <button
                                key={role}
                                onClick={() => handleRoleChange(user.socketId, role)}
                                className={`text-xs px-2 py-1 rounded-full transition-colors ${userRole === role
                                  ? `${ROLE_INFO[role].bgColor} ${ROLE_INFO[role].color} ring-2 ring-offset-1 ring-gray-400 dark:ring-gray-600`
                                  : 'bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-400 dark:hover:bg-gray-600'
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
                          onClick={() => handleKick(user.socketId)}
                          className="w-full flex items-center justify-center space-x-1 px-3 py-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors text-sm font-medium"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>{t('userList.kickUser')}</span>
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
