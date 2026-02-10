import React from 'react';
import { X, Info, User, LogOut, Zap, Clock, Hash, Palette, Activity } from 'lucide-react';

const ActivityLog = ({ isOpen, onClose, logs }) => {
    if (!isOpen) return null;

    const getLogIcon = (type) => {
        switch (type) {
            case 'join': return <User className="w-4 h-4 text-green-500" />;
            case 'leave': return <LogOut className="w-4 h-4 text-red-500" />;
            case 'vibe': return <Palette className="w-4 h-4 text-blue-500" />;
            case 'topic': return <Hash className="w-4 h-4 text-blue-500" />;
            case 'timer': return <Clock className="w-4 h-4 text-orange-500" />;
            case 'pulse': return <Zap className="w-4 h-4 text-yellow-500" />;
            case 'system': return <Info className="w-4 h-4 text-primary-500" />;
            default: return <Info className="w-4 h-4 text-gray-400" />;
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center pointer-events-none">
            <div
                className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto transition-opacity animate-in fade-in"
                onClick={onClose}
            />
            <div className="relative w-full max-w-sm mx-4 mb-4 sm:mb-0 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden pointer-events-auto animate-in slide-in-from-bottom-5 sm:slide-in-from-right-5 duration-300">
                <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center text-primary-600">
                            <Activity className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-none mb-1">Activity Log</h2>
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Recent Room Events</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors text-gray-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="max-h-[50vh] sm:max-h-[400px] overflow-y-auto p-4 space-y-2 scrollbar-thin">
                    {logs.length === 0 ? (
                        <div className="py-10 text-center space-y-3">
                            <div className="w-12 h-12 bg-gray-50 dark:bg-gray-900 rounded-2xl flex items-center justify-center mx-auto">
                                <Info className="w-6 h-6 text-gray-200 dark:text-gray-700" />
                            </div>
                            <p className="text-sm text-gray-400 font-medium">No activity recorded yet</p>
                        </div>
                    ) : (
                        logs.map((log) => (
                            <div key={log.id} className="flex items-start space-x-3 p-3 rounded-2xl bg-gray-50/50 dark:bg-gray-900/50 border border-gray-100/50 dark:border-gray-800/50 transition-colors hover:bg-white dark:hover:bg-gray-800">
                                <div className="mt-0.5 p-1.5 bg-white dark:bg-gray-800 rounded-lg shadow-sm">{getLogIcon(log.type)}</div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm text-gray-700 dark:text-gray-200 leading-tight font-medium">{log.content}</p>
                                    <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-1 font-bold">
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-900/50 text-center border-t border-gray-100 dark:border-gray-700">
                    <p className="text-[9px] text-gray-400 dark:text-gray-500 uppercase font-black tracking-[0.3em]">Ephemeral & Secure</p>
                </div>
            </div>
        </div>
    );
};

export default ActivityLog;
