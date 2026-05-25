import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { generateInviteLink } from '../utils/api'; // Import API utility
import {
  Send,
  Users,
  ArrowLeft,
  Clock,
  X,
  Phone,
  Image as ImageIcon,
  Loader2,
  Trash2,
  Mic,
  Smile,
  BarChart2,
  Plus,
  Edit2,
  Zap,
  Reply,
  FileText,
  Activity,
  Camera,
  PanelLeft,
  PanelRight,
  Ghost,
  EyeOff,
  Snowflake,
  RefreshCw,
  ArrowDown,
  Keyboard as KeyboardIcon,
  Sparkles,
  Volume2,
  VolumeX,
  Search,
  Eye,
  Code2,
  Lock,
  LayoutGrid,
  Gamepad2,
  Video,
} from 'lucide-react';
import EmojiPicker, { Theme } from 'emoji-picker-react';
import { useTheme } from '../context/ThemeContext';
import socketManager from '../socket';
import JoinRoomModal from './JoinRoomModal';
import MessageList from './MessageList';
import ReactionOverlay from './ReactionOverlay';
import UserList from './UserList';
import AudioCallModal from './AudioCallModal';
import PollModal from './PollModal';
import webRTCService, { CallState } from '../webrtc';
import {
  initMLS,
  createMLSGroup,
  createMLSIdentity,
  joinMLSGroup,
  addMemberToGroup,
  encryptMLSMessage,
  decryptMLSMessage,
  destroyMLSSession,
  isMLSReady,
  isMLSCreator,
  getMLSKeyPackage,
  initRoomEncryption,
  initE2EE,
  destroyE2EESession,
  handleIncomingKeyBundle,
} from '../utils/security';
import { initTrafficPadding, stopTrafficPadding, withJitter } from '../crypto/traffic-padding';
import { verifyServerSignature, isServerSigningReady } from '../crypto/server-signing';
import { getKeyBundle } from '../crypto/key-store';
import { initOHTTP } from '../crypto/ohttp';
import { initPrivacyPass, getAuthToken, refreshTokensIfNeeded, isPrivacyPassReady } from '../crypto/privacy-pass';
import { TransportManager, TRANSPORT } from '../transport/transport-manager';
import { Mp3Recorder } from '../utils/mp3Recorder';
import ThemeToggle from './ThemeToggle';
import PrivacyOverlay from './PrivacyOverlay';
import GhostWatermark from './GhostWatermark';
import TopicEditor from './TopicEditor';
import TimerModal from './TimerModal';
import PinnedMessageBanner from './PinnedMessageBanner';
import RoomCountdown from './RoomCountdown';
import ThreadView from './ThreadView';
import HotSeat from './HotSeat';
import TypingPreview from './TypingPreview';
import EditMessageModal from './EditMessageModal';
import DragDropOverlay from './DragDropOverlay';
import ActivityLog from './ActivityLog';
import CameraModal from './CameraModal';
import StegoModal from './StegoModal';
import TetrisMessage from './TetrisMessage';
import TetrisPanel from './TetrisPanel';
import ChessPanel from './ChessPanel';
import { getVibeById, getAllVibes } from '../utils/vibes';
import SharedMediaPlayer, { detectMediaUrl } from './SharedMediaPlayer';
import WatchPartyModal from './WatchPartyModal';
import { canManageRoom } from '../utils/roles';
import { getRandomIcebreaker } from '../utils/icebreakers';
import { AppRefreshButton } from './AppRefreshButton';
import CodeShareModal from './CodeShareModal';
import RoomToolsPanel from './RoomToolsPanel';
import SettingsModal from './SettingsModal';
import FloatingPanel from './FloatingPanel';
import { usePanelManager } from '../hooks/usePanelManager';
import { getCreatorId } from '../utils/creator';
import { hapticLight, hapticMedium, hapticHeavy, hapticSuccess } from '../utils/platform';
import { useSound } from '../hooks/useSound';
import { useAudioSettings } from '../hooks/useAudioSettings';
import { useMessageSearch } from '../hooks/useMessageSearch';
import MessageSearch from './MessageSearch';
import FileTransferModal from './FileTransferModal';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { useGeofence } from '../hooks/useGeofence';
import QuickVideoCapture from './QuickVideoCapture';
import { cameraPrewarmService } from '../utils/CameraPrewarmService';

const SLASH_COMMANDS = [
  { icon: Camera, label: 'Camera', value: '/camera', cmdKey: 'camera' },
  { icon: BarChart2, label: 'Poll', value: '/poll', cmdKey: 'poll' },
  { icon: Phone, label: 'Voice Call', value: '/call', cmdKey: 'call' },
  { icon: ImageIcon, label: 'Photo', value: '/photo', cmdKey: 'photo' },
  { icon: Mic, label: 'Voice Note', value: '/voice', cmdKey: 'voice' },
  { icon: Snowflake, label: 'Icebreaker', value: '/ice', cmdKey: 'icebreaker' },
  { icon: Zap, label: 'Pulse', value: '/pulse', cmdKey: 'pulse' },
  { icon: Sparkles, label: 'Confetti', value: '/confetti', cmdKey: 'confetti' },
  { icon: Edit2, label: 'Topic', value: '/topic', cmdKey: 'topic', adminOnly: true },
  { icon: Clock, label: 'Timer', value: '/timer', cmdKey: 'timer', adminOnly: true },
  { icon: Activity, label: 'Vibe', value: '/vibe', cmdKey: 'vibe', adminOnly: true },
  { icon: Sparkles, label: 'Hot Seat', value: '/hotSeat', cmdKey: 'hotSeat', adminOnly: true },
  { icon: Activity, label: 'Watch Party', value: '/media', cmdKey: 'watchParty' },
  { icon: FileText, label: 'Stego', value: '/stego', cmdKey: 'stego' },
  { icon: Code2, label: 'Code Share', value: '/code', cmdKey: 'codeShare' },
  { icon: Gamepad2, label: 'Tetris', value: '/tetris', cmdKey: 'tetris' },
  { icon: Gamepad2, label: 'Chess', value: '/chess', cmdKey: 'chess' },
];

const CONFETTI_COLORS = [
  '#FF6B6B', '#FFE66D', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
  '#F0B27A', '#AED6F1', '#F9A8D4', '#6EE7B7', '#FCA5A5',
];

// Safari detection (robust hybrid check)
function isSafariBrowser() {
  const ua = navigator.userAgent;
  const isWebKit = ua.includes('AppleWebKit');
  const isNotChrome = !ua.includes('Chrome') && !ua.includes('CriOS');
  const isNotFirefox = !ua.includes('FxiOS');
  return isWebKit && isNotChrome && isNotFirefox;
}

