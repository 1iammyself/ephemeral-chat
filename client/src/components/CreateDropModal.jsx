import React, { useState, useRef, useCallback } from 'react';
import {
  X, Package, Type, Image, Mic, FileUp, Plus, Minus,
  Clock, Eye, EyeOff, Users, Shield, Loader2, AlertTriangle
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { hapticSuccess, hapticError } from '../utils/platform';
import { encryptDrop, createDropAPI, fileToArrayBuffer } from '../utils/drops';
import { getCreatorId } from '../utils/creator';

// ─── Constants ────────────────────────────────────────────

const MAX_TEXT_LENGTH = 10000;
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
const MAX_RECIPIENTS = 20;

const CONTENT_TYPES = [
  { id: 'text', label: 'Text', icon: Type, description: 'A text message' },
  { id: 'image', label: 'Image', icon: Image, description: 'A photo or image' },
  { id: 'audio', label: 'Audio', icon: Mic, description: 'A voice note or audio' },
  { id: 'file', label: 'File', icon: FileUp, description: 'Any file up to 20MB' },
];

const TTL_OPTIONS = [
  { value: '5min', label: '5 Minutes', short: '5m' },
  { value: '15min', label: '15 Minutes', short: '15m' },
  { value: '30min', label: '30 Minutes', short: '30m' },
  { value: '1hour', label: '1 Hour', short: '1h' },
  { value: '6hour', label: '6 Hours', short: '6h' },
  { value: '24hour', label: '24 Hours', short: '24h' },
];

// ─── Component ────────────────────────────────────────────

const CreateDropModal = ({ onClose, onDropCreated }) => {
  const { theme } = useTheme();

  // Content
  const [contentType, setContentType] = useState('text');
  const [textContent, setTextContent] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const fileInputRef = useRef(null);

  // Recipients
  const [recipients, setRecipients] = useState(['']);
  const [recipientErrors, setRecipientErrors] = useState({});

  // Settings
  const [ttl, setTtl] = useState('1hour'); // 1 hour default
  const [viewOnce, setViewOnce] = useState(false);
  const [hint, setHint] = useState('');

  // State
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState(1); // 1: content, 2: recipients, 3: settings

  // ─── File Handling ──────────────────────────────────────

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      setError(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`);
      return;
    }

    setSelectedFile(file);
    setError('');

    // Generate preview for images
    if (contentType === 'image' && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setFilePreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  }, [contentType]);

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setFilePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  // ─── Recipient Management ──────────────────────────────

  const addRecipient = useCallback(() => {
    if (recipients.length >= MAX_RECIPIENTS) return;
    setRecipients(prev => [...prev, '']);
  }, [recipients.length]);

  const removeRecipient = useCallback((index) => {
    if (recipients.length <= 1) return;
    setRecipients(prev => prev.filter((_, i) => i !== index));
    setRecipientErrors(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, [recipients.length]);

  const updateRecipient = useCallback((index, value) => {
    // Normalize: lowercase, trim, only allow alphanumeric, underscore, hyphen, dot
    const cleaned = value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    setRecipients(prev => {
      const next = [...prev];
      next[index] = cleaned;
      return next;
    });

    // Clear error when typing
    setRecipientErrors(prev => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }, []);

  // ─── Validation ─────────────────────────────────────────

  const validateStep1 = useCallback(() => {
    if (contentType === 'text') {
      if (!textContent.trim()) {
        setError('Please enter some text content');
        return false;
      }
      if (textContent.length > MAX_TEXT_LENGTH) {
        setError(`Text too long. Maximum ${MAX_TEXT_LENGTH} characters`);
        return false;
      }
    } else {
      if (!selectedFile) {
        setError(`Please select ${contentType === 'image' ? 'an image' : contentType === 'audio' ? 'an audio file' : 'a file'}`);
        return false;
      }
    }
    setError('');
    return true;
  }, [contentType, textContent, selectedFile]);

  const validateStep2 = useCallback(() => {
    const errors = {};
    const validUsernames = [];

    recipients.forEach((r, i) => {
      const trimmed = r.trim();
      if (!trimmed) {
        errors[i] = 'Username required';
      } else if (trimmed.length < 2) {
        errors[i] = 'Min 2 characters';
      } else if (trimmed.length > 30) {
        errors[i] = 'Max 30 characters';
      } else if (validUsernames.includes(trimmed)) {
        errors[i] = 'Duplicate username';
      } else {
        validUsernames.push(trimmed);
      }
    });

    setRecipientErrors(errors);

    if (Object.keys(errors).length > 0) {
      setError('Please fix the recipient errors');
      return false;
    }

    if (validUsernames.length === 0) {
      setError('At least one recipient is required');
      return false;
    }

    setError('');
    return true;
  }, [recipients]);

  // ─── Create Drop ────────────────────────────────────────

  const handleCreate = async () => {
    if (!validateStep2()) return;

    setIsCreating(true);
    setError('');

    try {
      // 1. Prepare content as ArrayBuffer
      let contentBuffer;
      let contentMeta = {};

      if (contentType === 'text') {
        const encoder = new TextEncoder();
        contentBuffer = encoder.encode(textContent).buffer;
        contentMeta = { type: 'text', size: contentBuffer.byteLength };
      } else {
        contentBuffer = await fileToArrayBuffer(selectedFile);
        contentMeta = {
          type: contentType,
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
          size: selectedFile.size,
        };
      }

      // 2. Get valid recipient usernames
      const usernames = recipients.map(r => r.trim()).filter(Boolean);

      // 3. Encrypt
      const encrypted = await encryptDrop(contentBuffer, usernames);

      // 4. Send to server — flatten contentMeta to match server API
      const result = await createDropAPI({
        creatorId: getCreatorId(),
        encryptedPayload: encrypted.encryptedPayload,
        iv: encrypted.iv,
        salt: encrypted.salt,
        wrappedKeys: encrypted.wrappedKeys,
        recipientHashes: encrypted.recipientHashes,
        contentType: contentMeta.type,
        fileName: contentMeta.fileName || null,
        mimeType: contentMeta.mimeType || null,
        fileSize: contentMeta.size || null,
        ttl,
        viewOnce,
        hint: hint.trim() || undefined,
      });

      hapticSuccess();
      onDropCreated({
        ...result,
        hint: hint.trim() || null,
        viewOnce,
        recipientCount: recipients.filter(r => r.trim()).length,
      });
    } catch (err) {
      console.error('Failed to create drop:', err);
      setError(err.message || 'Failed to create drop. Please try again.');
      hapticError();
    } finally {
      setIsCreating(false);
    }
  };

  // ─── Step Navigation ────────────────────────────────────

  const nextStep = () => {
    if (step === 1 && validateStep1()) setStep(2);
    else if (step === 2 && validateStep2()) setStep(3);
  };

  const prevStep = () => {
    setError('');
    setStep(prev => Math.max(1, prev - 1));
  };

  // ─── Render Helpers ─────────────────────────────────────

  const getAcceptType = () => {
    switch (contentType) {
      case 'image': return 'image/*';
      case 'audio': return 'audio/*';
      default: return '*/*';
    }
  };

  // ─── Render ─────────────────────────────────────────────

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-gray-50 dark:bg-gray-800 rounded-2xl w-full max-w-md relative shadow-2xl overflow-hidden border border-gray-300 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-500" />
            <h2 className="text-lg font-bold dark:text-white">Create Ephemeral Drop</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isCreating}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center px-4 pt-3 gap-1">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className={`flex-1 h-1 rounded-full transition-colors ${
                s <= step ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-700'
              }`}
            />
          ))}
        </div>
        <p className="px-4 pt-1 text-xs text-gray-500 dark:text-gray-400">
          {step === 1 ? 'Step 1: Content' : step === 2 ? 'Step 2: Recipients' : 'Step 3: Settings'}
        </p>

        {/* Body */}
        <div className="p-4 max-h-[65vh] overflow-y-auto no-scrollbar">
          {/* ─── Step 1: Content ────────────────────── */}
          {step === 1 && (
            <div className="space-y-4">
              {/* Content Type Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  What do you want to drop?
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {CONTENT_TYPES.map(ct => {
                    const Icon = ct.icon;
                    return (
                      <button
                        key={ct.id}
                        type="button"
                        onClick={() => {
                          setContentType(ct.id);
                          clearFile();
                          setError('');
                        }}
                        className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                          contentType === ct.id
                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="text-xs font-medium">{ct.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Text Input */}
              {contentType === 'text' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Message
                  </label>
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    placeholder="Type your secret message..."
                    data-allow-copy="true"
                    rows={5}
                    maxLength={MAX_TEXT_LENGTH}
                    className="w-full p-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm resize-none"
                  />
                  <p className="text-xs text-gray-400 dark:text-gray-500 text-right mt-1">
                    {textContent.length}/{MAX_TEXT_LENGTH}
                  </p>
                </div>
              )}

              {/* File Input */}
              {contentType !== 'text' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {contentType === 'image' ? 'Select Image' : contentType === 'audio' ? 'Select Audio' : 'Select File'}
                  </label>

                  {/* Drop Zone */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-purple-400 dark:hover:border-purple-500 transition-colors"
                  >
                    {selectedFile ? (
                      <div className="space-y-2">
                        {filePreview && (
                          <img
                            src={filePreview}
                            alt="Preview"
                            className="max-h-32 mx-auto rounded-lg object-contain"
                          />
                        )}
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {selectedFile.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); clearFile(); }}
                          className="text-xs text-red-500 hover:text-red-600 font-medium"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <FileUp className="w-8 h-8 text-gray-400 mx-auto" />
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          Tap to select or drop a file here
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Max {MAX_FILE_SIZE / (1024 * 1024)}MB
                        </p>
                      </div>
                    )}
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={getAcceptType()}
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          )}

          {/* ─── Step 2: Recipients ─────────────────── */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    Who can open this drop?
                  </label>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {recipients.filter(r => r.trim()).length}/{MAX_RECIPIENTS}
                  </span>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Enter usernames. Recipients use their username as the decryption key — 
                  <span className="text-purple-500 font-medium"> no password is transmitted or stored</span>.
                </p>

                <div className="space-y-2">
                  {recipients.map((username, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => updateRecipient(index, e.target.value)}
                          placeholder={`username${index + 1}`}
                          data-allow-copy="true"
                          maxLength={30}
                          className={`w-full px-3 py-2 rounded-lg border text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:border-transparent ${
                            recipientErrors[index]
                              ? 'border-red-300 dark:border-red-500 focus:ring-red-500'
                              : 'border-gray-200 dark:border-gray-600 focus:ring-purple-500'
                          }`}
                        />
                        {recipientErrors[index] && (
                          <p className="text-xs text-red-500 mt-0.5">{recipientErrors[index]}</p>
                        )}
                      </div>
                      {recipients.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeRecipient(index)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {recipients.length < MAX_RECIPIENTS && (
                  <button
                    type="button"
                    onClick={addRecipient}
                    className="mt-2 flex items-center gap-1 text-sm text-purple-500 hover:text-purple-600 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Add recipient
                  </button>
                )}
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800/50">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Each username becomes a unique decryption key. The recipient must know 
                    their exact username to decrypt the drop. Share usernames 
                    securely — ideally in person or via a trusted channel.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ─── Step 3: Settings ──────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              {/* TTL */}
              <div>
                <div className="flex items-center gap-1 mb-2">
                  <Clock className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Self-Destruct Timer
                  </label>
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {TTL_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setTtl(option.value)}
                      className={`py-2 px-1 rounded-lg border-2 text-xs font-medium transition-all ${
                        ttl === option.value
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {option.short}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Drop auto-destructs after this time, whether claimed or not.
                </p>
              </div>

              {/* View Once */}
              <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  {viewOnce ? (
                    <EyeOff className="w-4 h-4 text-purple-500" />
                  ) : (
                    <Eye className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">View Once</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {viewOnce ? 'Each recipient can only view once' : 'Recipients can view multiple times'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewOnce(prev => !prev)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    viewOnce ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      viewOnce ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Hint */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  Hint (Optional)
                </label>
                <input
                  type="text"
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder="e.g. 'For the meeting' or 'Birthday surprise'"
                  data-allow-copy="true"
                  maxLength={100}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  Visible to anyone with the drop ID. Don't include secrets here.
                </p>
              </div>

              {/* Summary */}
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-1.5 text-xs">
                <p className="font-medium text-gray-700 dark:text-gray-300 text-sm">Summary</p>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Type</span>
                  <span className="font-medium capitalize">{contentType}</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Recipients</span>
                  <span className="font-medium">{recipients.filter(r => r.trim()).length} user(s)</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Expires</span>
                  <span className="font-medium">{TTL_OPTIONS.find(o => o.value === ttl)?.label}</span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>View Once</span>
                  <span className="font-medium">{viewOnce ? 'Yes' : 'No'}</span>
                </div>
                {contentType !== 'text' && selectedFile && (
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>File</span>
                    <span className="font-medium truncate ml-4">{selectedFile.name}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800/50 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <button
            type="button"
            onClick={step === 1 ? onClose : prevStep}
            disabled={isCreating}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={nextStep}
              className="px-6 py-2 text-sm font-bold bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCreate}
              disabled={isCreating}
              className="px-6 py-2 text-sm font-bold bg-purple-500 hover:bg-purple-600 disabled:bg-purple-300 dark:disabled:bg-purple-800 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Encrypting...
                </>
              ) : (
                <>
                  <Package className="w-4 h-4" />
                  Create Drop
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreateDropModal;
