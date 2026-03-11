import React, { useState } from 'react';
import { X, Clock, Play, RotateCcw } from 'lucide-react';

const TimerModal = ({ isOpen, onClose, onStart }) => {
    const [minutes, setMinutes] = useState(5);
    const [seconds, setSeconds] = useState(0);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        const durationSeconds = (parseInt(minutes) || 0) * 60 + (parseInt(seconds) || 0);
        if (durationSeconds > 0) {
            onStart(durationSeconds);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200 border border-gray-300 dark:border-gray-700">
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Clock className="w-5 h-5 text-primary-500" />
                        Start Countdown
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="flex items-center justify-center gap-4 mb-8">
                        <div className="flex flex-col items-center">
                            <label className="text-xs text-gray-500 uppercase font-semibold mb-1">Minutes</label>
                            <input
                                type="number"
                                min="0"
                                max="120"
                                value={minutes}
                                onChange={(e) => setMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                                className="w-20 text-center text-3xl font-bold bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:border-primary-500 focus:ring-0 transition-colors p-2"
                            />
                        </div>
                        <span className="text-2xl font-bold text-gray-400 mt-4">:</span>
                        <div className="flex flex-col items-center">
                            <label className="text-xs text-gray-500 uppercase font-semibold mb-1">Seconds</label>
                            <input
                                type="number"
                                min="0"
                                max="59"
                                value={seconds}
                                onChange={(e) => setSeconds(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                                className="w-20 text-center text-3xl font-bold bg-gray-50 dark:bg-gray-700 border-2 border-gray-200 dark:border-gray-600 rounded-xl focus:border-primary-500 focus:ring-0 transition-colors p-2"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-xl transition-colors font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary-500/30"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            Start Timer
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default TimerModal;
