import React, { useState } from 'react';
import { X, Plus, Trash2, Send, HelpCircle } from 'lucide-react';

const PollModal = ({ isOpen, onClose, onSend }) => {
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

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center">
                        <HelpCircle className="w-6 h-6 mr-2 text-primary-500" />
                        Create Poll
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Question
                        </label>
                        <input
                            type="text"
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Ask a question..."
                            className="input-field bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                            maxLength={200}
                            required
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Options (Min 2, Max 5)
                        </label>
                        {options.map((option, index) => (
                            <div key={index} className="flex items-center space-x-2">
                                <input
                                    type="text"
                                    value={option}
                                    onChange={(e) => handleOptionChange(index, e.target.value)}
                                    placeholder={`Option ${index + 1}`}
                                    className="input-field bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600"
                                    maxLength={100}
                                    required={index < 2}
                                />
                                {options.length > 2 && (
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveOption(index)}
                                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        ))}
                        {options.length < 5 && (
                            <button
                                type="button"
                                onClick={handleAddOption}
                                className="flex items-center text-primary-600 dark:text-primary-400 text-sm font-medium hover:underline p-1"
                            >
                                <Plus className="w-4 h-4 mr-1" />
                                Add Option
                            </button>
                        )}
                    </div>

                    <div className="flex items-center justify-between py-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Allow multiple answers
                        </label>
                        <button
                            type="button"
                            onClick={() => setAllowMultiple(!allowMultiple)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${allowMultiple ? 'bg-primary-600' : 'bg-gray-200 dark:bg-gray-700'
                                }`}
                        >
                            <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${allowMultiple ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                            />
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={!question.trim() || options.filter(opt => opt.trim()).length < 2}
                        className="w-full btn-primary py-3 flex items-center justify-center space-x-2"
                    >
                        <Send className="w-5 h-5" />
                        <span>Send Poll</span>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default PollModal;
