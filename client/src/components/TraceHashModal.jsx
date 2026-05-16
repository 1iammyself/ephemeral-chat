import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Search, Users, Shield, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';

const TraceHashModal = ({ onClose }) => {
    const { t } = useTranslation();
    const [targetHash, setTargetHash] = useState('');
    const [usernamesInput, setUsernamesInput] = useState('');
    const [results, setResults] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);

    // Same hashing logic as in GhostWatermark
    const hashUsername = async (username) => {
        try {
            const normalizedUsername = (username || '').trim().toLowerCase();
            if (!normalizedUsername) return null;

            const encoder = new TextEncoder();
            const data = encoder.encode(normalizedUsername);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 12).toUpperCase();
        } catch (err) {
            console.error('Failed to hash username:', err);
            return null;
        }
    };

    const handleVerify = async (e) => {
        e.preventDefault();
        if (!targetHash.trim()) return;

        setIsProcessing(true);
        const cleanHash = targetHash.trim().toUpperCase();
        const names = usernamesInput
            .split(/[,\n]/)
            .map(name => name.trim())
            .filter(name => name.length > 0);

        const matchResults = [];
        let foundMatch = null;

        for (const name of names) {
            const hash = await hashUsername(name);
            if (hash === cleanHash) {
                foundMatch = name;
                break;
            }
            matchResults.push({ name, hash });
        }

        setResults({
            found: foundMatch,
            searchedCount: names.length,
            targetHash: cleanHash
        });
        setIsProcessing(false);
    };

    const reset = () => {
        setResults(null);
        setTargetHash('');
        setUsernamesInput('');
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 ml-0">
            <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-md bg-gray-50 dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-300 dark:border-gray-700 transition-all duration-300">
                {/* Header */}
                <div className="bg-gradient-to-r from-sky-400 to-cyan-500 px-5 py-4">
                    <div className="flex justify-between items-center text-white">
                        <div className="flex items-center space-x-2">
                            <Shield className="w-5 h-5" />
                            <h2 className="text-lg font-bold">{t('trace.title')}</h2>
                        </div>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>

                <div className="p-4">
                    {!results ? (
                        <form onSubmit={handleVerify} className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                                    {t('trace.hashLabel')}
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                    <input
                                        type="text"
                                        value={targetHash}
                                        onChange={(e) => setTargetHash(e.target.value)}
                                        placeholder={t('trace.hashPlaceholder')}
                                        maxLength={12}
                                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-400 outline-none transition-all font-forensic uppercase tracking-wider text-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                                    {t('trace.usernamesLabel')}
                                </label>
                                <div className="relative">
                                    <Users className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
                                    <textarea
                                        value={usernamesInput}
                                        onChange={(e) => setUsernamesInput(e.target.value.toLowerCase())}
                                        placeholder={t('trace.usernamesSeparator')}
                                        className="w-full pl-9 pr-3 py-2.5 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-400 outline-none transition-all min-h-[56px] text-sm lowercase resize-y"
                                        rows={2}
                                        required
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
                                    {t('trace.usernamesHint')}
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={isProcessing || !targetHash || !usernamesInput}
                                className="w-full py-3 bg-sky-400 hover:bg-sky-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-sky-400/20 transition-all transform active:scale-[0.98] flex items-center justify-center space-x-2 text-sm"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>{t('trace.analyzing')}</span>
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-4 h-4" />
                                        <span>{t('trace.traceButton')}</span>
                                    </>
                                )}
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-4 py-1">
                            <div className={`p-4 rounded-xl border ${results.found ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                                <div className="flex items-start space-x-3">
                                    {results.found ? (
                                        <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                                    )}
                                    <div className="min-w-0">
                                        <h3 className={`text-base font-bold ${results.found ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                                            {results.found ? t('trace.matchFound') : t('trace.noMatch')}
                                        </h3>
                                        <p className={`text-xs mt-0.5 ${results.found ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                            Hash: <span className="font-forensic font-bold uppercase tracking-wide">{results.targetHash}</span>
                                        </p>
                                    </div>
                                </div>

                                {results.found && (
                                    <div className="mt-3 bg-white dark:bg-gray-800 p-3 rounded-lg border border-green-200 dark:border-green-800">
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('trace.identified')}</p>
                                        <p className="text-xl font-black text-gray-900 dark:text-white mt-0.5 break-all">
                                            {results.found}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <p className="text-center text-[10px] text-gray-400">
                                {t('trace.scanned', { count: results.searchedCount })}
                            </p>

                            <button
                                onClick={reset}
                                className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all flex items-center justify-center space-x-2 text-sm"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{t('trace.tryAgain')}</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TraceHashModal;
