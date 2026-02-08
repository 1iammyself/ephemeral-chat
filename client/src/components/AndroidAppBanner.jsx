import { useState, useEffect } from 'react';
import { X, Download, Smartphone, Shield, Zap } from 'lucide-react';

const APK_DOWNLOAD_URL = 'https://github.com/cLLeB/ephemeral-chat/releases/download/chapter/app-release.apk';
const DISMISS_KEY = 'androidAppBannerDismissed';
const DISMISS_EXPIRY_DAYS = 2; // Show again after 2 days

const AndroidAppBanner = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    // Detect if user is on Android
    const userAgent = navigator.userAgent.toLowerCase();
    const isAndroidDevice = /android/i.test(userAgent);
    setIsAndroid(isAndroidDevice);

    if (!isAndroidDevice) return;

    // Function to check environment
    const checkEnvironment = () => {
      // 1. Check for standalone/PWA modes
      const isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true;

      // 2. Check for TWA/App Referrer
      const isTWA = document.referrer.includes('android-app://');

      // 3. Check for Capacitor Bridge
      const hasCapacitorBridge = !!window.Capacitor?.isNative || !!window.Capacitor?.Plugins;

      // 4. Check for WebView-specific User Agent indicators
      // Standard Android Chrome DOES NOT contain "Version/4.0", but Android WebViews DO.
      const isWebView = userAgent.includes('version/4.0');

      // 5. Check for custom protocol (if applicable)
      const isCustomProtocol = window.location.protocol === 'capacitor:';

      const isAppEnvironment = isStandaloneMode || isTWA || hasCapacitorBridge || isWebView || isCustomProtocol;

      if (isAppEnvironment) {
        setIsVisible(false);
        return true; // Environment confirmed
      }
      return false;
    };

    // Initial check
    const confirmed = checkEnvironment();

    // If not confirmed, poll for a few seconds as the bridge might take time to initialize
    if (!confirmed) {
      setIsVisible(true); // Show by default on Android browser

      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (checkEnvironment() || attempts > 20) { // Check for 2 seconds
          clearInterval(interval);
        }
      }, 100);

      return () => clearInterval(interval);
    }
  }, []);

  const handleDownload = () => {
    window.location.href = APK_DOWNLOAD_URL;
  };

  // Don't render if not Android or not strictly in browser mode
  if (!isAndroid || !isVisible) return null;

  return (
    <>
      {/* Backdrop - No onClick dismiss */}
      <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-md z-[9999] animate-fadeIn" />

      {/* Banner Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-[10000] overflow-hidden animate-slideUp border border-indigo-500/20">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-6">
          <div className="flex flex-col items-center text-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center shadow-inner">
              <Smartphone className="w-10 h-10 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">App Required for Android</h3>
              <p className="text-indigo-100 text-sm mt-1">Enhanced security & privacy protection</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-8">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-4 mb-6">
            <p className="text-amber-800 dark:text-amber-300 text-sm leading-relaxed">
              To ensure <strong>screenshot and screen recording protection</strong>, chat rooms can only be accessed via the official Ephemeral Chat app on Android.
            </p>
          </div>

          {/* Features */}
          <div className="space-y-4 mb-8">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 shrink-0 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <span className="block font-semibold text-sm text-gray-900 dark:text-white">Screenshot Restriction</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">Prevents capturing sensitive conversations</span>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 shrink-0 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <span className="block font-semibold text-sm text-gray-900 dark:text-white">Direct App Launch</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">Open invite links instantly in-app</span>
              </div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            <button
              onClick={handleDownload}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-4 rounded-xl text-base font-bold transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-600/20"
            >
              <Download size={20} />
              Download & Install APK
            </button>
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
              The Play Store version is coming soon.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default AndroidAppBanner;
