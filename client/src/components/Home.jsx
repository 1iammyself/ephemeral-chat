import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserX, Clock, Shield, Plus, Zap, Wifi, Edit, Lock, KeyRound, Loader2, Timer, Package, Download, Radio } from 'lucide-react';
import CreateRoomModal from './CreateRoomModal';
import CreateDropModal from './CreateDropModal';
import DropCreatedModal from './DropCreatedModal';
import ClaimDropModal from './ClaimDropModal';
import DropViewer from './DropViewer';
import TraceHashModal from './TraceHashModal';
import ThemeToggle from './ThemeToggle';
import { joinWithVerbalCode, checkRoom } from '../utils/api';
import { hapticError } from '../utils/platform';
import { AppRefreshButton } from './AppRefreshButton';

const Home = ({ children }) => {
  const [roomCode, setRoomCode] = useState('');
  const [verbalCode, setVerbalCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTraceModal, setShowTraceModal] = useState(false);
  const [showCreateDropModal, setShowCreateDropModal] = useState(false);
  const [showClaimDropModal, setShowClaimDropModal] = useState(false);
  const [dropCreatedData, setDropCreatedData] = useState(null);
  const [dropClaimData, setDropClaimData] = useState(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isJoiningVerbal, setIsJoiningVerbal] = useState(false);
  const [urlParamsProcessed, setUrlParamsProcessed] = useState(false);
  const [verbalError, setVerbalError] = useState('');
  const [showDropsPanel, setShowDropsPanel] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (urlParamsProcessed) return;

    const action = searchParams.get('action');
    const joinCode = searchParams.get('join');

    if (action === 'create') {
      setUrlParamsProcessed(true);
      window.history.replaceState({}, '', window.location.pathname);
      setShowCreateModal(true);
    } else if (action === 'create-drop') {
      setUrlParamsProcessed(true);
      window.history.replaceState({}, '', window.location.pathname);
      setShowCreateDropModal(true);
    } else if (joinCode) {
      setUrlParamsProcessed(true);
      const decodedCode = decodeURIComponent(joinCode).trim().toLowerCase();
      window.history.replaceState({}, '', window.location.pathname);

      const words = decodedCode.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 4) {
        setIsJoiningVerbal(true);
        setVerbalCode(decodedCode);
        joinWithVerbalCode(decodedCode)
          .then(result => {
            if (result.success && result.roomCode) {
              navigate(`/room/${result.roomCode}`, {
                state: { inviteToken: result.token, requiresPassword: !!result.requiresPassword }
              });
            } else {
              setVerbalError('Invalid or expired verbal code.');
              hapticError();
            }
          })
          .catch(error => {
            const msg = typeof error === 'string' ? error : (error?.response?.data?.error || error?.message || 'Invalid or expired verbal code.');
            setVerbalError(msg);
            hapticError();
          })
          .finally(() => setIsJoiningVerbal(false));
      } else {
        setVerbalError('Invalid verbal code format. Please enter 4 words.');
        hapticError();
      }
    }
  }, [searchParams, urlParamsProcessed, navigate]);

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomCode.trim() || roomCode.length !== 10) {
      alert('Please enter a valid 10-character room code');
      return;
    }
    setIsJoining(true);
    try {
      const data = await checkRoom(roomCode.toUpperCase());
      if (data.exists) {
        navigate(`/room/${roomCode.toUpperCase()}`);
      } else {
        alert('Room not found. Please check the room code.');
      }
    } catch (error) {
      console.error('Error checking room:', error);
      alert('Failed to check room. Please try again.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleVerbalJoin = async (e) => {
    e.preventDefault();
    const trimmedCode = verbalCode.trim().toLowerCase();

    if (!trimmedCode) {
      setVerbalError('Please enter a verbal code');
      hapticError();
      return;
    }

    const words = trimmedCode.split(' ').filter(w => w.length > 0);
    if (words.length !== 4) {
      setVerbalError('Please enter 4 words separated by spaces');
      hapticError();
      return;
    }

    setVerbalError('');
    setIsJoiningVerbal(true);
    try {
      const result = await joinWithVerbalCode(trimmedCode);
      if (result.success && result.roomCode) {
        navigate(`/room/${result.roomCode}`, {
          state: { inviteToken: result.token, requiresPassword: result.requiresPassword }
        });
      }
    } catch (error) {
      setVerbalError(typeof error === 'string' ? error : 'Invalid or expired code');
      hapticError();
    } finally {
      setIsJoiningVerbal(false);
    }
  };

  const handleRoomCreated = (roomCode) => {
    setShowCreateModal(false);
    navigate(`/room/${roomCode}`);
  };

  const features = [
    { icon: Zap,   title: 'Real-Time'  },
    { icon: UserX, title: 'No Account' },
    { icon: Clock, title: 'Ephemeral'  },
    { icon: Lock,  title: 'Encrypted'  },
    { icon: Wifi,  title: 'WebSocket'  },
    { icon: Edit,  title: 'Nickname'   },
  ];

  return (
    <div style={{ height: '100vh', overflowY: 'auto' }} className="bg-slate-50 dark:bg-gray-900 transition-colors duration-200 no-scrollbar flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 flex-none bg-white/80 dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 backdrop-blur-xl transition-colors duration-200">
        <div className="max-w-lg mx-auto px-4 pt-[clamp(8px,env(safe-area-inset-top),32px)] pb-3 flex justify-between items-center">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <img src="/logo.svg" alt="Logo" className="h-7 w-7" />
            Ephemeral Chat
          </h1>
          <div className="flex items-center gap-2">
            <AppRefreshButton />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        {children || (
          <div className="flex-1 flex items-center justify-center px-4 py-6">
            <div className="w-full max-w-sm space-y-3">

              {/* Primary card */}
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-lg border border-gray-200 dark:border-gray-700">

                {/* Create Room */}
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-green-500 hover:bg-green-600 text-white font-bold rounded-xl transition-all active:scale-[0.98] shadow-md shadow-green-500/20 text-sm"
                >
                  <Plus className="w-4 h-4" />
                  Create New Room
                </button>

                {/* Verbal join form */}
                <form onSubmit={handleVerbalJoin} className="mt-3 flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={verbalCode}
                      onChange={(e) => { setVerbalCode(e.target.value); setVerbalError(''); }}
                      placeholder="4-word join code"
                      data-allow-copy="true"
                      className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                      disabled={isJoiningVerbal}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isJoiningVerbal || !verbalCode.trim()}
                    className="px-3.5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors disabled:opacity-50 flex items-center"
                  >
                    {isJoiningVerbal ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Join'}
                  </button>
                </form>
                {verbalError && (
                  <p className="mt-1.5 text-xs text-red-500 dark:text-red-400 animate-in fade-in">{verbalError}</p>
                )}

                {/* Secondary tiles: My Rooms | Drops | Nearby */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <button
                    onClick={() => navigate('/my-rooms')}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 transition-colors active:scale-95"
                  >
                    <Timer className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">My Rooms</span>
                  </button>

                  <button
                    onClick={() => setShowDropsPanel(p => !p)}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-colors active:scale-95 ${
                      showDropsPanel
                        ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700'
                        : 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Package className={`w-4 h-4 ${showDropsPanel ? 'text-purple-500 dark:text-purple-400' : 'text-gray-600 dark:text-gray-400'}`} />
                    <span className={`text-[10px] font-semibold ${showDropsPanel ? 'text-purple-600 dark:text-purple-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      Drops
                    </span>
                  </button>

                  <button
                    onClick={() => navigate('/nearby')}
                    className="flex flex-col items-center gap-1 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 transition-colors active:scale-95"
                  >
                    <Radio className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-300">Nearby</span>
                  </button>
                </div>

                {/* Drops sub-panel (Create / Claim / My Drops) */}
                {showDropsPanel && (
                  <div className="mt-2 grid grid-cols-3 gap-2 animate-in fade-in slide-in-from-top-1 duration-150">
                    <button
                      onClick={() => { setShowCreateDropModal(true); setShowDropsPanel(false); }}
                      className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl bg-purple-500 hover:bg-purple-600 transition-colors active:scale-95"
                    >
                      <Package className="w-4 h-4 text-white" />
                      <span className="text-[10px] font-bold text-white">Create</span>
                    </button>
                    <button
                      onClick={() => { setShowClaimDropModal(true); setShowDropsPanel(false); }}
                      className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-700 transition-colors active:scale-95"
                    >
                      <Download className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400">Claim</span>
                    </button>
                    <button
                      onClick={() => navigate('/my-drops')}
                      className="flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 transition-colors active:scale-95"
                    >
                      <Timer className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                      <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">My Drops</span>
                    </button>
                  </div>
                )}

                {/* Footer row: invite note + trace hash */}
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                  <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    Or open an invite link from the host
                  </p>
                  <button
                    onClick={() => setShowTraceModal(true)}
                    className="flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                  >
                    <Shield className="w-3 h-3" />
                    Trace Hash
                  </button>
                </div>
              </div>

              {/* Feature chips */}
              <div className="flex flex-wrap justify-center gap-1.5">
                {features.map((f, i) => (
                  <span key={i} className="flex items-center gap-1 px-2.5 py-1 bg-white/60 dark:bg-gray-800/60 rounded-full text-[10px] text-gray-500 dark:text-gray-400 border border-gray-200/60 dark:border-gray-700/60">
                    <f.icon className="w-2.5 h-2.5" />
                    {f.title}
                  </span>
                ))}
              </div>

              {/* Privacy */}
              <p className="text-center">
                <button
                  onClick={() => navigate('/privacy')}
                  className="text-[10px] text-gray-400 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 hover:underline transition-colors"
                >
                  Privacy Policy
                </button>
              </p>
            </div>
          </div>
        )}

        {showCreateModal && (
          <CreateRoomModal onClose={() => setShowCreateModal(false)} onRoomCreated={handleRoomCreated} />
        )}
        {showTraceModal && (
          <TraceHashModal onClose={() => setShowTraceModal(false)} />
        )}
        {showCreateDropModal && (
          <CreateDropModal
            onClose={() => setShowCreateDropModal(false)}
            onDropCreated={(data) => { setShowCreateDropModal(false); setDropCreatedData(data); }}
          />
        )}
        {dropCreatedData && (
          <DropCreatedModal onClose={() => setDropCreatedData(null)} dropData={dropCreatedData} />
        )}
        {showClaimDropModal && (
          <ClaimDropModal
            onClose={() => setShowClaimDropModal(false)}
            onDropClaimed={(data) => { setShowClaimDropModal(false); setDropClaimData(data); }}
          />
        )}
        {dropClaimData && (
          <DropViewer onClose={() => setDropClaimData(null)} claimData={dropClaimData} />
        )}
      </main>
    </div>
  );
};

export default Home;
