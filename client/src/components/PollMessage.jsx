import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Users } from 'lucide-react';
import PollDetailsModal from './PollDetailsModal';
import { getVibeById } from '../utils/vibes';

const PollMessage = ({ message, currentUser, onVote, roomVibe }) => {
    const { pollData } = message;
    const { question, options, allowMultiple } = pollData;
    const currentUserId = currentUser?.id || currentUser?.socketId;
    const vibe = getVibeById(roomVibe);

    const [showDetails, setShowDetails] = useState(false);

    const totalVotes = useMemo(() => {
        const uniqueVoters = new Set();
        options.forEach(opt => opt.votes?.forEach(v => uniqueVoters.add(v.userId)));
        return uniqueVoters.size;
    }, [options]);

    const hasUserVoted = (votes) => votes?.some(v => v.userId === currentUserId);

    // Dynamic classes based on vibe
    const accentColor = vibe.id === 'party' ? 'indigo' :
        vibe.id === 'chill' ? 'teal' :
            vibe.id === 'focus' ? 'orange' : 'primary';

    const headerClass = vibe.accentClass;
    const selectedOptionClass = `border-${accentColor}-500 bg-${accentColor}-50 dark:bg-${accentColor}-900/20`;
    const checkIconClass = `text-${accentColor}-500`;
    const selectedTextClass = `text-${accentColor}-700 dark:text-${accentColor}-300`;
    const progressBarClass = `bg-${accentColor}-500/10 dark:bg-${accentColor}-400/10`;
    const footerLinkClass = `text-${accentColor}-600 dark:text-${accentColor}-400`;

    return (
        <>
            <div className={`w-full max-w-[260px] sm:max-w-[320px] bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border-x border-b ${cardBorderClass} border-t-4 border-t-${accentColor}-500`}>
                <div className={`p-2.5 sm:p-4 ${headerClass}`}>
                    <h3 className="text-white font-bold leading-tight text-sm sm:text-base">{question}</h3>
                    <p className="text-white/80 text-[10px] sm:text-xs mt-1 flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {allowMultiple ? 'Select one or more' : 'Select one'}
                    </p>
                </div>

                <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                    {options.map((option) => {
                        const votes = option.votes || [];
                        const voteCount = votes.length;
                        const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                        const isVoted = hasUserVoted(votes);

                        return (
                            <div key={option.id} className="relative group">
                                <button
                                    onClick={() => onVote(message.id, option.id)}
                                    className={`w-full text-left p-2 sm:p-3 rounded-lg border transition-all duration-200 flex items-center justify-between relative z-10 ${isVoted
                                        ? selectedOptionClass
                                        : `border-gray-100 dark:border-gray-700 hover:border-${accentColor}-300 dark:hover:border-${accentColor}-700 bg-gray-50 dark:bg-gray-700/50`
                                        }`}
                                >
                                    <div className="flex items-center space-x-2 sm:space-x-3 mr-6 sm:mr-10">
                                        {isVoted ? (
                                            <CheckCircle2 className={`w-4 h-4 sm:w-5 sm:h-5 ${checkIconClass} shrink-0`} />
                                        ) : (
                                            <Circle className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 shrink-0" />
                                        )}
                                        <span className={`text-[13px] sm:text-sm ${isVoted ? `font-semibold ${selectedTextClass}` : 'text-gray-700 dark:text-gray-300'}`}>
                                            {option.text}
                                        </span>
                                    </div>
                                    <span className="text-[10px] sm:text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">
                                        {voteCount}
                                    </span>
                                </button>

                                {/* Progress bar background */}
                                {totalVotes > 0 && (
                                    <div className={`absolute left-0 top-0 h-full ${progressBarClass} rounded-lg pointer-events-none transition-all duration-500`} style={{ width: `${percentage}%` }} />
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <Users className="w-3.5 h-3.5 mr-1" />
                        <span>{totalVotes} vote{totalVotes !== 1 ? 's' : ''}</span>
                    </div>
                    <button
                        className={`text-xs font-medium ${footerLinkClass} hover:underline`}
                        onClick={() => setShowDetails(true)}
                    >
                        View results
                    </button>
                </div>
            </div>

            <PollDetailsModal
                isOpen={showDetails}
                onClose={() => setShowDetails(false)}
                pollData={pollData}
                currentUser={currentUser}
                roomVibe={roomVibe}
            />
        </>
    );
};

export default PollMessage;
