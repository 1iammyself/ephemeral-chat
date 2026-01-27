import React, { useState, useEffect, useRef } from 'react';
import { X, Edit2, Check } from 'lucide-react';

const TopicEditor = ({ isOpen, onClose, currentTopic, onSave }) => {
    const [topic, setTopic] = useState(currentTopic || '');
    const inputRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            setTopic(currentTopic || '');
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen, currentTopic]);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(topic.trim());
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Edit2 className="w-5 h-5 text-primary-500" />
                        Set Room Topic
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Topic or Announcement
                        </label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="e.g., Team meeting at 3pm, Project discussion..."
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all text-gray-900 dark:text-white placeholder-gray-400"
                            maxLength={100}
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 text-right">
                            {topic.length}/100 characters
                        </p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="flex-1 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                            >
                                <Check className="w-4 h-4" />
                                Save Topic
                            </button>
                        </div>
                        {currentTopic && (
                            <button
                                type="button"
                                onClick={() => {
                                    onSave('');
                                    onClose();
                                }}
                                className="w-full px-4 py-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors font-medium border border-transparent hover:border-red-200 dark:hover:border-red-800/50"
                            >
                                Remove Topic
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TopicEditor;
