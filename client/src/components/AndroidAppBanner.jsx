import { useState, useEffect } from 'react';
import { X, Download, Smartphone, Shield, Zap } from 'lucide-react';

const APK_DOWNLOAD_URL = 'https://github.com/cLLeB/ephemeral-chat/releases/download/chapter/app-release-signed.apk';
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

    // Check if already installed as TWA (Trusted Web Activity)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone === true ||
                         document.referrer.includes('android-app://');

    // Check if banner was dismissed
    const dismissedData = localStorage.getItem(DISMISS_KEY);
    let wasDismissed = false;
    
    if (dismissedData) {
      try {
        const { timestamp } = JSON.parse(dismissedData);
        const daysSinceDismiss = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
        wasDismissed = daysSinceDismiss < DISMISS_EXPIRY_DAYS;
      } catch {
        wasDismissed = false;
      }
    }

    // Show banner if: Android user, not in standalone/TWA mode, not dismissed
    if (isAndroidDevice && !isStandalone && !wasDismissed) {
      // Small delay to let the page load first
      const timer = setTimeout(() => setIsVisible(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDownload = () => {
    // Track that user clicked download (optional analytics)
    window.open(APK_DOWNLOAD_URL, '_blank');
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem(DISMISS_KEY, JSON.stringify({
      timestamp: Date.now()
    }));
  };

  // Don't render if not Android or not visible
  if (!isAndroid || !isVisible) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 animate-fadeIn"
        onClick={handleDismiss}
      />
      
      {/* Banner Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 max-w-md mx-auto bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-50 overflow-hidden animate-slideUp">
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Smartphone className="w-7 h-7 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Get the App</h3>
                <p className="text-indigo-100 text-sm">Better experience awaits</p>
              </div>
            </div>
            <button 
              onClick={handleDismiss}
              className="text-white/70 hover:text-white p-1 transition-colors"
              aria-label="Dismiss"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">
            Install the Ephemeral Chat app for the best experience with enhanced security features.
          </p>

          {/* Features */}
          <div className="space-y-2 mb-5">
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                <Shield className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <span className="text-gray-700 dark:text-gray-200">Screenshot & recording protection</span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                <Zap className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-gray-700 dark:text-gray-200">Open invite links directly in app</span>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-5 py-3 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25"
            >
              <Download size={18} />
              Download APK
            </button>
            <button
              onClick={handleDismiss}
              className="px-5 py-3 rounded-xl text-sm font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              Later
            </button>
          </div>

          {/* Install hint */}
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center">
            After downloading, open the APK file to install
          </p>
        </div>
      </div>
    </>
  );
};

export default AndroidAppBanner;
