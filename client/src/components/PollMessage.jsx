import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Users } from 'lucide-react';
import PollDetailsModal from './PollDetailsModal';

const PollMessage = ({ message, currentUser, onVote }) => {
    const { pollData, sender } = message;
    const { question, options, allowMultiple } = pollData;
    const currentUserId = currentUser?.id || currentUser?.socketId;

    const [showDetails, setShowDetails] = useState(false);

    const totalVotes = useMemo(() => {
        const uniqueVoters = new Set();
        options.forEach(opt => opt.votes?.forEach(v => uniqueVoters.add(v.userId)));
        return uniqueVoters.size;
    }, [options]);

    const hasUserVoted = (votes) => votes?.some(v => v.userId === currentUserId);

    return (
        <>
            <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="p-4 bg-primary-600">
                    <h3 className="text-white font-bold leading-tight">{question}</h3>
                    <p className="text-primary-100 text-xs mt-1 flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {allowMultiple ? 'Select one or more' : 'Select one'}
                    </p>
                </div>

                <div className="p-4 space-y-3">
                    {options.map((option) => {
                        const votes = option.votes || [];
                        const voteCount = votes.length;
                        const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                        const isVoted = hasUserVoted(votes);

                        return (
                            <div key={option.id} className="relative group">
                                <button
                                    onClick={() => onVote(message.id, option.id)}
                                    className={`w-full text-left p-3 rounded-lg border transition-all duration-200 flex items-center justify-between relative z-10 ${isVoted
                                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                                        : 'border-gray-100 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-700 bg-gray-50 dark:bg-gray-700/50'
                                        }`}
                                >
                                    <div className="flex items-center space-x-3 mr-10">
                                        {isVoted ? (
                                            <CheckCircle2 className="w-5 h-5 text-primary-500 shrink-0" />
                                        ) : (
                                            <Circle className="w-5 h-5 text-gray-400 dark:text-gray-500 shrink-0" />
                                        )}
                                        <span className={`text-sm ${isVoted ? 'font-semibold text-primary-700 dark:text-primary-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                            {option.text}
                                        </span>
                                    </div>
                                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 shrink-0">
                                        {voteCount}
                                    </span>
                                </button>

                                {/* Progress bar background */}
                                {totalVotes > 0 && (
                                    <div className="absolute left-0 top-0 h-full bg-primary-500/10 dark:bg-primary-400/10 rounded-lg pointer-events-none transition-all duration-500" style={{ width: `${percentage}%` }} />
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
                        className="text-xs font-medium text-primary-600 dark:text-primary-400 hover:underline"
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
            />
        </>
    );
};

export default PollMessage;
