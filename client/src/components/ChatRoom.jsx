import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Send,
  Users,
  Copy,
  ArrowLeft,
  Wifi,
  WifiOff,
  Clock,
  Lock,
  X,
  Phone,
  PhoneOff,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Mic,
  UserX,
  Smile,
  BarChart2,
  Plus,
  Edit2,
  Zap,
  Reply,
  FileText,
  Activity,
  Info,
  Camera,
  PanelLeft,
  PanelRight,
  GripVertical
} from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useTheme } from '../context/ThemeContext';
import socketManager from '../socket';
import JoinRoomModal from './JoinRoomModal';
import MessageList from './MessageList';
import UserList from './UserList';
import AudioCallModal from './AudioCallModal';
import PollModal from './PollModal';
import webRTCService, { CallState } from '../webrtc';
import { encryptMessage, decryptMessage } from '../utils/security';
import { Mp3Recorder } from '../utils/mp3Recorder';
import ThemeToggle from './ThemeToggle';
import PrivacyOverlay from './PrivacyOverlay';
import GhostWatermark from './GhostWatermark';
import TopicEditor from './TopicEditor';
import TimerModal from './TimerModal';
import EditMessageModal from './EditMessageModal';
import DragDropOverlay from './DragDropOverlay';
import ActivityLog from './ActivityLog';
import CameraModal from './CameraModal';
import { getVibeById, getAllVibes } from '../utils/vibes';
import { canManageRoom } from '../utils/roles';
import { getRandomIcebreaker } from '../utils/icebreakers';
import { RefreshButton } from './PWAHandler';
import { getCreatorId } from '../utils/creator';
import FileTransferModal from './FileTransferModal';
import { toast } from 'react-toastify';

const SLASH_COMMANDS = [
  { icon: Camera, label: 'Camera', value: '/camera', desc: 'Take a photo' },
  { icon: BarChart2, label: 'Poll', value: '/poll', desc: 'Create a new poll' },
  { icon: Phone, label: 'Voice Call', value: '/call', desc: 'Start a voice call' },
  { icon: ImageIcon, label: 'Photo', value: '/photo', desc: 'Upload an image' },
  { icon: Mic, label: 'Voice Note', value: '/voice', desc: 'Record a voice note' },
  { icon: Smile, label: 'Icebreaker', value: '/ice', desc: 'Send a random question' },
  { icon: Zap, label: 'Pulse', value: '/pulse', desc: 'Shake the room' },
  { icon: Edit2, label: 'Topic', value: '/topic', desc: 'Set room topic', adminOnly: true },
  { icon: Clock, label: 'Timer', value: '/timer', desc: 'Start a countdown', adminOnly: true },
  { icon: Activity, label: 'Vibe', value: '/vibe', desc: 'Change room vibe', adminOnly: true }
];

// Safari detection (robust hybrid check)
function isSafariBrowser() {
  const ua = navigator.userAgent;
  const isWebKit = ua.includes('AppleWebKit');
  const isNotChrome = !ua.includes('Chrome') && !ua.includes('CriOS');
  const isNotFirefox = !ua.includes('FxiOS');
  return isWebKit && isNotChrome && isNotFirefox;
}

