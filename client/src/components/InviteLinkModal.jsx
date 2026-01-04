import React, { useState, useRef, useEffect } from 'react';
import { generateInviteLink } from '../utils/api';
import { CopyToClipboard } from 'react-copy-to-clipboard';
import { toast } from 'react-toastify';
import { X, Loader2, Check, AlertCircle } from 'lucide-react';

const InviteLinkModal = ({ isOpen, onClose, roomCode }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [expiry, setExpiry] = useState('24'); // Default 24 hours
  const [isPermanent, setIsPermanent] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [error, setError] = useState(null);
  const linkInputRef = useRef(null);

  useEffect(() => {
    // Reset state when modal is opened/closed
    if (!isOpen) {
      setInviteLink('');
      setExpiry('24');
      setIsPermanent(false);
      setIsCopied(false);
    }
  }, [isOpen]);

  const handleGenerateLink = async () => {
    if (!roomCode) return;
    
    setIsGenerating(true);
    setError(null);
    
    try {
      const expiryHours = isPermanent ? undefined : parseInt(expiry, 10);
      
      if (!isPermanent && (isNaN(expiryHours) || expiryHours < 1)) {
        throw new Error('Please enter a valid expiry time');
      }
      
      const result = await generateInviteLink(roomCode, {
        isPermanent,
        expiryHours
      });
      
      if (result.success) {
        let url = result.url;
        const hash = window.location.hash;
        if (hash) {
            url += hash;
        }
        setInviteLink(url);
        toast.success('Invite link generated!');
      } else {
        throw new Error(result.error || 'Failed to generate invite link');
      }
    } catch (error) {
      console.error('Error generating invite link:', error);
      setError(error.message || 'Failed to generate invite link. Please try again.');
      toast.error(error.message || 'Failed to generate invite link');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    setIsCopied(true);
    toast.success('Link copied to clipboard!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold mb-4 dark:text-white">Generate Invite Link</h2>
        
        {!inviteLink ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="flex items-center space-x-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                <input
                  type="radio"
                  className="form-radio text-blue-500"
                  checked={!isPermanent}
                  onChange={() => setIsPermanent(false)}
                />
                <span className="font-medium dark:text-white">Temporary Link</span>
              </label>
              
              {!isPermanent && (
                <div className="ml-6 bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Expires after:
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min="1"
                      value={expiry}
                      onChange={(e) => setExpiry(e.target.value)}
                      className="w-20 p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                      disabled={isPermanent}
                    />
                    <span className="text-sm text-gray-600 dark:text-gray-400">hours</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    The link will expire after the specified time
                  </p>
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <label className="flex items-start space-x-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                <input
                  type="radio"
                  className="form-radio text-blue-500 mt-1"
                  checked={isPermanent}
                  onChange={() => setIsPermanent(true)}
                />
                <div>
                  <div className="font-medium dark:text-white">Permanent Link</div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    The link will never expire (use with caution)
                  </p>
                </div>
              </label>
            </div>
            
            {error && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded-lg flex items-start">
                <AlertCircle className="w-5 h-5 mr-2 mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            
            <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                disabled={isGenerating}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleGenerateLink}
                className={`px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors flex items-center justify-center min-w-[120px] ${
                  isGenerating ? 'opacity-75' : ''
                }`}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin w-4 h-4 mr-2" />
                    Generating...
                  </>
                ) : (
                  'Generate Link'
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Your invite link is ready!
                </label>
                <div className="flex rounded-md shadow-sm">
                  <input
                    ref={linkInputRef}
                    type="text"
                    readOnly
                    value={inviteLink}
                    data-allow-copy="true"
                    className="flex-1 min-w-0 block w-full px-3 py-2 rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    onClick={(e) => e.target.select()}
                  />
                  <CopyToClipboard text={inviteLink} onCopy={handleCopy}>
                    <button 
                      className={`inline-flex items-center px-4 py-2 border border-l-0 border-gray-300 dark:border-gray-600 rounded-r-md bg-white dark:bg-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 ${
                        isCopied ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300' : ''
                      }`}
                    >
                      {isCopied ? (
                        <>
                          <Check className="w-4 h-4 mr-1.5" />
                          Copied!
                        </>
                      ) : (
                        'Copy Link'
                      )}
                    </button>
                  </CopyToClipboard>
                </div>
              </div>
              
              <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800">
                <h4 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">Share this link</h4>
                <p className="text-xs text-blue-700 dark:text-blue-200">
                  {isPermanent 
                    ? 'This is a permanent invite link. It will never expire.' 
                    : `This link will expire in ${expiry} hour${expiry === '1' ? '' : 's'}.`}
                  {' '}Anyone with this link can join the room.
                </p>
              </div>
              
              <div className="flex items-center text-xs text-gray-500 dark:text-gray-400 mt-2">
                <div className="flex items-center mr-4">
                  <div className="w-2 h-2 rounded-full bg-green-500 mr-1.5"></div>
                  <span>Active</span>
                </div>
                {!isPermanent && (
                  <div className="flex items-center">
                    <Clock className="w-3 h-3 mr-1 text-gray-400" />
                    <span>Expires in {expiry} hour{expiry === '1' ? '' : 's'}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex justify-end mt-6 pt-4 border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-md hover:bg-blue-600 dark:hover:bg-blue-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InviteLinkModal;
