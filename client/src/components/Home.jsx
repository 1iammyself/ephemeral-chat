import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { UserX, Clock, Shield, Plus, Zap, Wifi, Edit, Lock, KeyRound, Loader2, Timer } from 'lucide-react';
import CreateRoomModal from './CreateRoomModal';
import TraceHashModal from './TraceHashModal';
import ThemeToggle from './ThemeToggle';
import { joinWithVerbalCode, checkRoom } from '../utils/api';
import { hapticError } from '../utils/platform';

import { RefreshButton } from './PWAHandler';

const Home = ({ children }) => {
  const [roomCode, setRoomCode] = useState('');
  const [verbalCode, setVerbalCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showTraceModal, setShowTraceModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isJoiningVerbal, setIsJoiningVerbal] = useState(false);
  const [urlParamsProcessed, setUrlParamsProcessed] = useState(false);
  const [verbalError, setVerbalError] = useState('');
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Auto-open create room modal if ?action=create is in URL (from Chrome extension)
  // Auto-join with verbal code if ?join= is in URL (from Chrome extension)
  useEffect(() => {
    // Only process URL params once
    if (urlParamsProcessed) return;

    const action = searchParams.get('action');
    const joinCode = searchParams.get('join');

    if (action === 'create') {
      setUrlParamsProcessed(true);
      // Clear the URL params first by replacing history
      window.history.replaceState({}, '', window.location.pathname);
      // Then open the modal
      setShowCreateModal(true);
    } else if (joinCode) {
      setUrlParamsProcessed(true);
      // Decode the verbal code (handles %20 -> spaces)
      const decodedCode = decodeURIComponent(joinCode).trim().toLowerCase();
      // Clear the URL params first
      window.history.replaceState({}, '', window.location.pathname);

      // Validate and auto-join
      const words = decodedCode.split(/\s+/).filter(w => w.length > 0);
      if (words.length === 4) {
        setIsJoiningVerbal(true);
        setVerbalCode(decodedCode);

        // Trigger the verbal join
        joinWithVerbalCode(decodedCode)
          .then(result => {
            if (result.success) {
              navigate(`/invite/${result.token}`);
            }
          })
          .catch(error => {
            setVerbalError(typeof error === 'string' ? error : 'Invalid or expired code');
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
      // Check if room exists
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

    // Validate format: 4 words separated by spaces
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
      if (result.success) {
        navigate(`/invite/${result.token}`);
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
    {
      icon: Zap,
      title: "Real-Time Chat",
      description: "Instant messaging"
    },
    {
      icon: Wifi,
      title: "WebSocket Powered",
      description: "Low-latency connections"
    },
    {
      icon: UserX,
      title: "No user account",
      description: "No registration needed"
    },
    {
      icon: Edit,
      title: "Pick Nickname",
      description: "Choose a name"
    },
    {
      icon: Clock,
      title: "Ephemeral",
      description: "Auto-delete messages"
    },
    {
      icon: Lock,
      title: "Private",
      description: "Optional passwords"
    }
  ];

  return (
    <div style={{ height: '100vh', overflowY: 'auto' }} className="dark:bg-gray-900 transition-colors duration-200 no-scrollbar">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm transition-colors duration-200">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400 flex items-center">
            <img src="/logo.svg" alt="Logo" className="h-8 w-8 sm:h-10 sm:w-10 mr-2 sm:mr-3" />
            Ephemeral Chat
          </h1>
          <div className="flex items-center space-x-2">
            <RefreshButton />
            <ThemeToggle />
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
              <p className="mt-3 sm:mt-4 max-w-2xl mx-auto text-sm sm:text-xl text-gray-500 dark:text-gray-400">
                Create or join a room to start chatting.
              </p>
            </div>

            {/* Hero Action Card */}
            <div className="mt-8 sm:mt-10 max-w-lg mx-auto space-y-4">
              <div className="bg-white dark:bg-[#1e293b] rounded-2xl p-5 sm:p-8 shadow-xl transition-colors duration-200">
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="w-full flex justify-center items-center px-4 py-2.5 sm:py-4 text-sm sm:text-lg font-bold rounded-xl text-white bg-[#22c55e] hover:bg-[#16a34a] transition-all transform active:scale-[0.98] shadow-lg shadow-green-500/20"
                >
                  <Plus className="-ml-1 mr-2 h-5 w-5" />
                  Create New Room
                </button>

                <button
                  onClick={() => navigate('/my-rooms')}
                  className="w-full flex justify-center items-center px-4 py-2.5 sm:py-3.5 text-sm sm:text-lg font-semibold rounded-xl text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all transform active:scale-[0.98] border border-blue-200 dark:border-blue-800/50 mt-3"
                >
                  <Timer className="-ml-1 mr-2 h-5 w-5" />
                  My Rooms
                </button>

                {/* Verbal Join Section */}
                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
                  <p className="text-center text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
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
                        className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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

                <p className="mt-4 text-center text-xs text-gray-400 dark:text-gray-500">
                  Or use an invite link shared by the host
                </p>
              </div>

              <button
                onClick={() => setShowTraceModal(true)}
                className="w-full flex justify-center items-center px-4 py-3 text-sm font-semibold rounded-xl text-gray-600 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 hover:bg-white dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-all transform active:scale-[0.98]"
              >
                <Shield className="mr-2 h-4 w-4" />
                Trace Forensic Hash
              </button>
            </div>

            {/* Features - Info Section */}
            <div className="mt-12 opacity-75">
              <p className="text-center text-xs text-gray-500 dark:text-gray-400 mb-4">
                Why use Ephemeral Chat?
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 sm:gap-2 max-w-lg mx-auto">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-1.5 p-1.5 sm:p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs transition-colors duration-200">
                    <feature.icon className="w-3 h-3 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                    <span className="text-gray-600 dark:text-gray-300 truncate">{feature.title}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )
        }

        {/* Create Room Modal */}
        {
          showCreateModal && (
            <CreateRoomModal
              onClose={() => setShowCreateModal(false)}
              onRoomCreated={handleRoomCreated}
            />
          )
        }

        {/* Trace Hash Modal */}
        {
          showTraceModal && (
            <TraceHashModal
              onClose={() => setShowTraceModal(false)}
            />
          )
        }
      </main >

      {/* Footer */}
      < footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-6 transition-colors duration-200" >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center space-y-2 text-sm text-gray-500 dark:text-gray-400">
            <p>Ephemeral Chat offers a fast, secure, and private experience</p>
            <button
              onClick={() => navigate('/privacy')}
              className="hover:text-blue-500 dark:hover:text-blue-400 transition-colors font-medium underline underline-offset-4"
            >
              Privacy Policy
            </button>
          </div>
        </div>
      </footer >
    </div >
  );
};

export default Home;
