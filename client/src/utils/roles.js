/**
 * Role management utilities for Ephemeral Chat
 * Defines role hierarchy and permissions
 */

// Role definitions in order of hierarchy (highest to lowest)
export const ROLES = {
  HOST: 'host',
  TIER1: 'tier1',
  TIER2: 'tier2',
  USER: 'user'
};

// Role display names and badges
export const ROLE_INFO = {
  [ROLES.HOST]: {
    label: 'Host',
    badge: '👑',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30'
  },
  [ROLES.TIER1]: {
    label: 'Admin',
    badge: '⭐',
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30'
  },
  [ROLES.TIER2]: {
    label: 'Mod',
    badge: '🛡️',
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30'
  },
  [ROLES.USER]: {
    label: 'User',
    badge: '',
    color: 'text-gray-500',
    bgColor: ''
  }
};

// Role hierarchy for permission checking
const ROLE_HIERARCHY = {
  [ROLES.HOST]: 4,
  [ROLES.TIER1]: 3,
  [ROLES.TIER2]: 2,
  [ROLES.USER]: 1
};

/**
 * Check if a role has higher or equal authority than another
 */
export const hasAuthority = (userRole, targetRole) => {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[targetRole];
};

/**
 * Check if a user can kick another user based on roles
 * Host can kick anyone except self
 * Tier1 can kick tier2 and regular users
 */
export const canKick = (kickerRole, targetRole) => {
  if (kickerRole === ROLES.HOST) {
    return true; // Host can kick anyone
  }
  if (kickerRole === ROLES.TIER1) {
    return targetRole === ROLES.TIER2 || targetRole === ROLES.USER;
  }
  return false;
};

/**
 * Check if a user can promote/demote another user
 * Only host can change roles
 */
export const canChangeRole = (userRole) => {
  return userRole === ROLES.HOST;
};

/**
 * Check if a user can manage guests (approve/deny)
 * Host and Tier1 can manage guests
 */
export const canManageGuests = (userRole) => {
  return userRole === ROLES.HOST || userRole === ROLES.TIER1;
};

/**
 * Check if a user can manage room settings (vibe, topic, timer)
 * Host, Tier1, and Tier2 can manage room settings
 */
export const canManageRoom = (userRole) => {
  return userRole === ROLES.HOST || userRole === ROLES.TIER1 || userRole === ROLES.TIER2;
};

/**
 * Get available roles that a user can assign to others
 * Only host can assign roles
 */
export const getAssignableRoles = (userRole) => {
  if (userRole === ROLES.HOST) {
    return [ROLES.TIER1, ROLES.TIER2, ROLES.USER];
  }
  return [];
};
