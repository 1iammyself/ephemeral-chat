import React, { useMemo, useState } from 'react';
import { CheckCircle2, Circle, Users, PenLine, Send as SendIcon, ChevronDown, ChevronUp, Plus, MessageSquarePlus } from 'lucide-react';
import PollDetailsModal from './PollDetailsModal';
import { getVibeById } from '../utils/vibes';
import socketManager from '../socket';

// ─── Inline Sub-Poll Component ──────────────────────────────────
const SubPollInline = ({ subPoll, parentOptionId, messageId, currentUserId, accentColor, hasVotedParent }) => {
    const [expanded, setExpanded] = useState(false);
    const subTotalVoters = useMemo(() => {
        const s = new Set();
        subPoll.options.forEach(o => o.votes?.forEach(v => s.add(v.userId)));
        return s.size;
    }, [subPoll.options]);

    const handleSubVote = (subOptionId) => {
        if (!hasVotedParent) return;
        socketManager.emit('vote-sub-poll', { messageId, optionId: parentOptionId, subOptionId });
    };

    return (
        <div className="mt-1.5 ml-5 pl-2.5 border-l-2 border-gray-200 dark:border-gray-600">
            <button onClick={() => setExpanded(!expanded)} className="flex items-center text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 font-medium hover:text-gray-700 dark:hover:text-gray-300">
                {expanded ? <ChevronUp className="w-3 h-3 mr-0.5" /> : <ChevronDown className="w-3 h-3 mr-0.5" />}
                {subPoll.question} ({subTotalVoters} vote{subTotalVoters !== 1 ? 's' : ''})
            </button>
            {expanded && (
                <div className="mt-1 space-y-1">
                    {!hasVotedParent && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-500 italic px-2 py-0.5">
                            Vote for this option first to unlock follow-up choices
                        </p>
                    )}
                    {subPoll.options.map(so => {
                        const voted = so.votes?.some(v => v.userId === currentUserId);
                        return (
                            <button key={so.id} onClick={() => handleSubVote(so.id)}
                                disabled={!hasVotedParent}
                                className={`w-full text-left px-2 py-1 rounded text-[11px] sm:text-xs border transition-colors ${!hasVotedParent
                                    ? 'border-gray-100 dark:border-gray-700 text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50'
                                    : voted
                                        ? `border-${accentColor}-400 bg-${accentColor}-50 dark:bg-${accentColor}-900/20 font-semibold text-${accentColor}-700 dark:text-${accentColor}-300`
                                        : 'border-gray-100 dark:border-gray-700 text-gray-700 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/40'
                                    }`}
                            >
                                {voted ? <CheckCircle2 className="w-3 h-3 inline mr-1" /> : <Circle className="w-3 h-3 inline mr-1" />}
                                {so.text}
                                <span className="float-right text-gray-400 dark:text-gray-500">{so.votes?.length || 0}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── Sub-Poll Creation Mini-Form ────────────────────────────────
const SubPollCreator = ({ messageId, optionId, accentColor, vibeBtnColor, onDone }) => {
    const [question, setQuestion] = useState('');
    const [opts, setOpts] = useState(['', '']);

    const handleAdd = () => { if (opts.length < 5) setOpts([...opts, '']); };
    const handleSubmit = () => {
        const filtered = opts.filter(o => o.trim());
        if (!question.trim() || filtered.length < 2) return;
        socketManager.emit('create-sub-poll', {
            messageId,
            optionId,
            subPollData: { question: question.trim(), options: filtered }
        });
        onDone();
    };

    return (
        <div className="mt-1.5 ml-5 pl-2.5 border-l-2 border-gray-200 dark:border-gray-600 space-y-1">
            <input type="text" value={question} onChange={e => setQuestion(e.target.value)}
                placeholder="Follow-up question..."
                className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white outline-none"
                maxLength={200} autoFocus />
            {opts.map((o, i) => (
                <input key={i} type="text" value={o} onChange={e => { const n = [...opts]; n[i] = e.target.value; setOpts(n); }}
                    placeholder={`Option ${i + 1}`}
                    className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white outline-none"
                    maxLength={100} />
            ))}
            <div className="flex items-center space-x-2">
                {opts.length < 5 && (
                    <button onClick={handleAdd} className={`text-[10px] text-${accentColor}-500 flex items-center`}>
                        <Plus className="w-3 h-3 mr-0.5" /> Add
                    </button>
                )}
                <button onClick={handleSubmit}
                    disabled={!question.trim() || opts.filter(o => o.trim()).length < 2}
                    style={vibeBtnColor ? { backgroundColor: vibeBtnColor } : undefined}
                    className={`text-[10px] px-2 py-0.5 rounded text-white disabled:opacity-40`}>
                    Create
                </button>
                <button onClick={onDone} className="text-[10px] text-gray-400 hover:text-gray-600">Cancel</button>
            </div>
        </div>
    );
};

// ─── Main PollMessage Component ─────────────────────────────────

const PollMessage = ({ message, currentUser, onVote, roomVibe }) => {
    const { pollData } = message;
    if (!pollData) return null; // Safety guard if pollData is missing
    const { question, options, allowMultiple, allowCustomAnswers } = pollData;
    const currentUserId = currentUser?.id || currentUser?.socketId;
    const vibe = getVibeById(roomVibe);

    // Only the poll sender or a Tier1 admin/host can add follow-up sub-polls
    const isSender = message.sender?.socketId === currentUserId || message.sender?.id === currentUserId ||
        (currentUser?.nickname && message.sender?.nickname === currentUser.nickname);
    const isAdmin = currentUser?.role === 'host' || currentUser?.role === 'admin' || currentUser?.isAdmin;
    const canAddFollowUp = isSender || isAdmin;

    const [showDetails, setShowDetails] = useState(false);
    const [showCustomInput, setShowCustomInput] = useState(false);
    const [customText, setCustomText] = useState('');
    const [creatingSubPollFor, setCreatingSubPollFor] = useState(null); // optionId or null

    const totalVotes = useMemo(() => {
        const uniqueVoters = new Set();
        options.forEach(opt => opt.votes?.forEach(v => uniqueVoters.add(v.userId)));
        return uniqueVoters.size;
    }, [options]);

    const hasUserVoted = (votes) => votes?.some(v => v.userId === currentUserId);

    const handleCustomAnswer = () => {
        const trimmed = customText.trim();
        if (!trimmed) return;
        socketManager.emit('poll-custom-answer', {
            messageId: message.id,
            customText: trimmed
        });
        setCustomText('');
        setShowCustomInput(false);
    };

    // Dynamic classes based on vibe
    const accentColor = vibe.accent || 'primary';

    // Hex values from vibe config
    const vibeBtnColor = vibe.colors?.primary || '#3b82f6';
    const vibeBtnColorHover = vibe.colors?.primary + 'cc'; // Slightly transparent for hover

    const headerClass = vibe.accentClass;
    const selectedOptionClass = `border-${accentColor}-500 bg-${accentColor}-50 dark:bg-${accentColor}-900/20`;
    const checkIconClass = `text-${accentColor}-500`;
    const selectedTextClass = `text-${accentColor}-700 dark:text-${accentColor}-300`;
    const progressBarClass = `bg-${accentColor}-500/10 dark:bg-${accentColor}-400/10`;
    const footerLinkClass = `text-${accentColor}-600 dark:text-${accentColor}-400`;
    const cardBorderClass = `border-black/10 dark:border-white/10`;

    return (
        <>
            <div className={`w-full max-w-[260px] sm:max-w-[320px] bg-white dark:bg-gray-800 rounded-xl overflow-hidden shadow-sm border-x border-b ${cardBorderClass} border-t-4 border-t-${accentColor}-500`}>
                <div className={`p-2.5 sm:p-4 ${headerClass}`}>
                    <h3 className="text-white font-bold leading-tight text-sm sm:text-base">{question}</h3>
                    <p className="text-white/80 text-[10px] sm:text-xs mt-1 flex items-center">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {allowMultiple ? 'Select one or more' : 'Select one'}
                        {allowCustomAnswers && ' · Custom answers allowed'}
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
                                            {option.isCustom && (
                                                <span className="ml-1.5 text-[10px] text-gray-500 dark:text-gray-500 italic">
                                                    (by {option.addedByNickname || 'someone'})
                                                </span>
                                            )}
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

                                {/* Sub-poll: display if exists */}
                                {option.subPoll && (
                                    <SubPollInline
                                        subPoll={option.subPoll}
                                        parentOptionId={option.id}
                                        messageId={message.id}
                                        currentUserId={currentUserId}
                                        accentColor={accentColor}
                                        hasVotedParent={isVoted}
                                    />
                                )}

                                {/* Sub-poll: create button / form */}
                                {!option.subPoll && creatingSubPollFor === option.id && (
                                    <SubPollCreator
                                        messageId={message.id}
                                        optionId={option.id}
                                        accentColor={accentColor}
                                        vibeBtnColor={vibeBtnColor}
                                        onDone={() => setCreatingSubPollFor(null)}
                                    />
                                )}
                                {!option.subPoll && creatingSubPollFor !== option.id && canAddFollowUp && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setCreatingSubPollFor(option.id); }}
                                        className="ml-5 mt-0.5 flex items-center text-[10px] text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors opacity-0 group-hover:opacity-100"
                                    >
                                        <MessageSquarePlus className="w-3 h-3 mr-0.5" />
                                        Add follow-up
                                    </button>
                                )}
                            </div>
                        );
                    })}

                    {/* Custom "Other" answer input */}
                    {allowCustomAnswers && (
                        <div className="mt-1">
                            {showCustomInput ? (
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="text"
                                        value={customText}
                                        onChange={(e) => setCustomText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleCustomAnswer()}
                                        placeholder="Type your answer..."
                                        className={`flex-1 text-xs sm:text-sm text-gray-900 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white focus:ring-1 focus:ring-${accentColor}-500 focus:border-${accentColor}-500 outline-none`}
                                        maxLength={100}
                                        autoFocus
                                    />
                                    <button
                                        onClick={handleCustomAnswer}
                                        disabled={!customText.trim()}
                                        style={customText.trim() ? { backgroundColor: vibeBtnColor } : undefined}
                                        className={`p-1.5 rounded-lg text-white disabled:opacity-40 disabled:bg-gray-400 transition-colors shrink-0`}
                                    >
                                        <SendIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setShowCustomInput(true)}
                                    className={`flex items-center text-xs sm:text-sm text-${accentColor}-600 dark:text-${accentColor}-400 font-medium hover:underline p-1`}
                                >
                                    <PenLine className="w-3.5 h-3.5 mr-1" />
                                    Add your own answer
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-black/5 dark:border-white/5 flex items-center justify-between">
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
