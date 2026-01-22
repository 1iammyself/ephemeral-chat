import React, { useState } from 'react';
import { X, Search, Users, Shield, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';

const TraceHashModal = ({ onClose }) => {
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

            <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 transition-all duration-300">
                {/* Header */}
                <div className="bg-gradient-to-r from-indigo-600 to-blue-600 p-6">
                    <div className="flex justify-between items-center text-white">
                        <div className="flex items-center space-x-3">
                            <Shield className="w-6 h-6" />
                            <h2 className="text-xl font-bold">Forensic Trace Tool</h2>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                    <p className="text-indigo-100 text-sm mt-1 opacity-90">
                        Identify the user behind a forensic watermark hash.
                    </p>
                </div>

                <div className="p-6">
                    {!results ? (
                        <form onSubmit={handleVerify} className="space-y-5">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Target Hash (from screenshot)
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        value={targetHash}
                                        onChange={(e) => setTargetHash(e.target.value)}
                                        placeholder="e.g. 3FC4CCFE7458"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all font-mono uppercase"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                    Usernames to Cross-check
                                </label>
                                <div className="relative">
                                    <Users className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                                    <textarea
                                        value={usernamesInput}
                                        onChange={(e) => setUsernamesInput(e.target.value)}
                                        placeholder="Paste room participants here... (comma or line separated)"
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all min-h-[120px] text-sm"
                                        required
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isProcessing || !targetHash || !usernamesInput}
                                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/20 transition-all transform active:scale-[0.98] flex items-center justify-center space-x-2"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        <span>Analyzing Hashes...</span>
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-5 h-5" />
                                        <span>Trace Identity</span>
                                    </>
                                )}
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-6 py-2">
                            <div className={`p-6 rounded-2xl border ${results.found ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'}`}>
                                <div className="flex items-start space-x-4">
                                    {results.found ? (
                                        <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400 mt-1" />
                                    ) : (
                                        <AlertCircle className="w-8 h-8 text-red-600 dark:text-red-400 mt-1" />
                                    )}
                                    <div>
                                        <h3 className={`text-lg font-bold ${results.found ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                                            {results.found ? 'Match Found' : 'No Match Detected'}
                                        </h3>
                                        <p className={`text-sm mt-1 ${results.found ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                                            Target: <span className="font-mono font-bold uppercase">{results.targetHash}</span>
                                        </p>
                                    </div>
                                </div>

                                {results.found && (
                                    <div className="mt-6 bg-white dark:bg-gray-800 p-4 rounded-xl border border-green-200 dark:border-green-800 shadow-sm">
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Identified User:</p>
                                        <p className="text-2xl font-black text-gray-900 dark:text-white mt-1 break-all">
                                            {results.found}
                                        </p>
                                    </div>
                                )}
                            </div>

                            <p className="text-center text-xs text-gray-500 dark:text-gray-400">
                                Scanned {results.searchedCount} usernames from provided list.
                            </p>

                            <button
                                onClick={reset}
                                className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-all flex items-center justify-center space-x-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span>Clear and Try Again</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TraceHashModal;
