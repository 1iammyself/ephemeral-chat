/**
 * LinkPreviewModal Component
 * Shows a confirmation dialog when users click external links in messages.
 * On Electron, offers "Open In-App" as an alternative to opening in system browser.
 */

import React, { useState, useMemo } from 'react';
import { ExternalLink, Globe, Shield, ShieldAlert, X, Eye } from 'lucide-react';

// Detect Electron
const isElectron = !!(window.electronAPI?.isElectron);

// Trusted domains key in localStorage
const TRUSTED_DOMAINS_KEY = 'ephemeral_trusted_domains';

function getTrustedDomains() {
    try {
        return JSON.parse(localStorage.getItem(TRUSTED_DOMAINS_KEY) || '[]');
    } catch { return []; }
}

function addTrustedDomain(domain) {
    const domains = getTrustedDomains();
    if (!domains.includes(domain)) {
        domains.push(domain);
        localStorage.setItem(TRUSTED_DOMAINS_KEY, JSON.stringify(domains));
    }
}

function isDomainTrusted(domain) {
    return getTrustedDomains().includes(domain);
}

// Check if a URL looks suspicious
function analyzeUrl(url) {
    const warnings = [];
    try {
        const parsed = new URL(url);

        // Non-HTTPS
        if (parsed.protocol !== 'https:') {
            warnings.push('This link does not use HTTPS (not encrypted)');
        }

        // IP address instead of domain
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(parsed.hostname)) {
            warnings.push('This link uses an IP address instead of a domain name');
        }

        // Very long URL (potential obfuscation)
        if (url.length > 200) {
            warnings.push('This is an unusually long URL');
        }

        // Common phishing patterns
        const phishingKeywords = ['login', 'signin', 'verify', 'account', 'secure', 'update', 'confirm'];
        const hasPhishing = phishingKeywords.some(kw =>
            parsed.hostname.includes(kw) && !['google', 'apple', 'microsoft', 'github'].some(safe => parsed.hostname.includes(safe))
        );
        if (hasPhishing) {
            warnings.push('This URL contains patterns commonly used in phishing');
        }

        return { hostname: parsed.hostname, protocol: parsed.protocol, warnings, isSuspicious: warnings.length > 0 };
    } catch {
        return { hostname: url, protocol: '', warnings: ['Invalid URL format'], isSuspicious: true };
    }
}

const LinkPreviewModal = ({ url, onClose }) => {
    const [trustDomain, setTrustDomain] = useState(false);

    const analysis = useMemo(() => analyzeUrl(url), [url]);

    const handleOpenExternal = () => {
        if (trustDomain) addTrustedDomain(analysis.hostname);

        if (isElectron && window.electronAPI?.openUrlExternal) {
            window.electronAPI.openUrlExternal(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
        onClose();
    };

    const handleOpenInApp = () => {
        if (trustDomain) addTrustedDomain(analysis.hostname);

        if (isElectron && window.electronAPI?.openUrlInApp) {
            window.electronAPI.openUrlInApp(url);
        }
        onClose();
    };

    if (!url) return null;

    return (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className={`px-5 py-4 flex items-center justify-between border-b ${analysis.isSuspicious
                    ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                    : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                    }`}>
                    <div className="flex items-center space-x-3">
                        {analysis.isSuspicious
                            ? <ShieldAlert className="w-6 h-6 text-amber-500" />
                            : <Shield className="w-6 h-6 text-blue-500" />
                        }
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white text-sm">
                                {analysis.isSuspicious ? 'Suspicious Link Detected' : 'Open External Link?'}
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                You're about to leave Ephemeral Chat
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>

                {/* URL Display */}
                <div className="px-5 py-4">
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-700">
                        <div className="flex items-center space-x-2 mb-1">
                            <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 truncate">
                                {analysis.hostname}
                            </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 break-all leading-relaxed pl-6 max-h-20 overflow-y-auto">
                            {url}
                        </p>
                    </div>

                    {/* Warnings */}
                    {analysis.warnings.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                            {analysis.warnings.map((warning, i) => (
                                <div key={i} className="flex items-start space-x-2 text-amber-600 dark:text-amber-400">
                                    <ShieldAlert className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                    <span className="text-xs">{warning}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Trust checkbox */}
                    <label className="flex items-center space-x-2 mt-4 cursor-pointer group">
                        <input
                            type="checkbox"
                            checked={trustDomain}
                            onChange={(e) => setTrustDomain(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500 cursor-pointer"
                        />
                        <span className="text-xs text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
                            Always trust links from <strong>{analysis.hostname}</strong>
                        </span>
                    </label>
                </div>

                {/* Actions */}
                <div className="px-5 py-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-200 dark:border-gray-700 flex flex-col space-y-2">
                    <button
                        onClick={handleOpenExternal}
                        className="w-full px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 transition-all active:scale-[0.98]"
                    >
                        <ExternalLink className="w-4 h-4" />
                        <span>Open in Browser</span>
                    </button>

                    {isElectron && (
                        <button
                            onClick={handleOpenInApp}
                            className="w-full px-4 py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl text-sm font-semibold flex items-center justify-center space-x-2 transition-all active:scale-[0.98]"
                        >
                            <Eye className="w-4 h-4" />
                            <span>Open In-App (Sandboxed)</span>
                        </button>
                    )}

                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

// Export helpers for use in MessageList
export { isDomainTrusted, analyzeUrl };
export default LinkPreviewModal;
