import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Smartphone, Shield, Zap, Monitor, Laptop, Globe, ExternalLink } from 'lucide-react';

const APK_DOWNLOAD_URL = 'https://github.com/cLLeB/ephemeral-chat/releases/download/chapter/app-release.apk';
const REPO_BASE = 'https://github.com/1iammyself/ephemeral-chat/releases/download/v1.1.4';

// Desktop download URLs
const DESKTOP_DOWNLOADS = {
    win: `${REPO_BASE}/Ephemeral.Chat-1.1.4-win.exe`,
    mac: `${REPO_BASE}/Ephemeral.Chat-1.1.4-mac-arm64.dmg`,
    linux: `${REPO_BASE}/Ephemeral.Chat-1.1.4-linux-x86_64.AppImage`,
    fallback: 'https://ephchat.kyere.me'
};

const AppRestrictionBanner = () => {
    const { t } = useTranslation();
    const [isVisible, setIsVisible] = useState(false);
    const [platform, setPlatform] = useState(null); // 'android' | 'desktop' | null

    useEffect(() => {
        const userAgent = navigator.userAgent.toLowerCase();
        const isAndroidDevice = /android/i.test(userAgent);
        const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);

        // Detection logic
        const checkEnvironment = () => {
            // WHITELIST: Allow privacy policy to be viewed in browser
            if (window.location.pathname === '/privacy') {
                setIsVisible(false);
                return true;
            }

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

            // Only allow Electron or Android native app
            if (isElectron || isAndroidApp) {
                setIsVisible(false);
                return true;
            }

            // Plain browser or unrecognised environment
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
            <div className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-[10000] max-w-sm mx-auto bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden animate-slideUp border border-blue-500/30">
                {/* Header - Compact */}
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-6">
                    <div className="flex flex-col items-center text-center gap-3">
                        <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center shadow-inner backdrop-blur-sm border border-white/20">
                            {isMobile ? (
                                <Smartphone className="w-10 h-10 text-white" />
                            ) : (
                                <Laptop className="w-10 h-10 text-white" />
                            )}
                        </div>
                        <div>
                            <h3 className="text-xl font-black text-white tracking-tight text-center">{t('appBanner.appRequired')}</h3>
                            <p className="text-blue-100/90 text-[10px] font-bold uppercase tracking-[0.2em] text-center">
                                {isAndroid ? t('appBanner.androidSecurity') : isIOS ? t('appBanner.comingSoon') : t('appBanner.desktopSecurity')}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Content - Compact */}
                <div className="px-6 py-6">
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800/50 rounded-xl p-4 mb-5">
                        <div className="flex gap-3 text-left">
                            <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                            <p className="text-blue-900 dark:text-blue-200 text-xs leading-relaxed">
                                {isIOS
                                    ? t('appBanner.iosMessage')
                                    : `${t('appBanner.privacyMessage')} ${isAndroid ? t('appBanner.android') : t('appBanner.desktop')} ${t('appBanner.app')}`
                                }
                            </p>
                        </div>
                    </div>

                    {/* Features */}
                    <div className="flex flex-col gap-3 mb-6">
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-left">
                            <Globe className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span className="font-bold text-xs text-gray-900 dark:text-white">{t('appBanner.hardenedPrivacy')}</span>
                        </div>
                        <div className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-left">
                            <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                            <span className="font-bold text-xs text-gray-900 dark:text-white">{t('appBanner.seamlessEntry')}</span>
                        </div>
                    </div>

                    {/* Buttons */}
                    <div className="flex flex-col gap-3">
                        {!isIOS && (
                            <button
                                onClick={() => window.location.href = 'ephemeral-chat://'}
                                className="w-full bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white px-5 py-3.5 rounded-xl text-sm font-bold transition-all border-2 border-blue-500/20 flex items-center justify-center gap-2 active:scale-[0.98]"
                            >
                                <ExternalLink size={18} className="text-blue-500" />
                                {t('appBanner.openInApp')}
                            </button>
                        )}

                        {!isIOS && (
                            <button
                                onClick={handleDownload}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white px-5 py-3.5 rounded-xl text-sm font-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 active:scale-[0.98]"
                            >
                                <Download size={18} />
                                {isAndroid ? t('appBanner.downloadApk') : t('appBanner.desktopApp')}
                            </button>
                        )}

                        {isIOS && (
                            <div className="w-full bg-gray-100 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 px-5 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 cursor-default border border-gray-200 dark:border-gray-700">
                                <span>{t('appBanner.iosComingSoon')}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default AppRestrictionBanner;
