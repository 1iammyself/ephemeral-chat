import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Users, Clock, Shield, Plus, ArrowRight } from 'lucide-react';
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
      icon: <MessageCircle className="w-6 h-6" />,
      title: "Real-Time Chat",
      description: "Instant messaging with WebSocket technology"
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: "Anonymous",
      description: "No registration required, just pick a nickname"
    },
    {
      icon: <Clock className="w-6 h-6" />,
      title: "Ephemeral",
      description: "Messages can auto-delete after set time"
    },
    {
      icon: <Shield className="w-6 h-6" />,
      title: "Private",
      description: "Optional room passwords for security"
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
            <div className="mt-10 max-w-md mx-auto bg-white rounded-xl shadow-md overflow-hidden p-6">
              <form onSubmit={handleJoinRoom} className="space-y-6">
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
                      className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-l-md border border-gray-300 focus:border-indigo-500 focus:ring-indigo-500"
                    />
                    <button
                      type="submit"
                      disabled={isJoining}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-r-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                      {isJoining ? 'Joining...' : 'Join Room'}
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-gray-500">
                    Enter a 10-character room code to join an existing room
                  </p>
                </div>
              </form>

              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300" />
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or</span>
                  </div>
                </div>

                <div className="mt-6">
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="w-full flex justify-center items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                  >
                    <Plus className="-ml-1 mr-2 h-5 w-5" />
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
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {features.map((feature, index) => (
                  <div key={index} className="pt-6">
                    <div className="flow-root bg-white rounded-lg px-6 pb-8">
                      <div className="-mt-6">
                        <div className="inline-flex items-center justify-center p-3 bg-indigo-500 rounded-md shadow-lg">
                          {React.cloneElement(feature.icon, { className: 'h-6 w-6 text-white' })}
                        </div>
                        <h3 className="mt-4 text-lg font-medium text-gray-900">{feature.title}</h3>
                        <p className="mt-2 text-base text-gray-500">
                          {feature.description}
                        </p>
                      </div>
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
            Built with React, Socket.IO, and Redis • Privacy-focused • No data stored permanently
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;
