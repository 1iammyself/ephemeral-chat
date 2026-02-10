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

            // 3. iOS detection
            const isIOS = /iphone|ipad|ipod/i.test(userAgent);

            // CHANGED: We now block iOS PWA as well, so we only allow Electron or Android Native
            if (isElectron || isAndroidApp) {
                setIsVisible(false);
                return true;
            }

            // If we are here, we are in a browser or iOS PWA
            if (isAndroidDevice) {
                setPlatform('android');
                setIsVisible(true);
            } else if (isIOS) {
                setPlatform('ios');
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
    const isIOS = platform === 'ios';
    const isMobile = isAndroid || isIOS;

    return (
        <>
            {/* Backdrop */}
            <div className="fixed inset-0 bg-slate-950/95 backdrop-blur-xl z-[9999] animate-fadeIn" />

            {/* Modal Card - Fixed Centering with Absolute Position */}
            <div className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-[10000] max-w-sm mx-auto bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden animate-slideUp border border-indigo-500/30">
                {/* Header - Compact */}
                <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 px-6 py-6">
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center shadow-inner backdrop-blur-sm border border-white/20">
                            {isMobile ? (
                                <Smartphone className="w-10 h-10 text-white" />
                            ) : (
                                <Laptop className="w-10 h-10 text-white" />
                            )}
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tight text-center">App Required</h3>
                            <p className="text-indigo-100/90 text-[10px] font-bold uppercase tracking-[0.2em] text-center">
                                {isAndroid ? 'Android Security' : isIOS ? 'Coming Soon' : 'Desktop Security'}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content - Compact */}
                <div className="px-6 py-6">
                    <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800/50 rounded-xl p-4 mb-5">
                        <div className="flex gap-3 text-left">
                            <Shield className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                            <p className="text-indigo-900 dark:text-indigo-200 text-xs leading-relaxed">
                                {isIOS
                                    ? "The iOS application is currently in development. To ensure privacy and security, access is currently available via the Android and Desktop apps."
                                    : <>To protect your <strong>privacy</strong>, rooms can only be accessed via the official {isAndroid ? 'Android' : 'Desktop'} app.</>
                                }
                            </p>
                        </div>
                    </div>

                    {/* Features */}
                    <div className="flex flex-col gap-3 mb-6">
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-left">
                            <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span className="font-bold text-xs text-gray-900 dark:text-white">Hardened Privacy</span>
                        </div>
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-left">
                            <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            <span className="font-bold text-xs text-gray-900 dark:text-white">Seamless Entry</span>
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex flex-col gap-3">
                        {!isIOS && (
                            <button
                                onClick={() => window.location.href = 'ephemeral-chat://'}
                                className="w-full bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-5 py-3.5 rounded-xl text-sm font-bold transition-all border-2 border-indigo-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                <ExternalLink size={18} className="text-indigo-500" />
                                Open in App
                            </button>
                        )}

                        {!isIOS && (
                            <button
                                onClick={handleDownload}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 active:scale-[0.98]"
                            >
                                <Download size={18} />
                                Download {isAndroid ? 'APK' : 'Desktop App'}
                            </button>
                        )}

                        {isIOS && (
                            <div className="w-full bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 px-5 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-default border border-gray-200 dark:border-gray-700">
                                <span>iOS App Coming Soon</span>
                            </div>
                        )}
                        <p className="text-center text-[9px] text-gray-400 dark:text-gray-500 uppercase tracking-widest font-bold mt-1">
                            Secure & Open Source
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
};

export default AppRestrictionBanner;