// --- Sub-component for Background Effects ---
const VibeEffects = ({ effectType }) => {
  if (!effectType) return null;

  if (effectType === 'sparkles') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-indigo-500/5 dark:bg-purple-900/10">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute animate-bounce"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 5}s`,
              animationDuration: `${2 + Math.random() * 3}s`,
              opacity: 0.4
            }}
          >
            <div className={`w-1 h-1 rounded-full ${i % 3 === 0 ? 'bg-indigo-400' : i % 3 === 1 ? 'bg-purple-400' : 'bg-pink-400'} blur-[1px]`} />
          </div>
        ))}
      </div>
    );
  }

  if (effectType === 'rain') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-teal-500/5 dark:bg-emerald-900/10">
        {[...Array(40)].map((_, i) => (
          <div
            key={i}
            className="absolute bg-gradient-to-b from-transparent to-teal-400/40 dark:to-teal-400/20"
            style={{
              left: `${Math.random() * 100}%`,
              top: `-10%`,
              width: '1px',
              height: `${20 + Math.random() * 40}px`,
              animation: `fall ${0.5 + Math.random() * 0.5}s linear infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
        <style>{`
          @keyframes fall {
            to { transform: translateY(110vh) translateX(20px); }
          }
        `}</style>
      </div>
    );
  }

  if (effectType === 'stars') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-orange-600/5 dark:bg-black/40">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="absolute bg-white rounded-full animate-pulse"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${Math.random() * 2}px`,
              height: `${Math.random() * 2}px`,
              opacity: Math.random() * 0.7,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 4}s`,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-orange-500/5 to-transparent animate-pulse" style={{ animationDuration: '10s' }} />
      </div>
    );
  }

  if (effectType === 'fireflies') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-emerald-500/5 dark:bg-green-950/20">
        {[...Array(30)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              width: `${Math.random() * 3 + 1.5}px`,
              height: `${Math.random() * 3 + 1.5}px`,
              backgroundColor: i % 3 === 0 ? '#bef264' : (i % 3 === 1 ? '#4ade80' : '#facc15'),
              boxShadow: `0 0 ${Math.random() * 10 + 5}px ${i % 3 === 0 ? '#bef264' : (i % 3 === 1 ? '#4ade80' : '#facc15')}`,
              animation: `firefly-drift ${5 + Math.random() * 10}s ease-in-out infinite, firefly-flash ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 10}s`,
              opacity: 0.8
            }}
          />
        ))}
        <style>{`
          @keyframes firefly-drift {
            0%, 100% { transform: translate(0, 0); }
            33% { transform: translate(${Math.random() * 30 - 15}px, ${Math.random() * 30 - 15}px); }
            66% { transform: translate(${Math.random() * 30 - 15}px, ${Math.random() * 30 - 15}px); }
          }
          @keyframes firefly-flash {
            0%, 100% { opacity: 0.2; transform: scale(0.8); }
            50% { opacity: 0.9; transform: scale(1.2); }
          }
        `}</style>
      </div>
    );
  }

  if (effectType === 'embers') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-orange-900/5 dark:bg-red-950/10">
        {[...Array(40)].map((_, i) => {
          const size = Math.random() * 3 + 1;
          const drift = Math.random() * 120 - 60;
          return (
            <div
              key={i}
              className="absolute rounded-sm blur-[0.3px]"
              style={{
                left: `${Math.random() * 110 - 5}%`,
                bottom: `-5%`,
                width: `${size}px`,
                height: `${size}px`,
                backgroundColor: i % 2 === 0 ? '#f97316' : '#ea580c',
                boxShadow: `0 0 ${size * 3}px ${i % 2 === 0 ? '#fba11b' : '#f97316'}`,
                animation: `embers-rise ${4 + Math.random() * 6}s ease-out infinite`,
                animationDelay: `${Math.random() * 8}s`,
              }}
            />
          );
        })}
        <style>{`
          @keyframes embers-rise {
            0% { transform: translateY(0) translateX(0) rotate(0deg) scale(1); opacity: 0; }
            15% { opacity: 1; transform: translateY(-15vh) translateX(5px) rotate(45deg) scale(1.2); }
            100% { transform: translateY(-110vh) translateX(${Math.random() * 200 - 100}px) rotate(720deg) scale(0.2); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  if (effectType === 'bubbles') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-sky-900/5 dark:bg-blue-950/10">
        {[...Array(25)].map((_, i) => {
          const size = Math.random() * 20 + 4;
          return (
            <div
              key={i}
              className="absolute border border-white/30 dark:border-white/20 rounded-full dark:bg-sky-400/5 bg-white/10 backdrop-blur-sm"
              style={{
                left: `${Math.random() * 100}%`,
                bottom: `-10%`,
                width: `${size}px`,
                height: `${size}px`,
                animation: `bubbles-wiggle ${8 + Math.random() * 10}s ease-in-out infinite`,
                animationDelay: `${Math.random() * 10}s`,
              }}
            />
          );
        })}
        <style>{`
          @keyframes bubbles-wiggle {
            0% { transform: translateY(0) translateX(0) scale(0.5); opacity: 0; }
            10% { opacity: 0.6; }
            50% { transform: translateY(-55vh) translateX(${Math.random() * 40 - 20}px) scale(1); }
            90% { opacity: 0.6; }
            100% { transform: translateY(-110vh) translateX(0) scale(1.3); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  if (effectType === 'steam') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-amber-900/5 dark:bg-stone-900/10">
        {[...Array(15)].map((_, i) => (
          <div
            key={i}
            className="absolute bg-white/10 dark:bg-white/5 blur-xl rounded-full"
            style={{
              left: `${20 + Math.random() * 60}%`,
              bottom: `-20%`,
              width: `${60 + Math.random() * 100}px`,
              height: `${60 + Math.random() * 100}px`,
              animation: `steam-rise ${8 + Math.random() * 8}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 8}s`,
            }}
          />
        ))}
        <style>{`
          @keyframes steam-rise {
            0% { transform: translateY(0) scale(1) translateX(0); opacity: 0; }
            30% { opacity: 0.4; }
            100% { transform: translateY(-120vh) scale(2) translateX(${Math.random() * 100 - 50}px); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  if (effectType === 'jazz-notes') {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0 bg-zinc-900/5 dark:bg-black/20">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="absolute text-yellow-500/20 dark:text-yellow-500/10 font-serif text-2xl select-none"
            style={{
              left: `${Math.random() * 100}%`,
              bottom: `-10%`,
              animation: `notes-float ${10 + Math.random() * 10}s linear infinite`,
              animationDelay: `${Math.random() * 10}s`,
            }}
          >
            {['♩', '♪', '♫', '♬'][i % 4]}
          </div>
        ))}
        <style>{`
          @keyframes notes-float {
            0% { transform: translateY(0) rotate(0deg) scale(0.8); opacity: 0; }
            15% { opacity: 0.8; }
            85% { opacity: 0.8; }
            100% { transform: translateY(-110vh) rotate(360deg) scale(1.2); opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  return null;
};

function SecretsPanel({ handleSendStego, onClose, initialExtractImage }) {
  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <StegoModal embedded onClose={onClose} onSendStego={handleSendStego} initialExtractImage={initialExtractImage} />
      </div>
    </div>
  );
}

class ChessPanelErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center p-6">
          <span className="text-3xl">♟</span>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Chess unavailable</p>
          <button onClick={() => this.setState({ hasError: false })}
            className="text-xs text-amber-600 dark:text-amber-400 underline">Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ChatRoom = () => {
  const location = useLocation();
  const roomCode = location.hash.slice(1);
  const navigate = useNavigate();
  const { t } = useTranslation();

  // If there is no room code in the hash (WebView stripped it on back-button press),
  // navigate to home before the browser paints — fires synchronously after commit.
  useLayoutEffect(() => {
    if (!roomCode) navigate('/home', { replace: true });
  }, [roomCode, navigate]);

  const [isConnected, setIsConnected] = useState(socketManager.isConnected);
  const [isJoined, setIsJoined] = useState(false);
  const [roomOpensAt, setRoomOpensAt] = useState(null); // ms timestamp — non-null = show countdown
  const [hotSeatTarget, setHotSeatTarget] = useState(null); // nickname of hot seat subject
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

  // Visual Viewport handler for mobile keyboard and browser chrome
  // On Capacitor native: Keyboard.resize:"body" + adjustResize handles everything —
  // the WebView body shrinks natively when the keyboard opens, so the flexbox layout
  // (.chat-container with height:100%) automatically adjusts. We only need to prevent
  // the page from scrolling on Android.
  // On web browsers: we still need the manual viewport calculation for iOS Safari.
  useEffect(() => {
    const isNative = Capacitor.getPlatform() !== 'web';

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(navigator.userAgent);

    // ── Native Capacitor: minimal handler ──
    // The body resizes automatically; just prevent unwanted page scroll on Android.
    if (isNative) {
      const preventScroll = () => {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      };

      // Keep page pinned to top (Android WebView can scroll behind the keyboard)
      window.addEventListener('scroll', preventScroll, { passive: false });
      window.addEventListener('resize', preventScroll);

      return () => {
        window.removeEventListener('scroll', preventScroll);
        window.removeEventListener('resize', preventScroll);
      };
    }

    // ── Web browser: full visualViewport handler (iOS Safari, etc.) ──
    let inputFocused = false;
    let initialVisualHeight = window.visualViewport?.height || window.innerHeight;

    const updateViewportHeight = () => {
      const vv = window.visualViewport;
      if (vv) {
        const visualHeight = vv.height;
        const visualOffsetTop = vv.offsetTop || 0;
        const heightDiff = initialVisualHeight - visualHeight;
        const keyboardThreshold = isAndroid ? 100 : 150;
        const keyboardLikelyOpen = inputFocused && heightDiff > keyboardThreshold;

        let targetHeight = keyboardLikelyOpen ? visualHeight : window.innerHeight;
        if (isIOS && keyboardLikelyOpen && visualOffsetTop > 0) {
          targetHeight = visualHeight - visualOffsetTop;
        }

        document.documentElement.style.setProperty('--vh', `${targetHeight * 0.01}px`);
        document.documentElement.style.setProperty('--chat-height', `${targetHeight}px`);
        document.documentElement.style.setProperty('--keyboard-height', keyboardLikelyOpen ? `${heightDiff}px` : '0px');
      } else {
        const vh = window.innerHeight;
        document.documentElement.style.setProperty('--vh', `${vh * 0.01}px`);
        document.documentElement.style.setProperty('--keyboard-height', '0px');
        document.documentElement.style.setProperty('--chat-height', `${vh}px`);
      }
    };

    const scrollToTop = () => {
      if (isAndroid) {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }
    };

    const handleFocusIn = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        inputFocused = true;
        if (isIOS) {
          document.body.classList.add('ios-keyboard-open');
          [50, 150, 300, 500].forEach(ms => setTimeout(updateViewportHeight, ms));
        } else {
          setTimeout(() => { updateViewportHeight(); scrollToTop(); }, 100);
          setTimeout(updateViewportHeight, 400);
        }
      }
    };

    const handleFocusOut = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        inputFocused = false;
        if (isIOS) {
          setTimeout(() => {
            document.body.classList.remove('ios-keyboard-open');
            updateViewportHeight();
          }, 100);
        } else {
          setTimeout(() => { updateViewportHeight(); scrollToTop(); }, 100);
        }
      }
    };

    updateViewportHeight();
    scrollToTop();

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateViewportHeight);
      window.visualViewport.addEventListener('scroll', scrollToTop);
    }
    window.addEventListener('resize', updateViewportHeight);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

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
  const [linkPreviews, setLinkPreviews] = useState({}); // { messageId: [preview, ...] }
  const [users, setUsers] = useState([]);
  const [persistentUserId] = useState(() => getCreatorId());
  const [currentUser, setCurrentUser] = useState(null);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState(null);
  const [inviteToken, setInviteToken] = useState(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [activePoll, setActivePoll] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [callState, setCallState] = useState({ state: CallState.IDLE });
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Watch Party state
  const [showMediaPlayer, setShowMediaPlayer] = useState(true);
  const [showWatchPartyModal, setShowWatchPartyModal] = useState(false); // kept for inline + menu triggers
  const [initialMedia, setInitialMedia] = useState(null); // Persisted media state from server on rejoin

  // Stealth Actions State
  const [isStealthMode, setIsStealthMode] = useState(false);
  const [overrideTtl, setOverrideTtl] = useState(null); // null = off, number = seconds per-message TTL
  const [showTtlPicker, setShowTtlPicker] = useState(false);

  // Pinned message
  const [pinnedMessage, setPinnedMessage] = useState(null);

  // Floating Reactions State
  const reactionLayerRef = useRef(null);
  const messageReactionOverlayRef = useRef(null);
  const lastReactionTime = useRef(0);

  // Sound engine
  const { emit: emitSound, setSoundContext } = useSound();
  const { settings: audioSettings, update: updateAudioSettings } = useAudioSettings();
  const soundEnabled = audioSettings.master;
  const { fetchPosition: fetchGeoPosition } = useGeofence();

  // Message Search (M1)
  const [showSearch, setShowSearch] = useState(false);

  // Live Typing Preview (M6)
  const [previewEnabled, setPreviewEnabled] = useState(() => localStorage.getItem('typingPreview_enabled') !== 'false');
  const previewDebounceRef = useRef(null);


  // Message Threads (M4)
  const [threadParent, setThreadParent] = useState(null);
  const { query: searchQuery, setQuery: setSearchQuery, results: searchResults, highlightMap, focusedMessageId, focusedIndex, next: searchNext, prev: searchPrev, clear: clearSearch } = useMessageSearch(messages);

  useEffect(() => {
    if (focusedMessageId) {
      const el = document.getElementById(focusedMessageId);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusedMessageId]);

  const toggleSound = useCallback(() => {
    updateAudioSettings({ master: !audioSettings.master });
  }, [audioSettings.master, updateAudioSettings]);

  // Live-sync sound state when changed from Settings modal or tray (Electron/init_script)
  useEffect(() => {
    const handler = (e) => updateAudioSettings({ master: !!e.detail });
    window.addEventListener('ephchat:soundEnabled', handler);
    return () => window.removeEventListener('ephchat:soundEnabled', handler);
  }, [updateAudioSettings]);

  // Knock-to-Join & Host State
  const [isWaitingForHost, setIsWaitingForHost] = useState(false);
  const [pendingGuests, setPendingGuests] = useState([]);
  const [isHost, setIsHost] = useState(false);
  const [roomKey, setRoomKey] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('user');
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState('general');

  const openSettings = useCallback((tab = 'general') => {
    setSettingsInitialTab(tab);
    setShowSettingsModal(true);
    emitSound('toggle');
  }, []);
  const [selectedRecipients, setSelectedRecipients] = useState([]);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [reactionTargetId, setReactionTargetId] = useState(null);
  const [showPollModal, setShowPollModal] = useState(false);
  const [showFeatureMenu, setShowFeatureMenu] = useState(false);
  const [roomVibe, setRoomVibe] = useState('default');
  const [roomTopic, setRoomTopic] = useState('');
  const [showTopicEditor, setShowTopicEditor] = useState(false);
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showCameraModal, setShowCameraModal] = useState(false);
  // Feature floating panels
  const { openPanel, closePanel, focusPanel, isOpen: isPanelOpen, getZ } = usePanelManager();
  const [stegoExtractImage, setStegoExtractImage] = useState(null);
  const [activeTetrisMessage, setActiveTetrisMessage] = useState(null);
  const [activeChessMessage, setActiveChessMessage] = useState(null);
  const [showChessConfig, setShowChessConfig] = useState(false);
  const setShowStegoModal = (v) => { if (!v) setStegoExtractImage(null); v ? openPanel('secrets') : closePanel('secrets'); };
  const setShowCodeShare    = (v) => v ? openPanel('code')    : closePanel('code');
  const [activeTimer, setActiveTimer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [showVideoCapture, setShowVideoCapture] = useState(false);
  const [videoReplyTarget, setVideoReplyTarget] = useState(null);
  const videoCaptureSendRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [editingMessage, setEditingMessage] = useState(null);
  const [latency, setLatency] = useState(null);
  const [activityLogs, setActivityLogs] = useState([]);
  const [showActivityLogs, setShowActivityLogs] = useState(false);
  const [hasNewLogs, setHasNewLogs] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const messagesContainerRef = useRef(null);
  const [offsets, setOffsets] = useState({ topic: 0, timer: 0 });
  const [showDesktopSidebar, setShowDesktopSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState('people');
  const [dragState, setDragState] = useState(null); // { type: 'topic' | 'timer', startX: number, startOffset: number }
  const [sessionToken, setSessionToken] = useState(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [verbalCode, setVerbalCode] = useState(null); // State for verbal code display
  const [autoApprove, setAutoApprove] = useState(false); // Auto-approve mode
  const [preApprovedList, setPreApprovedList] = useState([]); // Pre-approved users list

  // ─── Capacitor Keyboard State ────────────────────────────────
  // With Keyboard.resize: "body" + adjustResize, the WebView resizes natively.
  // Scroll messages into view when keyboard opens/closes so the latest messages
  // remain visible and there's no white gap flash.
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'web') {
      const scrollToBottom = () => {
        // Wait a frame for the WebView body to finish resizing
        requestAnimationFrame(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
        });
      };

      const handleWillHide = () => {
        // Keyboard is hiding (user dismissed it intentionally).
        // Scroll messages into view so the latest are visible.
        scrollToBottom();
      };

      const showListener = Keyboard.addListener('keyboardWillShow', scrollToBottom);
      const hideListener = Keyboard.addListener('keyboardWillHide', handleWillHide);

      return () => {
        showListener.then(l => l.remove());
        hideListener.then(l => l.remove());
      };
    }
  }, []);
  // ─── Android hardware back button ──────────────────────────────
  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android') return;
    let listenerHandle;
    CapApp.addListener('backButton', () => {
      navigate('/home', { replace: true });
    }).then(handle => { listenerHandle = handle; });
    return () => { if (listenerHandle) listenerHandle.remove(); };
  }, [navigate]);

  // ─── MLS Session State ──────────────────────────────────
  const [mlsReady, setMlsReady] = useState(false);
  const mlsReadyRef = useRef(false);
  const transportManagerRef = useRef(null);

  // Suggestions State
  const [suggestions, setSuggestions] = useState({ show: false, type: null, items: [], index: 0, query: '' });
  const suggestionRef = useRef(null);
  const [safariNoticeShown, setSafariNoticeShown] = useState(() => {
    return localStorage.getItem('safariAudioNoticeShown') === 'true';
  });
  const dragCounter = useRef(0);
  const typingTimeoutRef = useRef(null);
  const anonClickCountRef = useRef(0);
  const anonClickTimerRef = useRef(null);
  const anonHoldTimerRef = useRef(null);
  const currentUserRef = useRef(null);
  const { theme, effective: themeEffective } = useTheme();

  const [audioViewOnce, setAudioViewOnce] = useState(true);
  const [isAnonymousMode, setIsAnonymousMode] = useState(false);

  // ─── Sync MLS ref with state ───────────────────────────
  useEffect(() => { mlsReadyRef.current = mlsReady; }, [mlsReady]);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

  // ─── Initialize AES room-key on mount (no WASM needed) ───
  useEffect(() => {
    // Pre-derive the room key so the first encrypt/decrypt is instant.
    // This is a no-op if the key is already cached.
    initRoomEncryption(roomCode).catch(e => {
      console.error('[ChatRoom] AES key init failed:', e);
    });
  }, [roomCode]);

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
  const emojiHoverTimeoutRef = useRef(null);
  const featureHoverTimeoutRef = useRef(null);

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

  // --- Auto-ping for user activity to prevent server inactivity disconnect ---
  useEffect(() => {
    if (!isJoined || !isConnected) return;

    // Send an immediate heartbeat on join/reconnect
    socketManager.emit('user-activity');

    // Continuously ping the server every 60 seconds to prove the client is still alive
    // This allows users to be completely idle (no typing, mouse movement) without getting kicked
    const heartbeatInterval = setInterval(() => {
      socketManager.emit('user-activity');
    }, 60000); // 1 minute heartbeat

    return () => {
      clearInterval(heartbeatInterval);
    };
  }, [isJoined, isConnected]);
  // --------------------------------------------------------------------------

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
    const { nickname, password, capToken, inviteToken, sessionToken: resumeToken, lat, lng } = params;
    const userId = getCreatorId(); // Use persistent device ID for participation tracking
    const joinData = { roomCode, nickname, password, capToken, userId };
    if (inviteToken) joinData.inviteToken = inviteToken;
    if (resumeToken) joinData.sessionToken = resumeToken;
    if (lat != null) joinData.lat = lat;
    if (lng != null) joinData.lng = lng;

    socketManager.emit('join-room', joinData, async (response) => {
      if (!response) {
        setError('No response from server');
        setIsProcessingInvite(false);
        return;
      }
      if (response.redirect) {
        navigate(`/room#${response.roomCode}`, {
          replace: true,
          state: { fromInvite: true, nickname, inviteToken }
        });
        return;
      }
      if (!response.success && response.error === 'room-not-open-yet' && response.scheduledFor) {
        setRoomOpensAt(response.scheduledFor);
        setShowJoinModal(false);
        setIsProcessingInvite(false);
        return;
      }
      if (!response.success && response.error === 'geofence-location-required') {
        // Room requires GPS — fetch location and retry once
        const pos = await fetchGeoPosition();
        if (pos) {
          performJoin({ ...params, lat: pos.lat, lng: pos.lng });
        } else {
          setError('Location required to join this room. Please enable location access.');
          setIsProcessingInvite(false);
          setShowJoinModal(true);
        }
        return;
      }
      if (!response.success && response.error === 'geofence-out-of-range') {
        const dist = response.distanceMeters != null ? `${Math.round(response.distanceMeters)} m` : 'unknown distance';
        const radius = response.radiusMeters != null ? `${response.radiusMeters} m` : 'the allowed radius';
        setError(`You are too far from this room. You are ${dist} away but the room only allows within ${radius}.`);
        setIsProcessingInvite(false);
        setShowJoinModal(true);
        return;
      }
      if (response.success) {
        setIsConnected(true);
        setRoom(response.room);
        let msgs = response.messages || [];
        // Decrypt history messages — MLS v3 or legacy
        msgs = await Promise.all(msgs.map(async (msg) => {
          if (msg.isEncrypted && (msg.v === 4 || (msg.v === 3 && msg.mls))) {
            try {
              const decrypted = await decryptMLSMessage(msg, roomCode);
              const result = { ...msg, content: decrypted, isEncrypted: false };
              if (msg.messageType === 'poll' && !msg.pollData) {
                try { result.pollData = JSON.parse(decrypted); } catch { }
              }
              return result;
            } catch (e) {
              return { ...msg, content: '⚠️ Decryption failed' };
            }
          }
          return msg;
        }));
        setMessages(msgs);
        setUsers(response.users || []);

        const myRole = response.room.userRoles?.[socketManager.socket?.id] || (response.room.hostId === socketManager.socket?.id ? 'host' : 'user');
        setCurrentUserRole(myRole);
        setRoomVibe(response.room.vibe || 'default');
        setRoomTopic(response.room.topic || '');
        setActiveTimer(response.room.timer);
        setAutoApprove(response.room.autoApprove || false);
        setPreApprovedList(response.room.preApprovedList || []);
        if (response.room.hotSeatTarget) setHotSeatTarget(response.room.hotSeatTarget);
        socketManager.setRoomType(response.room.settings?.persistenceMode || 'ephemeral');

        setCurrentUser({ id: persistentUserId, socketId: socketManager.socket?.id, nickname: response.nickname, isAdmin: myRole === 'host' || myRole === 'tier1' });

        if (response.sessionToken) {
          setSessionToken(response.sessionToken);
        }

        setIsJoined(true);
        setShowJoinModal(false);
        setIsProcessingInvite(false);
        setIsWaitingForHost(false); // Clear here, after join is confirmed
        setIsReconnecting(false);
        setError(null);
        emitSound('connectionEstablished');

        // ─── AES-GCM Room Key Setup ───────────────────────
        // All members derive the same key from the roomCode via HKDF.
        // No handshake needed — ready immediately.
        try {
          await initRoomEncryption(roomCode);
          setMlsReady(true);
          console.log('[ChatRoom] 🔐 AES-GCM room key ready');
        } catch (e) {
          console.warn('[ChatRoom] AES key setup failed:', e.message);
        }

        // ─── PQXDH + Double Ratchet E2EE Setup ───────────
        // Upgrade to v5 protocol when both sides support it.
        // Falls back to v4 AES-GCM during key exchange (~200ms).
        try {
          await initE2EE(roomCode, socketManager);
          console.log('[ChatRoom] 🔐 PQXDH E2EE initialized (v5)');
        } catch (e) {
          console.warn('[ChatRoom] E2EE v5 setup failed (v4 fallback active):', e.message);
        }

        // ─── Fetch runtime config (works on Electron + Capacitor) ─
        // /api/config returns URLs that Vite build-time vars cannot know.
        let _runtimeCfg = null;
        try {
          const _cfgBase = socketManager.getServerUrl().replace(/\/$/, '');
          const _cfgRes = await fetch(`${_cfgBase}/api/config`);
          if (_cfgRes.ok) _runtimeCfg = await _cfgRes.json();
        } catch (_) { /* non-fatal */ }

        // ─── OHTTP — metadata-protecting oblivious proxy ──────────
        try {
          const relayUrl = _runtimeCfg?.ohttpRelayUrl ||
            import.meta.env.VITE_OHTTP_RELAY_URL || null;
          const serverBase = socketManager.getServerUrl().replace(/\/$/, '');
          const gatewayUrl = _runtimeCfg?.ohttpGatewayUrl || `${serverBase}/ohttp/request`;
          const configUrl = `${serverBase}/ohttp/config`;
          if (relayUrl) {
            await initOHTTP({ relayUrl, gatewayUrl, configUrl, enabled: true });
            console.log('[ChatRoom] OHTTP initialized');
          }
        } catch (e) {
          console.warn('[ChatRoom] OHTTP init failed (non-fatal):', e.message);
        }

        // ─── Privacy Pass — anonymous auth tokens ─────────────────
        try {
          const issuerUrl = _runtimeCfg?.privacyPassIssuerUrl ||
            `${socketManager.getServerUrl().replace(/\/$/, '')}/privacy-pass`;
          await initPrivacyPass(issuerUrl);
          console.log('[ChatRoom] 🎫 Privacy Pass initialized');
        } catch (e) {
          console.warn('[ChatRoom] Privacy Pass init failed (non-fatal):', e.message);
        }

        // ─── Traffic Padding — defeat traffic analysis ─────────────
        try {
          const _chaffSocket = socketManager.socket;
          initTrafficPadding('medium', (_msg, isChaff) => {
            // Chaff frames are emitted as no-op events (server has no handler → silent drop)
            if (isChaff && _chaffSocket?.connected) {
              _chaffSocket.emit('chaff', null);
            }
          });
          console.log('[ChatRoom] 🔀 Traffic padding active');
        } catch (e) {
          console.warn('[ChatRoom] Traffic padding init failed (non-fatal):', e.message);
        }

        // TransportManager init
        try {
          const tm = new TransportManager({
            socketManager,
            relayUrl: socketManager.getServerUrl(),
            iceConfig: {
              iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
              ]
            }
          });
          tm.onTransportSelected = (peerId, type) => {
            console.log(`🔗 P2P transport for ${peerId}: ${type}`);
          };
          transportManagerRef.current = tm;
        } catch (tmErr) {
          console.warn('⚠️ TransportManager init failed (socket fallback):', tmErr.message);
        }
        return;
      }
      setError(response.error || 'Failed to join room');
      setIsProcessingInvite(false);
      setIsWaitingForHost(false); // Clear on failure too, so modal shows error
      setIsReconnecting(false); // Stop spinner
      setShowJoinModal(true); // Re-show the join modal so the error is visible
      if (response.error && response.error.includes('not found')) {
        setIsJoined(false); // Kick user out if room is gone
      }
    });
  }, [roomCode, navigate, fetchGeoPosition]);

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

  const spawnMessageReaction = useCallback((messageId, emoji) => {
    const target = messageId ? document.getElementById(messageId) : null;
    const rect = target?.getBoundingClientRect?.();
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
    const y = rect ? rect.top + rect.height / 2 : window.innerHeight - 120;
    messageReactionOverlayRef.current?.spawn?.({ emoji, x, y });
  }, []);

  const handleRoomReaction = useCallback((data) => {
    const { emoji } = data;
    spawnReaction(emoji);
  }, [spawnReaction]);

  const triggerConfettiBomb = useCallback(() => {
    const layer = reactionLayerRef.current;
    if (!layer) return;

    const PIECE_COUNT = 90;
    for (let i = 0; i < PIECE_COUNT; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'confetti-piece';

        const isCircle = Math.random() > 0.55;
        const w = isCircle ? Math.random() * 7 + 4 : Math.random() * 8 + 4;
        const h = isCircle ? w : Math.random() * 14 + 6;
        const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];

        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * 52 + 22;
        const ex = (Math.cos(angle) * dist).toFixed(1);
        const ey = (Math.sin(angle) * dist - 25).toFixed(1);
        const spin = ((Math.random() - 0.5) * 1440).toFixed(0);
        const dur = (Math.random() * 1.4 + 1.2).toFixed(2);

        el.style.cssText = [
          `width:${w}px`, `height:${h}px`, `background:${color}`,
          `border-radius:${isCircle ? '50%' : '2px'}`,
          `--ex:${ex}vw`, `--ey:${ey}vh`,
          `--spin:${spin}deg`, `--dur:${dur}s`,
          `margin-left:-${(w / 2).toFixed(1)}px`,
          `margin-top:-${(h / 2).toFixed(1)}px`,
        ].join(';');

        el.addEventListener('animationend', () => el.remove(), { once: true });
        layer.appendChild(el);
      }, Math.random() * 450);
    }
  }, []);

  const lastConfettiLocalTime = useRef(0);

  const handleSendConfetti = useCallback(() => {
    const now = Date.now();
    if (now - lastConfettiLocalTime.current < 10000) return;
    lastConfettiLocalTime.current = now;
    socketManager.emit('send-confetti-bomb');
    triggerConfettiBomb();
    hapticMedium();
  }, [triggerConfettiBomb]);

  const handleConfettiBomb = useCallback(() => {
    triggerConfettiBomb();
    hapticLight();
  }, [triggerConfettiBomb]);

  const handleMessagePinned = useCallback((pinData) => {
    setPinnedMessage(pinData);
  }, []);

  const handleMessageUnpinned = useCallback(() => {
    setPinnedMessage(null);
  }, []);

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
    socketManager.connect();
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

    // Initial check (only if not already joined, to avoid double-join logic)
    if (socketManager.isConnected && !stateRef.current.isJoined) {
      handleConnect();
    }

    const handleDisconnect = (reason) => {
      setIsConnected(false);
      if (reason === 'transport close' || reason === 'ping timeout') {
        if (stateRef.current.isJoined) {
          setIsReconnecting(true);
        }
      }
    };

    const handleRoomJoined = async (data) => {
      setIsConnected(true);
      setIsReconnecting(false);
      setRoom(data.room);
      setUsers(data.users || []);
      let msgs = data.messages || [];
      // Decrypt history — MLS v3 or show as-is
      msgs = await Promise.all(msgs.map(async (msg) => {
        if (msg.isEncrypted && (msg.v === 4 || (msg.v === 3 && msg.mls))) {
          try {
            const decrypted = await decryptMLSMessage(msg, roomCode);
            const result = { ...msg, content: decrypted, isEncrypted: false };
            if (msg.messageType === 'poll' && !msg.pollData) {
              try { result.pollData = JSON.parse(decrypted); } catch { }
            }
            return result;
          } catch (e) {
            return { ...msg, content: '⚠️ Decryption failed' };
          }
        }
        return msg;
      }));
      setMessages(msgs);
      setUsers(data.users || []);

      const myRole = data.room.userRoles?.[socketManager.socket?.id] || (data.room.hostId === socketManager.socket?.id ? 'host' : 'user');
      setCurrentUserRole(myRole);
      setIsHost(myRole === 'host');
      setRoomVibe(data.room.vibe || 'default');
      setRoomTopic(data.room.topic || '');
      setActiveTimer(data.room.timer);
      setPinnedMessage(data.room.pinnedMessage || null);
      socketManager.setRoomType(data.room.settings?.persistenceMode || 'ephemeral');

      setCurrentUser({ id: persistentUserId, socketId: socketManager.socket?.id, nickname: data.nickname, isAdmin: (myRole === 'host' || myRole === 'tier1') });
      setIsJoined(true);
      setShowJoinModal(false);
      setError(null);

      // Restore persisted media state if the room had active media sessions
      if (data.activeMedia && (Array.isArray(data.activeMedia) ? data.activeMedia.length > 0 : data.activeMedia)) {
        // Server now sends an array; tag with _ts so reconnects re-trigger the effect
        const mediaArr = Array.isArray(data.activeMedia) ? data.activeMedia : [data.activeMedia];
        setInitialMedia(mediaArr.map(m => ({ ...m, _ts: Date.now() })));
      }
    };

    // ─── MLS Key Exchange Handlers ───────────────────────────
    const handleMLSKeyPackage = ({ keyPackage, from }) => {
      // Complete the PQXDH responder step when a joiner's key bundle arrives
      if (!roomCode) return;
      console.log('[ChatRoom] Key bundle received from:', from);
      handleIncomingKeyBundle({ socketId: from, bundle: keyPackage }, roomCode).catch(e => {
        console.warn('[ChatRoom] Key bundle handling failed:', e.message);
      });
    };

    const handleMLSWelcome = ({ welcome, commit }) => {
      // Joiner receives welcome message — join the group
      if (!roomCode || isMLSReady(roomCode)) return;
      console.log('[ChatRoom] MLS welcome received');
      try {
        joinMLSGroup(roomCode, welcome, null, null);
        setMlsReady(true);
        console.log('[ChatRoom] 🔐 MLS session ready (joined via welcome)');
      } catch (e) {
        console.warn('[ChatRoom] MLS join failed:', e.message);
      }
    };

    // ─── AES-GCM / E2EE Message Handler ─────────────────────
    const handleNewMessage = async (message) => {
      const isOwnMessage = message.sender?.socketId === socketManager.socket?.id;

      // v5 (PQXDH+DR), v4 (AES-GCM), or legacy v3 (MLS) encrypted messages
      if (message.isEncrypted && (message.v === 5 || message.v === 4 || (message.v === 3 && message.mls))) {
        try {
          const decrypted = await decryptMLSMessage(message, roomCode);
          message.content = decrypted;
          message.isEncrypted = false;
          if (message.messageType === 'poll' && !message.pollData) {
            try { message.pollData = JSON.parse(decrypted); } catch { }
          }
        } catch (e) {
          console.warn('[ChatRoom] Decrypt error:', e.message);
          message.content = '⚠️ Decryption failed';
        }
        if (!isOwnMessage) {
          const myNick = currentUserRef.current?.nickname;
          const hasMention = myNick && new RegExp(`@${myNick}\\b`, 'i').test(message.content ?? '');
          emitSound(hasMention ? 'mention' : 'receive');
        }
        setMessages(prev => [...prev, message]);
        return;
      }
      // Unencrypted — show as-is
      if (!isOwnMessage) emitSound('receive');
      setMessages(prev => [...prev, message]);
    };

    const handleMessageDeleted = ({ messageId }) => {
      setMessages(prev => prev.filter(m => m.id !== messageId));
      setActiveTetrisMessage(prev => prev?.id === messageId ? null : prev);
      setActiveChessMessage(prev => prev?.id === messageId ? null : prev);
    };

    const handleMessageEdited = async ({ message }) => {
      let content = message.content;
      let isEncrypted = message.isEncrypted;
      if (message.isEncrypted && (message.v === 5 || message.v === 4 || (message.v === 3 && message.mls))) {
        try {
          content = await decryptMLSMessage(message, roomCode);
          isEncrypted = false;
        } catch {
          content = '⚠️ Decryption failed';
          isEncrypted = false;
        }
      }
      setMessages(prev => prev.map(m =>
        m.id === message.id ? { ...m, ...message, content, isEncrypted } : m
      ));
    };

    const handleUserJoined = ({ user, roomUsers }) => {
      if (Array.isArray(roomUsers)) setUsers(roomUsers);
      else if (user?.socketId) setUsers(prev => {
        // Remove any existing entry with the same nickname (stale socket from reconnect)
        const filtered = prev.filter(u => u.socketId === user.socketId ? false : u.nickname !== user.nickname);
        return [...filtered, user];
      });

      // ─── MLS: no action needed here — joiners send key package on join ───

      // Attempt P2P transport to the new peer (non-blocking)
      if (user?.socketId && transportManagerRef.current) {
        transportManagerRef.current.connect(user.socketId, roomCode).catch(() => { });
      }

      emitSound('roomJoin');
      const displayName = user?.nickname || 'Someone';
      const log = { id: `log_${Date.now()}`, type: 'join', content: `${displayName} joined the room`, timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handleUserLeft = ({ nickname, socketId, userCount }) => {
      if (socketId) setUsers(prev => prev.filter(u => u.socketId !== socketId));
      else if (typeof userCount === 'number') setUsers(prev => prev.slice(0, userCount));

      emitSound('roomLeave');
      const displayName = nickname || 'A user';
      const log = { id: `log_${Date.now()}`, type: 'leave', content: `${displayName} left the room`, timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handleError = ({ code, message }) => {
      if (code === 'INVALID_KEY_BUNDLE') return;
      if (message.includes('Invalid') || message.includes('expired')) { setError(message); setShowJoinModal(true); }
    };

    const handleKnockApproved = async (data) => {
      if (isServerSigningReady() && data._sig) {
        const valid = await verifyServerSignature(data);
        if (!valid) console.warn('[Security] knock-approved signature invalid — possible relay tampering');
      }
      const { isHost } = data;
      // Keep the waiting/processing state active — do NOT clear isWaitingForHost
      // here. Clearing it now would cause JoinRoomModal to revert to form mode
      // between knock-approved and the join-room callback, which produces a blank
      // screen flash when React flushes the intermediate state.
      // setIsWaitingForHost(false) and setShowJoinModal(false) are handled
      // inside performJoin's success/failure callback.
      if (isHost) setIsHost(true);
      if (joinParamsRef.current) performJoin(joinParamsRef.current);
    };

    const handleKnockDenied = ({ reason }) => {
      setIsWaitingForHost(false);
      setError(reason || 'Entry denied');
      setIsProcessingInvite(false);
    };

    const handleUserKnocking = (guest) => setPendingGuests(prev => prev.find(g => g.socketId === guest.socketId) ? prev : [...prev, guest]);

    const handlePromotedToHost = async (data = {}) => {
      if (isServerSigningReady() && data._sig) {
        const valid = await verifyServerSignature(data);
        if (!valid) console.warn('[Security] promoted-to-host signature invalid — possible relay tampering');
      }
      setIsHost(true);
      setCurrentUserRole('host');
      setCurrentUser(prev => prev ? { ...prev, isAdmin: true } : prev);
      const log = { id: `log_${Date.now()}`, type: 'system', content: 'You are now the host of this room', timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };

    const handleMessageUpdated = async (updatedMessage) => {
      let finalMessage = updatedMessage;
      if (updatedMessage.isEncrypted && (updatedMessage.v === 4 || (updatedMessage.v === 3 && updatedMessage.mls))) {
        try {
          const decrypted = await decryptMLSMessage(updatedMessage, roomCode);
          finalMessage = { ...updatedMessage };
          finalMessage.content = decrypted;
          finalMessage.isEncrypted = false;
          if (finalMessage.messageType === 'poll' && !finalMessage.pollData) {
            try { finalMessage.pollData = JSON.parse(decrypted); } catch { }
          }
        } catch (e) {
          console.warn('[ChatRoom] Update decrypt error:', e.message);
          finalMessage.content = '⚠️ Decryption failed';
        }
      }
      setMessages(prev => prev.map(m => m.id === finalMessage.id ? finalMessage : m));
      // Keep open game panels in sync
      setActiveTetrisMessage(prev => (prev && prev.id === finalMessage.id) ? finalMessage : prev);
      setActiveChessMessage(prev => (prev && prev.id === finalMessage.id) ? finalMessage : prev);
    };

    // Role and moderation event handlers
    const handleRoleUpdated = async (data) => {
      if (isServerSigningReady() && data._sig) {
        const valid = await verifyServerSignature(data);
        if (!valid) console.warn('[Security] role-updated signature invalid — possible relay tampering');
      }
      const { userId, role, updatedBy } = data;
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
      setActivityLogs(prev => [{ id: `log_kick_${Date.now()}`, type: 'system', content: `You were kicked by ${kickedBy}: ${reason}`, timestamp: new Date().toISOString() }, ...prev].slice(0, 50));
      setIsJoined(false);
      setRoom(null);
      navigate('/home', { replace: true });
    };

    const handleUserKicked = ({ userId, nickname, kickedBy }) => {
      const log = { id: `log_${Date.now()}`, type: 'system', content: `${nickname} was kicked by ${kickedBy}`, timestamp: new Date().toISOString() };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
      setUsers(prev => prev.filter(u => u.socketId !== userId));
    };

    const handleGuestApproved = async (data) => {
      if (isServerSigningReady() && data._sig) {
        const valid = await verifyServerSignature(data);
        if (!valid) console.warn('[Security] guest-approved signature invalid — possible relay tampering');
      }
      const { guestId } = data;
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
      if (userId !== socketManager.socket?.id) emitSound('typingNearby');
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

    const handleMessageReaction = ({ messageId, emoji, fromSocketId }) => {
      const mySocketId = socketManager.socket?.id;
      if (fromSocketId && mySocketId && fromSocketId === mySocketId) return;
      spawnMessageReaction(messageId, emoji);
    };

    const handleMessageViewed = ({ messageId, userId, nickname, seenBy }) => {
      if (!messageId || !userId) return;
      setMessages(prev => prev.map(m => {
        if (m.id !== messageId) return m;
        const viewedBy = Array.isArray(m.viewedBy) ? m.viewedBy : [];
        const nextViewedBy = viewedBy.includes(userId) ? viewedBy : [...viewedBy, userId];

        const existingSeenBy = Array.isArray(m.seenBy) ? m.seenBy : [];
        const incoming = Array.isArray(seenBy) ? seenBy.filter(n => typeof n === 'string' && n) : [];
        const withIncoming = incoming.length > 0
          ? Array.from(new Set([...existingSeenBy, ...incoming]))
          : (nickname && typeof nickname === 'string' && !existingSeenBy.includes(nickname))
            ? [...existingSeenBy, nickname]
            : existingSeenBy;

        if (nextViewedBy === viewedBy && withIncoming === existingSeenBy) return m;
        return { ...m, viewedBy: nextViewedBy, seenBy: withIncoming };
      }));
    };

    socketManager.on('connect', handleConnect);
    socketManager.on('disconnect', handleDisconnect);
    socketManager.on('room-joined', handleRoomJoined);
    socketManager.on('new-message', handleNewMessage);
    socketManager.on('message-deleted', handleMessageDeleted);
    socketManager.on('message-edited', handleMessageEdited);
    socketManager.on('message-updated', handleMessageUpdated);
    socketManager.on('message-reaction', handleMessageReaction);
    socketManager.on('message-viewed', handleMessageViewed);
    socketManager.on('user-joined', handleUserJoined);
    socketManager.on('user-left', handleUserLeft);
    socketManager.on('room-error', handleError);
    socketManager.on('error', handleError);
    socketManager.on('latency-pong', handlePong);
    socketManager.on('mls-key-package', handleMLSKeyPackage);
    socketManager.on('mls-welcome', handleMLSWelcome);
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
    socketManager.on('confetti-bomb', handleConfettiBomb);
    socketManager.on('message-pinned', handleMessagePinned);
    socketManager.on('message-unpinned', handleMessageUnpinned);
    socketManager.on('room-opening', () => {
      setRoomOpensAt(null);
      // Auto-rejoin the now-open room using stored credentials
      if (!stateRef.current.isJoined && joinParamsRef.current) {
        performJoin(joinParamsRef.current);
      }
    });
    socketManager.on('hotSeat-started', ({ targetNickname }) => setHotSeatTarget(targetNickname));
    socketManager.on('hotSeat-ended', () => setHotSeatTarget(null));
    socketManager.on('room-fork-invite', ({ newRoomCode, fromNickname, isHost: forkIsHost }) => {
      const msg = forkIsHost ? `Forked room ${newRoomCode} is ready.` : `${fromNickname} forked the room — join code: ${newRoomCode}`;
      setActivityLogs(prev => [{ id: `log_fork_${Date.now()}`, type: 'system', content: msg, timestamp: new Date().toISOString() }, ...prev].slice(0, 50));
      setHasNewLogs(true);
      emitSound('roomInvite');
    });
    socketManager.on('file-transfer-invite', handleFileTransferInvite);

    // Screenshot detection handler
    const handleScreenshotDetected = ({ nickname, timestamp }) => {
      const log = {
        id: `log_ss_${Date.now()}_${Math.random()}`,
        type: 'screenshot',
        content: `📸 ${nickname} may have attempted a screenshot`,
        timestamp: timestamp || new Date().toISOString()
      };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
      triggerPulse();
    };
    socketManager.on('screenshot-detected', handleScreenshotDetected);

    // Auto-approve update handler
    const handleAutoApproveUpdated = ({ enabled, updatedBy }) => {
      setAutoApprove(enabled);
      const log = {
        id: `log_aa_${Date.now()}`,
        type: 'system',
        content: `${updatedBy} ${enabled ? 'enabled' : 'disabled'} auto-approve`,
        timestamp: new Date().toISOString()
      };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };
    socketManager.on('auto-approve-updated', handleAutoApproveUpdated);

    // Pre-approved list update handler
    const handlePreApprovedListUpdated = ({ list, updatedBy }) => {
      setPreApprovedList(list || []);
      const log = {
        id: `log_pal_${Date.now()}`,
        type: 'system',
        content: `${updatedBy} updated the pre-approved list (${(list || []).length} users)`,
        timestamp: new Date().toISOString()
      };
      setActivityLogs(prev => [log, ...prev].slice(0, 50));
      if (!showActivityLogs) setHasNewLogs(true);
    };
    socketManager.on('pre-approved-list-updated', handlePreApprovedListUpdated);

    socketManager.on('messages-cleared', () => {
      // Wipe local session data
      destroyMLSSession(roomCode);
      destroyE2EESession(roomCode);
      try {
        sessionStorage.removeItem('eph-creator-id');
        sessionStorage.removeItem('eph-creator-token');
        sessionStorage.removeItem('ephchat-device-id');
      } catch (_) {}
      setMessages([]);
      setLinkPreviews({});
      setActivityLogs(prev => [{
        id: `log_${Date.now()}`,
        type: 'system',
        content: 'Room content has been cleared (Panic Burn)',
        timestamp: new Date().toISOString()
      }, ...prev].slice(0, 50));
    });

    // ─── Link Preview Updates ────────────────────────────────
    // Server sends 'link-preview-update' when metadata is fetched for URLs in messages.
    // Can arrive immediately (cached) or after async fetch.
    const handleLinkPreviewUpdate = ({ messageId, previews }) => {
      if (!messageId || !previews || !Array.isArray(previews)) return;
      setLinkPreviews(prev => ({
        ...prev,
        [messageId]: [...(prev[messageId] || []), ...previews],
      }));
    };
    socketManager.on('link-preview-update', handleLinkPreviewUpdate);


    return () => {
      socketManager.off('connect', handleConnect);
      socketManager.off('disconnect', handleDisconnect);
      socketManager.off('room-joined', handleRoomJoined);
      socketManager.off('new-message', handleNewMessage);
      socketManager.off('message-deleted', handleMessageDeleted);
      socketManager.off('message-edited', handleMessageEdited);
      socketManager.off('message-updated', handleMessageUpdated);
      socketManager.off('message-reaction', handleMessageReaction);
      socketManager.off('message-viewed', handleMessageViewed);
      socketManager.off('user-joined', handleUserJoined);
      socketManager.off('user-left', handleUserLeft);
      socketManager.off('room-error', handleError);
      socketManager.off('error', handleError);
      socketManager.off('latency-pong', handlePong);
      socketManager.off('mls-key-package', handleMLSKeyPackage);
      socketManager.off('mls-welcome', handleMLSWelcome);
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
      socketManager.off('confetti-bomb', handleConfettiBomb);
      socketManager.off('message-pinned', handleMessagePinned);
      socketManager.off('message-unpinned', handleMessageUnpinned);
      socketManager.off('room-opening');
      socketManager.off('room-fork-invite');
      socketManager.off('hotSeat-started');
      socketManager.off('hotSeat-ended');
      socketManager.off('file-transfer-invite', handleFileTransferInvite);
      socketManager.off('screenshot-detected', handleScreenshotDetected);
      socketManager.off('auto-approve-updated', handleAutoApproveUpdated);
      socketManager.off('pre-approved-list-updated', handlePreApprovedListUpdated);
      socketManager.off('messages-cleared');
      socketManager.off('link-preview-update', handleLinkPreviewUpdate);

      // ─── MLS Security: Clean up session + padding ───
      destroyMLSSession(roomCode);
      destroyE2EESession(roomCode);
      stopTrafficPadding();
      setMlsReady(false);

      // ─── P2P Transport: Tear down ICE connections ───
      if (transportManagerRef.current) {
        try { transportManagerRef.current.destroy?.(); } catch (_) { }
        transportManagerRef.current = null;
      }

      // Explicitly leave the room before disconnecting
      socketManager.emit('leave-room');

      if (!import.meta.env.DEV) {
        socketManager.disconnect();
      }
    };
  }, [roomCode, performJoin, handleFileTransferInvite, triggerPulse]); // roomKey excluded — not used in effect body, was causing spurious socket restarts

  useEffect(() => {
    if (!isConnected) return;
    const interval = setInterval(() => {
      socketManager.emit('latency-ping', Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, [isConnected]);

  // High-Assurance Quick Actions (Electron only, Option C)
  useEffect(() => {
    if (window.electronAPI?.onToggleStealth) {
      window.electronAPI.onToggleStealth(() => {
        setIsStealthMode(prev => {
          const next = !prev;
          if (next) hapticLight();
          return next;
        });
      });
    }

    if (window.electronAPI?.onToggleOverrideTtl) {
      window.electronAPI.onToggleOverrideTtl(() => {
        setOverrideTtl(prev => {
          const next = prev ? null : 10; // Toggle between off and 10s default
          if (next) hapticLight();
          return next;
        });
      });
    }

    if (window.electronAPI?.onPanicBurn) {
      window.electronAPI.onPanicBurn(() => {
        if (socketManager.socket?.connected) {
          socketManager.emit('panic-burn', { roomCode });
          hapticHeavy();
        }
      });
    }

    if (window.electronAPI?.onToggleAnonymous) {
      window.electronAPI.onToggleAnonymous(() => {
        setIsAnonymousMode(prev => {
          const next = !prev;
          if (next) hapticLight();
          return next;
        });
      });
    }
  }, []);

  // Zeroize key material on tab/browser close (beforeunload doesn't trigger React cleanup)
  useEffect(() => {
    const wipe = () => {
      destroyMLSSession(roomCode);
      destroyE2EESession(roomCode);
      stopTrafficPadding();
    };
    window.addEventListener('beforeunload', wipe);
    window.addEventListener('pagehide', wipe); // iOS Safari
    return () => {
      window.removeEventListener('beforeunload', wipe);
      window.removeEventListener('pagehide', wipe);
    };
  }, [roomCode]);

  // Ctrl+Z global panic-burn shortcut (web + desktop, skips text inputs)
  useEffect(() => {
    const handlePanicKey = (e) => {
      if (!e.ctrlKey || e.shiftKey || e.altKey) return;
      if (e.key !== 'z' && e.key !== 'Z') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      if (socketManager.socket?.connected && roomCode) {
        socketManager.emit('panic-burn', { roomCode });
      }
    };
    window.addEventListener('keydown', handlePanicKey, true);
    return () => window.removeEventListener('keydown', handlePanicKey, true);
  }, [roomCode]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 250;

    // Auto-scroll only if already near bottom or if the last message was from the current user
    const lastMessage = messages[messages.length - 1];
    const isOwnMessage = lastMessage && currentUser && (
      lastMessage.sender.socketId === currentUser.socketId ||
      lastMessage.sender.id === currentUser.id
    );

    if (isNearBottom || isOwnMessage) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;

    // Show button if we are more than 300px away from the bottom
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    setShowScrollBottom(distanceFromBottom > 300);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        const drawer = document.getElementById('emoji-drawer');
        if (!drawer || !drawer.contains(event.target)) {
          setShowEmojiPicker(false);
        }
      }
      if (featureMenuRef.current && !featureMenuRef.current.contains(event.target)) {
        setShowFeatureMenu(false);
      }
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setSuggestions(prev => ({ ...prev, show: false }));
      }
      if (!event.target.closest('[data-ttl-picker]')) {
        setShowTtlPicker(false);
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
      const filtered = SLASH_COMMANDS.filter(cmd => {
        const cmdValue = cmd.value.substring(1).toLowerCase();
        return cmdValue.startsWith(query) && (!cmd.adminOnly || canManageRoom(currentUserRole));
      });
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
        .filter(u => u.nickname.toLowerCase().startsWith(query));

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
      if (item.value === '/ice') {
        handleSendIcebreaker();
        setSuggestions(prev => ({ ...prev, show: false }));
        return;
      }
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
    } else if (e.key === 'Enter') {
      // Intercept Enter directly — bypass form onSubmit to avoid Android keyboard flash.
      // The form's submit event can cause a brief blur→refocus cycle on mobile.
      e.preventDefault();
      doSendMessage();
    }
  };

  const onEmojiClick = (emojiData) => {
    if (reactionTargetId) {
      handleReaction(reactionTargetId, emojiData.emoji);
      setReactionTargetId(null);
      setShowEmojiPicker(false);
      return;
    }
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

  const handleCancelJoin = useCallback(() => navigate('/home', { replace: true }), [navigate]);

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

  const handleToggleAutoApprove = () => {
    const newValue = !autoApprove;
    socketManager.emit('toggle-auto-approve', { roomCode, enabled: newValue });
  };

  const handleUpdatePreApprovedList = (list) => {
    socketManager.emit('update-pre-approved-list', { roomCode, list });
  };

  // Parse pre-approved list from text (comma-separated, optional roles in parentheses)
  // Format: user1(admin),user2,user3(mod),user4
  const parsePreApprovedText = (text) => {
    if (!text || !text.trim()) return [];
    return text.split(',')
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0)
      .map(entry => {
        const match = entry.match(/^([^(]+?)(?:\(([^)]+)\))?$/);
        if (!match) return null;
        return {
          name: match[1].trim(),
          role: (match[2] || 'none').trim().toLowerCase()
        };
      })
      .filter(Boolean);
  };

  // Handle .txt file upload for pre-approved list
  const handlePreApprovedFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.txt')) {
      setError('Only .txt files are supported');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const parsed = parsePreApprovedText(text);
      if (parsed.length > 0) {
        handleUpdatePreApprovedList(parsed);
      } else {
        setError('Could not parse any users from the file');
      }
    };
    reader.readAsText(file);
    // Reset file input
    e.target.value = '';
  };

  // Core send logic — called directly (no event needed)
  // This avoids the form submission pipeline that causes Android keyboard blur flash
  const doSendMessage = async () => {
    if (!newMessage.trim() || isSending || !isConnected) return;

    // 1. Handle Slash Commands
    if (newMessage.trim().startsWith('/')) {
      const parts = newMessage.trim().split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const args = parts.slice(1).join(' ');

      emitSound('tap');
      switch (cmd) {
        case '/camera': setShowCameraModal(true); break;
        case '/poll': setShowPollModal(true); break;
        case '/call':
          if (users.length > 7) setError('Voice calls are disabled in rooms with more than 7 users for stability.');
          else handleStartCall();
          break;
        case '/photo':
        case '/image': fileInputRef.current?.click(); break;
        case '/voice':
        case '/note': startRecording(); break;
        case '/ice': handleSendIcebreaker(); break;
        case '/pulse': handleSendPulse(); break;
        case '/confetti': handleSendConfetti(); break;
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
        case '/hotseat':
        case '/hotSeat':
          if (isHost) {
            const targetNick = args.trim() || users.find(u => u.nickname !== currentUser?.nickname)?.nickname;
            if (targetNick) socketManager.emit('hotSeat-start', { targetNickname: targetNick });
            else setError('Usage: /hotSeat <nickname>');
          } else setError('Only the host can start Hot Seat');
          break;
        case '/media':
        case '/watch':
        case '/watchparty':
          if (args) {
            const detected = detectMediaUrl(args);
            if (detected) {
              socketManager.emit('media-share', { roomCode, type: detected.type, id: detected.id || null, url: detected.url, sharedBy: currentUser?.nickname || 'Someone' });
              setShowMediaPlayer(true);
            } else setError('Paste a YouTube URL after /media');
          } else {
            // No URL provided — open the watch party modal
            setShowWatchPartyModal(true);
          }
          break;
        case '/stego':
          setShowStegoModal(true);
          break;
        case '/code':
          setShowCodeShare(true);
          break;
        case '/tetris':
          handleSendTetris();
          break;
        case '/chess':
          setShowChessConfig(true);
          break;
        default: break;
      }
      if (cmd.startsWith('/')) {
        const isValid = SLASH_COMMANDS.some(c => c.value === cmd || c.value.startsWith(cmd + ' '));
        if (isValid) { if (cmd !== '/ice') setNewMessage(''); return; }
      }
    }

    // Auto-detect YouTube URLs and trigger Watch Party
    {
      const detected = detectMediaUrl(newMessage.trim());
      if (detected) {
        socketManager.emit('media-share', {
          roomCode,
          type: detected.type,
          id: detected.id || null,
          url: detected.url,
          sharedBy: currentUser?.nickname || 'Someone'
        });
        setShowMediaPlayer(true);
        setNewMessage('');
        return;
      }
    }

    setIsSending(true);
    try {
      let content = newMessage.trim();
      const mentionMatches = content.match(/@(\w+)/g) || [];
      const mentionedSocketIds = mentionMatches.map(m => {
        const nick = m.substring(1).toLowerCase();
        const user = users.find(u => u.nickname.toLowerCase() === nick);
        return user?.socketId;
      }).filter(Boolean);

      if (mentionMatches.length > 0) {
        let strippedContent = content;
        let changed = true;
        while (changed) {
          changed = false;
          const match = strippedContent.match(/^@\w+\s*/);
          if (match) { strippedContent = strippedContent.substring(match[0].length); changed = true; }
        }
        if (strippedContent.trim()) content = strippedContent.trim();
      }

      const finalRecipients = mentionedSocketIds.length > 0 ? mentionedSocketIds : selectedRecipients;

      let v2Payload;
      try {
        v2Payload = await encryptMLSMessage(content, roomCode);
      } catch (e) {
        console.error('AES encrypt failed — message NOT sent:', e.message);
        setError('Encryption failed. Please rejoin the room.');
        return;
      }

      const replyData = replyingTo ? {
        id: replyingTo.id,
        content: (() => {
          switch (replyingTo.messageType) {
            case 'image': return 'Image';
            case 'audio': return 'Voice Note';
            case 'file': return replyingTo.fileName || 'File';
            case 'poll': return replyingTo.pollData?.question || 'Poll';
            default: return replyingTo.content;
          }
        })(),
        sender: replyingTo.sender.nickname
      } : null;

      await withJitter(() => {
        socketManager.emit('send-message', {
          ...v2Payload,
          messageType: 'text',
          recipients: finalRecipients,
          replyTo: replyData,
          isAnonymous: isAnonymousMode,
          isEncrypted: true,
          overrideTtl: overrideTtl || null
        });
      });

      if (overrideTtl) setOverrideTtl(null);
      if (!isStealthMode) socketManager.emit('user-activity');
      hapticLight();
      emitSound('send');

      // ── Clear message while keeping keyboard open ──
      // We clear state after sends. On mobile, we avoid disabling the input 
      // during isSending to prevent the OS from auto-blurring (which hides keyboard).
      setNewMessage('');
      setReplyingTo(null);
      // Clear live preview for others
      if (previewEnabled) {
        if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
        socketManager.emit('typing-preview', { partial: '' });
      }

      // Focus the input to ensure keyboard stays up
      if (messageInputRef.current) {
        messageInputRef.current.focus();
        // Defer a visual focus to ensure React re-render doesn't stomp it
        setTimeout(() => {
          messageInputRef.current?.focus();
        }, 10);
      }
    } catch (error) {
      setError('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  // Form onSubmit wrapper (handles Enter key on desktop)
  const handleSendMessage = (e) => {
    e.preventDefault();
    doSendMessage();
  };

  // Programmatic send (used by CodeShareModal / other modals)
  const sendTextMessage = useCallback(async (content) => {
    if (!content.trim() || !isConnected) return;
    setIsSending(true);
    try {
      let v2Payload;
      try {
        v2Payload = await encryptMLSMessage(content, roomCode);
      } catch (e) {
        setError('Encryption failed.');
        return;
      }
      await withJitter(() => {
        socketManager.emit('send-message', {
          ...v2Payload,
          messageType: 'text',
          recipients: [],
          replyTo: null,
          isAnonymous: false,
          isEncrypted: true,
          overrideTtl: null,
        });
      });
    } finally {
      setIsSending(false);
    }
  }, [isConnected, roomCode]);

  const handleSendPoll = (pollData) => {
    // Polls are NOT encrypted — the server needs pollData to manage votes.
    if (!isConnected) return;
    socketManager.emit('send-message', {
      messageType: 'poll',
      pollData,
      recipients: selectedRecipients,
      isAnonymous: isAnonymousMode
    });
  };

  const handleDeleteMessage = (messageId) => {
    socketManager.emit('delete-message', { messageId });
  };


  // ── Share result handler ──────────────────────────────────────────
  const handleShareResult = (text) => {
    if (!isConnected || !text) return;
    socketManager.emit('send-message', { content: text });
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

  const handlePinMessage = useCallback(({ messageId, text, senderNickname }) => {
    if (pinnedMessage?.messageId === messageId) {
      socketManager.emit('unpin-message');
    } else {
      socketManager.emit('pin-message', { messageId, text, senderNickname });
    }
  }, [pinnedMessage]);

  const handleUnpinMessage = useCallback(() => {
    socketManager.emit('unpin-message');
  }, []);

  const handleForkRoom = useCallback((targetSocketIds) => {
    socketManager.emit('fork-room', { targetSocketIds });
  }, []);

  const handleThreadReply = useCallback(async (parentId, content) => {
    if (!content.trim() || !isConnected) return;
    try {
      const v2Payload = await encryptMLSMessage(content.trim(), roomCode);
      socketManager.emit('send-message', {
        ...v2Payload,
        messageType: 'text',
        parentId,
        isEncrypted: true,
        isAnonymous: isAnonymousMode,
      });
    } catch (e) {
      console.error('Thread reply encryption failed:', e.message);
    }
  }, [isConnected, roomCode, isAnonymousMode]);

  const handleReaction = (messageId, emoji) => {
    spawnMessageReaction(messageId, emoji);
    socketManager.emit('add-reaction', { messageId, emoji });
    emitSound('reaction');
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

  const handleTyping = (partial) => {
    if (isStealthMode || isAnonymousMode) return; // Block typing indicator in stealth/anon mode
    socketManager.emit('typing', { roomCode });
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socketManager.emit('stop-typing', { roomCode });
    }, 1000);
    // Live preview — debounced at 200ms
    if (previewEnabled && typeof partial === 'string') {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
      previewDebounceRef.current = setTimeout(() => {
        socketManager.emit('typing-preview', { partial });
      }, 200);
    }
  };

  const handleSendPulse = () => {
    socketManager.emit('send-pulse', { roomCode });
    hapticHeavy(); // Strong haptic feedback for pulse
    triggerPulse(); // Immediate local feedback

    // Add local log for sender
    const log = { id: `log_${Date.now()}`, type: 'pulse', content: `You sent a pulse`, timestamp: new Date().toISOString() };
    setActivityLogs(prev => [log, ...prev].slice(0, 50));
  };

  const handleSendIcebreaker = () => {
    const question = getRandomIcebreaker();
    setNewMessage(`🧊 ${question}`);
    setShowFeatureMenu(false);
    hapticLight();
    emitSound('tap');
    // Focus the input field so user can edit or send
    setTimeout(() => {
      messageInputRef.current?.focus();
    }, 100);
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

      // View-once images are encrypted just like all other content.
      // The recipient decrypts client-side on reveal — the server never sees plaintext.
      if (isViewOnce && isImage) {
        let voPayload;
        try {
          voPayload = await encryptMLSMessage(content, roomCode);
        } catch (encErr) {
          console.error('View-once encrypt failed:', encErr.message);
          setError('Encryption failed. Please rejoin the room.');
          setIsUploading(false);
          return;
        }
        socketManager.emit('send-message', {
          ...voPayload,
          messageType: 'image',
          isViewOnce: true,
          recipients: selectedRecipients,
          isAnonymous: isAnonymousMode,
          replyTo: replyingTo ? {
            id: replyingTo.id,
            content: replyingTo.messageType === 'image' ? 'Image'
              : replyingTo.messageType === 'audio' ? 'Voice Note'
              : replyingTo.content,
            sender: replyingTo.sender.nickname
          } : null
        });
        setReplyingTo(null);
        setIsUploading(false);
        return;
      }

      // AES-GCM encrypt all non-view-once images and files
      let v2Payload;
      try {
        v2Payload = await encryptMLSMessage(content, roomCode);
      } catch (e) {
        console.error('AES file encrypt failed — file NOT sent:', e.message);
        setError('File encryption failed. Please rejoin the room.');
        setIsUploading(false);
        return;
      }

      // Try P2P transport first for large files
      const encryptedBlob = new Blob([JSON.stringify(v2Payload)], { type: 'application/octet-stream' });
      let sentViaP2P = false;

      if (transportManagerRef.current && selectedRecipients.length > 0 && file.size > 64 * 1024) {
        // For large files, attempt P2P/relay for each direct recipient
        try {
          const results = await Promise.all(
            selectedRecipients.map(peerId =>
              transportManagerRef.current.sendFile(peerId, encryptedBlob, {
                messageType: isImage ? 'image' : 'file',
                fileName: file.name,
                mimeType: file.type,
                fileSize: file.size,
                isViewOnce,
                isEncrypted: true
              })
            )
          );
          sentViaP2P = results.every(r => r.success);
          if (sentViaP2P) {
            console.log(`📡 File sent via P2P to ${selectedRecipients.length} peer(s)`);
          }
        } catch (p2pErr) {
          console.warn('P2P file transfer failed, using socket fallback:', p2pErr.message);
        }
      }

      // ─── Socket.IO fallback (broadcast or P2P failed) ────
      if (!sentViaP2P) {
        await withJitter(() => {
          socketManager.emit('send-message', {
            ...v2Payload,
            messageType: isImage ? 'image' : 'file',
            imageData: isImage ? v2Payload.ct : undefined,
            isEncrypted: true,
            isViewOnce,
            fileName: file.name,
            mimeType: file.type,
            fileSize: file.size,
            recipients: selectedRecipients,
            isAnonymous: isAnonymousMode,
            replyTo: replyingTo ? {
              id: replyingTo.id,
              content: replyingTo.messageType === 'image' ? 'Image'
                : replyingTo.messageType === 'audio' ? 'Voice Note'
                : replyingTo.content,
              sender: replyingTo.sender.nickname
            } : null
          });
        });
      }
      setReplyingTo(null);
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

  const handleSendStego = (stegoBlob) => {
    const file = new File([stegoBlob], `stego_${Date.now()}.png`, { type: 'image/png' });
    uploadFile(file, { isViewOnce: false });
  };

  const handleStegoExtract = (dataUrl) => {
    const [header, b64] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: mime });
    setStegoExtractImage(blob);
    openPanel('secrets');
  };


  const handleSendTetris = () => {
    if (!isConnected) return;
    socketManager.emit('send-message', {
      messageType: 'game',
      gameData: { gameType: 'tetris' },
      userId: persistentUserId,
      isAnonymous: false,
    });
  };

  const handleTetrisJoin = (messageId) => {
    if (!isConnected) return;
    socketManager.emit('tetris-join', { messageId });
    // Open panel immediately for the joining player
    setMessages(prev => {
      const msg = prev.find(m => m.id === messageId);
      if (msg) { setActiveTetrisMessage(msg); openPanel('tetris'); }
      return prev;
    });
  };

  const handleTetrisLaunch = (message) => {
    setActiveTetrisMessage(message);
    openPanel('tetris');
    hapticLight();
  };

  const handleTetrisSpectate = (message) => {
    setActiveTetrisMessage(message);
    openPanel('tetris');
  };

  // Close tetris panel when the game message is deleted
  useEffect(() => {
    if (!activeTetrisMessage && isPanelOpen('tetris')) closePanel('tetris');
  }, [activeTetrisMessage]);

  const [chessTimeControl, setChessTimeControl] = useState(null); // null = no timer

  const handleSendChess = (cpuDifficulty = null) => {
    if (!isConnected) return;
    socketManager.emit('send-message', {
      messageType: 'game',
      gameData: { gameType: 'chess', ...(cpuDifficulty ? { cpuDifficulty } : {}), timeControl: chessTimeControl },
      userId: persistentUserId,
      isAnonymous: false,
    });
    setShowChessConfig(false);
  };

  const handleChessJoin = (messageId) => {
    if (!isConnected) return;
    socketManager.emit('chess-join', { messageId });
    setMessages(prev => {
      const msg = prev.find(m => m.id === messageId);
      if (msg) { setActiveChessMessage(msg); openPanel('chess'); }
      return prev;
    });
  };

  const handleChessLaunch = (message) => {
    setActiveChessMessage(message);
    openPanel('chess');
    hapticLight();
  };

  const handleChessSpectate = (message) => {
    setActiveChessMessage(message);
    openPanel('chess');
  };

  const handleChessVsCpu = (message) => {
    setActiveChessMessage(message);
    openPanel('chess');
    hapticLight();
  };

  useEffect(() => {
    if (!activeChessMessage && isPanelOpen('chess')) closePanel('chess');
  }, [activeChessMessage]);


  const handleEditMessage = (message) => {
    setEditingMessage(message);
  };

  const handleSaveEdit = async (newContent) => {
    if (editingMessage) {
      try {
        const v2Payload = await encryptMLSMessage(newContent, roomCode);
        socketManager.emit('edit-message', {
          messageId: editingMessage.id,
          ...v2Payload,
          isEncrypted: true
        });
      } catch (e) {
        console.error('Edit encryption failed:', e.message);
        setError('Failed to encrypt edit.');
      }
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
      setSoundContext({ recording: true });
      emitSound('recordingStart');
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
    setSoundContext({ recording: false });
    emitSound('recordingStop');
    clearInterval(recordingTimerRef.current);
  };

  const handleCancelRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setSoundContext({ recording: false });
    emitSound('recordingStop');
    setRecordingDuration(0);
    clearInterval(recordingTimerRef.current);
  };

  const sendAudioMessage = async (audioBlob) => {
    if (audioBlob.size > 5 * 1024 * 1024) {
      setError('Voice note is too large (max 5MB).');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Audio = reader.result.split(',')[1];

      // ─── AES-GCM encryption for audio ───────────────────────
      try {
        const v2Payload = await encryptMLSMessage(base64Audio, roomCode);
        await withJitter(() => {
          socketManager.emit('send-message', {
            ...v2Payload,
            messageType: 'audio',
            isEncrypted: true,
            isViewOnce: audioViewOnce,
            recipients: selectedRecipients,
            replyTo: replyingTo ? {
              id: replyingTo.id,
              content: replyingTo.messageType === 'image' ? 'Image'
                : replyingTo.messageType === 'audio' ? 'Voice Note'
                : replyingTo.content,
              sender: replyingTo.sender.nickname
            } : null
          });
        });
        setReplyingTo(null);
      } catch (e) {
        console.error('Audio encryption failed:', e.message);
        setError('Failed to encrypt audio.');
      }
    };
    reader.readAsDataURL(audioBlob);
  };

  const sendVideoReply = async (blob, replyTo, duration, mimeType, filterStyle, overlays, allowSave) => {
    if (!blob || blob.size === 0) return;
    if (blob.size > 8 * 1024 * 1024) {
      setError('Video reply is too large (max 8MB).');
      return;
    }
    // Yield main thread for large blobs to avoid UI stutter during base64 encode
    if (blob.size > 4 * 1024 * 1024) await new Promise(r => setTimeout(r, 0));
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Video = reader.result.split(',')[1];
      try {
        const v2Payload = await encryptMLSMessage(base64Video, roomCode);
        await withJitter(() => {
          socketManager.emit('send-message', {
            ...v2Payload,
            messageType: 'videoReply',
            isEncrypted: true,
            isViewOnce: !allowSave,
            duration,
            mimeType: mimeType || 'video/webm',
            filterStyle: filterStyle && filterStyle !== 'none' ? filterStyle : undefined,
            overlays: overlays && overlays.length > 0 ? overlays : undefined,
            recipients: selectedRecipients,
            replyTo: replyTo ? {
              id: replyTo.id,
              content: replyTo.messageType === 'image' ? 'Image'
                : replyTo.messageType === 'audio' ? 'Voice Note'
                : replyTo.messageType === 'videoReply' ? 'Video Reply'
                : replyTo.content,
              sender: replyTo.sender?.nickname ?? replyTo.sender
            } : null,
          });
        });
        emitSound('send');
      } catch (e) {
        console.error('Video reply encryption failed:', e.message);
        setError('Failed to encrypt video reply.');
      }
    };
    reader.readAsDataURL(blob);
  };

  const handleVideoReplyGesture = useCallback(({ phase, message }) => {
    switch (phase) {
      case 'arm':
        cameraPrewarmService.prewarm('user').catch(() => {});
        break;
      case 'intent':
        setVideoReplyTarget(message ?? null);
        setShowVideoCapture(true);
        hapticLight();
        emitSound('tap');
        break;
      case 'release':
        videoCaptureSendRef.current?.();
        break;
      case 'cancel':
        setShowVideoCapture(false);
        setVideoReplyTarget(null);
        cameraPrewarmService.suspend();
        break;
      default:
        break;
    }
  }, [emitSound, hapticLight]);

  useEffect(() => {
    const unsubscribe = webRTCService.onCallStateChange((state) => {
      setCallState(state);
      const inCall = state.state !== CallState.IDLE;
      setSoundContext({ inCall });
      if (state.state === CallState.INCOMING) setShowCallModal(true);
      if (state.state === CallState.IDLE && showCallModal) setTimeout(() => setShowCallModal(false), 1000);
    });
    return unsubscribe;
  }, [showCallModal, setSoundContext]);

  const currentVibe = getVibeById(roomVibe);
  const vibeAccent = currentVibe.accent || 'primary';
  const vibeHex = currentVibe.colors?.primary || '#3b82f6';

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

  // Fetch verbal code if host
  useEffect(() => {
    if (isJoined && isHost && roomCode && !verbalCode) {
      // Auto-generate invite to get the verbal code
      generateInviteLink(roomCode).then(data => {
        if (data && data.verbalCode) {
          setVerbalCode(data.verbalCode);
        }
      }).catch(err => {
        console.error('Failed to fetch verbal code:', err);
      });
    }
  }, [isJoined, isHost, roomCode, verbalCode]);

  if (error && !isJoined) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-black">
        <div className="text-center">
          <div className="bg-red-100 dark:bg-red-900 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-200 px-4 py-3 rounded mb-4">
            <p className="font-bold">{t('chatRoom.error')}</p><p>{error}</p>
          </div>
          <button onClick={() => navigate('/home', { replace: true })} className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">{t('common.goHome')}</button>
        </div>
      </div>
    );
  }

  if (showJoinModal) return <JoinRoomModal roomCode={roomCode} onJoin={handleJoinRoom} onCancel={handleCancelJoin} error={error} isProcessingInvite={isProcessingInvite} isWaitingForHost={isWaitingForHost} />;

  return (
    <div
      className={`flex flex-col transition-colors duration-500 chat-container overflow-hidden ${getVibeById(roomVibe).bgClass}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <VibeEffects effectType={getVibeById(roomVibe).effectType} />
      {isReconnecting && (
        <div className="absolute inset-0 z-[100] bg-black/20 backdrop-blur-[2px] flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-full shadow-lg flex items-center space-x-2">
            <Loader2 className={`w-4 h-4 text-${vibeAccent}-500 animate-spin`} />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('chatRoom.reconnecting')}</span>
          </div>
        </div>
      )}
      <div className={`${getVibeById(roomVibe).panelClass} px-4 pt-1 sm:pt-3 pb-2 sm:py-3 sticky top-0 z-50 shrink-0`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-4">
            <button onClick={() => navigate('/home', { replace: true })} className="p-1.5 sm:p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-600 dark:text-gray-300 flex-shrink-0"><ArrowLeft className="w-5 h-5" /></button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate text-gray-900 dark:text-white leading-tight">{/^[A-Z0-9]{10}$/.test(roomCode) ? t('chatRoom.chatroom') : roomCode}</h1>
              <div className="flex items-center space-x-3 sm:space-x-4 text-sm text-gray-600 dark:text-gray-400 mt-1">
                {latency !== null && (
                  <div className="flex items-end space-x-0.5 h-4 pb-1" title={`Latency: ${latency}ms`}>
                    {[1, 2, 3, 4].map((bar) => {
                      const activeBars = latency < 100 ? 4 : latency < 200 ? 3 : latency < 400 ? 2 : 1;
                      const colorClass = latency < 100 ? 'bg-green-500' : latency < 300 ? 'bg-yellow-500' : 'bg-red-500';
                      return (
                        <div
                          key={bar}
                          className={`w-0.5 rounded-t-[1px] transition-all duration-300 ${bar <= activeBars ? colorClass : 'bg-gray-300 dark:bg-gray-600 opacity-40'}`}
                          style={{ height: `${bar * 25}%` }}
                        />
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={() => {
                    setSidebarTab('people');
                    if (window.innerWidth >= 1024) {
                      setShowDesktopSidebar(prev => !prev);
                    } else {
                      setShowMobileMenu(true);
                    }
                  }}
                  className="flex items-center space-x-1 hover:bg-black/5 dark:hover:bg-white/5 px-1.5 py-0.5 rounded cursor-pointer transition-colors"
                  title={t('chatRoom.participants')}
                >
                  <Users className="w-4 h-4" />
                  <span>{users.length}</span>
                </button>
                {getTTLDisplay() && (
                  <div className="flex items-center space-x-1">
                    <Clock className="w-4 h-4" />
                    <span><span className="hidden sm:inline">{t('chatRoom.ttl')}: </span>{getTTLDisplay()}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-1 sm:space-x-2">
            <ThemeToggle />
            {/* Unified panel toggle — People & Tools */}
            <button
              onClick={() => {
                if (window.innerWidth >= 1024) {
                  setShowDesktopSidebar(prev => !prev);
                } else {
                  setShowMobileMenu(true);
                }
              }}
              className={`p-2 rounded-lg transition-colors relative ${showDesktopSidebar ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
              title={t('chatRoom.peopleTools')}
            >
              <LayoutGrid className="w-5 h-5" />
              {isHost && pendingGuests.length > 0 && <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-gray-800" />}
            </button>
          </div>
        </div>
      </div>



      <div className={`flex-1 flex overflow-hidden min-h-0 ${sidebarPosition === 'left' ? 'flex-row-reverse' : ''}`}>
        <div className="flex-1 flex flex-col min-w-0 min-h-0 relative">
          {/* ── Scheduled room countdown — overlays entire chat area ── */}
          {roomOpensAt && (
            <RoomCountdown
              opensAt={roomOpensAt}
              roomCode={roomCode}
              onOpen={() => setRoomOpensAt(null)}
            />
          )}
          {/* ── Compact info bar: now inside the center column for better sidebar alignment ── */}
          {(roomTopic || activeTimer) && (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full mx-4 my-2 shadow-sm w-fit max-w-[calc(100%-2rem)] ${getVibeById(roomVibe).panelClass} overflow-x-auto scrollbar-none shrink-0 animate-in fade-in slide-in-from-top-2 duration-300`}>
              {/* Topic Pill */}
              {roomTopic && (
                <div className={`shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full bg-${vibeAccent}-100/30 dark:bg-${vibeAccent}-900/20`}>
                  <span className={`text-[10px] font-bold text-${vibeAccent}-600 dark:text-${vibeAccent}-400 uppercase tracking-wider`}>{t('chatRoom.topic')}</span>
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate max-w-[120px] sm:max-w-[200px]">{roomTopic}</span>
                  {canManageRoom(currentUserRole) && (
                    <button onClick={() => setShowTopicEditor(true)} className={`p-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-400 hover:text-${vibeAccent}-500 transition-colors`}>
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
              {/* Timer Pill */}
              {activeTimer && (
                <div
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full transition-colors"
                  style={{
                    backgroundColor: themeEffective === 'dark' ? `${vibeHex}dd` : `${vibeHex}20`,
                  }}
                >
                  <Clock className={`w-3 h-3 ${timeLeft === '00:00' ? 'animate-bounce text-red-500 dark:text-red-300' : 'animate-pulse'}`} style={timeLeft !== '00:00' ? { color: themeEffective === 'dark' ? '#ffffff' : vibeHex } : undefined} />
                  <span className={`font-mono text-xs font-bold tracking-wider ${timeLeft === '00:00' ? 'text-red-600 dark:text-red-100' : ''}`} style={timeLeft !== '00:00' ? { color: themeEffective === 'dark' ? '#ffffff' : vibeHex } : undefined}>{timeLeft || '00:00'}</span>
                  {canManageRoom(currentUserRole) && (
                    <button onClick={handleStopTimer} className="p-0.5 rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/20" title={t('chatRoom.stopTimer')}>
                      <X className={`w-3 h-3 ${timeLeft === '00:00' ? 'text-red-500 dark:text-red-300' : 'text-red-300'}`} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <PinnedMessageBanner
            pinnedMessage={pinnedMessage}
            isHost={canManageRoom(currentUserRole)}
            onUnpin={handleUnpinMessage}
            onClick={() => {
              if (pinnedMessage?.messageId) {
                const el = document.getElementById(pinnedMessage.messageId);
                el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }
            }}
          />
          {hotSeatTarget && (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-50/90 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800/30">
              <span className="text-base">🎤</span>
              <span className="text-xs font-bold text-red-700 dark:text-red-400 flex-1 truncate">
                {hotSeatTarget} is in the Hot Seat!
              </span>
            </div>
          )}
          {showSearch && (
            <MessageSearch
              query={searchQuery}
              setQuery={setSearchQuery}
              results={searchResults}
              focusedIndex={focusedIndex}
              onNext={searchNext}
              onPrev={searchPrev}
              onClose={() => { setShowSearch(false); clearSearch(); }}
            />
          )}
          <div
            ref={messagesContainerRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-y-auto pl-4 lg:pl-10 pr-2 scrollbar-thin overscroll-contain touch-pan-y chat-messages-area relative"
          >
            {/* Scroll to Bottom Button */}
            {showScrollBottom && (
              <button
                onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className={`fixed sm:absolute bottom-20 sm:bottom-6 right-4 sm:right-6 z-[55] p-2.5 sm:p-3 rounded-full shadow-2xl transition-all duration-300 transform hover:scale-110 active:scale-95 animate-in fade-in zoom-in slide-in-from-bottom-4 ${getVibeById(roomVibe).accentClass} text-white group`}
                title={t('chatRoom.scrollToBottom')}
              >
                <ArrowDown className="w-4 h-4 sm:w-5 sm:h-5 group-hover:animate-bounce" />
              </button>
            )}
            {/* Watch Party Player — renders as a message-like card in the chat flow */}
            {showMediaPlayer && (
              <SharedMediaPlayer
                roomCode={roomCode}
                currentUser={currentUser}
                isHost={isHost}
                roomVibe={roomVibe}
                mlsReady={mlsReady}
                initialMedia={initialMedia}
              />
            )}
            <MessageList
              messages={messages}
              currentUser={currentUser}
              messageTTL={room?.settings?.messageTTL}
              onVote={handleVote}
              onReply={handleReply}
              onReact={handleReaction}
              onEdit={handleEditMessage}
              onDelete={handleDeleteMessage}
              onPin={handlePinMessage}
              onViewThread={setThreadParent}
              isHost={isHost}
              pinnedMessageId={pinnedMessage?.messageId}
              roomVibe={roomVibe}
              onShareResult={handleShareResult}
              onStegoExtract={handleStegoExtract}
              onTetrisJoin={handleTetrisJoin}
              onTetrisSpectate={handleTetrisSpectate}
              onTetrisLaunch={handleTetrisLaunch}
              onChessJoin={handleChessJoin}
              onChessSpectate={handleChessSpectate}
              onChessLaunch={handleChessLaunch}
              onChessVsCpu={handleChessVsCpu}
              linkPreviews={linkPreviews}
              onOpenEmojiPicker={(messageId) => {
                setReactionTargetId(messageId);
                setShowEmojiPicker(true);
              }}
              highlightMap={highlightMap}
              focusedMessageId={focusedMessageId}
              onVideoReply={handleVideoReplyGesture}
            />
            <div ref={messagesEndRef} />
          </div>
          <div className={`${getVibeById(roomVibe).panelClass} sticky bottom-0 z-50 shrink-0 chat-input-area`}>
            {/* Active Security Indicators */}
            {(isStealthMode || overrideTtl !== null || isAnonymousMode) && (
              <div className="px-4 py-1.5 flex items-center gap-3 bg-transparent dark:bg-black/20 overflow-x-auto scrollbar-none">
                {isStealthMode && (
                  <div className="flex items-center gap-1.5 text-[10px] font-black tracking-tighter text-gray-600 dark:text-gray-400 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-gray-200/50 dark:border-white/10 shadow-sm shrink-0">
                    <EyeOff className="w-3 h-3" />
                    {t('chatRoom.stealthMode').toUpperCase()}
                  </div>
                )}
                {overrideTtl !== null && (
                  <button
                    onClick={() => setShowTtlPicker(p => !p)}
                    className="flex items-center gap-1.5 text-[10px] font-black tracking-tighter text-red-600 dark:text-red-400 bg-red-50/80 dark:bg-red-950/40 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-red-100/50 dark:border-red-500/20 shadow-sm animate-pulse shrink-0 hover:animate-none transition-all"
                    title="Change self-destruct timer"
                  >
                    <Clock className="w-3 h-3" />
                    VANISH-{overrideTtl < 60 ? `${overrideTtl}S` : `${overrideTtl / 60}M`}
                  </button>
                )}
                {isAnonymousMode && (
                  <div className="flex items-center gap-1.5 text-[10px] font-black tracking-tighter text-purple-600 dark:text-purple-400 bg-purple-50/80 dark:bg-purple-950/40 backdrop-blur-sm px-2.5 py-1 rounded-lg border border-purple-100/50 dark:border-purple-500/20 shadow-sm shrink-0">
                    <Ghost className="w-3 h-3" />
                    {t('chatRoom.anonMode').toUpperCase()}
                  </div>
                )}
              </div>
            )}

            {!isStealthMode && <TypingPreview />}
            {typingUsers.size > 0 && !isStealthMode && (
              <div className="px-4 py-1 text-xs text-gray-600 dark:text-gray-400 italic animate-pulse bg-black/5 dark:bg-white/5">
                {t('chatRoom.typing', { count: typingUsers.size, names: Array.from(typingUsers.values()).join(', ') })}
              </div>
            )}
            {replyingTo && (
              <div className="px-4 py-2 bg-black/5 dark:bg-white/5 flex items-center justify-between animate-in slide-in-from-bottom-2">
                <div className="flex items-center space-x-2 overflow-hidden">
                  <Reply className={`w-4 h-4 text-${vibeAccent}-500`} />
                  <div className={`flex flex-col text-xs border-l-2 border-${vibeAccent}-500 pl-2`}>
                    <span className={`font-semibold text-${vibeAccent}-500`}>{t('chatRoom.replyingTo')} {replyingTo.sender.nickname}</span>
                    <span className="text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                      {replyingTo.messageType === 'image' ? t('chatRoom.image') : replyingTo.messageType === 'audio' ? t('chatRoom.voiceNote') : replyingTo.content}
                    </span>
                  </div>
                </div>
                <button onClick={handleCancelReply} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full">
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            )}
            {selectedRecipients.length > 0 && (
              <div className={`px-4 py-2 bg-${vibeAccent}-50/50 dark:bg-${vibeAccent}-900/20 flex items-center justify-between`}>
                <span className={`text-xs text-${vibeAccent}-600 dark:text-${vibeAccent}-300 font-medium flex items-center`}><Users className="w-3 h-3 mr-1.5" />{t('chatRoom.sendingTo', { count: selectedRecipients.length })}</span>
                <button onClick={() => setSelectedRecipients([])} className={`text-xs text-${vibeAccent}-500 hover:text-${vibeAccent}-700 dark:hover:text-${vibeAccent}-200 underline`}>{t('chatRoom.clearSelection')}</button>
              </div>
            )}
            <div className="px-0 pt-2 sm:px-4 sm:pt-4 pb-0 sm:pb-4 w-full relative z-10 bg-transparent">
              <form onSubmit={handleSendMessage} className="flex items-center w-full">
                {isRecording ? (
                  <div className="flex-1 flex flex-col space-y-2 w-full">
                    {/* Safari Audio Notice */}

                    <div className={`flex items-center justify-between bg-${vibeAccent}-50 dark:bg-${vibeAccent}-900/20 rounded-lg px-4 py-2 border border-${vibeAccent}-100 dark:border-${vibeAccent}-800/30`}>
                      <div className="flex items-center space-x-3"><div className={`w-3 h-3 bg-${vibeAccent}-500 rounded-full animate-pulse`} /><span className={`text-${vibeAccent}-600 dark:text-${vibeAccent}-400 font-medium font-mono`}>{formatDuration(recordingDuration)} / 0:30</span></div>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setAudioViewOnce(!audioViewOnce)}
                          style={audioViewOnce ? { backgroundColor: vibeHex } : undefined}
                          className={`p-2 rounded-full font-bold text-[10px] w-8 h-8 flex items-center justify-center transition-colors ${audioViewOnce ? `text-white` : `bg-transparent text-${vibeAccent}-500 border border-${vibeAccent}-500`}`}
                          title={audioViewOnce ? "View Once Active" : "View Once Inactive"}
                        >
                          1x
                        </button>
                        <button type="button" onClick={handleCancelRecording} className={`p-2 hover:bg-${vibeAccent}-100 dark:hover:bg-${vibeAccent}-900/40 rounded-full text-${vibeAccent}-500`}><Trash2 className="w-5 h-5" /></button>
                        <button type="button" onClick={handleStopRecording} style={{ backgroundColor: vibeHex }} className={`p-2 rounded-full text-white shadow-sm`}><Send className="w-5 h-5" /></button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className={`relative flex items-center w-full ${getVibeById(roomVibe).inputClass} rounded-none sm:rounded-xl px-1 py-0.5 sm:py-1 transition-all ${isAnonymousMode ? 'border-purple-400 dark:border-purple-600 ring-4 ring-purple-500/20' : ''}`}>
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" id="image-upload" />

                    <div
                      className="relative flex-shrink-0"
                      ref={featureMenuRef}
                      onMouseEnter={() => {
                        if (window.electronAPI) {
                          clearTimeout(featureHoverTimeoutRef.current);
                          setShowFeatureMenu(true);
                        }
                      }}
                      onMouseLeave={() => {
                        if (window.electronAPI) {
                          featureHoverTimeoutRef.current = setTimeout(() => setShowFeatureMenu(false), 300);
                        }
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => { emitSound('toggle'); setShowFeatureMenu(!showFeatureMenu); }}
                        disabled={!isConnected}
                        className={`p-1.5 sm:p-2.5 rounded-full transition-all duration-200 border-none outline-none focus:outline-none focus:ring-0 ${showFeatureMenu ? `bg-transparent hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent text-${vibeAccent}-500 shadow-none` : `hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400`}`}
                        title={t('chatRoom.features')}
                      >
                        <Plus className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform duration-300 ${showFeatureMenu ? 'rotate-45' : ''}`} />
                      </button>

                      {showFeatureMenu && (
                        <div className={`absolute bottom-full mb-2 sm:mb-3 left-0 z-50 ${getVibeById(roomVibe).panelClass} rounded-2xl sm:rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] border border-white/20 dark:border-white/10 p-1.5 sm:p-3 flex flex-col space-y-1 sm:space-y-2 w-[70vw] max-w-[220px] sm:w-[85vw] sm:max-w-[320px] animate-in slide-in-from-bottom-2 duration-300 backdrop-blur-3xl ring-1 ring-white/10 dark:ring-white/5`}>
                          {/* Reaction Row */}
                          <div className="flex items-center gap-0.5 sm:gap-1 bg-white/40 dark:bg-white/5 rounded-xl sm:rounded-2xl p-0.5 sm:p-1 px-1 sm:px-1.5 border border-white/10 shadow-inner">
                            <div className="flex items-center flex-1 overflow-x-auto scrollbar-none gap-0.5 sm:gap-1 sm:py-0.5 no-scrollbar">
                              {['❤️', '🔥', '👏', '😂', '😮', '💯', '😍', '😘', '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '🥰', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '😏', '🙄', '😬', '🤥', '😌', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '🥵', '🥶', '🥴', '😵', '🤩', '🥳', '🤡', '🤠', '✨', '⚡', '🎉', '👍', '🙏', '👀', '🤔', '😎', '🥳', '🤯', '💎', '🎨', '💦', '🍆', '💀', '💩', '🌈', '🍦', '🍕', '🎸', '🎮', '🚀', '🛸', '👻', '👾', '👑', '💸', '💪', '🙌', '🤝', '🤤', '😈', '🥺'].map(emoji => (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={() => sendRoomReaction(emoji)}
                                  className="p-0.5 sm:p-1 hover:bg-white dark:hover:bg-gray-700 rounded sm:rounded-lg transition-all hover:scale-110 sm:hover:scale-125 active:scale-95 flex-shrink-0"
                                >
                                  <span className="text-sm sm:text-xl leading-none">{emoji}</span>
                                </button>
                              ))}
                            </div>
                            <div className="w-px h-5 sm:h-6 bg-gray-200 dark:bg-gray-700/50 mx-0.5 flex-shrink-0" />
                            <button
                              type="button"
                              onClick={handleSendPulse}
                              disabled={!isConnected}
                              className={`w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center ${getVibeById(roomVibe).accentClass} rounded sm:rounded-lg transition-all hover:scale-110 active:scale-95 shadow-sm group flex-shrink-0`}
                              title="Pulse — shake everyone's device"
                            >
                              <Zap className="w-3 h-3 sm:w-4 sm:h-4 fill-current" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { handleSendConfetti(); setShowFeatureMenu(false); }}
                              disabled={!isConnected}
                              className="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center bg-gradient-to-br from-pink-500 to-yellow-400 rounded sm:rounded-lg transition-all hover:scale-110 active:scale-95 shadow-sm flex-shrink-0"
                              title="Confetti bomb! (10 s cooldown)"
                            >
                              <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
                            </button>
                          </div>

                          <div className="h-px bg-gray-100 dark:bg-gray-700/50 sm:mx-1 hidden sm:block" />

                          {/* Actions Grid — mobile: 4-col icon-only, desktop: 3-col with labels */}
                          <div className="grid grid-cols-4 sm:grid-cols-3 gap-1 sm:gap-1.5">
                            <button type="button" onClick={() => { setShowFileModal(true); setShowFeatureMenu(false); const recipientNames = selectedRecipients.length > 0 ? `targeting ${selectedRecipients.map(id => users.find(u => u.socketId === id)?.nickname || id).join(', ')}` : 'as a broadcast'; setActivityLogs(prev => [{ id: `log_ft_init_${Date.now()}`, type: 'system', content: `You initiated a secure file transfer intent ${recipientNames}`, timestamp: new Date().toISOString() }, ...prev].slice(0, 50)); }} disabled={!isConnected} className={`flex items-center justify-center sm:flex-col p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white/5 dark:bg-white/5 hover:bg-white/40 dark:hover:bg-white/10 transition-all border border-white/10 group`} title="Files">
                              <div className={`sm:w-8 sm:h-8 sm:rounded-lg sm:bg-white/10 dark:sm:bg-white/10 flex items-center justify-center sm:mb-1 group-hover:scale-110 transition-transform sm:shadow-sm`}>
                                <FileText className={`w-4 h-4 text-${vibeAccent}-500`} />
                              </div>
                              <span className="hidden sm:block text-[10px] font-bold text-gray-700 dark:text-gray-300">{t('chatRoom.files')}</span>
                            </button>
                            <button type="button" onClick={() => { setShowCameraModal(true); setShowFeatureMenu(false); }} disabled={!isConnected} className={`flex items-center justify-center sm:flex-col p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white/5 dark:bg-white/5 hover:bg-white/40 dark:hover:bg-white/10 transition-all border border-white/10 group`} title={t('chatRoom.camera')}>
                              <div className={`sm:w-8 sm:h-8 sm:rounded-lg sm:bg-white/10 dark:sm:bg-white/10 flex items-center justify-center sm:mb-1 group-hover:scale-110 transition-transform sm:shadow-sm`}>
                                <Camera className={`w-4 h-4 text-${vibeAccent}-500`} />
                              </div>
                              <span className="hidden sm:block text-[10px] font-bold text-gray-700 dark:text-gray-300">{t('chatRoom.camera')}</span>
                            </button>
                            <button type="button" onClick={() => { if (users.length > 7) { setError('Voice calls are limited to 7 users.'); } else { handleStartCall(); setShowFeatureMenu(false); } }} disabled={!isConnected || users.length < 2 || users.length > 7} className={`flex items-center justify-center sm:flex-col p-1.5 sm:p-2 rounded-lg sm:rounded-xl transition-all border border-white/10 group ${users.length > 7 ? 'bg-white/5 opacity-40 cursor-not-allowed' : 'bg-white/5 dark:bg-white/5 hover:bg-white/20 sm:shadow-sm'}`} title={users.length > 7 ? "Disabled: Max 7 users" : "Voice Call"}>
                              <div className={`sm:w-8 sm:h-8 sm:rounded-lg flex items-center justify-center sm:mb-1 transition-transform sm:shadow-sm ${users.length > 7 ? 'sm:bg-white/5' : 'sm:bg-white/10 dark:sm:bg-white/10 group-hover:scale-110'}`}>
                                <Phone className={`w-4 h-4 ${users.length > 7 ? 'text-gray-400' : 'text-green-500'}`} />
                              </div>
                              <span className="hidden sm:block text-[10px] font-bold text-gray-700 dark:text-gray-300">{users.length > 7 ? t('chatRoom.callDisabled') : t('chatRoom.call')}</span>
                            </button>
                            <button type="button" onClick={() => { setShowPollModal(true); setShowFeatureMenu(false); }} disabled={!isConnected} className={`flex items-center justify-center sm:flex-col p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white/5 dark:bg-white/5 hover:bg-white/40 dark:hover:bg-white/10 transition-all border border-white/10 group`} title="Poll">
                              <div className={`sm:w-8 sm:h-8 sm:rounded-lg sm:bg-white/10 dark:sm:bg-white/10 flex items-center justify-center sm:mb-1 group-hover:scale-110 transition-transform sm:shadow-sm`}>
                                <BarChart2 className={`w-4 h-4 text-${vibeAccent}-500`} />
                              </div>
                              <span className="hidden sm:block text-[10px] font-bold text-gray-700 dark:text-gray-300">{t('chatRoom.poll')}</span>
                            </button>
                            <button type="button" onClick={() => { startRecording(); setShowFeatureMenu(false); }} disabled={!isConnected} className="flex items-center justify-center sm:flex-col p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white/5 dark:bg-white/5 hover:bg-white/20 dark:hover:bg-white/10 transition-all border border-white/10 group" title={t('chatRoom.voiceNote')}>
                              <div className="sm:w-8 sm:h-8 sm:rounded-lg sm:bg-white/10 dark:sm:bg-white/10 flex items-center justify-center sm:mb-1 group-hover:scale-110 transition-transform sm:shadow-sm">
                                <Mic className="w-4 h-4 text-red-500" />
                              </div>
                              <span className="hidden sm:block text-[10px] font-bold text-gray-700 dark:text-gray-300">{t('chatRoom.voiceNote')}</span>
                            </button>
                            <button type="button" onClick={handleSendIcebreaker} disabled={!isConnected} className="flex items-center justify-center sm:flex-col p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white/5 dark:bg-white/5 hover:bg-white/20 dark:hover:bg-white/10 transition-all border border-white/10 group" title={t('chatRoom.icebreaker')}>
                              <div className="sm:w-8 sm:h-8 sm:rounded-lg sm:bg-white/10 dark:sm:bg-white/10 flex items-center justify-center sm:mb-1 group-hover:scale-110 transition-transform sm:shadow-sm">
                                <Snowflake className="w-4 h-4 text-cyan-500" />
                              </div>
                              <span className="hidden sm:block text-[10px] font-bold text-gray-700 dark:text-gray-300">{t('chatRoom.icebreaker')}</span>
                            </button>
                            <button type="button" onClick={() => { setVideoReplyTarget(null); setShowVideoCapture(true); setShowFeatureMenu(false); cameraPrewarmService.prewarm('user').catch(() => {}); }} disabled={!isConnected} className="flex items-center justify-center sm:flex-col p-1.5 sm:p-2 rounded-lg sm:rounded-xl bg-white/5 dark:bg-white/5 hover:bg-white/20 dark:hover:bg-white/10 transition-all border border-white/10 group" title={t('chatRoom.videoReply')}>
                              <div className="sm:w-8 sm:h-8 sm:rounded-lg sm:bg-white/10 dark:sm:bg-white/10 flex items-center justify-center sm:mb-1 group-hover:scale-110 transition-transform sm:shadow-sm">
                                <Video className="w-4 h-4 text-rose-500" />
                              </div>
                              <span className="hidden sm:block text-[10px] font-bold text-gray-700 dark:text-gray-300">{t('chatRoom.videoReply')}</span>
                            </button>
                            <button type="button" onClick={() => { setShowWatchPartyModal(true); setShowFeatureMenu(false); }} disabled={!isConnected} className="flex sm:hidden items-center justify-center p-1.5 rounded-lg bg-white/5 dark:bg-white/5 hover:bg-white/20 dark:hover:bg-white/10 transition-all border border-white/10 group" title={t('chatRoom.watchParty')}>
                              <div className="flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Activity className="w-4 h-4 text-purple-400" />
                              </div>
                            </button>
                            <button type="button" onClick={() => { setShowEmojiPicker(p => !p); setShowFeatureMenu(false); }} disabled={!isConnected} className="flex sm:hidden items-center justify-center p-1.5 rounded-lg bg-white/5 dark:bg-white/5 hover:bg-white/20 dark:hover:bg-white/10 transition-all border border-white/10 group" title="Emoji">
                              <div className="flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Smile className="w-4 h-4 text-yellow-400" />
                              </div>
                            </button>
                          </div>

                          {/* Admin Section — mobile: compact row, desktop: full with labels */}
                          {canManageRoom(currentUserRole) && (
                            <>
                              <div className="h-px bg-gray-100 dark:bg-gray-700/50 sm:mx-1" />
                              {/* Mobile: single compact row */}
                              <div className="flex sm:hidden items-center justify-between w-full px-0.5 overflow-hidden">
                                <div className="flex items-center w-[102px] flex-shrink-0 overflow-x-auto scrollbar-none gap-0.5 sm:gap-1 sm:py-0.5 no-scrollbar bg-black/5 dark:bg-black/20 rounded-lg px-0.5 border border-white/5 shadow-inner">
                                  {getAllVibes().map(vibe => (
                                    <button
                                      key={vibe.id}
                                      onClick={() => handleUpdateVibe(vibe.id)}
                                      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs transition-all ${roomVibe === vibe.id ? `bg-${vibeAccent}-500 text-white shadow-lg` : 'hover:bg-white/10'}`}
                                      title={vibe.name}
                                    >
                                      {vibe.emoji}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => { setShowTopicEditor(true); setShowFeatureMenu(false); }} className="p-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors border border-white/10 flex-shrink-0" title="Topic">
                                    <Edit2 className="w-3.5 h-3.5 text-orange-500" />
                                  </button>
                                  <button type="button" onClick={() => { if (activeTimer) handleStopTimer(); else setShowTimerModal(true); setShowFeatureMenu(false); }} className={`p-1 rounded-lg border border-white/10 transition-all flex-shrink-0 ${activeTimer ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-white/5 hover:bg-white/10'}`} title={activeTimer ? 'Stop Timer' : 'Timer'}>
                                    {activeTimer ? <X className="w-3.5 h-3.5 text-red-500" /> : <Clock className={`w-3.5 h-3.5 text-${vibeAccent}-500`} />}
                                  </button>
                                </div>
                              </div>
                              {/* Desktop: full admin section with labels */}
                              <div className="hidden sm:block space-y-2">
                                <div className="flex items-center justify-between px-1">
                                  <p className="text-[10px] font-bold text-gray-800 dark:text-gray-400 uppercase tracking-widest flex-shrink-0 mr-4">{t('chatRoom.admin').toUpperCase()}</p>
                                  <div className="w-[146px] overflow-x-auto scrollbar-none no-scrollbar flex-shrink-0 ml-auto bg-black/10 dark:bg-black/20 rounded-full px-1 border border-white/5 shadow-inner group/vibes">
                                    <div className="flex gap-1.5 py-1">
                                      {getAllVibes().map(vibe => (
                                        <button
                                          key={vibe.id}
                                          onClick={() => handleUpdateVibe(vibe.id)}
                                          className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm transition-all ${roomVibe === vibe.id ? `bg-${vibeAccent}-500 text-white shadow-lg scale-110` : 'hover:bg-white/10 dark:hover:bg-white/10 hover:scale-105'}`}
                                          title={vibe.name}
                                        >
                                          {vibe.emoji}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => { setShowTopicEditor(true); setShowFeatureMenu(false); }}
                                    className="flex items-center space-x-2 p-2 rounded-xl bg-white/5 dark:bg-white/5 hover:bg-white/10 dark:hover:bg-white/10 transition-colors border border-white/10"
                                  >
                                    <div className="w-7 h-7 rounded-lg bg-white/10 dark:bg-white/5 flex items-center justify-center flex-shrink-0">
                                      <Edit2 className="w-3.5 h-3.5 text-orange-500" />
                                    </div>
                                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">{t('chatRoom.topic')}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (activeTimer) handleStopTimer();
                                      else setShowTimerModal(true);
                                      setShowFeatureMenu(false);
                                    }}
                                    className={`flex items-center space-x-2 p-2 rounded-xl border border-white/10 transition-all ${activeTimer ? 'bg-red-500/10 hover:bg-red-500/20' : 'bg-white/5 dark:bg-white/5 hover:bg-white/10 dark:hover:bg-white/10'}`}
                                  >
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${activeTimer ? 'bg-red-500/20' : 'bg-white/10 dark:bg-white/10'}`}>
                                      {activeTimer ? <X className="w-3.5 h-3.5 text-red-500" /> : <Clock className={`w-3.5 h-3.5 text-${vibeAccent}-500`} />}
                                    </div>
                                    <span className={`text-xs font-medium ${activeTimer ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                      {activeTimer ? t('chatRoom.stop') : t('chatRoom.timer')}
                                    </span>
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div
                      className="relative flex-shrink-0 hidden sm:block"
                      ref={emojiPickerRef}
                      onMouseEnter={() => {
                        if (window.electronAPI) {
                          clearTimeout(emojiHoverTimeoutRef.current);
                          setShowEmojiPicker(true);
                        }
                      }}
                      onMouseLeave={() => {
                        if (window.electronAPI) {
                          emojiHoverTimeoutRef.current = setTimeout(() => setShowEmojiPicker(false), 300);
                        }
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (!showEmojiPicker) {
                            messageInputRef.current?.blur();
                          }
                          emitSound('toggle');
                          setShowEmojiPicker(!showEmojiPicker);
                        }}
                        disabled={!isConnected}
                        className={`p-1.5 sm:p-2.5 rounded-full transition-colors border-none outline-none focus:outline-none focus:ring-0 ${showEmojiPicker ? `bg-transparent hover:bg-transparent dark:bg-transparent dark:hover:bg-transparent text-${vibeAccent}-500 shadow-none` : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400'}`}
                        title="Emoji"
                      >
                        <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                      <div
                        className={`hidden sm:block absolute bottom-full mb-2 left-0 sm:left-auto z-[60] animate-in fade-in zoom-in slide-in-from-bottom-2 duration-200 themed-emoji-picker sm:w-[320px] ${showEmojiPicker ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
                        style={{
                          '--epr-highlight-color': vibeHex,
                          '--epr-focus-bg-color': `${vibeHex}20`,
                          '--epr-hover-bg-color': `${vibeHex}10`,
                          '--epr-bg-color': 'transparent',
                          '--epr-category-label-bg-color': 'transparent',
                          '--epr-picker-border-radius': '1.25rem',
                          '--epr-search-input-bg-color': 'rgba(128,128,128,0.15)',
                          '--epr-category-navigation-button-size': '18px',
                          '--epr-emoji-size': '22px',
                          '--epr-header-padding': '8px 8px 4px',
                        }}
                      >
                        <div className="absolute inset-0 bg-white/40 dark:bg-white/[0.06] backdrop-blur-2xl rounded-[1.25rem] shadow-2xl border border-white/20 dark:border-white/10 -z-10" />
                        <EmojiPicker
                          onEmojiClick={onEmojiClick}
                          theme={themeEffective === 'dark' ? Theme.DARK : Theme.LIGHT}
                          lazyLoadEmojis={true}
                          skinTonesDisabled
                          autoFocusSearch={false}
                          searchPlaceholder="Search emojis..."
                          width="100%"
                          height={350}
                          previewConfig={{ showPreview: false }}
                        />
                      </div>
                    </div>
                    <div className="relative flex-1 min-w-0">
                      {suggestions.show && (
                        <div
                          ref={suggestionRef}
                          className="absolute bottom-full left-0 -ml-12 sm:ml-0 mb-3 w-[85vw] sm:w-full max-w-[280px] sm:max-w-none bg-white/10 dark:bg-black/20 backdrop-blur-2xl border border-white/20 rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] overflow-hidden z-[60] animate-in slide-in-from-bottom-2 duration-300 ring-1 ring-white/10"
                        >
                          <div className="max-h-48 overflow-y-auto p-1.5 sm:p-2 space-y-0.5">
                            {suggestions.items.map((item, idx) => (
                              <button
                                key={idx}
                                onClick={() => applySuggestion(item)}
                                onMouseEnter={() => setSuggestions(prev => ({ ...prev, index: idx }))}
                                className={`w-full flex items-center space-x-2 sm:space-x-3 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl transition-all text-left ${idx === suggestions.index ? `bg-${vibeAccent}-500/20 dark:bg-${vibeAccent}-400/20 shadow-sm border border-${vibeAccent}-500/30` : 'hover:bg-white/5 dark:hover:bg-white/5 border border-transparent'}`}
                              >
                                {suggestions.type === 'command' ? (
                                  <>
                                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shadow-sm ${idx === suggestions.index ? `bg-${vibeAccent}-500/30 dark:bg-${vibeAccent}-400/30` : 'bg-white/10 dark:bg-white/5'}`}>
                                      <item.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-bold text-[11px] sm:text-sm tracking-tight">{item.value}</div>
                                      <div className="text-[10px] sm:text-[11px] font-semibold text-gray-800 dark:text-gray-100 truncate">{item.desc}</div>
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full shadow-sm bg-gradient-to-br from-${vibeAccent}-500 to-${vibeAccent}-600 flex items-center justify-center text-white text-[10px] sm:text-xs font-black`}>
                                      {item.nickname[0].toUpperCase()}
                                    </div>
                                    <div className="font-bold text-[11px] sm:text-sm tracking-tight">@{item.nickname}</div>
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
                        spellCheck={true}
                        autoCorrect="on"
                        autoCapitalize="sentences"
                        value={newMessage}
                        onChange={(e) => { setNewMessage(e.target.value); handleTyping(e.target.value); }}
                        onKeyDown={handleKeyDown}
                        onCopy={(e) => e.preventDefault()}
                        onCut={(e) => e.preventDefault()}
                        onPaste={(e) => e.preventDefault()}
                        placeholder={isAnonymousMode ? t('chatRoom.sendAnon') : t('chatRoom.sendMessage')}
                        className={`w-full bg-transparent border-none focus:outline-none focus:ring-0 dark:text-white text-[15px] sm:text-base py-2.5 min-w-0 placeholder:text-gray-500 dark:placeholder:text-gray-400 ${newMessage.startsWith('🧊 ') ? 'pl-2 pr-10' : 'px-2'}`}
                        disabled={!isConnected}
                        maxLength={500}
                        style={{ boxShadow: 'none' }}
                      />
                      {newMessage.startsWith('🧊 ') && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); handleSendIcebreaker(); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-cyan-500 hover:text-cyan-600 active:scale-95 transition-all"
                          title="Shuffle question"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    {/* Per-message TTL picker */}
                    <div className="relative flex-shrink-0" data-ttl-picker>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => setShowTtlPicker(p => !p)}
                        className={`p-2.5 sm:p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all text-base sm:text-lg flex-shrink-0 touch-manipulation ${overrideTtl !== null ? 'text-red-500 bg-red-50/80 dark:bg-red-950/40 ring-2 ring-red-500/30' : 'text-gray-400 hover:text-red-500 hover:bg-black/5 dark:hover:bg-white/5'}`}
                        style={{ WebkitTapHighlightColor: 'transparent' }}
                        title={overrideTtl !== null ? `Self-destruct: ${overrideTtl}s` : 'Set self-destruct timer'}
                      >
                        ⏱
                      </button>
                      {showTtlPicker && (
                        <div className="absolute bottom-full mb-2 right-0 z-[70] bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 p-2 flex flex-col gap-1 min-w-[130px] animate-in slide-in-from-bottom-2 duration-200">
                          <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 px-1 pb-0.5">{t('chatRoom.selfDestructLabel').toUpperCase()}</p>
                          {[5, 30, 60, 300].map(secs => (
                            <button
                              key={secs}
                              type="button"
                              onClick={() => { setOverrideTtl(overrideTtl === secs ? null : secs); setShowTtlPicker(false); }}
                              className={`flex items-center justify-between px-3 py-1.5 rounded-xl text-sm font-bold transition-all ${overrideTtl === secs ? 'bg-red-500 text-white shadow-sm' : 'hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-700 dark:text-gray-200'}`}
                            >
                              <span>{secs < 60 ? `${secs}s` : `${secs / 60}m`}</span>
                              {overrideTtl === secs && <span className="text-xs ml-2">✓</span>}
                            </button>
                          ))}
                          {overrideTtl !== null && (
                            <button
                              type="button"
                              onClick={() => { setOverrideTtl(null); setShowTtlPicker(false); }}
                              className="mt-1 px-3 py-1.5 rounded-xl text-xs font-bold text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 text-center transition-all"
                            >
                              {t('chatRoom.turnOff')}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onTouchStart={(e) => {
                        e.preventDefault();
                        anonHoldTimerRef.current = setTimeout(() => {
                          anonHoldTimerRef.current = null;
                        }, 500);
                      }}
                      onTouchEnd={() => {
                        if (anonHoldTimerRef.current !== null) {
                          clearTimeout(anonHoldTimerRef.current);
                          anonHoldTimerRef.current = null;
                          setIsAnonymousMode(prev => !prev);
                        }
                      }}
                      onClick={() => {
                        anonClickCountRef.current += 1;
                        if (anonClickCountRef.current === 1) {
                          anonClickTimerRef.current = setTimeout(() => {
                            anonClickCountRef.current = 0;
                            setIsAnonymousMode(prev => !prev);
                          }, 280);
                        } else {
                          clearTimeout(anonClickTimerRef.current);
                          anonClickCountRef.current = 0;
                          setIsAnonymousMode(prev => !prev);
                        }
                      }}
                      className={`p-2.5 sm:p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full transition-all text-base sm:text-lg flex-shrink-0 touch-manipulation ${
                        isAnonymousMode
                          ? `${getVibeById(roomVibe).accentClass} ring-2 ring-white/20`
                          : 'text-gray-400 hover:text-primary-500 hover:bg-black/5 dark:hover:bg-white/5'
                      }`}
                      style={{ WebkitTapHighlightColor: 'transparent' }}
                      title={isAnonymousMode ? t('chatRoom.anonMode') : t('chatRoom.sendAnon')}
                    >
                      👻
                    </button>
                    {newMessage.trim() ? (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          doSendMessage();
                        }}
                        onClick={doSendMessage}
                        disabled={!isConnected}
                        className={`flex-shrink-0 ml-1 sm:ml-2 ${getVibeById(roomVibe).accentClass} h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center rounded-full transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <Send className="w-4 h-4 sm:w-5 sm:h-5 -ml-0.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={startRecording}
                        disabled={!isConnected}
                        className={`flex-shrink-0 ml-1 sm:ml-2 ${getVibeById(roomVibe).accentClass} h-8 w-8 sm:h-10 sm:w-10 flex items-center justify-center rounded-full transition-all shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
                        title={t('chatRoom.voiceNote')}
                      >
                        <Mic className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    )}
                  </div>
                )}
              </form>
            </div>

            {/* Bottom-Docked Emoji Drawer (Mobile Only) */}
            <div
              id="emoji-drawer"
              className={`mobile-emoji-drawer sm:hidden w-full transition-all duration-300 ease-in-out bg-transparent overflow-hidden relative ${showEmojiPicker ? 'h-[260px] opacity-100 pointer-events-auto z-0 mt-0.8' : 'h-0 opacity-0 pointer-events-none mt-0'}`}
            >
              <div className="w-full h-full pb-5">
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
                  theme={themeEffective === 'dark' ? Theme.DARK : Theme.LIGHT}
                  lazyLoadEmojis={true}
                  skinTonesDisabled
                  autoFocusSearch={false}
                  searchPlaceholder="Search emojis..."
                  width="100%"
                  height="100%"
                  previewConfig={{ showPreview: false }}
                  style={{
                    '--epr-highlight-color': vibeHex,
                    '--epr-bg-color': 'transparent',
                    '--epr-category-label-bg-color': 'transparent',
                    '--epr-border-color': 'transparent',
                    '--epr-hover-bg-color': `${vibeHex}10`,
                    '--epr-focus-bg-color': `${vibeHex}20`,
                    '--epr-search-input-bg-color': 'transparent',
                    '--epr-header-padding': '0px 8px 0px',
                  }}
                />
              </div>
              <div
                className={`absolute bottom-[-8px] left-0 right-0 w-full flex items-center justify-between px-6 pb-2 pt-0 pointer-events-none transition-opacity duration-300 ${showEmojiPicker ? 'opacity-100' : 'opacity-0'}`}
              >
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowEmojiPicker(false); setTimeout(() => messageInputRef.current?.focus(), 50); }}
                  className="p-1.5 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 rounded-full text-gray-500 dark:text-gray-400 transition-all flex items-center justify-center pointer-events-auto"
                  title={t('chatRoom.keyboard')}
                >
                  <KeyboardIcon className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); setShowEmojiPicker(false); setTimeout(() => setShowWatchPartyModal(true), 50); }}
                  className={`p-1.5 active:scale-95 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all flex items-center justify-center pointer-events-auto`}
                  style={{ color: vibeHex }}
                  title={t('chatRoom.watchParty')}
                >
                  <Activity className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Desktop Sidebar */}
        {showDesktopSidebar && (
          <div
            className={`hidden lg:flex flex-col relative ${getVibeById(roomVibe).sidebarClass} transition-all duration-75 ${sidebarPosition === 'right' ? 'border-l border-gray-300 dark:border-white/5' : 'border-r border-gray-300 dark:border-white/5'}`}
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

            {/* Tab bar */}
            <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setSidebarTab('people')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${sidebarTab === 'people' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 dark:border-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                {t('chatRoom.people')}
              </button>
              <button
                onClick={() => setSidebarTab('tools')}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${sidebarTab === 'tools' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 dark:border-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
              >
                {t('chatRoom.toolsTab')}
              </button>
            </div>

            {sidebarTab === 'people' ? (
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
                verbalCode={verbalCode}
                roomVibe={roomVibe}
                onWatchParty={() => setShowWatchPartyModal(true)}
                autoApprove={autoApprove}
                onToggleAutoApprove={handleToggleAutoApprove}
                preApprovedList={preApprovedList}
                onUpdatePreApprovedList={handleUpdatePreApprovedList}
                onPreApprovedFileUpload={handlePreApprovedFileUpload}
                parsePreApprovedText={parsePreApprovedText}
                onForkRoom={handleForkRoom}
              />
            ) : (
              <RoomToolsPanel
                vibeAccent={vibeAccent}
                previewEnabled={previewEnabled}
                setPreviewEnabled={setPreviewEnabled}
                sidebarPosition={sidebarPosition}
                setSidebarPosition={setSidebarPosition}
                hasNewLogs={hasNewLogs}
                onOpenPanel={openPanel}
                setShowActivityLogs={setShowActivityLogs}
                setHasNewLogs={setHasNewLogs}
                verbalCode={verbalCode}
                isHost={isHost}
                soundEnabled={soundEnabled}
                toggleSound={toggleSound}
                showSearch={showSearch}
                setShowSearch={setShowSearch}
                clearSearch={clearSearch}
                onOpenSettings={openSettings}
                onClose={null}
              />
            )}
          </div>
        )}
      </div>

      {
        showMobileMenu && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowMobileMenu(false)} />
            <div className={`absolute right-0 top-0 bottom-0 w-64 max-w-[70vw] ${getVibeById(roomVibe).sidebarClass} backdrop-blur-md shadow-xl flex flex-col`}>
              {/* Mobile drawer header with tabs */}
              <div className="flex shrink-0 border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setSidebarTab('people')}
                  className={`flex-1 py-3 text-xs font-bold transition-colors ${sidebarTab === 'people' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  {t('chatRoom.people')}
                </button>
                <button
                  onClick={() => setSidebarTab('tools')}
                  className={`flex-1 py-3 text-xs font-bold transition-colors ${sidebarTab === 'tools' ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500' : 'text-gray-500 dark:text-gray-400'}`}
                >
                  {t('chatRoom.toolsTab')}
                </button>
                <button onClick={() => setShowMobileMenu(false)} className="px-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">
                {sidebarTab === 'people' ? (
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
                    verbalCode={verbalCode}
                    roomVibe={roomVibe}
                    onWatchParty={() => { setShowMobileMenu(false); setShowWatchPartyModal(true); }}
                    autoApprove={autoApprove}
                    onToggleAutoApprove={handleToggleAutoApprove}
                    preApprovedList={preApprovedList}
                    onUpdatePreApprovedList={handleUpdatePreApprovedList}
                    onPreApprovedFileUpload={handlePreApprovedFileUpload}
                    parsePreApprovedText={parsePreApprovedText}
                    onForkRoom={handleForkRoom}
                  />
                ) : (
                  <RoomToolsPanel
                    vibeAccent={vibeAccent}
                    previewEnabled={previewEnabled}
                    setPreviewEnabled={setPreviewEnabled}
                    sidebarPosition={sidebarPosition}
                    setSidebarPosition={setSidebarPosition}
                    hasNewLogs={hasNewLogs}
                    onOpenPanel={openPanel}
                    setShowActivityLogs={setShowActivityLogs}
                    setHasNewLogs={setHasNewLogs}
                    verbalCode={verbalCode}
                    isHost={isHost}
                    soundEnabled={soundEnabled}
                    toggleSound={toggleSound}
                    showSearch={showSearch}
                    setShowSearch={setShowSearch}
                    clearSearch={clearSearch}
                    onOpenSettings={openSettings}
                    onClose={() => setShowMobileMenu(false)}
                  />
                )}
              </div>
            </div>
          </div>
        )
      }

      {showCallModal && <AudioCallModal isOpen={showCallModal} onClose={() => setShowCallModal(false)} roomCode={roomCode} />}

      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        initialTab={settingsInitialTab}
      />
      {hotSeatTarget && (
        <HotSeat
          hotSeatTarget={hotSeatTarget}
          isHotSeat={currentUser?.nickname === hotSeatTarget}
          isHost={isHost}
          onEnd={() => socketManager.emit('hotSeat-end')}
        />
      )}
      <ThreadView
        parentMessage={threadParent}
        messages={messages}
        currentUser={currentUser}
        isOpen={!!threadParent}
        onClose={() => setThreadParent(null)}
        onSend={handleThreadReply}
        roomVibe={roomVibe}
      />
      <WatchPartyModal
        isOpen={showWatchPartyModal}
        onClose={() => setShowWatchPartyModal(false)}
        roomVibe={roomVibe}
        onShare={(url) => {
          const detected = detectMediaUrl(url);
          if (detected) {
            socketManager.emit('media-share', {
              roomCode,
              type: detected.type,
              id: detected.id || null,
              url: detected.url,
              sharedBy: currentUser?.nickname || 'Someone',
            });
            setShowMediaPlayer(true);
          }
        }}
      />
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
      <QuickVideoCapture
        open={showVideoCapture}
        replyTo={videoReplyTarget}
        sendTriggerRef={videoCaptureSendRef}
        onSend={sendVideoReply}
        onDismiss={() => { setShowVideoCapture(false); setVideoReplyTarget(null); }}
      />
      {/* ── Floating feature panels ─────────────────────────────────── */}
      {isPanelOpen('secrets') && (
        <FloatingPanel title={t('chatRoom.panels.secrets')} icon={Lock} iconColor="text-violet-400"
          onClose={() => closePanel('secrets')} onFocus={() => focusPanel('secrets')} zIndex={getZ('secrets')}
          defaultWidth={560} defaultHeight={520} defaultX={160} defaultY={90}>
          <SecretsPanel
            handleSendStego={handleSendStego}
            onClose={() => { setStegoExtractImage(null); closePanel('secrets'); }}
            initialExtractImage={stegoExtractImage}
          />
        </FloatingPanel>
      )}
      {isPanelOpen('code') && (
        <FloatingPanel title={t('chatRoom.panels.codeStudio')} icon={Code2} iconColor="text-blue-400"
          onClose={() => closePanel('code')} onFocus={() => focusPanel('code')} zIndex={getZ('code')}
          defaultWidth={820} defaultHeight={580} defaultX={80} defaultY={70}>
          <CodeShareModal embedded onClose={() => closePanel('code')} roomCode={roomCode} currentUser={currentUser}
            onSendCode={(code, lang) => { sendTextMessage(`\`\`\`${lang}\n${code}\n\`\`\``); }} />
        </FloatingPanel>
      )}
      {isPanelOpen('watch') && (
        <FloatingPanel title={t('chatRoom.panels.watchParty')} icon={Activity} iconColor="text-red-400"
          onClose={() => closePanel('watch')} onFocus={() => focusPanel('watch')} zIndex={getZ('watch')}
          defaultWidth={700} defaultHeight={520} defaultX={140} defaultY={85}>
          <WatchPartyModal embedded onClose={() => closePanel('watch')} roomVibe={roomVibe}
            onShare={(url) => {
              const detected = detectMediaUrl(url);
              if (detected) {
                socketManager.emit('media-share', { roomCode, type: detected.type, id: detected.id || null, url: detected.url, sharedBy: currentUser?.nickname || 'Someone' });
                setShowMediaPlayer(true);
              }
            }} />
        </FloatingPanel>
      )}
      {/* ── Tetris FloatingPanel — always mounted while message exists so game state survives close/minimize ── */}
      {activeTetrisMessage && (
        <FloatingPanel
          title={t('chatRoom.panels.tetris')}
          icon={Gamepad2}
          iconColor="text-cyan-400"
          onClose={() => closePanel('tetris')}
          onFocus={() => focusPanel('tetris')}
          zIndex={getZ('tetris')}
          defaultWidth={560}
          defaultHeight={560}
          defaultX={100}
          defaultY={60}
          visible={isPanelOpen('tetris')}
        >
          <TetrisPanel
            message={activeTetrisMessage}
            currentUser={currentUser}
            roomVibe={roomVibe}
          />
        </FloatingPanel>
      )}

      {/* ── Chess FloatingPanel — always mounted while message exists so game state survives close/minimize ── */}
      {activeChessMessage && (
        <FloatingPanel
          title="Chess"
          icon={Gamepad2}
          iconColor="text-amber-400"
          onClose={() => closePanel('chess')}
          onFocus={() => focusPanel('chess')}
          zIndex={getZ('chess')}
          defaultWidth={480}
          defaultHeight={600}
          defaultX={120}
          defaultY={50}
          visible={isPanelOpen('chess')}
        >
          <ChessPanelErrorBoundary>
            <ChessPanel
              message={activeChessMessage}
              currentUser={currentUser}
              roomVibe={roomVibe}
              onDelete={handleDeleteMessage}
            />
          </ChessPanelErrorBoundary>
        </FloatingPanel>
      )}

      {/* ── Chess config picker ──────────────────────────────────────── */}
      {showChessConfig && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setShowChessConfig(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-5 w-full max-w-xs"
            onClick={e => e.stopPropagation()}>
            <p className="text-sm font-black text-gray-800 dark:text-gray-100 mb-4 text-center">♟ Chess — New Game</p>

            {/* Time control picker */}
            <p className="text-[10px] text-gray-400 uppercase tracking-widest text-center mb-2">Time Control</p>
            <div className="grid grid-cols-3 gap-1.5 mb-4">
              {[
                { label: 'No Timer', value: null },
                { label: '1 min', value: { initial: 60, increment: 0 } },
                { label: '3+2', value: { initial: 180, increment: 2 } },
                { label: '5 min', value: { initial: 300, increment: 0 } },
                { label: '10+5', value: { initial: 600, increment: 5 } },
                { label: '15+10', value: { initial: 900, increment: 10 } },
              ].map(tc => {
                const isSelected = JSON.stringify(chessTimeControl) === JSON.stringify(tc.value);
                return (
                  <button key={tc.label} onClick={() => setChessTimeControl(tc.value)}
                    className={`py-1.5 rounded-lg text-[11px] font-black transition-colors ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                    {tc.label}
                  </button>
                );
              })}
            </div>

            <button onClick={() => handleSendChess(null)}
              className="w-full mb-3 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white font-black text-sm transition-colors">
              ⚔️ vs Player
            </button>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest text-center mb-2">vs CPU</p>
            <div className="flex gap-2">
              {['easy', 'medium', 'hard'].map(d => (
                <button key={d} onClick={() => handleSendChess(d)}
                  className={`flex-1 py-2.5 rounded-xl text-white font-black text-xs capitalize ${currentVibe.accentClass} hover:opacity-90 transition-opacity`}>
                  🤖 {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <EditMessageModal
        isOpen={!!editingMessage}
        onClose={() => setEditingMessage(null)}
        onSave={handleSaveEdit}
        initialContent={editingMessage?.content}
      />
      <PollModal isOpen={showPollModal} onClose={() => setShowPollModal(false)} onSend={handleSendPoll} roomVibe={roomVibe} />
      <DragDropOverlay isDragging={isDragging} />
      <PrivacyOverlay />

      {/* Zoom-style Reaction Layer */}
      <div id="reaction-layer" ref={reactionLayerRef} />
      <ReactionOverlay ref={messageReactionOverlayRef} />

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
