import { useState, useEffect } from 'react';
import { Download, Smartphone, Shield, Zap, Monitor, Laptop, Globe, ExternalLink } from 'lucide-react';

const APK_DOWNLOAD_URL = 'https://github.com/cLLeB/ephemeral-chat/releases/download/chapter/app-release.apk';
const REPO_BASE = 'https://github.com/1iammyself/ephemeral-chat/releases/download/v1.1.1';

// Desktop download URLs
const DESKTOP_DOWNLOADS = {
    win: `${REPO_BASE}/Ephemeral-Chat-1.1.1-win.exe`,
    mac: `${REPO_BASE}/Ephemeral-Chat-1.1.1-mac-arm64.dmg`,
    linux: `${REPO_BASE}/Ephemeral-Chat-1.1.1-linux-x86_64.AppImage`,
    fallback: 'https://github.com/1iammyself/ephemeral-chat/releases/tag/v1.1.1'
};

const AppRestrictionBanner = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [platform, setPlatform] = useState(null); // 'android' | 'desktop' | null

    useEffect(() => {
        const userAgent = navigator.userAgent.toLowerCase();
        const isAndroidDevice = /android/i.test(userAgent);
        const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

        // Detection logic
        const checkEnvironment = () => {
            // 1. Desktop/Electron
            const isElectron = !!(window.electronAPI || window.process?.versions?.electron || document.body.classList.contains('electron-app'));

            // 2. Android Native (APK/WebView/Capacitor)
            const isAndroidApp = isAndroidDevice && (
                window.matchMedia('(display-mode: standalone)').matches ||
                window.navigator.standalone === true ||
                document.referrer.includes('android-app://') ||
                window.Capacitor?.isNative ||
                userAgent.includes('version/4.0')
            );

            if (isElectron || isAndroidApp) {
                setIsVisible(false);
                return true;
            }

            // If we are here, we are in a browser
            if (isAndroidDevice) {
                setPlatform('android');
                setIsVisible(true);
            } else if (!isMobile) {
                setPlatform('desktop');
                setIsVisible(true);
            }
            return false;
        };

        const confirmed = checkEnvironment();

        // Poll for bridge if it's Android
        if (!confirmed && isAndroidDevice) {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (checkEnvironment() || attempts > 20) {
                    clearInterval(interval);
                }
            }, 100);
            return () => clearInterval(interval);
        }
    }, []);

    const getDesktopDownloadUrl = () => {
        const userAgent = navigator.userAgent.toLowerCase();
        if (userAgent.indexOf('win') !== -1) return DESKTOP_DOWNLOADS.win;
        if (userAgent.indexOf('mac') !== -1) return DESKTOP_DOWNLOADS.mac;
        if (userAgent.indexOf('linux') !== -1) return DESKTOP_DOWNLOADS.linux;
        return DESKTOP_DOWNLOADS.fallback;
    };

    const handleDownload = () => {
        if (platform === 'android') {
            window.location.href = APK_DOWNLOAD_URL;
        } else {
            window.location.href = getDesktopDownloadUrl();
        }
    };

    if (!isVisible) return null;

    const isAndroid = platform === 'android';

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[9999] animate-fadeIn" />

            {/* Container for Centering - Using dvh for robust mobile height */}
            <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 overflow-y-auto min-h-[100dvh]">
                {/* Modal Card */}
                <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden animate-slideUp border border-indigo-500/30 my-auto">
                    {/* Header with platform-specific icon */}
                    <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 px-6 py-8">
                        <div className="flex flex-col items-center text-center gap-4">
                            <div className="w-20 h-20 bg-white/15 rounded-3xl flex items-center justify-center shadow-inner backdrop-blur-sm border border-white/20">
                                {isAndroid ? (
                                    <Smartphone className="w-12 h-12 text-white" />
                                ) : (
                                    <Laptop className="w-12 h-12 text-white" />
                                )}
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-white tracking-tight text-center">App Required</h3>
                                <p className="text-indigo-100/90 text-sm font-medium mt-1 uppercase tracking-widest text-center">
                                    {isAndroid ? 'Android Security' : 'Desktop Security'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="px-6 py-8">
                        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl p-5 mb-8">
                            <div className="flex gap-3 text-left">
                                <Shield className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                                <p className="text-indigo-900 dark:text-indigo-200 text-sm leading-relaxed">
                                    To protect your privacy with <strong>screenshot restriction</strong> and <strong>end-to-end security</strong>, chat rooms can only be accessed via the official Ephemeral Chat {isAndroid ? 'Android' : 'Desktop'} application.
                                </p>
                            </div>
                        </div>

                        {/* Feature List */}
                        <div className="space-y-5 mb-10">
                            <div className="flex items-center gap-4 group text-left">
                                <div className="w-10 h-10 shrink-0 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl flex items-center justify-center transition-colors group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/50">
                                    <Globe className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <div className="text-left">
                                    <span className="block font-bold text-sm text-gray-900 dark:text-white">Hardened Privacy</span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Isolated environment for secure chats</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-4 group text-left">
                                <div className="w-10 h-10 shrink-0 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center transition-colors group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50">
                                    <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="text-left">
                                    <span className="block font-bold text-sm text-gray-900 dark:text-white">Seamless Entry</span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Launch directly into rooms from links</span>
                                </div>
                            </div>
                        </div>

                        {/* CTA Section */}
                        <div className="flex flex-col gap-4">
                            <button
                                onClick={() => window.location.href = 'ephemeral-chat://'}
                                className="w-full bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-6 py-4 rounded-2xl text-base font-bold transition-all border-2 border-indigo-500/20 flex items-center justify-center gap-3 active:scale-[0.98]"
                            >
                                <ExternalLink size={20} className="text-indigo-500" />
                                Open in App
                            </button>
                            <button
                                onClick={handleDownload}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-2xl text-base font-black transition-all flex items-center justify-center gap-3 shadow-xl shadow-indigo-600/30 active:scale-[0.98]"
                            >
                                <Download size={20} />
                                Download {isAndroid ? 'APK' : 'Desktop App'}
                            </button>
                            <p className="text-center text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-bold">
                                Secure & Open Source
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AppRestrictionBanner;
