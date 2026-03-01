import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCreatorId } from '../utils/creator';
import { ArrowLeft, Trash2, LogIn, Timer, Users, Zap, PartyPopper, Sun, Sunset, RefreshCw } from 'lucide-react';

const MyRooms = () => {
    const [rooms, setRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();
    const API_BASE = import.meta.env.VITE_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : '');

    useEffect(() => {
        fetchRooms();
    }, []);

    const fetchRooms = async () => {
        try {
            setLoading(true);
            const creatorId = getCreatorId();
            const response = await fetch(`${API_BASE}/api/my-rooms?creatorId=${creatorId}`);

            if (!response.ok) {
                throw new Error('Failed to fetch rooms');
            }

            const data = await response.json();
            setRooms(data);
            setError(null);
        } catch (err) {
            console.error('Error fetching rooms:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteRoom = async (roomCode) => {

        try {
            const creatorId = getCreatorId();
            const response = await fetch(`${API_BASE}/api/rooms/${roomCode}/delete`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ creatorId })
            });

            if (!response.ok) {
                throw new Error('Failed to delete room');
            }

            // Remove room from local state
            setRooms(rooms.filter(r => r.roomCode !== roomCode));
        } catch (err) {
            console.error('Error deleting room:', err);
            alert('Failed to delete room: ' + err.message);
        }
    };

    const formatTimeRemaining = (ms) => {
        if (ms <= 0) return 'Expired';

        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 0) {
            return `${hours}h ${minutes}m remaining`;
        }
        return `${minutes}m remaining`;
    };

    const getStatusBadge = (status) => {
        const styles = {
            active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
            recoverable: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
            expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
        };

        const labels = {
            active: 'Active',
            recoverable: 'Empty',
            expired: 'Expired'
        };

        return (
            <span className={`px-2 py-1 rounded text-xs font-medium ${styles[status]}`}>
                {labels[status]}
            </span>
        );
    };

    const getModeIcon = (mode) => {
        const icons = {
            ephemeral: Zap,
            gathering: PartyPopper,
            social: Sun,
            extended: Sunset
        };
        return icons[mode] || Timer;
    };

    const getModeLabel = (mode) => {
        const labels = {
            ephemeral: 'Quick Chat',
            gathering: 'Gathering',
            social: 'Social',
            extended: 'Extended'
        };
        return labels[mode] || mode;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Loading your rooms...</p>
                </div>
            </div>
        );
    }

    const renderRoomCard = (room) => {
        const ModeIcon = getModeIcon(room.persistenceMode);
        return (
            <div
                key={room.roomCode}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 sm:p-6 shadow-sm hover:shadow-md transition-shadow"
            >
                <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                            <h3 className="text-lg sm:text-xl font-mono font-bold text-gray-900 dark:text-white">
                                {room.roomCode}
                            </h3>
                            {getStatusBadge(room.status)}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                            <div className="flex items-center">
                                <ModeIcon className="w-4 h-4 mr-1" />
                                {getModeLabel(room.persistenceMode)}
                            </div>

                            <div className="flex items-center">
                                <Users className="w-4 h-4 mr-1" />
                                {room.userCount} {room.userCount === 1 ? 'user' : 'users'}
                            </div>

                            <div className="flex items-center">
                                <Timer className="w-4 h-4 mr-1" />
                                {formatTimeRemaining(room.timeRemaining)}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                    {room.status !== 'expired' && (
                        <button
                            onClick={() => navigate(`/room/${room.roomCode}`)}
                            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                        >
                            <LogIn className="w-4 h-4 mr-2" />
                            {room.status === 'active' ? 'Join' : 'Enter'} Room
                        </button>
                    )}

                    {room.isOwner && (
                        <button
                            onClick={() => handleDeleteRoom(room.roomCode)}
                            className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                        </button>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="h-screen overflow-y-auto bg-gradient-to-br from-blue-50 via-white to-blue-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
            <div className="max-w-4xl mx-auto p-4 sm:p-6">
                {/* Header */}
                <div className="mb-6">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 mr-2" />
                        Back to Home
                    </button>

                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                                My Rooms
                            </h1>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {rooms.filter(r => r.isOwner).length}/5 rooms managed
                            </p>
                        </div>

                        <div className="flex space-x-2">
                            <button
                                onClick={fetchRooms}
                                disabled={loading}
                                className="p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center justify-center border border-gray-200 dark:border-gray-700"
                                title="Refresh room status"
                            >
                                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                            <button
                                onClick={() => navigate('/?action=create')}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                Create New Room
                            </button>
                        </div>
                    </div>
                </div>

                {/* Error State */}
                {error && (
                    <div className="bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 text-red-700 dark:text-red-400 px-4 py-3 rounded mb-4">
                        {error}
                    </div>
                )}

                {/* Empty State */}
                {!loading && rooms.length === 0 && (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Timer className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                            No rooms yet
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                            Create your first room to get started
                        </p>
                        <button
                            onClick={() => navigate('/?action=create')}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Create Room
                        </button>
                    </div>
                )}

                {/* Rooms Lists */}
                <div className="space-y-8">
                    {/* Managed Rooms Section */}
                    {rooms.some(r => r.isOwner) && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                                <Zap className="w-4 h-4 mr-2 text-blue-600" />
                                Managed by Me
                            </h2>
                            <div className="space-y-4">
                                {rooms.filter(r => r.isOwner).map(room => renderRoomCard(room))}
                            </div>
                        </div>
                    )}

                    {/* Recent Rooms Section */}
                    {rooms.some(r => !r.isOwner) && (
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                                <Users className="w-4 h-4 mr-2 text-blue-600" />
                                Joined Recently
                            </h2>
                            <div className="space-y-4">
                                {rooms.filter(r => !r.isOwner).map(room => renderRoomCard(room))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MyRooms;
