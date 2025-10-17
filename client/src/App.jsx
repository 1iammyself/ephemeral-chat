import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Home from './components/Home';
import ChatRoom from './components/ChatRoom';
import JoinRoomModal from './components/JoinRoomModal';
import InviteHandler from './components/InviteHandler.jsx';

// Simple placeholder for InstallPrompt component
const InstallPrompt = () => null;

function App() {
  // Check for service worker updates
  useEffect(() => {
    if ('serviceWorker' in navigator && import.meta.env.PROD) {
      // Check for service worker updates every time the app loads
      navigator.serviceWorker.getRegistration().then(registration => {
        if (registration) {
          registration.update().catch(error => {
            console.log('Service worker update check failed:', error);
          });
        }
      });

      // Listen for controller change (new service worker activated)
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (confirm('A new version is available. Reload to update?')) {
          window.location.reload();
        }
      });
    }
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomCode" element={<ChatRoom />} />
          <Route path="/join" element={
            <Home>
              <JoinRoomModal />
            </Home>
          } />
          <Route path="/invite/:token" element={<InviteHandler />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <InstallPrompt />
      </div>
    </Router>
  );
}

export default App;
