import React, { useState, useMemo } from 'react';
import { X, MessageSquare } from 'lucide-react';

/**
 * ThreadView — Inline expandable panel showing all replies to a message.
 * Displays as an accordion below the parent message.
 */

const ThreadView = ({ parentMessage, allMessages, onReply, onClose }) => {
    const threadMessages = useMemo(() => {
        if (!parentMessage?.id) return [];
        return allMessages.filter(m => m.replyTo?.id === parentMessage.id)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }, [parentMessage?.id, allMessages]);

    const formatTime = (ts) => {
        const date = new Date(ts);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    if (threadMessages.length === 0) return null;

    return (
        <div className="mt-2 ml-4 border-l-2 border-purple-300 dark:border-purple-700 pl-3 space-y-2 animate-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-1.5 text-[10px] font-bold text-purple-500 dark:text-purple-400 uppercase tracking-wider">
                    <MessageSquare className="w-3 h-3" />
                    <span>{threadMessages.length} {threadMessages.length === 1 ? 'reply' : 'replies'}</span>
                </div>
                <button onClick={onClose} className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                    <X className="w-3 h-3 text-gray-400" />
                </button>
            </div>

            {threadMessages.map((msg) => (
                <div key={msg.id} className="flex flex-col space-y-0.5">
                    <div className="flex items-center space-x-1.5 text-[10px] text-gray-400 dark:text-gray-500">
                        <span className={`font-bold ${msg.isAnonymous ? 'text-purple-500' : 'text-primary-500 dark:text-primary-400'}`}>
                            {msg.sender.nickname}
                        </span>
                        <span>•</span>
                        <span>{formatTime(msg.timestamp)}</span>
                    </div>
                    <div className="text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-lg px-2.5 py-1.5">
                        {msg.messageType === 'image' ? '📷 Photo' :
                            msg.messageType === 'audio' ? '🎤 Voice Note' :
                                msg.content}
                    </div>
                </div>
            ))}

            <button
                onClick={() => onReply(parentMessage)}
                className="text-[10px] font-bold text-purple-500 dark:text-purple-400 hover:text-purple-600 dark:hover:text-purple-300 transition-colors py-1"
            >
                + Reply to thread
            </button>
        </div>
    );
};

export default ThreadView;
