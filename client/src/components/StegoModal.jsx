import { useState, useRef } from 'react';
import { X, Lock, Eye, EyeOff, Download, Send, Image as ImageIcon, AlertCircle, CheckCircle } from 'lucide-react';
import { embed, extract } from '../crypto/steganography';

export default function StegoModal({ isOpen, onClose, onSendStego }) {
  const [tab, setTab] = useState('hide');

  const [carrierFile, setCarrierFile] = useState(null);
  const [carrierPreview, setCarrierPreview] = useState(null);
  const [secretText, setSecretText] = useState('');
  const [hidePassphrase, setHidePassphrase] = useState('');
  const [showHidePass, setShowHidePass] = useState(false);
  const [isEmbedding, setIsEmbedding] = useState(false);
  const [embedResult, setEmbedResult] = useState(null);

  const [extractFile, setExtractFile] = useState(null);
  const [extractPreview, setExtractPreview] = useState(null);
  const [extractPassphrase, setExtractPassphrase] = useState('');
  const [showExtractPass, setShowExtractPass] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractResult, setExtractResult] = useState(null);

  const hideFileRef = useRef(null);
  const extractFileRef = useRef(null);

  const reset = () => {
    setTab('hide');
    setCarrierFile(null);
    if (carrierPreview) URL.revokeObjectURL(carrierPreview);
    setCarrierPreview(null);
    setSecretText('');
    setHidePassphrase('');
    setShowHidePass(false);
    setIsEmbedding(false);
    setEmbedResult(null);
    setExtractFile(null);
    if (extractPreview) URL.revokeObjectURL(extractPreview);
    setExtractPreview(null);
    setExtractPassphrase('');
    setShowExtractPass(false);
    setIsExtracting(false);
    setExtractResult(null);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleCarrierSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (carrierPreview) URL.revokeObjectURL(carrierPreview);
    setCarrierFile(file);
    setCarrierPreview(URL.createObjectURL(file));
    setEmbedResult(null);
  };

  const handleExtractSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) return;
    if (extractPreview) URL.revokeObjectURL(extractPreview);
    setExtractFile(file);
    setExtractPreview(URL.createObjectURL(file));
    setExtractResult(null);
  };

  const handleEmbed = async () => {
    if (!carrierFile || !secretText.trim() || !hidePassphrase.trim()) return;
    setIsEmbedding(true);
    setEmbedResult(null);
    try {
      const stegoBlob = await embed(carrierFile, secretText.trim(), hidePassphrase.trim());
      setEmbedResult(stegoBlob);
    } catch (err) {
      console.error('Embed failed:', err);
    }
    setIsEmbedding(false);
  };

  const handleExtract = async () => {
    if (!extractFile || !extractPassphrase.trim()) return;
    setIsExtracting(true);
    setExtractResult(null);
    try {
      const text = await extract(extractFile, extractPassphrase.trim());
      setExtractResult(text === null ? 'not-found' : text);
    } catch {
      setExtractResult('error');
    }
    setIsExtracting(false);
  };

  const handleDownload = () => {
    if (!embedResult) return;
    const url = URL.createObjectURL(embedResult);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stego_${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSend = () => {
    if (!embedResult || !onSendStego) return;
    onSendStego(embedResult);
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full sm:w-[480px] bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 pt-5 pb-0">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
            <Lock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-black text-gray-900 dark:text-white">Steganography</h2>
            <p className="text-[10px] text-gray-400">Hide secrets in plain sight</p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mx-5 mt-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {['hide', 'extract'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${tab === t ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
            >
              {t === 'hide' ? 'Hide Message' : 'Extract Message'}
            </button>
          ))}
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {tab === 'hide' ? (
            <>
              {/* Carrier image */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Carrier Image</label>
                <input ref={hideFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleCarrierSelect(e.target.files?.[0])} />
                {carrierPreview ? (
                  <div
                    className="relative rounded-xl overflow-hidden aspect-video bg-gray-100 dark:bg-gray-800 cursor-pointer group"
                    onClick={() => hideFileRef.current?.click()}
                  >
                    <img src={carrierPreview} alt="Carrier" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-bold">Change image</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => hideFileRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors group"
                  >
                    <ImageIcon className="w-6 h-6 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors" />
                    <span className="text-xs text-gray-400">Tap to pick image (PNG/JPEG)</span>
                  </button>
                )}
              </div>

              {/* Secret text */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Secret Message</label>
                <textarea
                  value={secretText}
                  onChange={e => setSecretText(e.target.value)}
                  placeholder="Type your hidden message…"
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 px-3 py-2.5 outline-none focus:ring-2 focus:ring-indigo-400/40 resize-none"
                />
              </div>

              {/* Passphrase */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Passphrase</label>
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-400/40">
                  <input
                    type={showHidePass ? 'text' : 'password'}
                    value={hidePassphrase}
                    onChange={e => setHidePassphrase(e.target.value)}
                    placeholder="Share this key out-of-band"
                    className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none"
                  />
                  <button type="button" onClick={() => setShowHidePass(p => !p)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    {showHidePass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Recipient needs this passphrase to extract the message.</p>
              </div>

              {/* Embed / result */}
              {!embedResult ? (
                <button
                  onClick={handleEmbed}
                  disabled={isEmbedding || !carrierFile || !secretText.trim() || !hidePassphrase.trim()}
                  className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-indigo-700 transition-colors active:scale-95"
                >
                  {isEmbedding ? 'Embedding…' : 'Embed Message'}
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl">
                    <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">Message embedded successfully!</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownload}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Save PNG
                    </button>
                    {onSendStego && (
                      <button
                        onClick={handleSend}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-colors active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Send
                      </button>
                    )}
                  </div>
                  <button onClick={() => setEmbedResult(null)} className="w-full text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors py-1">
                    Start over
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Extract: image picker */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Stego Image</label>
                <input ref={extractFileRef} type="file" accept="image/*" className="hidden" onChange={e => handleExtractSelect(e.target.files?.[0])} />
                {extractPreview ? (
                  <div
                    className="relative rounded-xl overflow-hidden aspect-video bg-gray-100 dark:bg-gray-800 cursor-pointer group"
                    onClick={() => extractFileRef.current?.click()}
                  >
                    <img src={extractPreview} alt="Stego" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="text-white text-xs font-bold">Change image</span>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => extractFileRef.current?.click()}
                    className="w-full border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl py-6 flex flex-col items-center gap-2 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors group"
                  >
                    <ImageIcon className="w-6 h-6 text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 transition-colors" />
                    <span className="text-xs text-gray-400">Tap to pick stego image</span>
                  </button>
                )}
              </div>

              {/* Passphrase */}
              <div>
                <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Passphrase</label>
                <div className="flex items-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 focus-within:ring-2 focus-within:ring-indigo-400/40">
                  <input
                    type={showExtractPass ? 'text' : 'password'}
                    value={extractPassphrase}
                    onChange={e => setExtractPassphrase(e.target.value)}
                    placeholder="Enter the shared passphrase"
                    onKeyDown={e => { if (e.key === 'Enter') handleExtract(); }}
                    className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 outline-none"
                  />
                  <button type="button" onClick={() => setShowExtractPass(p => !p)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                    {showExtractPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                onClick={handleExtract}
                disabled={isExtracting || !extractFile || !extractPassphrase.trim()}
                className="w-full py-3 rounded-xl bg-indigo-600 text-white text-sm font-bold disabled:opacity-40 hover:bg-indigo-700 transition-colors active:scale-95"
              >
                {isExtracting ? 'Extracting…' : 'Extract Message'}
              </button>

              {extractResult !== null && (
                <div className={`p-3 rounded-xl ${extractResult === 'not-found' || extractResult === 'error' ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
                  {extractResult === 'not-found' || extractResult === 'error' ? (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-xs text-red-700 dark:text-red-400 font-medium">
                        {extractResult === 'not-found' ? 'No hidden message found or wrong passphrase.' : 'Extraction failed. Make sure this is a lossless PNG.'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide mb-1">Hidden message revealed</p>
                        <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">{extractResult}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="pb-safe-area-inset-bottom h-4" />
      </div>
    </div>
  );
}
