import React, { useState } from 'react';
import { X, Plus, Trash2, Send, HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * PollModal – creates a poll with optional follow-up sub-options per answer.
 *
 * Data shape sent to onSend:
 *   {
 *     question: string,
 *     options: [
 *       { text: string, followUps: string[] },  // followUps may be empty []
 *       ...
 *     ],
 *     allowMultiple: boolean,
 *     allowCustomAnswers: boolean
 *   }
 */
const PollModal = ({ isOpen, onClose, onSend, roomVibe }) => {
    const [question, setQuestion] = useState('');
    // Each option: { text: string, followUps: string[], showFollowUp: boolean }
    const [options, setOptions] = useState([
        { text: '', followUps: [], showFollowUp: false },
        { text: '', followUps: [], showFollowUp: false },
    ]);
    const [allowMultiple, setAllowMultiple] = useState(false);
    const [allowCustomAnswers, setAllowCustomAnswers] = useState(false);

    if (!isOpen) return null;

    const vibeAccent = roomVibe === 'party' ? 'indigo' :
        roomVibe === 'chill' ? 'teal' :
            roomVibe === 'focus' ? 'orange' : 'primary';

    // Explicit hex values to avoid Tailwind JIT purging dynamic class names (especially focus/orange)
    const vibeColor = {
        party: '#6366f1',
        chill: '#14b8a6',
        focus: '#f97316',
        default: '#3b82f6',
    }[roomVibe] || '#3b82f6';

    const vibeColorHover = {
        party: '#4f46e5',
        chill: '#0d9488',
        focus: '#ea580c',
        default: '#2563eb',
    }[roomVibe] || '#2563eb';

    // ── Option helpers ──────────────────────────────────────────────
    const addOption = () => {
        if (options.length < 5) {
            setOptions([...options, { text: '', followUps: [], showFollowUp: false }]);
        }
    };

    const removeOption = (idx) => {
        if (options.length > 2) setOptions(options.filter((_, i) => i !== idx));
    };

    const updateOptionText = (idx, text) => {
        const next = [...options];
        next[idx] = { ...next[idx], text };
        setOptions(next);
    };

    const toggleFollowUp = (idx) => {
        const next = [...options];
        next[idx] = { ...next[idx], showFollowUp: !next[idx].showFollowUp };
        // Auto-add one empty follow-up field when expanding for the first time
        if (!next[idx].showFollowUp && next[idx].followUps.length === 0) {
            next[idx].followUps = [''];
        }
        setOptions(next);
    };

    // ── Follow-up helpers ───────────────────────────────────────────
    const addFollowUp = (optIdx) => {
        const next = [...options];
        if (next[optIdx].followUps.length < 4) {
            next[optIdx] = { ...next[optIdx], followUps: [...next[optIdx].followUps, ''] };
        }
        setOptions(next);
    };

    const removeFollowUp = (optIdx, fuIdx) => {
        const next = [...options];
        const fus = next[optIdx].followUps.filter((_, i) => i !== fuIdx);
        next[optIdx] = { ...next[optIdx], followUps: fus };
        setOptions(next);
    };

    const updateFollowUp = (optIdx, fuIdx, text) => {
        const next = [...options];
        const fus = [...next[optIdx].followUps];
        fus[fuIdx] = text;
        next[optIdx] = { ...next[optIdx], followUps: fus };
        setOptions(next);
    };

    // ── Submit ──────────────────────────────────────────────────────
    const handleSubmit = (e) => {
        e.preventDefault();
        const validOptions = options.filter(o => o.text.trim());
        if (!question.trim() || validOptions.length < 2) return;

        onSend({
            question: question.trim(),
            options: validOptions.map(o => ({
                text: o.text.trim(),
                followUps: o.followUps.filter(fu => fu.trim()).map(fu => fu.trim()),
            })),
            allowMultiple,
            allowCustomAnswers,
        });

        // Reset
        onClose();
        setQuestion('');
        setOptions([
            { text: '', followUps: [], showFollowUp: false },
            { text: '', followUps: [], showFollowUp: false },
        ]);
        setAllowMultiple(false);
        setAllowCustomAnswers(false);
    };

    const canSubmit = question.trim() && options.filter(o => o.text.trim()).length >= 2;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
            <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[92vw] max-w-[360px] sm:max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-${vibeAccent}-500/20 flex flex-col max-h-[90vh]`}>

                {/* Header */}
                <div className={`flex items-center justify-between px-3 py-2 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-${vibeAccent}-50/30 dark:bg-${vibeAccent}-900/10 shrink-0`}>
                    <h2 className="text-base sm:text-xl font-bold text-gray-900 dark:text-white flex items-center">
                        <HelpCircle className={`w-4 h-4 sm:w-5 sm:h-5 mr-1.5 text-${vibeAccent}-500`} />
                        Create Poll
                    </h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 transition-colors">
                        <X className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-3 sm:p-4 space-y-3 overflow-y-auto min-h-0">

                    {/* Question */}
                    <div>
                        <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Question</label>
                        <input
                            type="text"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Ask a question..."
                            className={`input-field bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 focus:ring-${vibeAccent}-500/20 focus:border-${vibeAccent}-500 text-sm`}
                            maxLength={200}
                            required
                        />
                    </div>

                    {/* Options */}
                    <div className="space-y-2">
                        <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300">
                            Options (Min 2 · Max 5)
                        </label>

                        {options.map((option, idx) => (
                            <div key={idx} className={`rounded-xl border ${option.showFollowUp ? `border-${vibeAccent}-300 dark:border-${vibeAccent}-700` : 'border-gray-200 dark:border-gray-700'} overflow-hidden`}>

                                {/* Option row */}
                                <div className="flex items-center gap-2 p-2">
                                    <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white bg-${vibeAccent}-500`}>
                                        {idx + 1}
                                    </span>
                                    <input
                                        type="text"
                                        value={option.text}
                                        onChange={(e) => updateOptionText(idx, e.target.value)}
                                        placeholder={`Option ${idx + 1}`}
                                        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none"
                                        maxLength={100}
                                        required={idx < 2}
                                    />
                                    {/* Follow-up toggle */}
                                    <button
                                        type="button"
                                        onClick={() => toggleFollowUp(idx)}
                                        title="Add follow-up options for this answer"
                                        className={`shrink-0 p-1 rounded-lg text-[9px] font-bold border transition-colors ${option.showFollowUp ? `bg-${vibeAccent}-100 dark:bg-${vibeAccent}-900/30 border-${vibeAccent}-300 dark:border-${vibeAccent}-700 text-${vibeAccent}-600 dark:text-${vibeAccent}-400` : 'bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`}
                                    >
                                        {option.showFollowUp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                                    </button>
                                    {/* Remove option */}
                                    {options.length > 2 && (
                                        <button type="button" onClick={() => removeOption(idx)} className="shrink-0 p-1 text-red-400 hover:text-red-600 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Follow-up sub-options */}
                                {option.showFollowUp && (
                                    <div className={`bg-${vibeAccent}-50/50 dark:bg-${vibeAccent}-900/10 border-t border-${vibeAccent}-200 dark:border-${vibeAccent}-800 p-2 space-y-1.5`}>
                                        <p className={`text-[9px] font-black uppercase tracking-wider text-${vibeAccent}-600 dark:text-${vibeAccent}-400 mb-1`}>
                                            Follow-up options if someone picks "{option.text || `Option ${idx + 1}`}"
                                        </p>
                                        {option.followUps.map((fu, fuIdx) => (
                                            <div key={fuIdx} className="flex items-center gap-1.5">
                                                <span className="shrink-0 w-4 h-4 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-[8px] font-bold text-gray-500">
                                                    {String.fromCharCode(65 + fuIdx)}
                                                </span>
                                                <input
                                                    type="text"
                                                    value={fu}
                                                    onChange={(e) => updateFollowUp(idx, fuIdx, e.target.value)}
                                                    placeholder={`Follow-up ${fuIdx + 1}`}
                                                    className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-1 text-xs text-gray-900 dark:text-white outline-none focus:border-orange-400 transition-colors"
                                                    maxLength={80}
                                                />
                                                <button type="button" onClick={() => removeFollowUp(idx, fuIdx)} className="shrink-0 p-0.5 text-red-400 hover:text-red-600 transition-colors">
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </div>
                                        ))}
                                        {option.followUps.length < 4 && (
                                            <button
                                                type="button"
                                                onClick={() => addFollowUp(idx)}
                                                className={`flex items-center gap-1 text-[10px] font-bold text-${vibeAccent}-600 dark:text-${vibeAccent}-400 hover:underline mt-0.5`}
                                            >
                                                <Plus className="w-3 h-3" /> Add follow-up option
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {options.length < 5 && (
                            <button
                                type="button"
                                onClick={addOption}
                                className={`flex items-center text-${vibeAccent}-600 dark:text-${vibeAccent}-400 text-xs font-bold hover:underline p-1 active:scale-95 transition-transform`}
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                Add Option
                            </button>
                        )}
                    </div>

                    {/* Toggles */}
                    <div className="space-y-1">
                        {[
                            { label: 'Allow multiple answers', value: allowMultiple, toggle: () => setAllowMultiple(!allowMultiple) },
                            { label: 'Allow "Other" answer', value: allowCustomAnswers, toggle: () => setAllowCustomAnswers(!allowCustomAnswers) },
                        ].map(({ label, value, toggle }) => (
                            <div key={label} className="flex items-center justify-between py-1.5">
                                <label className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300">{label}</label>
                                <button
                                    type="button"
                                    onClick={toggle}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? `bg-${vibeAccent}-500` : 'bg-gray-200 dark:bg-gray-700'}`}
                                >
                                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${value ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={!canSubmit}
                        style={canSubmit ? { backgroundColor: vibeColor } : undefined}
                        onMouseOver={e => { if (canSubmit) e.currentTarget.style.backgroundColor = vibeColorHover; }}
                        onMouseOut={e => { if (canSubmit) e.currentTarget.style.backgroundColor = vibeColor; }}
                        className={`w-full py-2.5 sm:py-3 rounded-xl flex items-center justify-center gap-2 font-bold shadow-sm active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors`}
                    >
                        <Send className="w-4 h-4" />
                        <span>Send Poll</span>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PollModal;
