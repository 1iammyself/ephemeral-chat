import React from 'react';
import { X, Clock } from 'lucide-react';
import { getVibeById } from '../utils/vibes';

const PollDetailsModal = ({ isOpen, onClose, pollData, currentUser, roomVibe }) => {
    if (!isOpen || !pollData) return null;

    const { question, options } = pollData;
    const currentUserId = currentUser?.id || currentUser?.socketId;
    const vibe = getVibeById(roomVibe);

    const formatTime = (isoString) => {
        const date = new Date(isoString);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        if (isToday) {
            return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    // Dynamic classes based on vibe
    const accentColor = vibe.id === 'party' ? 'indigo' :
        vibe.id === 'chill' ? 'teal' :
            vibe.id === 'focus' ? 'orange' : 'primary';

    const avatarClass = `bg-${accentColor}-600 text-white`;
    const youBadgeClass = `bg-${accentColor}-100 dark:bg-${accentColor}-900/40 text-${accentColor}-600 dark:text-${accentColor}-400 border-${accentColor}-200 dark:border-${accentColor}-800`;
    const nicknameClass = `text-${accentColor}-600 dark:text-${accentColor}-400`;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
                    <div className="flex items-center space-x-3">
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 dark:text-gray-400"
                        >
                            <X className="w-5 h-5" />
                        </button>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Poll details</h2>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin">
                    <div className="space-y-2">
                        <h3 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                            {question}
                        </h3>
                    </div>

                    <div className="space-y-8">
                        {options.map((option) => (
                            <div key={option.id} className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                                        {option.text}
                                    </h4>
                                    <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center space-x-1 ${(option.votes?.length || 0) > 0
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 border border-green-200 dark:border-green-800'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                                        }`}>
                                        <span>{option.votes?.length || 0} vote{(option.votes?.length || 0) !== 1 ? 's' : ''}</span>
                                        {(option.votes?.length || 0) > 0 && <span className="text-[10px]">★</span>}
                                    </div>
                                </div>

                                {option.votes && option.votes.length > 0 ? (
                                    <div className="space-y-3 pl-2">
                                        {option.votes.map((vote, idx) => {
                                            const isMe = vote.userId === currentUserId;
                                            return (
                                                <div key={idx} className="flex items-center space-x-4 animate-in slide-in-from-left-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold shadow-sm ${isMe
                                                        ? avatarClass
                                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                                        }`}>
                                                        {vote.nickname?.charAt(0).toUpperCase() || '?'}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center space-x-2">
                                                            <span className={`font-bold transition-colors ${isMe ? nicknameClass : 'text-gray-900 dark:text-white'
                                                                }`}>
                                                                {isMe ? 'You' : vote.nickname}
                                                            </span>
                                                            {isMe && (
                                                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${youBadgeClass} font-bold border`}>
                                                                    You
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
                                                            <Clock className="w-3 h-3 mr-1 opacity-70" />
                                                            {formatTime(vote.timestamp)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="pl-2 italic text-sm text-gray-400 dark:text-gray-500 py-2 border-l-2 border-gray-100 dark:border-gray-800 ml-1">
                                        No votes yet
                                    </div>
                                )}

                                {/* Sub-poll (follow-up) details */}
                                {option.subPoll && (
                                    <div className="mt-4 ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-4">
                                        <p className={`text-sm font-bold text-${accentColor}-600 dark:text-${accentColor}-400`}>
                                            ↳ {option.subPoll.question}
                                        </p>
                                        {option.subPoll.options.map((subOption) => (
                                            <div key={subOption.id} className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                                        {subOption.text}
                                                    </h5>
                                                    <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">
                                                        {subOption.votes?.length || 0} vote{(subOption.votes?.length || 0) !== 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                                {subOption.votes && subOption.votes.length > 0 && (
                                                    <div className="space-y-2 pl-2">
                                                        {subOption.votes.map((vote, idx) => {
                                                            const isMe = vote.userId === currentUserId;
                                                            return (
                                                                <div key={idx} className="flex items-center space-x-3">
                                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${isMe
                                                                        ? avatarClass
                                                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                                                        }`}>
                                                                        {vote.nickname?.charAt(0).toUpperCase() || '?'}
                                                                    </div>
                                                                    <span className={`text-sm font-medium ${isMe ? nicknameClass : 'text-gray-700 dark:text-gray-300'}`}>
                                                                        {isMe ? 'You' : vote.nickname}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PollDetailsModal;
