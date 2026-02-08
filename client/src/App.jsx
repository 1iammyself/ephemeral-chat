import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './components/Home';
import ChatRoom from './components/ChatRoom';
import JoinRoomModal from './components/JoinRoomModal';
import InviteHandler from './components/InviteHandler.jsx';
import PWAHandler from './components/PWAHandler';
import MyRooms from './components/MyRooms'; // Import MyRooms component
import AndroidAppBanner from './components/AndroidAppBanner';
import DesktopSecurityGuard from './components/DesktopSecurityGuard';
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
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 transition-colors duration-200">
        <PWAHandler />
        <DesktopSecurityGuard />
        <AndroidAppBanner />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/my-rooms" element={<MyRooms />} /> {/* Add MyRooms route */}
          <Route path="/room/:roomCode" element={<ChatRoom />} />
          <Route path="/join" element={
            <Home>
              <JoinRoomModal />
            </Home>
          } />
          <Route path="/invite/:token" element={<InviteHandler />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ToastContainer />
      </div>
    </Router>
  );
}

export default App;
