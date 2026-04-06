import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './components/Home';
import ChatRoom from './components/ChatRoom';
import InviteHandler from './components/InviteHandler.jsx';
import PWAHandler from './components/PWAHandler';
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

function App() {
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

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 transition-colors duration-200 no-scrollbar">
        <PWAHandler />
        <DesktopSecurityGuard />
        <DeepLinkHandler />
        <AppRestrictionBanner />
        <Routes>
          <Route path="/" element={<Home />} />
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
