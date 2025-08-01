import { useState, useEffect } from 'react';

export const usePWAInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    // Check if the app is already installed
    const isRunningStandalone = () => {
      return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone ||
        document.referrer.includes('android-app://')
      );
    };

    setIsInstalled(isRunningStandalone());

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the default install prompt
      e.preventDefault();
      // Stash the event so it can be triggered later
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      console.log('App was installed');
      setIsInstalled(true);
      setCanInstall(false);
    };

    // Check if the browser supports PWA installation
    const isSupported = () => {
      return 'BeforeInstallPromptEvent' in window;
    };

    if (isSupported()) {
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.addEventListener('appinstalled', handleAppInstalled);
    }

    // Clean up event listeners
    return () => {
      if (isSupported()) {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
        window.removeEventListener('appinstalled', handleAppInstalled);
      }
    };
  }, []);

  // Function to trigger the installation prompt
  const installApp = async () => {
    if (!deferredPrompt) {
      console.warn('Install prompt not available');
      return false;
    }

    try {
      // Show the install prompt
      deferredPrompt.prompt();
      
      // Wait for the user to respond to the prompt
      const { outcome } = await deferredPrompt.userChoice;
      
      // Optionally, send analytics about the installation
      console.log(`User response to the install prompt: ${outcome}`);
      
      // Clear the deferredPrompt variable
      setDeferredPrompt(null);
      setCanInstall(false);
      
      return outcome === 'accepted';
    } catch (error) {
      console.error('Error during installation:', error);
      return false;
    }
  };

  return { installApp, canInstall, isInstalled };
};

export default usePWAInstall;
