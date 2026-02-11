import React, { useState } from 'react';
import { X, Mail, Link as LinkIcon, Check, Copy } from 'lucide-react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { toast } from 'react-toastify';

// Simple icons for social platforms (Lucide doesn't have brand icons like WhatsApp/Telegram natively)
// We'll use SVGs or text for them.
const WhatsAppIcon = () => (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" /><path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0 .5-.5l1-1h4l1 1a.5.5 0 0 0 .5.5v1a.5.5 0 0 0 1 0V9a1.5 1.5 0 0 0-1.5-1.5h-4.998A1.5 1.5 0 0 0 9 9v1z" fill="none" stroke="none" /><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
);

const TelegramIcon = () => (
    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6"><path d="M21.198 2.433a2.242 2.242 0 0 0-1.022.215l-8.609 3.33c-2.068.8-4.133 1.598-5.724 2.21a405.15 405.15 0 0 1-2.863 1.092c-.42.161-.536.37-.536.603 0 .254.113.483.504.623.21.076 1.77.675 2.51 1.059 1.157.604 1.35 1.464.975 2.11l-.81 1.415c-.255.441.134.808.577.535l4.897-3.056c.642-.403 1.378-.49 2.068-.138 1.42.723 3.69 1.94 4.54 2.43.344.197.688.291 1.002.308.536.028 1.258-.225 1.487-1.472l2.67-14.496c.106-.575.056-1.162-.437-1.574-.352-.295-.815-.357-1.18-.243zM4.779 9.875c.189-.072 2.898-1.11 5.92-2.28 1.636-.632 3.684-1.42 5.09-1.968-.588 3.208-1.493 8.13-1.68 9.176l-.16.892-.72-.375c-.957-.504-2.618-1.37-3.535-1.838-.135-.07-.274-.131-.418-.184-1.1-.397-2.614 1.01-4.04 1.895-.494.307-.942.585-1.334.8-.024-.265.176-1.048.432-1.928l.898-2.586.417-1.284-.66-1.02a.495.495 0 0 1-.03-.04c-.052-.086-.963-1.614.97-1.17 1.728.397 3.52 3.96 3.65 4.1.189.206.51.218.706.015.195-.203.176-.54-.055-.724l-3.23-2.61c-.504-.407-1.066-.86-1.517-1.222l-5.719 2.21-.06.023.08-1.005z" /></svg>
);


const ShareSheet = ({ isOpen, onClose, shareData }) => {
    const [isCopied, setIsCopied] = useState(false);

    if (!isOpen) return null;

    const { url, text, title } = shareData;
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(text);

    const handleCopy = () => {
        setIsCopied(true);
        toast.success('Link copied to clipboard!');
        setTimeout(() => {
            setIsCopied(false);
            onClose(); // Optional: close after copy? Maybe keep open.
        }, 1000);
    };

    const shareOptions = [
        {
            name: 'WhatsApp',
            icon: <WhatsAppIcon />,
            color: 'bg-green-500 hover:bg-green-600',
            action: () => {
                window.open(`https://wa.me/?text=${encodedText}%20${encodedUrl}`, '_blank');
                onClose();
            }
        },
        {
            name: 'Telegram',
            icon: <TelegramIcon />,
            color: 'bg-blue-500 hover:bg-blue-600',
            action: () => {
                window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`, '_blank');
                onClose();
            }
        },
        {
            name: 'Email',
            icon: <Mail className="w-6 h-6" />,
            color: 'bg-gray-500 hover:bg-gray-600',
            action: () => {
                window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodedText}%0A%0A${encodedUrl}`, '_blank');
                onClose();
            }
        }
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center p-4 z-[60]">
            <div className="bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl p-6 w-full max-w-sm animate-in slide-in-from-bottom duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Share via
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-1 text-gray-400 hover:text-gray-500 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="grid grid-cols-4 gap-4 mb-6">
                    {shareOptions.map((option) => (
                        <button
                            key={option.name}
                            onClick={option.action}
                            className="flex flex-col items-center gap-2 group"
                        >
                            <div className={`w-12 h-12 flex items-center justify-center rounded-full text-white shadow-sm transition-transform group-hover:scale-105 ${option.color}`}>
                                {option.icon}
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">{option.name}</span>
                        </button>
                    ))}

                    <CopyToClipboard text={url} onCopy={handleCopy}>
                        <button className="flex flex-col items-center gap-2 group">
                            <div className={`w-12 h-12 flex items-center justify-center rounded-full text-white shadow-sm transition-transform group-hover:scale-105 ${isCopied ? 'bg-green-500' : 'bg-gray-700 dark:bg-gray-600'}`}>
                                {isCopied ? <Check className="w-6 h-6" /> : <Copy className="w-6 h-6" />}
                            </div>
                            <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                                {isCopied ? 'Copied' : 'Copy'}
                            </span>
                        </button>
                    </CopyToClipboard>
                </div>

                <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                    <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg flex items-center justify-between group cursor-pointer" onClick={() => {
                        // Select text on click logic defined in parent usually, effectively just show link
                    }}>
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600 dark:text-blue-400">
                                <LinkIcon className="w-4 h-4" />
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">Invite Link</span>
                                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{url}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShareSheet;
