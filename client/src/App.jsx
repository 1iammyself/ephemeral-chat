import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import ChatRoom from './components/ChatRoom';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomCode" element={<ChatRoom />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
