import { useState, useEffect } from 'react';
import { X, Download } from 'lucide-react';
import usePWAInstall from '../hooks/usePWAInstall';

const InstallPrompt = () => {
  const { canInstall, installApp, isInstalled } = usePWAInstall();
  const [isVisible, setIsVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only show the prompt if the app can be installed and hasn't been dismissed
    if (canInstall && !isInstalled && !dismissed) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [canInstall, isInstalled, dismissed]);

  const handleInstall = async () => {
    await installApp();
    setDismissed(true);
  };

  const handleDismiss = () => {
    setIsVisible(false);
    setDismissed(true);
    // Store dismissal in localStorage to prevent showing again
    localStorage.setItem('pwaPromptDismissed', 'true');
  };

  // Don't show if the prompt was previously dismissed
  useEffect(() => {
    const wasDismissed = localStorage.getItem('pwaPromptDismissed') === 'true';
    if (wasDismissed) {
      setDismissed(true);
    }
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 max-w-sm z-50 border border-gray-200 dark:border-gray-700">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-medium text-gray-900 dark:text-white">Install Ephemeral Chat</h3>
        <button 
          onClick={handleDismiss}
          className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
          aria-label="Dismiss"
        >
          <X size={20} />
        </button>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
        Add Ephemeral Chat to your home screen for quick access and an enhanced experience.
      </p>
      <div className="flex space-x-3">
        <button
          onClick={handleInstall}
          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Download size={16} />
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="flex-1 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md text-sm font-medium border border-gray-300 dark:border-gray-600 transition-colors"
        >
          Not Now
        </button>
      </div>
    </div>
  );
};

export default InstallPrompt;
