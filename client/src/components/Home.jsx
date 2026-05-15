import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserX, Clock, Shield, Plus, Zap, Wifi, Edit, Lock, KeyRound, Loader2, Timer, Package, Download, Radio, Settings } from 'lucide-react';
import CreateRoomModal from './CreateRoomModal';
import CreateDropModal from './CreateDropModal';
import DropCreatedModal from './DropCreatedModal';
import ClaimDropModal from './ClaimDropModal';
import DropViewer from './DropViewer';
import TraceHashModal from './TraceHashModal';
import SettingsModal from './SettingsModal';
import { joinWithVerbalCode, checkRoom } from '../utils/api';
import { hapticError } from '../utils/platform';

const Home = ({ children }) => {
  const [roomCode, setRoomCode] = useState('');
  const [verbalCode, setVerbalCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTraceModal, setShowTraceModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCreateDropModal, setShowCreateDropModal] = useState(false);
  const [showClaimDropModal, setShowClaimDropModal] = useState(false);
  const [dropCreatedData, setDropCreatedData] = useState(null);
  const [dropClaimData, setDropClaimData] = useState(null);
  const [isJoining, setIsJoining] = useState(false);
  const [isJoiningVerbal, setIsJoiningVerbal] = useState(false);
  const [urlParamsProcessed, setUrlParamsProcessed] = useState(false);
  const [verbalError, setVerbalError] = useState('');
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
                state: {
                  inviteToken: result.token,
                  requiresPassword: !!result.requiresPassword
                }
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
          .finally(() => {
            setIsJoiningVerbal(false);
          });
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
          state: {
            inviteToken: result.token,
            requiresPassword: result.requiresPassword
          }
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
    { icon: Zap,   title: 'Real-Time Chat',  description: 'Instant messaging' },
    { icon: Wifi,  title: 'WebSocket Powered', description: 'Low-latency connections' },
    { icon: UserX, title: 'No user account', description: 'No registration needed' },
    { icon: Edit,  title: 'Pick Nickname',   description: 'Choose a name' },
    { icon: Clock, title: 'Ephemeral',       description: 'Auto-delete messages' },
    { icon: Lock,  title: 'Private',         description: 'Optional passwords' },
  ];

  return (
    <div style={{ height: '100vh', overflowY: 'auto' }} className="bg-slate-50 dark:bg-gray-900 transition-colors duration-200 no-scrollbar">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700 transition-colors duration-200 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 pt-[clamp(8px,env(safe-area-inset-top),32px)] pb-4 sm:py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center">
            <img src="/logo.svg" alt="Logo" className="h-8 w-8 sm:h-10 sm:w-10 mr-2 sm:mr-3" />
            Ephemeral Chat
          </h1>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Settings"
              aria-label="Open settings"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow">
        {children || (
          <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
            {/* Hero Section */}
            <div className="text-center mb-8 sm:mb-16">
              <h2 className="text-2xl sm:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight lg:text-6xl">
                Secure, Temporary Chat Rooms
              </h2>
              <p className="mt-3 sm:mt-4 max-w-2xl mx-auto text-sm sm:text-xl text-gray-600 dark:text-gray-400">
                Create or join a room to start chatting.
              </p>
            </div>

            {/* Hero Action Card */}
            <div className="mt-8 sm:mt-10 max-w-lg mx-auto space-y-4">
              <div className="bg-white/90 dark:bg-[#1e293b] rounded-2xl p-5 sm:p-8 shadow-xl border border-gray-200 dark:border-gray-700 transition-colors duration-200">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full flex justify-center items-center px-4 py-2.5 sm:py-4 text-sm sm:text-lg font-bold rounded-xl text-white bg-[#22c55e] hover:bg-[#16a34a] transition-all transform active:scale-[0.98] shadow-lg shadow-green-500/20"
                >
                  <Plus className="-ml-1 mr-2 h-5 w-5" />
                  Create New Room
                </button>

                <button
                  onClick={() => navigate('/my-rooms')}
                  className="w-full flex justify-center items-center px-4 py-2.5 sm:py-3.5 text-sm sm:text-lg font-semibold rounded-xl text-gray-700 dark:text-gray-300 bg-slate-100 dark:bg-gray-800/50 hover:bg-slate-200 dark:hover:bg-gray-800/80 transition-all transform active:scale-[0.98] border border-slate-200 dark:border-gray-700 mt-3"
                >
                  <Timer className="-ml-1 mr-2 h-5 w-5" />
                  My Rooms
                </button>

                {/* Ephemeral Drops Section */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-center text-xs font-medium text-purple-700 dark:text-purple-400 mb-3 flex items-center justify-center gap-1">
                    <Package className="w-3.5 h-3.5" />
                    Ephemeral Drops — Encrypted Dead Drops
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setShowCreateDropModal(true)}
                      className="flex justify-center items-center px-3 py-2.5 text-sm font-bold rounded-xl text-white bg-purple-500 hover:bg-purple-600 transition-all transform active:scale-[0.98] shadow-lg shadow-purple-500/20"
                    >
                      <Package className="-ml-1 mr-1.5 h-4 w-4" />
                      Create Drop
                    </button>
                    <button
                      onClick={() => setShowClaimDropModal(true)}
                      className="flex justify-center items-center px-3 py-2.5 text-sm font-bold rounded-xl text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-all transform active:scale-[0.98] border border-purple-200 dark:border-purple-800/50"
                    >
                      <Download className="-ml-1 mr-1.5 h-4 w-4" />
                      Claim Drop
                    </button>
                  </div>
                  <button
                    onClick={() => navigate('/my-drops')}
                    className="w-full flex justify-center items-center px-4 py-2 text-xs font-medium rounded-lg text-purple-500 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all mt-2"
                  >
                    My Drops →
                  </button>
                </div>

                {/* Nearby Transfer Section */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-center text-xs font-medium text-emerald-700 dark:text-emerald-400 mb-3 flex items-center justify-center gap-1">
                    <Radio className="w-3.5 h-3.5" />
                    Nearby Transfer — P2P File Sharing
                  </p>
                  <button
                    onClick={() => navigate('/nearby')}
                    className="w-full flex justify-center items-center px-4 py-2.5 text-sm font-bold rounded-xl text-white bg-emerald-500 hover:bg-emerald-600 transition-all transform active:scale-[0.98] shadow-lg shadow-emerald-500/20"
                  >
                    <Radio className="-ml-1 mr-2 h-4 w-4" />
                    Nearby Transfer
                  </button>
                  <p className="text-center text-[10px] text-gray-700 dark:text-gray-500 mt-1.5">
                    Send files &amp; messages to devices on the same network
                  </p>
                </div>

                {/* Verbal Join Section */}
                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-center text-sm font-semibold text-gray-900 dark:text-gray-300 mb-3">
                    Have a join code?
                  </p>
                  <form onSubmit={handleVerbalJoin} className="flex gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        value={verbalCode}
                        onChange={(e) => setVerbalCode(e.target.value)}
                        placeholder="clarity compass journey peace"
                        data-allow-copy="true"
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                        disabled={isJoiningVerbal}
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isJoiningVerbal || !verbalCode.trim()}
                      className="px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                    >
                      {isJoiningVerbal ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Join'
                      )}
                    </button>
                  </form>
                  {verbalError && (
                    <p className="mt-2 text-xs text-red-500 dark:text-red-400 animate-in fade-in slide-in-from-top-1">
                      {verbalError}
                    </p>
                  )}
                </div>

                <p className="mt-4 text-center text-xs text-gray-700 dark:text-gray-500">
                  Or use an invite link shared by the host
                </p>
              </div>

              <button
                onClick={() => setShowTraceModal(true)}
                className="w-full flex justify-center items-center px-4 py-3 text-sm font-semibold rounded-xl text-gray-800 dark:text-gray-400 bg-white/80 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-all transform active:scale-[0.98]"
              >
                <Shield className="mr-2 h-4 w-4" />
                Trace Forensic Hash
              </button>
            </div>

            {/* Features Info Section */}
            <div className="mt-12">
              <p className="text-center text-xs text-gray-700 dark:text-gray-400 mb-4 font-medium">
                Why use Ephemeral Chat?
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 sm:gap-2 max-w-lg mx-auto">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-1.5 p-1.5 sm:p-2 bg-gray-100 dark:bg-gray-800 rounded text-xs transition-colors duration-200 border border-gray-200 dark:border-gray-700">
                    <feature.icon className="w-3 h-3 text-gray-600 dark:text-gray-500 flex-shrink-0" />
                    <span className="text-gray-800 dark:text-gray-300 truncate font-medium">{feature.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {showCreateModal && (
          <CreateRoomModal
            onClose={() => setShowCreateModal(false)}
            onRoomCreated={handleRoomCreated}
          />
        )}

        {showTraceModal && (
          <TraceHashModal
            onClose={() => setShowTraceModal(false)}
          />
        )}

        {showCreateDropModal && (
          <CreateDropModal
            onClose={() => setShowCreateDropModal(false)}
            onDropCreated={(data) => {
              setShowCreateDropModal(false);
              setDropCreatedData(data);
            }}
          />
        )}

        {dropCreatedData && (
          <DropCreatedModal
            onClose={() => setDropCreatedData(null)}
            dropData={dropCreatedData}
          />
        )}

        {showClaimDropModal && (
          <ClaimDropModal
            onClose={() => setShowClaimDropModal(false)}
            onDropClaimed={(data) => {
              setShowClaimDropModal(false);
              setDropClaimData(data);
            }}
          />
        )}

        {dropClaimData && (
          <DropViewer
            onClose={() => setDropClaimData(null)}
            claimData={dropClaimData}
          />
        )}
      </main>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        initialTab="general"
      />

      {/* Footer */}
      <footer className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-6 transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center space-y-2 text-sm text-gray-700 dark:text-gray-400">
            <p>Ephemeral Chat offers a fast, secure, and private experience</p>
            <button
              onClick={() => navigate('/privacy')}
              className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors font-medium underline underline-offset-4"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