const ChatRoom = () => {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [isConnected, setIsConnected] = useState(socketManager.isConnected);
  const [isJoined, setIsJoined] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(true);
  const [isProcessingInvite, setIsProcessingInvite] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [fileTransferInvites, setFileTransferInvites] = useState([]);

  // Sidebar State
  const [sidebarPosition, setSidebarPosition] = useState('right');
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const sidebarRef = useRef(null);

  // Sidebar Resize Logic
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isResizingSidebar) return;

      let newWidth;
      if (sidebarPosition === 'right') {
        newWidth = window.innerWidth - e.clientX;
      } else {
        newWidth = e.clientX;
      }

      // Constrain width
      if (newWidth < 200) newWidth = 200;
      if (newWidth > 600) newWidth = 600;

      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
    };

    if (isResizingSidebar) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none'; // Prevent text selection while resizing
    } else {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingSidebar, sidebarPosition]);

  // Visual Viewport handler for mobile keyboard and browser chrome - IMPROVED FOR ANDROID
  // This entire useEffect should REPLACE the existing viewport handler (lines 142-205 in ChatRoom.jsx)
  useEffect(() => {
    // Detect mobile OS
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    const isAndroid = /Android/.test(navigator.userAgent);

    // Track if an input is currently focused
    let inputFocused = false;

    // Store the initial viewport height (before keyboard)
    let initialHeight = window.innerHeight;
    let initialVisualHeight = window.visualViewport?.height || window.innerHeight;

    const updateViewportHeight = () => {
      const vv = window.visualViewport;

      if (vv) {
        // On iOS Safari, visualViewport.height includes the keyboard
        // But it may also include an offset from the top when page scrolls
        const visualHeight = vv.height;
        const visualOffsetTop = vv.offsetTop || 0;

        // Calculate height difference from the initial visual viewport
        const heightDiff = initialVisualHeight - visualHeight;

        // Keyboard detection:
        // - Android: use a lower threshold (100px)
        // - iOS: use the height difference plus check if input is focused
        const keyboardThreshold = isAndroid ? 100 : 150;
        const keyboardLikelyOpen = inputFocused && heightDiff > keyboardThreshold;

        let targetHeight;
        if (keyboardLikelyOpen) {
          // Keyboard is open - use visual viewport height
          // On iOS, this should be the height above the keyboard
          targetHeight = visualHeight;
        } else {
          // No keyboard - use window inner height
          targetHeight = window.innerHeight;
        }

        // For iOS with keyboard open, also account for any scroll offset
        if (isIOS && keyboardLikelyOpen && visualOffsetTop > 0) {
          // Page has scrolled, adjust for this
          targetHeight = visualHeight - visualOffsetTop;
        }

        // Update CSS custom properties
        document.documentElement.style.setProperty('--vh', `${targetHeight * 0.01}px`);
        document.documentElement.style.setProperty('--chat-height', `${targetHeight}px`);
        document.documentElement.style.setProperty('--keyboard-height', keyboardLikelyOpen ? `${heightDiff}px` : '0px');

        // Debug: log values for iOS troubleshooting
        if (isIOS && inputFocused) {
          console.log('[iOS Keyboard]', {
            visualHeight,
            innerHeight: window.innerHeight,
            initialVisualHeight,
            heightDiff,
            targetHeight,
            keyboardLikelyOpen,
            visualOffsetTop
          });
        }
      } else {
        // Fallback for browsers without visualViewport
        const vh = window.innerHeight;
        document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
        document.documentElement.style.setProperty('--keyboard-height', '0px');
        document.documentElement.style.setProperty('--chat-height', `${vh}px`);
      }
    };

    const scrollToTop = () => {
      // Prevent page scroll on Android
      if (isAndroid) {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }
    };

    // Input focus handlers to track keyboard state
    const handleFocusIn = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        inputFocused = true;

        // Android-specific: Force viewport update after a short delay
        if (isAndroid) {
          setTimeout(() => {
            updateViewportHeight();
            scrollToTop();
          }, 100);

          // Additional update after keyboard animation completes
          setTimeout(() => {
            updateViewportHeight();
          }, 400);
        } else if (isIOS) {
          // iOS-specific: Add class to trigger fixed positioning CSS
          document.body.classList.add('ios-keyboard-open');

          // Update viewport height multiple times during keyboard animation
          setTimeout(() => {
            updateViewportHeight();
          }, 50);
          setTimeout(() => {
            updateViewportHeight();
          }, 150);
          setTimeout(() => {
            updateViewportHeight();
          }, 300);
          setTimeout(() => {
            updateViewportHeight();
          }, 500);
        } else {
          updateViewportHeight();
        }
      }
    };

    const handleFocusOut = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        inputFocused = false;

        // Android-specific: Force viewport update after keyboard closes
        if (isAndroid) {
          setTimeout(() => {
            updateViewportHeight();
            scrollToTop();
          }, 100);
        } else if (isIOS) {
          // iOS-specific: Remove class and reset after keyboard closes
          setTimeout(() => {
            document.body.classList.remove('ios-keyboard-open');
            updateViewportHeight();
          }, 100);
        } else {
          setTimeout(() => {
            updateViewportHeight();
          }, 100);
        }
      }
    };

    // Initial setup
    updateViewportHeight();
    scrollToTop();

    // Listen for viewport changes
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportHeight);
      window.visualViewport.addEventListener('scroll', scrollToTop);
    }

    // Listen for window resize (fallback)
    window.addEventListener('resize', updateViewportHeight);

    // Listen for input focus/blur to track keyboard state
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    // Android-specific: Prevent scroll when input is focused
    if (isAndroid) {
      const preventScroll = (e) => {
        if (inputFocused) {
          window.scrollTo(0, 0);
        }
      };
      window.addEventListener('scroll', preventScroll, { passive: false });

      return () => {
        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', updateViewportHeight);
          window.visualViewport.removeEventListener('scroll', scrollToTop);
        }
        window.removeEventListener('resize', updateViewportHeight);
        window.removeEventListener('scroll', preventScroll);
        document.removeEventListener('focusin', handleFocusIn);
        document.removeEventListener('focusout', handleFocusOut);
      };
    }

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateViewportHeight);
        window.visualViewport.removeEventListener('scroll', scrollToTop);
      }
      window.removeEventListener('resize', updateViewportHeight);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [inviteToken, setInviteToken] = useState(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [callState, setCallState] = useState({ state: CallState.IDLE });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Floating Reactions State
  const reactionLayerRef = useRef(null);
  const lastReactionTime = useRef(0);

  // Knock-to-Join & Host State
  const [isWaitingForHost, setIsWaitingForHost] = useState(false);
  const [pendingGuests, setPendingGuests] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [roomKey, setRoomKey] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('user');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showFeatureMenu, setShowFeatureMenu] = useState(false);
  const [roomVibe, setRoomVibe] = useState('default');
  const [roomTopic, setRoomTopic] = useState('');
  const [showTopicEditor, setShowTopicEditor] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [activeTimer, setActiveTimer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [editingMessage, setEditingMessage] = useState(null);
  const [latency, setLatency] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [showActivityLogs, setShowActivityLogs] = useState(false);
  const [hasNewLogs, setHasNewLogs] = useState(false);
  const [offsets, setOffsets] = useState({ topic: 0, timer: 0 });
  const [dragState, setDragState] = useState(null); // { type: 'topic' | 'timer', startX: number, startOffset: number }
  const [sessionToken, setSessionToken] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Suggestions State
  const [suggestions, setSuggestions] = useState({ show: false, type: null, items: [], index: 0, query: '' });
  const suggestionRef = useRef(null);
  const [safariNoticeShown, setSafariNoticeShown] = useState(() => {
    return localStorage.getItem('safariAudioNoticeShown') === 'true';
  });
  const dragCounter = useRef(0);
  const typingTimeoutRef = useRef(null);
  const { theme } = useTheme();

  const [audioViewOnce, setAudioViewOnce] = useState(true);



  const messageInputRef = useRef(null);

  useEffect(() => {
    if (!activeTimer) {
      if (timeLeft) setTimeLeft(null);
      return;
    }

    // Immediate update
    const update = () => {
      const remaining = Math.ceil((activeTimer.endTime - Date.now()) / 1000);
      if (remaining <= 0) {
        setTimeLeft('00:00');
        // Keep activeTimer until explicitly stopped or cleared by server
      } else {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [activeTimer]);

  const emojiPickerRef = useRef(null);
  const featureMenuRef = useRef(null);

  const mediaRecorderRef = useRef(null);
  const mp3RecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);
  const joinParamsRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Ref to track state without triggering re-renders in effects
  const stateRef = useRef({
    isJoined: false,
    sessionToken: null
  });

  useEffect(() => {
    stateRef.current.isJoined = isJoined;
    stateRef.current.sessionToken = sessionToken;
  }, [isJoined, sessionToken]);

  // Check for invite token and room key
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tokenFromUrl = searchParams.get('token');
    if (location.state?.inviteToken) {
      setInviteToken(location.state.inviteToken);
    } else if (tokenFromUrl) {
      setInviteToken(tokenFromUrl);
    }
    const hash = window.location.hash.substring(1);
    if (hash) setRoomKey(hash);
  }, [location]);

  const triggerPulse = useCallback(() => {
    if (navigator.vibrate) {
      try {
        navigator.vibrate([50, 50, 50]);
      } catch (e) {
        // Ignore vibration errors
      }
    }
    const container = document.querySelector('.chat-container');
    if (container) {
      container.classList.remove('animate-shake');
      // Trigger reflow
      void container.offsetWidth;
      container.classList.add('animate-shake');
      setTimeout(() => container.classList.remove('animate-shake'), 500);
    }
  }, []);

  const performJoin = useCallback((params) => {
    const { nickname, password, capToken, inviteToken } = params;
    const userId = getCreatorId(); // Use persistent device ID for participation tracking
    const joinData = { roomCode, nickname, password, capToken, userId };
    if (inviteToken) joinData.inviteToken = inviteToken;

    socketManager.emit('join-room', joinData, async (response) => {
      if (!response) {
        setError('No response from server');
        setIsProcessingInvite(false);
        return;
      }
      if (response.redirect) {
        navigate(`/room/${response.roomCode}`, {
          state: { fromInvite: true, nickname, inviteToken }
        });
        return;
      }
      if (response.success) {
        setIsConnected(true);
        setRoom(response.room);
        let msgs = response.messages || [];
        if (roomKey) {
          msgs = await Promise.all(msgs.map(async (msg) => {
            if (msg.isEncrypted) {
              try {
                const decrypted = await decryptMessage(msg.content, msg.iv, roomKey);
                return { ...msg, content: decrypted };
              } catch (e) {
                return { ...msg, content: '⚠️ Decryption failed' };
              }
            }
            return msg;
          }));
        }
        setMessages(msgs);
        setUsers(response.room?.users || []);

        const myRole = response.room.userRoles?.[socketManager.socket?.id] || (response.room.hostId === socketManager.socket?.id ? 'host' : 'user');
        setCurrentUserRole(myRole);
        setRoomVibe(response.room.vibe || 'default');
        setRoomTopic(response.room.topic || '');
        setActiveTimer(response.room.timer);
        socketManager.setRoomType(response.room.settings?.persistenceMode || 'ephemeral');

        setCurrentUser({ id: socketManager.socket?.id, socketId: socketManager.socket?.id, nickname: response.nickname, isAdmin: myRole === 'host' || myRole === 'tier1' });

        if (response.sessionToken) {
          setSessionToken(response.sessionToken);
        }

        setIsJoined(true);
        setShowJoinModal(false);
        setIsProcessingInvite(false);
        setIsWaitingForHost(false);
        setIsReconnecting(false);
        setError(null);
        return;
      }
      setError(response.error || 'Failed to join room');
      setIsProcessingInvite(false);
      setIsWaitingForHost(false);
      setIsReconnecting(false); // Stop spinner
      if (response.error && response.error.includes('not found')) {
        setIsJoined(false); // Kick user out if room is gone
      }
    });
  }, [roomCode, navigate, roomKey]);

  const spawnReaction = useCallback((emoji) => {
    if (!reactionLayerRef.current) return;
    if (reactionLayerRef.current.children.length > 30) return; // Cap nodes for performance

    const el = document.createElement("div");
    el.className = "floating-reaction";
    el.textContent = emoji;

    // Randomize position and rotation
    const x = Math.random() * 80 - 40; // -40vw to 40vw
    const r = Math.random() * 40 - 20; // -20deg to 20deg

    el.style.setProperty("--x", `${x}vw`);
    el.style.setProperty("--r", `${r}deg`);

    el.addEventListener("animationend", () => {
      el.remove();
    });

    reactionLayerRef.current.appendChild(el);
  }, []);

  const handleRoomReaction = useCallback((data) => {
    const { emoji } = data;
    spawnReaction(emoji);
  }, [spawnReaction]);

  const handleFileTransferInvite = useCallback(({ from, fromId, roomCode: targetRoomCode, recipients: targetedTo }) => {
    // Determine if we should show this
    const myId = socketManager.socket?.id;

    // CRITICAL: Ignore if this is from ourselves (sender should never see their own invite)
    if (!myId || fromId === myId) {
      console.log('[FileTransfer] Ignoring invite from self or no socket id', { fromId, myId });
      return;
    }

    if (targetRoomCode !== roomCode) return; // Ignore other rooms

    // If targeted, check if we are a recipient
    if (targetedTo && Array.isArray(targetedTo) && !targetedTo.includes(myId)) {
      return; // Not for us
    }

    // Add to activity log for recipient
    const log = {
      id: `log_ft_recv_${Date.now()}_${Math.random()}`,
      type: 'system',
      content: `${from} invited you to a secure file transfer`,
      timestamp: new Date().toISOString()
    };
    setActivityLogs(prev => {
      // Prevent duplicate activity log entries for the same invite
      if (prev.some(l => l.content === log.content && (Date.now() - new Date(l.timestamp).getTime() < 2000))) {
        return prev;
      }
      return [log, ...prev].slice(0, 50);
    });
    setHasNewLogs(true);

    // Trigger Pulse to alert the user visually
    triggerPulse();

    // Prevent duplicate toasts using fixed toastId
    if (toast.isActive('file-transfer-invite')) return;

    toast(({ closeToast }) => (
      <div className="flex flex-col gap-1.5 min-w-[240px] p-1">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
            <FileText className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
              {from}
            </h3>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium">
              Secure file transfer request
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={() => {
              closeToast();
              setShowFileModal(true);
            }}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            Open Files
          </button>
          <button
            onClick={closeToast}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-lg text-xs font-semibold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors active:scale-95"
          >
            Ignore
          </button>
        </div>
      </div>
    ), {
      toastId: 'file-transfer-invite',
      autoClose: false,
      position: "top-right",
      className: 'dark:bg-gray-900/90 dark:backdrop-blur-md border border-gray-100 dark:border-gray-800 rounded-2xl shadow-2xl p-2'
    });
  }, [roomCode, triggerPulse]);

  const sendRoomReaction = useCallback((emoji) => {
    const now = Date.now();
    if (now - lastReactionTime.current < 200) return; // Rate limit 5 per second locally
    lastReactionTime.current = now;

    socketManager.emit('send-room-reaction', { emoji });
    spawnReaction(emoji); // Show locally immediately

    // Haptics
    if (navigator.vibrate) navigator.vibrate(10);
  }, [spawnReaction]);

  useEffect(() => {
    const socket = socketManager.connect();
    const handleConnect = () => {
      setIsConnected(true);
      // Read current state from ref to avoid dependency cycle
      const { isJoined: joined, sessionToken: token } = stateRef.current;

      if (joined && token) {
        setIsReconnecting(true);
        // Auto-rejoin using session token and stored credentials to prevent random nickname generation
        const storedParams = joinParamsRef.current || {};
        performJoin({
          sessionToken: token,
          nickname: storedParams.nickname,
          password: storedParams.password,
          capToken: storedParams.capToken
        });
      }
    };
    socket.on('connect', handleConnect);

    // Initial check (only if not already joined, to avoid double-join logic)
    if (socket.connected && !stateRef.current.isJoined) {
      handleConnect();
    }

    const handleDisconnect = (reason) => {
      setIsConnected(false);
      if (reason === 'io server disconnect') {
        setError('You have been disconnected by the server');
      } else if (reason === 'transport close' || reason === 'ping timeout') {
        // Don't show full screen error for background disconnects if we can rejoin
        if (isJoined) {
          setIsReconnecting(true);
        } else {
          setError('Connection lost. Trying to reconnect...');
        }
      }
    };

    const handleRoomJoined = async (data) => {
      setIsConnected(true);
      setRoom(data.room);
      setUsers(data.users || []);
      let msgs = data.messages || [];
      if (roomKey) {
        msgs = await Promise.all(msgs.map(async (msg) => {
          if (msg.isEncrypted) {
            try {
              const decrypted = await decryptMessage(msg.content, msg.iv, roomKey);
              return { ...msg, content: decrypted };
            } catch (e) {
              return { ...msg, content: '⚠️ Decryption failed' };
            }
          }
          return msg;
        }));
      }
      setMessages(msgs);
      setUsers(data.users || []);

      const myRole = data.room.userRoles?.[socketManager.socket?.id] || (data.room.hostId === socketManager.socket?.id ? 'host' : 'user');
      setCurrentUserRole(myRole);
      setIsHost(myRole === 'host');
      setRoomVibe(data.room.vibe || 'default');
      setRoomTopic(data.room.topic || '');
      setActiveTimer(data.room.timer);
      socketManager.setRoomType(data.room.settings?.persistenceMode || 'ephemeral');

      setCurrentUser({ id: socketManager.socket?.id, socketId: socketManager.socket?.id, nickname: data.nickname, isAdmin: (myRole === 'host' || myRole === 'tier1') });
      setIsJoined(true);
      setShowJoinModal(false);
      setError(null);
    };

    const handleNewMessage = async (message) => {
      if (message.isEncrypted && roomKey) {
        try {
          const decrypted = await decryptMessage(message.content, message.iv, roomKey);
          message.content = decrypted;
        } catch (e) {
          message.content = '⚠️ Decryption failed';
        }
      }
      setMessages(prev => [...prev, message]);
    };

    const handleMessageDeleted = ({ messageId }) => setMessages(prev => prev.filter(m => m.id !== messageId));

    const handleUserJoined = ({ user, roomUsers }) => {
      if (Array.isArray(roomUsers)) setUsers(roomUsers);
      else if (user?.socketId) setUsers(prev => prev.some(u => u.socketId === user.socketId) ? prev : [...prev, user]);

      const displayName = user?.nickname || 'Someone';
      const log = { id: `log_${Date.now()}`, type: 'join', content: `${displayName} joined the room`, timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handleUserLeft = ({ nickname, socketId, userCount }) => {
      if (socketId) setUsers(prev => prev.filter(u => u.socketId !== socketId));
      else if (typeof userCount === 'number') setUsers(prev => prev.slice(0, userCount));

      const displayName = nickname || 'A user';
      const log = { id: `log_${Date.now()}`, type: 'leave', content: `${displayName} left the room`, timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handleError = ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 5000);
      if (message.includes('Invalid') || message.includes('expired')) setShowJoinModal(true);
    };

    const handleKnockApproved = ({ isHost }) => {
      setIsWaitingForHost(false);
      if (isHost) setIsHost(true);
      if (joinParamsRef.current) performJoin(joinParamsRef.current);
    };

    const handleKnockDenied = ({ reason }) => {
      setIsWaitingForHost(false);
      setError(reason || 'Entry denied');
      setIsProcessingInvite(false);
    };

    const handleUserKnocking = (guest) => setPendingGuests(prev => prev.find(g => g.socketId === guest.socketId) ? prev : [...prev, guest]);

    const handlePromotedToHost = () => {
      setIsHost(true);
      setCurrentUserRole('host');
      setCurrentUser(prev => prev ? { ...prev, isAdmin: true } : prev);
      const log = { id: `log_${Date.now()}`, type: 'system', content: 'You are now the host of this room', timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handleMessageUpdated = (updatedMessage) => {
      setMessages(prev => prev.map(m => m.id === updatedMessage.id ? updatedMessage : m));
    };

    // Role and moderation event handlers
    const handleRoleUpdated = ({ userId, role, updatedBy }) => {
      if (userId === socketManager.socket?.id) {
        setCurrentUserRole(role);
        const log = { id: `log_${Date.now()}`, type: 'system', content: `Your role has been changed to ${role} by ${updatedBy}`, timestamp: new Date().toISOString() };
        setActivityLogs(prev => [log, ...prev].slice(0, 50));
        if (!showActivityLogs) setHasNewLogs(true);
      }
      setUsers(prev => prev.map(u => u.socketId === userId ? { ...u, role } : u));
    };

    const handleUsersUpdated = ({ users: updatedUsers }) => {
      setUsers(updatedUsers);
    };

    const handleKicked = ({ reason, kickedBy }) => {
      setError(`You were kicked by ${kickedBy}: ${reason}`);
      setIsJoined(false);
      setRoom(null);
      navigate('/');
    };

    const handleUserKicked = ({ userId, nickname, kickedBy }) => {
      const log = { id: `log_${Date.now()}`, type: 'system', content: `${nickname} was kicked by ${kickedBy}`, timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
      setUsers(prev => prev.filter(u => u.socketId !== userId));
    };

    const handleGuestApproved = ({ guestId }) => {
      setPendingGuests(prev => prev.filter(g => g.socketId !== guestId));
    };

    const handleGuestDenied = ({ guestId }) => {
      setPendingGuests(prev => prev.filter(g => g.socketId !== guestId));
    };

    // Room customization handlers
    const handleVibeUpdated = ({ vibeId, updatedBy }) => {
      setRoomVibe(vibeId);
      const log = { id: `log_${Date.now()}`, type: 'vibe', content: `${updatedBy} changed vibe to ${getVibeById(vibeId).name}`, timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handleRoomTopicUpdated = ({ topic, updatedBy }) => {
      setRoomTopic(topic);
      const log = {
        id: `log_${Date.now()}`,
        type: 'topic',
        content: topic ? `${updatedBy} set topic: "${topic}"` : `${updatedBy} cleared the topic`,
        timestamp: new Date().toISOString()
      };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handleTimerStarted = (timer) => {
      setActiveTimer(timer);
      const log = { id: `log_${Date.now()}`, type: 'timer', content: `${timer.startedBy} started a timer`, timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handleTimerStopped = ({ stoppedBy }) => {
      setActiveTimer(null);
      setTimeLeft(null);
      const log = { id: `log_${Date.now()}`, type: 'timer', content: `${stoppedBy} stopped the timer`, timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handlePulseReceived = ({ from }) => {
      triggerPulse();
      const log = { id: `log_${Date.now()}`, type: 'pulse', content: `${from} sent a pulse`, timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handleUserTyping = ({ userId, nickname }) => {
      setTypingUsers(prev => {
        const next = new Map(prev);
        next.set(userId, nickname);
        return next;
      });
    };

    const handleUserStopTyping = ({ userId }) => {
      setTypingUsers(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };

    const handlePong = (startTime) => {
      setLatency(Date.now() - startTime);
    };

    socketManager.on('connect', handleConnect);
    socketManager.on('disconnect', handleDisconnect);
    socketManager.on('room-joined', handleRoomJoined);
    socketManager.on('new-message', handleNewMessage);
    socketManager.on('message-deleted', handleMessageDeleted);
    socketManager.on('message-updated', handleMessageUpdated);
    socketManager.on('user-joined', handleUserJoined);
    socketManager.on('room-left', handleUserLeft);
    socketManager.on('room-error', handleError);
    socketManager.on('latency-pong', handlePong);
    socketManager.on('knock-approved', handleKnockApproved);
    socketManager.on('knock-denied', handleKnockDenied);
    socketManager.on('user-knocking', handleUserKnocking);
    socketManager.on('promoted-to-host', handlePromotedToHost);
    socketManager.on('role-updated', handleRoleUpdated);
    socketManager.on('users-updated', handleUsersUpdated);
    socketManager.on('kicked', handleKicked);
    socketManager.on('user-kicked', handleUserKicked);
    socketManager.on('guest-approved', handleGuestApproved);
    socketManager.on('guest-denied', handleGuestDenied);
    socketManager.on('vibe-updated', handleVibeUpdated);
    socketManager.on('room-topic-updated', handleRoomTopicUpdated);
    socketManager.on('timer-started', handleTimerStarted);
    socketManager.on('timer-stopped', handleTimerStopped);
    socketManager.on('pulse-received', handlePulseReceived);
    socketManager.on('user-typing', handleUserTyping);
    socketManager.on('user-stop-typing', handleUserStopTyping);
    socketManager.on('room-reaction', handleRoomReaction);
    socketManager.on('file-transfer-invite', handleFileTransferInvite);

    return () => {
      socketManager.off('connect', handleConnect);
      socketManager.off('disconnect', handleDisconnect);
      socketManager.off('room-joined', handleRoomJoined);
      socketManager.off('new-message', handleNewMessage);
      socketManager.off('message-deleted', handleMessageDeleted);
      socketManager.off('message-updated', handleMessageUpdated);
      socketManager.off('user-joined', handleUserJoined);
      socketManager.off('room-left', handleUserLeft);
      socketManager.off('room-error', handleError);
      socketManager.off('latency-pong', handlePong);
      socketManager.off('knock-approved', handleKnockApproved);
      socketManager.off('knock-denied', handleKnockDenied);
      socketManager.off('user-knocking', handleUserKnocking);
      socketManager.off('promoted-to-host', handlePromotedToHost);
      socketManager.off('role-updated', handleRoleUpdated);
      socketManager.off('users-updated', handleUsersUpdated);
      socketManager.off('kicked', handleKicked);
      socketManager.off('user-kicked', handleUserKicked);
      socketManager.off('guest-approved', handleGuestApproved);
      socketManager.off('guest-denied', handleGuestDenied);
      socketManager.off('vibe-updated', handleVibeUpdated);
      socketManager.off('room-topic-updated', handleRoomTopicUpdated);
      socketManager.off('timer-started', handleTimerStarted);
      socketManager.off('timer-stopped', handleTimerStopped);
      socketManager.off('pulse-received', handlePulseReceived);
      socketManager.off('user-typing', handleUserTyping);
      socketManager.off('user-stop-typing', handleUserStopTyping);
      socketManager.off('room-reaction', handleRoomReaction);
      socketManager.off('file-transfer-invite', handleFileTransferInvite);

      // Explicitly leave the room before disconnecting
      socketManager.emit('leave-room');

      if (process.env.NODE_ENV !== 'development') {
        socketManager.disconnect();
      }
    };
  }, [roomCode, performJoin, roomKey, handleFileTransferInvite, triggerPulse]); // Removed isJoined, sessionToken to prevent cleanup on state change

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      socketManager.emit('latency-ping', Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected]);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
      if (featureMenuRef.current && !featureMenuRef.current.contains(event.target)) {
        setShowFeatureMenu(false);
      }
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setSuggestions(prev => ({ ...prev, show: false }));
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Suggestions Logic
  useEffect(() => {
    const text = newMessage;
    const lastWord = text.split(/\s/).pop();

    if (text.startsWith('/')) {
      const query = text.substring(1).toLowerCase();
      const filtered = SLASH_COMMANDS.filter(cmd =>
        (cmd.value.toLowerCase().includes(query) || cmd.label.toLowerCase().includes(query)) &&
        (!cmd.adminOnly || canManageRoom(currentUserRole))
      );
      setSuggestions({
        show: filtered.length > 0,
        type: 'command',
        items: filtered,
        index: 0,
        query
      });
    } else if (lastWord && lastWord.startsWith('@')) {
      const query = lastWord.substring(1).toLowerCase();
      const filtered = users
        .filter(u => u.socketId !== socketManager.socket?.id)
        .filter(u => u.nickname.toLowerCase().includes(query));

      setSuggestions({
        show: filtered.length > 0,
        type: 'mention',
        items: filtered,
        index: 0,
        query
      });
    } else {
      setSuggestions(prev => ({ ...prev, show: false }));
    }
  }, [newMessage, users, currentUserRole]);

  const applySuggestion = (item) => {
    if (suggestions.type === 'command') {
      setNewMessage(item.value + ' ');
    } else if (suggestions.type === 'mention') {
      const parts = newMessage.split(/\s/);
      parts.pop();
      setNewMessage(parts.join(' ') + (parts.length > 0 ? ' ' : '') + '@' + item.nickname + ' ');
    }
    setSuggestions(prev => ({ ...prev, show: false }));
    messageInputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (suggestions.show) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSuggestions(prev => ({ ...prev, index: (prev.index + 1) % prev.items.length }));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestions(prev => ({ ...prev, index: (prev.index - 1 + prev.items.length) % prev.items.length }));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applySuggestion(suggestions.items[suggestions.index]);
      } else if (e.key === 'Escape') {
        setSuggestions(prev => ({ ...prev, show: false }));
      }
    }
  };

  const onEmojiClick = (emojiData) => {
    setNewMessage(prev => prev + emojiData.emoji);
  };

  const handleJoinRoom = async (params) => {
    const { nickname } = params;
    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }
    if (isProcessingInvite || isJoined) return;
    setIsProcessingInvite(true);
    setError(null);
    setIsWaitingForHost(true);
    joinParamsRef.current = params;
    try {
      const knockData = { roomCode, nickname: nickname.trim(), password: params.password?.trim(), capToken: params.capToken };
      if (params.inviteToken) knockData.inviteToken = params.inviteToken;
      socketManager.emit('knock', knockData);
    } catch (err) {
      setError('Failed to join room. Please try again.');
      setIsProcessingInvite(false);
      setIsWaitingForHost(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleApproveGuest = (guestId) => {
    socketManager.emit('approve-guest', { guestId, roomCode });
    setPendingGuests(prev => prev.filter(g => g.socketId !== guestId));
  };

  const handleDenyGuest = (guestId) => {
    socketManager.emit('deny-guest', { guestId, roomCode });
    setPendingGuests(prev => prev.filter(g => g.socketId !== guestId));
  };

  const handleSetUserRole = (targetUserId, role) => {
    socketManager.emit('set-user-role', { targetUserId, role, roomCode });
  };

  const handleKickUser = (targetUserId) => {
    socketManager.emit('kick-user', { targetUserId, roomCode });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || isSending || !isConnected) return;

    // 1. Handle Slash Commands
    if (newMessage.trim().startsWith('/')) {
      const parts = newMessage.trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      switch (cmd) {
        case '/camera': setShowCameraModal(true); break;
        case '/poll': setShowPollModal(true); break;
        case '/call':
          if (users.length > 7) {
            setError('Voice calls are disabled in rooms with more than 7 users for stability.');
          } else {
            handleStartCall();
          }
          break;
        case '/photo':
        case '/image': fileInputRef.current?.click(); break;
        case '/voice':
        case '/note': startRecording(); break;
        case '/ice': handleSendIcebreaker(); break;
        case '/pulse': handleSendPulse(); break;
        case '/topic':
          if (canManageRoom(currentUserRole)) {
            if (args) handleSaveTopic(args);
            else setShowTopicEditor(true);
          } else setError('Admin permission required for /topic');
          break;
        case '/timer':
          if (canManageRoom(currentUserRole)) {
            const mins = parseInt(args);
            if (!isNaN(mins)) handleStartTimer(mins * 60);
            else setShowTimerModal(true);
          } else setError('Admin permission required for /timer');
          break;
        case '/vibe':
          if (canManageRoom(currentUserRole)) {
            const vibe = getAllVibes().find(v => v.name.toLowerCase() === args.toLowerCase() || v.id === args.toLowerCase());
            if (vibe) handleUpdateVibe(vibe.id);
          }
          break;
        default:
          // Just send as regular message if not a valid command
          break;
      }
      if (cmd.startsWith('/')) {
        const isValid = SLASH_COMMANDS.some(c => c.value === cmd);
        if (isValid) {
          setNewMessage('');
          return;
        }
      }
    }

    setIsSending(true);
    try {
      let content = newMessage.trim();

      // Handle Mentions for Targeted Delivery
      const mentionMatches = content.match(/@(\w+)/g) || [];
      const mentionedSocketIds = mentionMatches.map(m => {
        const nick = m.substring(1).toLowerCase();
        const user = users.find(u => u.nickname.toLowerCase() === nick);
        return user?.socketId;
      }).filter(Boolean);

      // Strip leading mentions from content before sending
      // This allows @nick to stay in the middle of a sentence, but clears it as a routing prefix
      if (mentionMatches.length > 0) {
        let strippedContent = content;
        let changed = true;
        while (changed) {
          changed = false;
          const match = strippedContent.match(/^@\w+\s*/);
          if (match) {
            strippedContent = strippedContent.substring(match[0].length);
            changed = true;
          }
        }
        // Only use stripped content if we didn't wipe everything out
        if (strippedContent.trim()) {
          content = strippedContent.trim();
        }
      }

      // If mentions exist, they take precedence
      const finalRecipients = mentionedSocketIds.length > 0 ? mentionedSocketIds : selectedRecipients;

      let isEncrypted = false;
      let iv = null;
      if (roomKey) {
        const result = await encryptMessage(content, roomKey);
        content = result.encrypted;
        iv = result.iv;
        isEncrypted = true;
      }

      const replyData = replyingTo ? {
        id: replyingTo.id,
        content: replyingTo.messageType === 'image' ? 'Image' : replyingTo.messageType === 'audio' ? 'Voice Note' : replyingTo.content,
        sender: replyingTo.sender.nickname
      } : null;

      socketManager.emit('send-message', {
        content,
        isEncrypted,
        iv,
        recipients: finalRecipients,
        replyTo: replyData
      });
      socketManager.emit('user-activity');
      setNewMessage('');
      setReplyingTo(null);
    } catch (error) {
      setError('Failed to send message');
    } finally {
      setIsSending(false);
      // Maintain focus on mobile devices to prevent keyboard from dismissing
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile) {
        setTimeout(() => {
          messageInputRef.current?.focus();
        }, 50);
      }
    }
  };

  const handleSendPoll = (pollData) => {
    if (!isConnected) return;
    socketManager.emit('send-message', { messageType: 'poll', pollData, recipients: selectedRecipients });
  };

  const handleVote = (messageId, optionId) => {
    if (!isConnected) return;
    socketManager.emit('vote-poll', { messageId, optionId });
  };

  const handleUpdateVibe = (vibeId) => {
    socketManager.emit('update-vibe', { vibeId, roomCode });
    setShowFeatureMenu(false);
  };

  const handleSaveTopic = (topic) => {
    socketManager.emit('set-room-topic', { topic, roomCode });
  };

  const handleStartTimer = (duration) => {
    socketManager.emit('start-timer', { duration, roomCode });
  };

  const handleStopTimer = () => {
    socketManager.emit('stop-timer', { roomCode });
  };

  const handleReply = (message) => {
    // Automatic Private Reply Logic
    if (message.recipients && message.recipients.length > 0) {
      // It's a private message
      if (message.sender.socketId === socketManager.socket?.id) {
        // I sent this message, so replying means sending to the same recipients
        setSelectedRecipients(message.recipients);
      } else {
        // I received this message, so replying means responding to the sender
        // (and potentially other recipients if we implemented Reply All, but let's stick to sender for now as standard "Reply")
        setSelectedRecipients([message.sender.socketId]);

        // If it was a multi-party private message, we might want to include others, 
        // but for now, ensure we at least reply to the sender privately.
      }
    }

    setReplyingTo(message);
    messageInputRef.current?.focus();
  };

  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  const handleReaction = (messageId, emoji) => {
    socketManager.emit('add-reaction', { messageId, emoji });
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleTyping = () => {
    socketManager.emit('typing', { roomCode });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketManager.emit('stop-typing', { roomCode });
    }, 1000);
  };

  const handleSendPulse = () => {
    socketManager.emit('send-pulse', { roomCode });
    triggerPulse(); // Immediate local feedback

    // Add local log for sender
    const log = { id: `log_${Date.now()}`, type: 'pulse', content: `You sent a pulse`, timestamp: new Date().toISOString() };
    setActivityLogs(prev => [log, ...prev].slice(0, 50));
  };

  const handleSendIcebreaker = () => {
    const question = getRandomIcebreaker();
    socketManager.emit('send-message', {
      content: `🧊 ${question}`,
      isEncrypted: false,
      recipients: selectedRecipients
    });
    socketManager.emit('user-activity');
    setShowFeatureMenu(false);
  };

  const handleStartPillDrag = (e, type) => {
    const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
    setDragState({
      type,
      startX: clientX,
      startOffset: offsets[type]
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const handleMove = (e) => {
      const clientX = e.type.startsWith('touch') ? e.touches[0].clientX : e.clientX;
      const deltaX = clientX - dragState.startX;
      setOffsets(prev => ({
        ...prev,
        [dragState.type]: dragState.startOffset + deltaX
      }));
    };

    const handleEnd = () => {
      setDragState(null);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove);
    window.addEventListener('touchend', handleEnd);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [dragState]);

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const uploadFile = async (file, options = {}) => {
    const { isViewOnce = false } = options;
    if (file.size > 10 * 1024 * 1024) {
      setError('File too large (max 10MB)');
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const isImage = file.type.startsWith('image/');
      // For images, we send the full data URI so it can be rendered in <img> tags
      // For other files, we send raw base64 as before
      let content = isImage ? e.target.result : e.target.result.split(',')[1];

      let isEncrypted = false;
      let iv = null;

      if (roomKey) {
        try {
          const result = await encryptMessage(content, roomKey);
          content = result.encrypted;
          iv = result.iv;
          isEncrypted = true;
        } catch (error) {
          console.error('Encryption failed for file:', error);
          setError('Failed to encrypt file');
          setIsUploading(false);
          return;
        }
      }

      socketManager.emit('send-message', {
        messageType: isImage ? 'image' : 'file',
        content: content,
        imageData: isImage ? content : undefined, // Include imageData for server compatibility
        isEncrypted,
        iv,
        isViewOnce,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        recipients: selectedRecipients
      });
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (imageData, isViewOnce = true) => {
    // Ensure modal state is updated
    setShowCameraModal(false);

    // Convert Base64 dataUrl back to a File object for the existing upload logic
    fetch(imageData)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
        uploadFile(file, { isViewOnce }); // Use the flag from camera modal
      })
      .catch(err => {
        console.error('Failed to process captured image:', err);
        setError('Failed to process captured image');
      });
  };

  const handleEditMessage = (message) => {
    setEditingMessage(message);
  };

  const handleSaveEdit = (newContent) => {
    if (editingMessage) {
      socketManager.emit('edit-message', {
        messageId: editingMessage.id,
        newContent
      });
      setEditingMessage(null);
    }
  };

  const handleImageUpload = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadFile(file, { isViewOnce: true });
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [selectedRecipients, uploadFile]);

  const handleStartCall = useCallback(async () => {
    let recipients = selectedRecipients.length > 0
      ? users.filter(u => selectedRecipients.includes(u.socketId) || selectedRecipients.includes(u.id))
      : users.filter(u => u.socketId !== currentUser?.id && u.id !== currentUser?.id);

    if (recipients.length === 0) {
      setError('No users to call');
      return;
    }
    try {
      const recipientList = recipients.map(u => ({ id: u.socketId || u.id, nickname: u.nickname }));
      await webRTCService.startCall(roomCode, recipientList);
      setShowCallModal(true);
    } catch (err) {
      console.error('Call failed:', err);
      setError(`Failed to start call: ${err.message || 'Check microphone permissions'}`);
    }
  }, [users, currentUser, roomCode, selectedRecipients]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      let mimeType = '';
      // Robust MIME type selection
      if (isSafari) {
        if (MediaRecorder.isTypeSupported('audio/wav')) {
          mimeType = 'audio/wav';
        } else if (MediaRecorder.isTypeSupported('audio/mp3')) {
          mimeType = 'audio/mp3';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        }
      } else {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/webm')) {
          mimeType = 'audio/webm';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }
      mediaRecorderRef.current = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorderRef.current.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingDuration(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          if (prev >= 29) { handleStopRecording(); return 30; }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      setError(`Microphone access failed: ${err.message || 'Check permissions'}`);
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorderRef.current.mimeType });
        // Check for empty or truncated blob
        if (audioBlob.size === 0) {
          setError('Recorded audio is empty. Please try again.');
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
          return;
        }
        // Warn if blob is suspiciously small (<1KB)
        if (audioBlob.size < 1024) {
          setError('Audio recording may be too short or truncated.');
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
          return;
        }
        sendAudioMessage(audioBlob);
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
  };

  const handleCancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingDuration(0);
    clearInterval(recordingTimerRef.current);
  };

  const sendAudioMessage = (audioBlob) => {
    if (audioBlob.size > 5 * 1024 * 1024) {
      setError('Voice note is too large (max 5MB).');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Audio = reader.result.split(',')[1];
      socketManager.emit('send-message', { messageType: 'audio', content: base64Audio, isViewOnce: audioViewOnce, recipients: selectedRecipients });
    };
    reader.readAsDataURL(audioBlob);
  };

  useEffect(() => {
    const unsubscribe = webRTCService.onCallStateChange((state) => {
      setCallState(state);
      if (state.state === CallState.INCOMING) setShowCallModal(true);
      if (state.state === CallState.IDLE && showCallModal) setTimeout(() => setShowCallModal(false), 1000);
    });
    return unsubscribe;
  }, [showCallModal]);

  const getTTLDisplay = () => {
    if (!room?.settings?.messageTTL) return null;
    const ttl = room.settings.messageTTL;
    if (ttl < 60) return `${ttl}s`;
    if (ttl < 3600) return `${Math.floor(ttl / 60)}m`;
    return `${Math.floor(ttl / 3600)}h`;
  };

  const toggleRecipient = (socketId) => setSelectedRecipients(prev => prev.includes(socketId) ? prev.filter(id => id !== socketId) : [...prev, socketId]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    const originalOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.overscrollBehavior = originalOverscroll;
    };
  }, []);

  if (error && !isJoined) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
            <p className="font-bold">Error</p><p>{error}</p>
          </div>
          <button onClick={() => navigate('/')} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Go Back to Home</button>
        </div>
      </div>
    );
  }

  if (showJoinModal) return <JoinRoomModal roomCode={roomCode} onJoin={handleJoinRoom} onCancel={() => navigate('/')} error={error} isProcessingInvite={isProcessingInvite} isWaitingForHost={isWaitingForHost} />;

  return (
    <div
      className={`flex flex-col transition-colors duration-500 chat-container overflow-hidden ${getVibeById(roomVibe).bgClass}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isReconnecting && (
        <div className="absolute inset-0 z-[100] bg-black/20 backdrop-blur-[2px] flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-lg flex items-center space-x-2">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Reconnecting...</span>
          </div>
        </div>
      )}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-2 sm:py-3 sticky top-0 z-50 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <button onClick={() => navigate('/')} className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300 flex-shrink-0"><ArrowLeft className="w-5 h-5" /></button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate text-gray-900 dark:text-white leading-tight">Secure Chat</h1>
              <div className="flex items-center space-x-3 sm:space-x-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                {latency !== null && (
                  <div className="flex items-end space-x-0.5 h-4 pb-1" title={`Latency: ${latency}ms`}>
                    {[1, 2, 3, 4].map((bar) => {
                      const activeBars = latency < 100 ? 4 : latency < 200 ? 3 : latency < 400 ? 2 : 1;
                      const isActive = bar <= activeBars;
                      const colorClass = latency < 100 ? 'bg-green-500' : latency < 300 ? 'bg-yellow-500' : 'bg-red-500';
                      return (
                        <div
                          key={bar}
                          className={`w-0.5 rounded-t-[1px] transition-all duration-300 ${isActive ? colorClass : 'bg-gray-300 dark:bg-gray-600 opacity-40'}`}
                          style={{ height: `${bar * 25}%` }}
                        />
                      );
                    })}
                  </div>
                )}
                <div className="flex items-center space-x-1">
                  <Users className="w-4 h-4" />
                  <span>{users.length}</span>
                </div>
                {getTTLDisplay() && (
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span><span className="hidden sm:inline">TTL: </span>{getTTLDisplay()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button
              onClick={() => setSidebarPosition(prev => prev === 'right' ? 'left' : 'right')}
              className="hidden lg:flex p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300"
              title={`Move sidebar to ${sidebarPosition === 'right' ? 'left' : 'right'}`}
            >
              {sidebarPosition === 'right' ? <PanelLeft className="w-5 h-5" /> : <PanelRight className="w-5 h-5" />}
            </button>
            <RefreshButton />
            <ThemeToggle />
            <button onClick={() => setShowMobileMenu(true)} className="lg:hidden p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300 relative">
              <Users className="w-5 h-5" />
              {isHost && pendingGuests.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-800" />}
            </button>
          </div>
        </div>
      </div>

      <div className="absolute top-[84px] sm:top-[100px] left-0 right-0 z-40 flex flex-col items-center space-y-2 pointer-events-none transition-all duration-300">
        {/* Topic Pill */}
        {roomTopic && (
          <div
            className="pointer-events-auto bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm border border-gray-200 dark:border-gray-700 px-4 py-1.5 rounded-full shadow-sm flex items-center space-x-2 animate-in slide-in-from-top-2 max-w-[80%] cursor-move touch-none"
            style={{ transform: `translateX(${offsets.topic}px)` }}
            onMouseDown={(e) => handleStartPillDrag(e, 'topic')}
            onTouchStart={(e) => handleStartPillDrag(e, 'topic')}
          >
            <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wider select-none">Topic</span>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate select-none">{roomTopic}</span>
            {canManageRoom(currentUserRole) && (
              <button
                onClick={(e) => { e.stopPropagation(); setShowTopicEditor(true); }}
                className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-400 hover:text-primary-500 transition-colors"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <Edit2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {/* Timer Pill */}
        {activeTimer && (
          <div
            className="pointer-events-auto bg-indigo-600/90 backdrop-blur-md px-4 py-1.5 rounded-full shadow-lg flex items-center space-x-3 animate-in slide-in-from-top-2 text-white border border-indigo-500/50 cursor-move touch-none"
            style={{ transform: `translateX(${offsets.timer}px)` }}
            onMouseDown={(e) => handleStartPillDrag(e, 'timer')}
            onTouchStart={(e) => handleStartPillDrag(e, 'timer')}
          >
            <Clock className={`w-3.5 h-3.5 select-none ${timeLeft === '00:00' ? 'animate-bounce text-red-300' : 'animate-pulse'}`} />
            <span className={`font-mono text-sm font-bold tracking-wider select-none ${timeLeft === '00:00' ? 'text-red-100' : ''}`}>{timeLeft || '00:00'}</span>
            {canManageRoom(currentUserRole) && (
              <button
                onClick={(e) => { e.stopPropagation(); handleStopTimer(); }}
                className="ml-1 p-0.5 hover:bg-white/20 rounded-full transition-colors"
                title="Stop Timer"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {error && <div className="mx-4 mt-2 bg-red-100 dark:bg-red-900/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-2 rounded-lg text-sm text-center md:w-fit md:mx-auto">{error}</div>}

      <div className={`flex-1 flex overflow-hidden min-h-0 ${sidebarPosition === 'left' ? 'flex-row-reverse' : ''}`}>
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <div className="flex-1 min-h-0 overflow-y-auto pl-4 lg:pl-10 pr-2 scrollbar-thin overscroll-contain touch-pan-y chat-messages-area">
            <MessageList
              messages={messages}
              currentUser={currentUser}
              messageTTL={room?.settings?.messageTTL}
              onVote={handleVote}
              onReply={handleReply}
              onReact={handleReaction}
              onEdit={handleEditMessage}
            />
            <div ref={messagesEndRef} />
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 sticky bottom-0 z-50 shrink-0 chat-input-area">
            {typingUsers.size > 0 && (
              <div className="px-4 py-1 text-xs text-gray-500 dark:text-gray-400 italic animate-pulse bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
                {Array.from(typingUsers.values()).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...
              </div>
            )}
            {replyingTo && (
              <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-600 flex items-center justify-between animate-in slide-in-from-bottom-2">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <Reply className="w-4 h-4 text-blue-500" />
                  <div className="flex flex-col text-xs border-l-2 border-blue-500 pl-2">
                    <span className="font-semibold text-blue-500">Replying to {replyingTo.sender.nickname}</span>
                    <span className="text-gray-500 dark:text-gray-400 truncate max-w-[200px]">
                      {replyingTo.messageType === 'image' ? 'Image' : replyingTo.messageType === 'audio' ? 'Voice Note' : replyingTo.content}
                    </span>
                  </div>
                </div>
                <button onClick={handleCancelReply} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            )}
            {selectedRecipients.length > 0 && (
              <div className="px-4 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex items-center justify-between">
                <span className="text-xs text-blue-600 dark:text-blue-300 font-medium flex items-center"><Users className="w-3 h-3 mr-1.5" />Sending to {selectedRecipients.length} specific user{selectedRecipients.length !== 1 ? 's' : ''}</span>
                <button onClick={() => setSelectedRecipients([])} className="text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-200 underline">Clear selection</button>
              </div>
            )}
            <div className="px-2 pt-2 sm:px-4 sm:pt-4 pb-0 sm:pb-4">
              <form onSubmit={handleSendMessage} className="flex items-center space-x-1.5 sm:space-x-3">
                {isRecording ? (
                  <div className="flex-1 flex flex-col space-y-2">
                    {/* Safari Audio Notice */}
                    {isSafariBrowser() && !safariNoticeShown && (
                      <div className="flex items-center space-x-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200/50 dark:border-amber-800/50 animate-in slide-in-from-top-2">
                        <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                        <span className="text-xs text-amber-700 dark:text-amber-300">Recordings made and played on Safari may be truncated. Playback on other browsers is unaffected.</span>
                        <button
                          type="button"
                          onClick={() => {
                            setSafariNoticeShown(true);
                            localStorage.setItem('safariAudioNoticeShown', 'true');
                          }}
                          className="ml-auto text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 p-0.5"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-2">
                      <div className="flex items-center space-x-3"><div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" /><span className="text-red-600 dark:text-red-400 font-medium font-mono">{formatDuration(recordingDuration)} / 0:30</span></div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setAudioViewOnce(!audioViewOnce)}
                          className={`p-2 rounded-full font-bold text-[10px] w-8 h-8 flex items-center justify-center transition-colors ${audioViewOnce ? 'bg-red-500 text-white' : 'bg-transparent text-red-500 border border-red-500'}`}
                          title={audioViewOnce ? "View Once Active" : "View Once Inactive"}
                        >
                          1x
                        </button>
                        <button type="button" onClick={handleCancelRecording} className="p-2 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-full text-red-500"><Trash2 className="w-5 h-5" /></button>
                        <button type="button" onClick={handleStopRecording} className="p-2 bg-red-500 hover:bg-red-600 rounded-full text-white shadow-sm"><Send className="w-5 h-5" /></button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="image-upload" />

                    <div className="relative" ref={featureMenuRef}>
                      <button
                        type="button"
                        onClick={() => setShowFeatureMenu(!showFeatureMenu)}
                        disabled={!isConnected}
                        className={`p-2.5 sm:p-3 rounded-xl transition-all duration-200 ${showFeatureMenu ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-600 scale-110' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
                      >
                        <Plus className={`w-5 h-5 transition-transform duration-300 ${showFeatureMenu ? 'rotate-45' : ''}`} />
                      </button>

                      {showFeatureMenu && (
                        <div className="absolute bottom-full mb-3 left-0 z-50 bg-white/95 dark:bg-gray-800/95 rounded-3xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 p-2 sm:p-3 flex flex-col space-y-2 w-[280px] sm:w-80 animate-in slide-in-from-bottom-2 duration-300 backdrop-blur-xl ring-1 ring-black/5 dark:ring-white/5">
                          {/* Floating Reaction Pill */}
                          <div className="flex items-center gap-1 bg-gray-50/80 dark:bg-gray-900/80 rounded-2xl p-1 px-1.5 border border-gray-100/50 dark:border-gray-800/50 shadow-inner">
                            <div className="flex items-center flex-1 justify-around">
                              {['❤️', '🔥', '👏', '😂', '😮', '💯'].map(emoji => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => sendRoomReaction(emoji)}
                                  className="p-1 hover:bg-white dark:hover:bg-gray-700 rounded-lg transition-all hover:scale-125 active:scale-95"
                                >
                                  <span className="text-xl leading-none">{emoji}</span>
                                </button>
                              ))}
                            </div>
                            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700/50 mx-0.5" />
                            <button
                              type="button"
                              onClick={handleSendPulse}
                              disabled={!isConnected}
                              className="w-8 h-8 flex items-center justify-center bg-yellow-400 hover:bg-yellow-500 text-white rounded-lg transition-all hover:scale-110 active:scale-95 shadow-sm shadow-yellow-400/20 group flex-shrink-0"
                              title="Send Pulse Alert"
                            >
                              <Zap className="w-4 h-4 fill-current" />
                            </button>
                          </div>

                          <div className="h-px bg-gray-100 dark:bg-gray-700/50 mx-1" />

                          <div className="grid grid-cols-3 gap-1.5">
                            {/* Files Button */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowFileModal(true);
                                setShowFeatureMenu(false);
                                // Add to activity log for the sender
                                const recipientNames = selectedRecipients.length > 0
                                  ? `targeting ${selectedRecipients.map(id => users.find(u => u.socketId === id)?.nickname || id).join(', ')}`
                                  : 'as a broadcast';

                                const log = {
                                  id: `log_ft_init_${Date.now()}`,
                                  type: 'system',
                                  content: `You initiated a secure file transfer intent ${recipientNames}`,
                                  timestamp: new Date().toISOString()
                                };
                                setActivityLogs(prev => [log, ...prev].slice(0, 50));
                              }}
                              disabled={!isConnected}
                              className="flex flex-col items-center justify-center p-2 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 hover:bg-indigo-100 dark:hover:bg-indigo-900/20 transition-all border border-indigo-100/20 dark:border-indigo-800/20 group"
                            >
                              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                                <FileText className="w-4 h-4 text-indigo-500" />
                              </div>
                              <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Files</span>
                            </button>
                            {/* Main Actions Grid */}
                            <button
                              type="button"
                              onClick={() => { setShowCameraModal(true); setShowFeatureMenu(false); }}
                              disabled={!isConnected}
                              className="flex flex-col items-center justify-center p-2 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-all border border-blue-100/20 dark:border-blue-800/20 group"
                            >
                              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                                <Camera className="w-4 h-4 text-blue-500" />
                              </div>
                              <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Camera</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                if (users.length > 7) {
                                  setError('Voice calls are limited to 7 users for stability.');
                                } else {
                                  handleStartCall();
                                  setShowFeatureMenu(false);
                                }
                              }}
                              disabled={!isConnected || users.length < 2 || users.length > 7}
                              className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all border group ${users.length > 7
                                ? 'bg-gray-50/50 dark:bg-gray-800/20 border-gray-200/20 dark:border-gray-700/20 opacity-50 cursor-not-allowed'
                                : 'bg-green-50/50 dark:bg-green-900/10 hover:bg-green-100 dark:hover:bg-green-900/20 border-green-100/20 dark:border-green-800/20'
                                }`}
                              title={users.length > 7 ? "Disabled: Max 7 users for voice calls" : "Start Voice Call"}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-1 transition-transform ${users.length > 7
                                ? 'bg-gray-100 dark:bg-gray-800/50'
                                : 'bg-green-100 dark:bg-green-900/30 group-hover:scale-110'
                                }`}>
                                <Phone className={`w-4 h-4 ${users.length > 7 ? 'text-gray-400' : 'text-green-500'}`} />
                              </div>
                              <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">
                                {users.length > 7 ? 'Disabled' : 'Voice Call'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => { setShowPollModal(true); setShowFeatureMenu(false); }}
                              disabled={!isConnected}
                              className="flex flex-col items-center justify-center p-2 rounded-xl bg-purple-50/50 dark:bg-purple-900/10 hover:bg-purple-100 dark:hover:bg-purple-900/20 transition-all border border-purple-100/20 dark:border-purple-800/20 group"
                            >
                              <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                                <BarChart2 className="w-4 h-4 text-purple-500" />
                              </div>
                              <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Poll</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => { startRecording(); setShowFeatureMenu(false); }}
                              disabled={!isConnected}
                              className="flex flex-col items-center justify-center p-2 rounded-xl bg-red-50/50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 transition-all border border-red-100/20 dark:border-red-800/20 group"
                            >
                              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                                <Mic className="w-4 h-4 text-red-500" />
                              </div>
                              <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Voice Note</span>
                            </button>

                            <button
                              type="button"
                              onClick={handleSendIcebreaker}
                              disabled={!isConnected}
                              className="flex flex-col items-center justify-center p-2 rounded-xl bg-cyan-50/50 dark:bg-cyan-900/10 hover:bg-cyan-100 dark:hover:bg-cyan-900/20 transition-all border border-cyan-100/20 dark:border-cyan-800/20 group"
                            >
                              <div className="w-8 h-8 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
                                <Smile className="w-4 h-4 text-cyan-500" />
                              </div>
                              <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Icebreaker</span>
                            </button>


                          </div>

                          {/* Admin Section */}
                          {canManageRoom(currentUserRole) && (
                            <>
                              <div className="h-px bg-gray-100 dark:bg-gray-700/50 mx-1" />
                              <div className="space-y-2">
                                <div className="flex items-center justify-between px-1">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Admin</p>
                                  <div className="flex gap-1">
                                    {getAllVibes().map(vibe => (
                                      <button
                                        key={vibe.id}
                                        onClick={() => handleUpdateVibe(vibe.id)}
                                        className={`w-6 h-6 rounded-md flex items-center justify-center text-xs transition-all ${roomVibe === vibe.id ? 'bg-primary-500 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                                        title={vibe.name}
                                      >
                                        {vibe.emoji}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => { setShowTopicEditor(true); setShowFeatureMenu(false); }}
                                    className="flex items-center space-x-2 p-2 rounded-xl bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors border border-gray-100 dark:border-gray-800"
                                  >
                                    <div className="w-7 h-7 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                                      <Edit2 className="w-3.5 h-3.5 text-orange-500" />
                                    </div>
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Topic</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (activeTimer) handleStopTimer();
                                      else setShowTimerModal(true);
                                      setShowFeatureMenu(false);
                                    }}
                                    className={`flex items-center space-x-2 p-2 rounded-xl border transition-all ${activeTimer ? 'bg-red-50 border-red-100 dark:bg-red-900/10 dark:border-red-900/20' : 'bg-gray-50 border-gray-100 dark:bg-gray-900/50 dark:border-gray-800'}`}
                                  >
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${activeTimer ? 'bg-red-100 dark:bg-red-900/30' : 'bg-indigo-100 dark:bg-indigo-900/30'}`}>
                                      {activeTimer ? <X className="w-3.5 h-3.5 text-red-500" /> : <Clock className="w-3.5 h-3.5 text-indigo-500" />}
                                    </div>
                                    <span className={`text-xs font-medium ${activeTimer ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                      {activeTimer ? 'Stop' : 'Timer'}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="relative" ref={emojiPickerRef}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!showEmojiPicker) {
                            messageInputRef.current?.blur();
                          }
                          setShowEmojiPicker(!showEmojiPicker);
                        }}
                        disabled={!isConnected}
                        className={`p-2.5 sm:p-3 rounded-xl transition-colors ${showEmojiPicker ? 'bg-gray-100 dark:bg-gray-700 text-blue-500' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400'}`}
                      >
                        <Smile className="w-5 h-5" />
                      </button>
                      {showEmojiPicker && (
                        <div className="absolute bottom-full mb-2 left-0 z-50 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-200">
                          <EmojiPicker
                            onEmojiClick={onEmojiClick}
                            theme={theme === 'dark' ? Theme.DARK : Theme.LIGHT}
                            lazyLoadEmojis={true}
                            skinTonesDisabled
                            autoFocusSearch={false}
                            searchPlaceholder="Search emojis..."
                            width={window.innerWidth < 640 ? 280 : 320}
                            height={window.innerWidth < 640 ? 350 : 400}
                            previewConfig={{ showPreview: false }}
                          />
                        </div>
                      )}
                    </div>
                    <div className="relative flex-1">
                      {suggestions.show && (
                        <div
                          ref={suggestionRef}
                          className="absolute bottom-full left-0 w-full mb-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden z-[60] animate-in slide-in-from-bottom-2 duration-200"
                        >
                          <div className="max-h-48 overflow-y-auto">
                            {suggestions.items.map((item, idx) => (
                              <button
                                key={idx}
                                onClick={() => applySuggestion(item)}
                                onMouseEnter={() => setSuggestions(prev => ({ ...prev, index: idx }))}
                                className={`w-full flex items-center space-x-3 px-4 py-2.5 transition-colors text-left ${idx === suggestions.index ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}
                              >
                                {suggestions.type === 'command' ? (
                                  <>
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${idx === suggestions.index ? 'bg-blue-100 dark:bg-blue-900/40' : 'bg-gray-100 dark:bg-gray-700'}`}>
                                      <item.icon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-bold text-sm">{item.value}</div>
                                      <div className="text-[10px] opacity-70 truncate">{item.desc}</div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                                      {item.nickname[0].toUpperCase()}
                                    </div>
                                    <div className="font-bold text-sm">@{item.nickname}</div>
                                  </>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <input
                        ref={messageInputRef}
                        type="text"
                        value={newMessage}
                        onChange={(e) => { setNewMessage(e.target.value); handleTyping(); }}
                        onKeyDown={handleKeyDown}
                        onCopy={(e) => e.preventDefault()}
                        onCut={(e) => e.preventDefault()}
                        onPaste={(e) => e.preventDefault()}
                        onFocus={() => {
                          const isAndroid = /Android/.test(navigator.userAgent);

                          if (isAndroid) {
                            // Android behavior - prevent scroll and ensure input stays visible
                            setTimeout(() => {
                              const inputContainer = messageInputRef.current?.closest('.chat-input-area');
                              if (inputContainer) {
                                inputContainer.scrollIntoView({ block: 'end', behavior: 'smooth' });
                              }
                              window.scrollTo(0, 0);
                            }, 100);
                          }
                          // iOS handling is done via the global focusin handler in useEffect
                        }}

                        onBlur={() => {
                          // Reset scroll position (primarily for Android)
                          window.scrollTo(0, 0);
                          // iOS class removal is handled by the global focusout handler in useEffect
                        }}

                        placeholder="Type message..."
                        className="w-full input-field py-2.5 sm:py-3 px-3 sm:px-4 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 text-sm sm:text-base"
                        disabled={!isConnected || isSending}
                        maxLength={500}
                      />
                    </div>
                    <button type="submit" disabled={!newMessage.trim() || !isConnected || isSending} className="btn-primary px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl"><Send className="w-5 h-5" /></button>
                  </>
                )}
              </form>
            </div>
          </div>
        </div>

        {/* Desktop Sidebar */}
        <div
          className={`hidden lg:flex flex-col relative bg-white dark:bg-gray-800 ${sidebarPosition === 'right' ? 'border-l' : 'border-r'} border-gray-200 dark:border-gray-700 transition-all duration-75`}
          style={{ width: `${sidebarWidth}px` }}
          ref={sidebarRef}
        >
          {/* Resize Handle */}
          <div
            className={`absolute top-0 bottom-0 w-1.5 cursor-col-resize z-50 hover:bg-blue-500/50 transition-colors flex items-center justify-center opacity-0 hover:opacity-100 ${sidebarPosition === 'right' ? '-left-0.5' : '-right-0.5'}`}
            onMouseDown={() => setIsResizingSidebar(true)}
          >
            <div className="w-0.5 h-8 bg-gray-300 dark:bg-gray-600 rounded-full" />
          </div>

          <UserList
            users={users}
            currentUser={currentUser}
            pendingGuests={pendingGuests}
            isHost={isHost}
            onApprove={handleApproveGuest}
            onDeny={handleDenyGuest}
            selectedRecipients={selectedRecipients}
            onToggleRecipient={toggleRecipient}
            onSetUserRole={handleSetUserRole}
            onKickUser={handleKickUser}
            currentUserRole={currentUserRole}
            onShowActivityLogs={() => { setShowActivityLogs(true); setHasNewLogs(false); }}
            hasNewLogs={hasNewLogs}
          />
        </div>
      </div>

      {
        showMobileMenu && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)} />
            <div className="absolute right-0 top-0 bottom-0 w-64 max-w-[70vw] bg-white dark:bg-gray-800 shadow-xl flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700"><h2 className="text-lg font-semibold text-gray-900 dark:text-white">Room Details</h2><button onClick={() => setShowMobileMenu(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400"><X className="w-5 h-5" /></button></div>
              <div className="flex-1 overflow-y-auto">
                <UserList
                  users={users}
                  currentUser={currentUser}
                  pendingGuests={pendingGuests}
                  isHost={isHost}
                  onApprove={handleApproveGuest}
                  onDeny={handleDenyGuest}
                  selectedRecipients={selectedRecipients}
                  onToggleRecipient={toggleRecipient}
                  onSetUserRole={handleSetUserRole}
                  onKickUser={handleKickUser}
                  currentUserRole={currentUserRole}
                  onShowActivityLogs={() => { setShowActivityLogs(true); setHasNewLogs(false); }}
                  hasNewLogs={hasNewLogs}
                />
              </div>
            </div>
          </div>
        )
      }

      {showCallModal && <AudioCallModal isOpen={showCallModal} onClose={() => setShowCallModal(false)} roomCode={roomCode} />}
      <TopicEditor
        isOpen={showTopicEditor}
        onClose={() => setShowTopicEditor(false)}
        currentTopic={roomTopic}
        onSave={handleSaveTopic}
      />
      <TimerModal
        isOpen={showTimerModal}
        onClose={() => setShowTimerModal(false)}
        onStart={handleStartTimer}
      />
      <CameraModal
        isOpen={showCameraModal}
        onClose={() => setShowCameraModal(false)}
        onCapture={handleCameraCapture}
      />
      <EditMessageModal
        isOpen={!!editingMessage}
        onClose={() => setEditingMessage(null)}
        onSave={handleSaveEdit}
        initialContent={editingMessage?.content}
      />
      <PollModal isOpen={showPollModal} onClose={() => setShowPollModal(false)} onSend={handleSendPoll} />
      <DragDropOverlay isDragging={isDragging} />
      <PrivacyOverlay />

      {/* Zoom-style Reaction Layer */}
      <div id="reaction-layer" ref={reactionLayerRef} />

      {
        isJoined && currentUser && (
          <GhostWatermark
            nickname={currentUser.nickname}
          />
        )
      }
      <ActivityLog
        isOpen={showActivityLogs}
        onClose={() => setShowActivityLogs(false)}
        logs={activityLogs}
      />
      {
        showFileModal && (
          <FileTransferModal
            onClose={() => setShowFileModal(false)}
            roomCode={roomCode}
            recipients={selectedRecipients}
            currentUserNickname={currentUser?.nickname}
          />
        )
      }
    </div >
  );
};

export default ChatRoom;
