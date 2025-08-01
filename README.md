# Ephemeral Chat

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A secure, anonymous, and ephemeral chat application that allows users to create temporary chat rooms with self-destructing messages. Built with React, Node.js, and Socket.IO for real-time communication.

## ✨ Features

### Core Features
- 🧾 **Instant Room Creation**: Generate unique 6-digit room codes instantly
- 🪪 **Anonymous Participation**: Join with temporary nicknames, no accounts required
- ⚡ **Real-Time Messaging**: Lightning-fast message delivery using WebSockets
- 🕒 **Self-Destructing Messages**: Set custom TTL for messages
- 🧹 **Auto-Cleanup**: Rooms automatically close after period of inactivity
- 📱 **Progressive Web App**: Install on mobile devices and desktop for an app-like experience
- 📴 **Offline Support**: Basic offline functionality with service worker caching
- 🚀 **Fast Loading**: Optimized assets and caching for quick startup

### Security & Privacy
- 🔐 **Optional Room Passwords**: Add an extra layer of security
- 🛡️ **Rate Limiting**: Prevent abuse with configurable message limits
- 🔄 **No Message Persistence**: Messages are never stored on the server
- 🔒 **End-to-End Encryption**: Optional encryption for private conversations (coming soon)

## 📱 Mobile Experience

Ephemeral Chat is a Progressive Web App (PWA) that can be installed on your device for a native app-like experience.

### Install on Mobile/Desktop
1. Open Ephemeral Chat in Chrome, Edge, or Safari
2. Look for the install prompt or:
   - **Android/Chrome**: Tap the "Add to Home screen" prompt or use the browser menu
   - **iOS/Safari**: Tap the Share button and select "Add to Home Screen"
   - **Desktop/Chrome**: Click the install icon in the address bar or use the browser menu

### Offline Usage
- Basic app shell and resources are cached for offline use
- Messages will sync when you're back online
- App updates automatically when a new version is available

## 🚀 Quick Start

For detailed deployment instructions, see the [Deployment Guide](DEPLOYMENT.md).

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher) or yarn
- Redis (optional but recommended for production)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/cLLeB/ephemeral-chat.git
cd ephemeral-chat
```

2. **Install dependencies**
```bash
# Install server dependencies
npm install

# Install client dependencies
cd client
npm install
cd ..
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env file with your configuration
```

4. **Start the application**
```bash
# Development mode (with hot-reload)
npm run dev

# Production build
npm run build
npm start
```

5. **Access the application**
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### With Docker (Alternative)
```bash
docker-compose up --build
```

## 🛠 PWA Configuration

The PWA is configured with the following features:
- Service worker for offline support and caching
- Web App Manifest for installability
- Responsive design for all screen sizes
- Automatic updates when new versions are available

### Service Worker
- Caches static assets for offline use
- Implements network-first strategy for API calls
- Automatically updates when new content is available

### Web App Manifest
- Defines app name, icons, and theme colors
- Configures display mode and orientation
- Provides app-like experience when installed

## 🏗️ Project Structure

```
ephemeral-chat/
├── client/                    # React frontend
│   ├── public/               # Static assets
│   └── src/
│       ├── assets/           # Images, fonts, etc.
│       ├── components/       # Reusable UI components
│       ├── hooks/            # Custom React hooks
│       ├── services/         # API and service integrations
│       ├── utils/            # Helper functions
│       ├── App.jsx           # Main App component
│       └── main.jsx          # Entry point
│
├── server/                   # Express + Socket.IO backend
│   ├── config/              # Configuration files
│   ├── controllers/         # Request handlers
│   ├── middleware/          # Custom middleware
│   ├── models/              # Data models
│   ├── routes/              # API routes
│   ├── services/            # Business logic
│   ├── socket/              # Socket.IO handlers
│   ├── utils/               # Utility functions
│   ├── index.js             # Server entry point
│   └── package.json
│
├── .env.example            # Environment variables template
├── .gitignore
├── docker-compose.yml      # Docker configuration
├── Dockerfile             # Frontend Dockerfile
├── package.json           # Root package.json
└── README.md
```

## 📱 Usage

### For Users
1. **Create a Room**
   - Click "Create a New Room"
   - Configure room settings (password, message TTL)
   - Share the room code with others

2. **Join a Room**
   - Enter the 6-digit room code
   - Choose a nickname (anonymous)
   - Enter password if required

3. **Chat Features**
   - Send and receive messages in real-time
   - Set message expiration time
   - View active participants
   - Copy room link to clipboard

### For Developers
```javascript
// Example: Connect to a room
const socket = io('http://localhost:3001');
socket.emit('joinRoom', { room: '123456', username: 'anon' });

// Send a message
socket.emit('sendMessage', {
  room: '123456',
  message: 'Hello, World!',
  ttl: 60 // seconds
});
```

## ⚙️ Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
# Server
PORT=3001
NODE_ENV=development

# Redis (optional)
REDIS_URL=redis://localhost:6379

# Room Settings
ROOM_EXPIRY_MINUTES=30
MAX_MESSAGES_PER_MINUTE=60
MAX_ROOMS=1000
MAX_USERS_PER_ROOM=50

# Security
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=100
```

### Available Scripts
- `npm run dev`: Start development server
- `npm run build`: Create production build
- `npm start`: Start production server
- `npm test`: Run tests
- `npm run lint`: Lint code
- `npm run format`: Format code

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

## 📬 Contact

- **Email**: [kyereboatengcaleb@gmail.com](mailto:kyereboatengcaleb@gmail.com)
- **GitHub**: [cLLeB/ephemeral-chat](https://github.com/cLLeB/-ephemeral-chat/)
- **Issues**: [GitHub Issues](https://github.com/cLLeB/-ephemeral-chat/issues)

## 🤝 Acknowledgments

- Built with ❤️ using React, Node.js, and Socket.IO
- Inspired by privacy-focused chat applications
- Thanks to all contributors who helped with this project
