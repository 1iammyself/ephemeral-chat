import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageCircle, Users, Clock, Shield, Plus, ArrowRight } from 'lucide-react';
import CreateRoomModal from './CreateRoomModal';

const Home = () => {
  const [roomCode, setRoomCode] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const navigate = useNavigate();

  const handleJoinRoom = async (e) => {
    e.preventDefault();
    if (!roomCode.trim() || roomCode.length !== 6) {
      alert('Please enter a valid 6-character room code');
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="bg-primary-600 p-3 rounded-2xl">
              <MessageCircle className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Ephemeral Chat
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Anonymous, temporary chat rooms with real-time messaging. 
            No registration required.
          </p>
        </div>

        {/* Main Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-12">
          {/* Create Room */}
          <div className="card p-8 text-center">
            <div className="bg-green-100 p-3 rounded-full w-fit mx-auto mb-4">
              <Plus className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3">Create New Room</h3>
            <p className="text-gray-600 mb-6">
              Start a new chat room and get a unique room code to share
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="btn-primary w-full"
            >
              Create Room
            </button>
          </div>

          {/* Join Room */}
          <div className="card p-8">
            <div className="bg-blue-100 p-3 rounded-full w-fit mx-auto mb-4">
              <ArrowRight className="w-6 h-6 text-blue-600" />
            </div>
            <h3 className="text-xl font-semibold mb-3 text-center">Join Existing Room</h3>
            <p className="text-gray-600 mb-6 text-center">
              Enter a room code to join an ongoing conversation
            </p>
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <input
                type="text"
                placeholder="Enter 6-digit room code..."
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="input-field text-center text-lg font-mono tracking-wider"
                disabled={isJoining}
              />
              <button
                type="submit"
                disabled={isJoining || roomCode.length !== 6}
                className="btn-primary w-full"
              >
                {isJoining ? 'Joining...' : 'Join Room'}
              </button>
            </form>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, index) => (
            <div key={index} className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 text-center">
              <div className="text-gray-500 mb-2">
                {React.cloneElement(feature.icon, { className: 'w-5 h-5 mx-auto' })}
              </div>
              <h4 className="text-sm font-medium text-gray-700 mb-1">{feature.title}</h4>
              <p className="text-xs text-gray-500">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="text-center mt-12 text-gray-500 text-sm">
          <p>
            Built with React, Socket.IO, and Redis • 
            <span className="ml-1">Privacy-focused • No data stored permanently</span>
          </p>
        </div>
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <CreateRoomModal
          onClose={() => setShowCreateModal(false)}
          onRoomCreated={handleRoomCreated}
        />
      )}
    </div>
  );
};

export default Home;
