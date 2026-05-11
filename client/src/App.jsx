import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { BiometricPlugin } from './capacitor/security-plugins';
import Home from './components/Home';
import LandingRedirect from './components/LandingRedirect';
import ChatRoom from './components/ChatRoom';
import InviteHandler from './components/InviteHandler.jsx';
import { useAppResume } from './hooks/useAppResume';
import MyRooms from './components/MyRooms'; // Import MyRooms component
import MyDrops from './components/MyDrops';
import DropPage from './components/DropPage';
import NearbyTransfer from './components/NearbyTransfer';
import AppRestrictionBanner from './components/AppRestrictionBanner';
import DesktopSecurityGuard from './components/DesktopSecurityGuard';
import DeepLinkHandler from './components/DeepLinkHandler';
import PrivacyPolicy from './components/PrivacyPolicy';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

let isAuthRunning = false;

async function runBiometricGate(setIsLocked) {
  if (Capacitor.getPlatform() !== 'android') return;
  if (isAuthRunning) return;
  isAuthRunning = true;

  try {
    const { available } = await BiometricPlugin.isAvailable();
    if (!available) {
      setIsLocked(false);
      return;
    }

    const result = await BiometricPlugin.authenticate({
      title: 'Unlock Ephemeral Chat',
      subtitle: 'Confirm your identity to continue',
      cancelLabel: 'Cancel',
    });

    setIsLocked(result.success !== true);
  } catch {
    // On unexpected errors, don't block the user on non-critical failure
    setIsLocked(false);
  } finally {
    isAuthRunning = false;
  }
}

function App() {
  const isAndroid = Capacitor.getPlatform() === 'android';
  const [isLocked, setIsLocked] = useState(isAndroid);

  useAppResume();

  // Run biometric gate on mount
  useEffect(() => {
    runBiometricGate(setIsLocked);
  }, []);

  // Re-run biometric gate whenever the app returns to the foreground
  useEffect(() => {
    if (!isAndroid) return;

    let listenerHandle;
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) {
        setIsLocked(true);
        runBiometricGate(setIsLocked);
      }
    }).then((handle) => {
      listenerHandle = handle;
    });

    return () => {
      if (listenerHandle) listenerHandle.remove();
    };
  }, [isAndroid]);

  // Global copy/cut/paste guard with a small whitelist
  useEffect(() => {
    const handler = (e) => {
      const allowed = e.target?.closest && e.target.closest('[data-allow-copy="true"]');
      if (!allowed) {
        e.preventDefault();
      }
    };

    document.addEventListener('copy', handler);
    document.addEventListener('cut', handler);
    document.addEventListener('paste', handler);

    return () => {
      document.removeEventListener('copy', handler);
      document.removeEventListener('cut', handler);
      document.removeEventListener('paste', handler);
    };
  }, []);

  if (isLocked) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100vh', background: '#111', color: '#fff', fontSize: '1.1rem' }}>
        Authentication required
      </div>
    );
  }

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 transition-colors duration-200 no-scrollbar">
        <DesktopSecurityGuard />
        <DeepLinkHandler />
        <AppRestrictionBanner />
        <Routes>
          <Route path="/" element={<LandingRedirect />} />
          <Route path="/my-rooms" element={<MyRooms />} /> {/* Add MyRooms route */}
          <Route path="/my-drops" element={<MyDrops />} />
          <Route path="/drop/:dropId" element={<DropPage />} />
          <Route path="/nearby" element={<NearbyTransfer />} />
          <Route path="/room/:roomCode" element={<ChatRoom />} />
          <Route path="/join" element={<Navigate to="/" replace />} />
          <Route path="/invite/:token" element={<InviteHandler />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </div>
    </Router>
  );
}

export default App;
