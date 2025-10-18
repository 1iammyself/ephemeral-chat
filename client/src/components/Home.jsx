import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Users, Clock, Shield, Plus, ArrowRight, Zap, Wifi, User, Edit, Lock } from 'lucide-react';
import CreateRoomModal from './CreateRoomModal';

const Home = ({ children }) => {
  const [roomCode, setRoomCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const navigate = useNavigate();

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomCode.trim() || roomCode.length !== 10) {
      alert('Please enter a valid 10-character room code');
      return;
    }

    setIsJoining(true);
    try {
      // Check if room exists
      const response = await fetch(`/api/rooms/${roomCode.toUpperCase()}`);
      const data = await response.json();
      
      if (response.ok && data.exists) {
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
      icon: User,
      title: "Anonymous",
      description: "No registration needed"
    },
    {
      icon: Edit,
      title: "Pick Nickname",
      description: "Just choose a name"
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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-indigo-600 flex items-center">
            <MessageCircle className="h-8 w-8 mr-2" />
            Ephemeral Chat
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow">
        {children || (
          <div className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
            {/* Hero Section */}
            <div className="text-center mb-16">
              <h2 className="text-4xl font-extrabold text-gray-900 sm:text-5xl sm:tracking-tight lg:text-6xl">
                Secure, Temporary Chat Rooms
              </h2>
              <p className="mt-5 max-w-2xl mx-auto text-xl text-gray-500">
                Create or join a room to start chatting. Your messages disappear when you leave!
              </p>
            </div>

            {/* Join Room Form */}
            <div className="mt-10 max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-4 sm:p-6">
              <form onSubmit={handleJoinRoom} className="space-y-4 sm:space-y-6">
                <div>
                  <label htmlFor="roomCode" className="block text-sm font-medium text-gray-700">
                    Room Code
                  </label>
                  <div className="mt-1 flex rounded-md shadow-sm">
                    <input
                      type="text"
                      id="roomCode"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      maxLength={10}
                      placeholder="ABCDEFGHIJ"
                      className="flex-1 min-w-0 block w-full px-3 py-2 sm:py-3 text-sm sm:text-base rounded-none rounded-l-md border border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={isJoining}
                      className="inline-flex items-center px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base font-medium rounded-r-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 min-h-[44px]"
                    >
                      {isJoining ? 'Joining...' : 'Join Room'}
                    </button>
                  </div>
                  <p className="mt-2 text-xs sm:text-sm text-gray-500">
                    Enter a 10-character room code to join an existing room
                  </p>
                </div>
              </form>

              <div className="mt-4 sm:mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or</span>
                  </div>
                </div>

                <div className="mt-4 sm:mt-6">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="w-full flex justify-center items-center px-4 py-3 text-sm sm:text-base font-medium rounded-md shadow-sm text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 min-h-[44px]"
                  >
                    <Plus className="-ml-1 mr-2 h-4 w-4 sm:h-5 sm:w-5" />
                    Create New Room
                  </button>
                </div>
              </div>
            </div>

            {/* Features */}
            <div className="mt-16">
              <h3 className="text-center text-lg font-medium text-gray-900 mb-8">
                Why use Ephemeral Chat?
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 mb-6">
                {features.map((feature, index) => (
                  <div key={index} className="flex items-center space-x-2 sm:space-x-3 p-2 sm:p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg shadow-sm hover:shadow-md transition-shadow">
                    <feature.icon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-900 text-sm sm:text-base">{feature.title}</div>
                      <div className="text-xs text-gray-600 truncate">{feature.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Create Room Modal */}
        {showCreateModal && (
          <CreateRoomModal
            onClose={() => setShowCreateModal(false)}
            onRoomCreated={handleRoomCreated}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-gray-500">
            Ephemeral Chat offers a fast, secure, and anonymous experience 
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
