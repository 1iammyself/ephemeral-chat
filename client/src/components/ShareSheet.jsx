import React, { useState } from 'react';
import { X, Mail, Link as LinkIcon, Check, Copy } from 'lucide-react';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { toast } from 'react-toastify';

// Simple icons for social platforms (Lucide doesn't have brand icons like WhatsApp/Telegram natively)
// We'll use SVGs or text for them.
const WhatsAppIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M12.031 2c-5.523 0-10 4.477-10 10 0 1.758.455 3.41 1.25 4.854L2 22l5.304-1.391c1.396.758 2.984 1.187 4.673 1.187 5.523 0 10-4.477 10-10A10.003 10.003 0 0 0 12.031 2zm0 1.5c4.694 0 8.5 3.806 8.5 8.5s-3.806 8.5-8.5 8.5c-1.503 0-2.91-.393-4.133-1.082l-.296-.167-3.111.815.829-3.037-.184-.294A8.454 8.454 0 0 1 3.531 12c0-4.694 3.806-8.5 8.5-8.5zm4.723 5.488c-.255-.127-1.5-.74-1.733-.824s-.404-.127-.574.127-.659.824-.808 1.002-.298.19-.553.063c-.255-.127-1.077-.396-2.052-1.266-.758-.675-1.27-1.51-1.419-1.764s-.016-.393.11-.519c.114-.113.255-.296.383-.443s.17-.254.255-.422c.085-.17.042-.317-.021-.443s-.574-1.383-.787-1.89c-.207-.492-.416-.425-.574-.433l-.489-.007c-.17 0-.447.064-.68.317s-.894.866-.894 2.112c0 1.246.904 2.45 1.031 2.619s1.777 2.712 4.305 3.803c.601.259 1.07.414 1.436.53.604.191 1.154.164 1.588.1s1.3-.532 1.481-1.044.181-.952.127-1.044-.191-.128-.446-.255z" />
    </svg>
);

const TelegramIcon = () => (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M20.665 3.717l-17.73 6.837c-1.21.486-1.203 1.161-.222 1.462l4.552 1.42 10.532-6.645c.498-.303.953-.14.579.192l-8.533 7.701v3.13c.307 0 .443-.14.615-.307l1.475-1.432 3.07 2.268c.565.312.973.152 1.115-.522l2.015-9.492c.206-.822-.315-1.192-1.258-.762z" />
    </svg>
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
