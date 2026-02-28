import React, { useState } from 'react';
import { X, Plus, Trash2, Send, HelpCircle } from 'lucide-react';

const PollModal = ({ isOpen, onClose, onSend, roomVibe }) => {
    const [question, setQuestion] = useState('');
    const [options, setOptions] = useState(['', '']);
    const [allowMultiple, setAllowMultiple] = useState(false);

    if (!isOpen) return null;

    const handleAddOption = () => {
        if (options.length < 5) {
            setOptions([...options, '']);
        }
    };

    const handleRemoveOption = (index) => {
        if (options.length > 2) {
            const newOptions = options.filter((_, i) => i !== index);
            setOptions(newOptions);
        }
    };

    const handleOptionChange = (index, value) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (question.trim() && options.filter(opt => opt.trim()).length >= 2) {
            onSend({
                question: question.trim(),
                options: options.filter(opt => opt.trim()),
                allowMultiple
            });
            onClose();
            // Reset form
            setQuestion('');
            setOptions(['', '']);
            setAllowMultiple(false);
        }
    };

    const vibeAccent = roomVibe === 'party' ? 'indigo' :
        roomVibe === 'chill' ? 'teal' :
            roomVibe === 'focus' ? 'orange' : 'primary';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm z-[100]">
            <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[90vw] max-w-[340px] sm:max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-${vibeAccent}-500/20 flex flex-col max-h-[90vh]`}>
                <div className={`flex items-center justify-between px-3 py-2 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-${vibeAccent}-50/30 dark:bg-${vibeAccent}-900/10 shrink-0`}>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center">
                        <HelpCircle className={`w-5 h-5 sm:w-6 sm:h-6 mr-1.5 sm:mr-2 text-${vibeAccent}-500`} />
                        Create Poll
                    </h2>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto min-h-0">
                    <div>
                        <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">
                            Question
                        </label>
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

                    <div className="space-y-2">
                        <label className="block text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300">
                            Options (Min 2, Max 5)
                        </label>
                        {options.map((option, index) => (
                            <div key={index} className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => handleOptionChange(index, e.target.value)}
                                    placeholder={`Option ${index + 1}`}
                                    className={`input-field bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 focus:ring-${vibeAccent}-500/20 focus:border-${vibeAccent}-500 text-sm py-2 sm:py-2.5`}
                                    maxLength={100}
                                    required={index < 2}
                                />
                                {options.length > 2 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveOption(index)}
                                        className="p-1.5 sm:p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg shrink-0 transition-colors"
                                    >
                                        <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {options.length < 5 && (
                            <button
                                type="button"
                                onClick={handleAddOption}
                                className={`flex items-center text-${vibeAccent}-600 dark:text-${vibeAccent}-400 text-xs sm:text-sm font-bold hover:underline p-1 active:scale-95 transition-transform`}
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                Add Option
                            </button>
                        )}
                    </div>

                    <div className="flex items-center justify-between py-1 sm:py-2">
                        <label className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300">
                            Allow multiple answers
                        </label>
                        <button
                            type="button"
                            onClick={() => setAllowMultiple(!allowMultiple)}
                            className={`relative inline-flex h-5 sm:h-6 w-9 sm:w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-${vibeAccent}-500 focus:ring-offset-2 ${allowMultiple ? `bg-${vibeAccent}-600` : 'bg-gray-200 dark:bg-gray-700'
                                }`}
                        >
                            <span
                                className={`inline-block h-3.5 sm:h-4 w-3.5 sm:w-4 transform rounded-full bg-white transition-transform ${allowMultiple ? 'translate-x-5 sm:translate-x-6' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={!question.trim() || options.filter(opt => opt.trim()).length < 2}
                        className={`w-full btn-${vibeAccent} py-2.5 sm:py-3 rounded-xl flex items-center justify-center space-x-2 font-bold shadow-sm active:scale-95 disabled:opacity-50`}
                    >
                        <Send className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>Send Poll</span>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PollModal;
