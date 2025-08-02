<div align="center">
  <h1>Ephemeral Chat</h1>
  
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](docs/CONTRIBUTING.md)
  [![GitHub stars](https://img.shields.io/github/stars/cLLeB/ephemeral-chat?style=social)](https://github.com/cLLeB/ephemeral-chat/stargazers)
  [![Live Demo](https://img.shields.io/badge/🌐-Live_Demo-2ea44f)](https://ephemeral-chat-7j66.onrender.com/)

  <p>A secure, anonymous, and ephemeral chat application with self-destructing messages.</p>
  
  [Explore the Docs](https://github.com/cLLeB/ephemeral-chat#readme) ·
  [Report Bug](https://github.com/cLLeB/ephemeral-chat/issues) ·
  [Request Feature](https://github.com/cLLeB/ephemeral-chat/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=)
</div>

## ✨ Features

### Core Features
- **Instant Room Creation**: Generate unique chat rooms instantly
- **Anonymous Participation**: No accounts or personal information required
- **Real-Time Messaging**: Lightning-fast message delivery using WebSockets
- **Self-Destructing Messages**: Messages disappear after being read
- **Auto-Cleanup**: Rooms automatically close after inactivity
- **Cross-Platform**: Works on web, mobile, and desktop

### Security & Privacy
- **End-to-End Encryption**: Secure message transmission
- **No Message Persistence**: Messages are never stored on the server
- **Rate Limiting**: Prevents abuse and spam
- **Secure Room Links**: Unique, unguessable room URLs

## 🚀 Quick Start

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher) or yarn
- (Optional) Redis for production deployments

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/cLLeB/ephemeral-chat.git
   cd ephemeral-chat
   ```

2. **Install dependencies**
   ```bash
   # Install root dependencies
   npm install
   
   # Install client dependencies
   cd client && npm install && cd ..
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory:
   ```env
   PORT=3001
   NODE_ENV=development
   CLIENT_URL=http://localhost:3000
   ```

4. **Start the development server**
   ```bash
   # Start both client and server
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:3001

## 📚 Documentation

- [User Guide](docs/USER_GUIDE.md) - Complete guide for end users
- [Deployment Guide](docs/DEPLOYMENT.md) - How to deploy to production
- [Mobile Build Guide](docs/MOBILE_BUILD_GUIDE.md) - Building the Android app
- [Contributing Guide](docs/CONTRIBUTING.md) - How to contribute to the project
- [Code of Conduct](docs/CODE_OF_CONDUCT.md) - Community guidelines
- [API Documentation](docs/API.md) - API reference (coming soon)

## 🛠 Built With

- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: Node.js, Express, Socket.IO
- **Mobile**: Progressive Web App (PWA)
- **Deployment**: Render, Docker

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

See our [Contributing Guide](docs/CONTRIBUTING.md) for detailed information on how to contribute.

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

## 📞 Contact

- **Project Link**: [https://github.com/cLLeB/ephemeral-chat](https://github.com/cLLeB/ephemeral-chat)
- **Live Demo**: [https://ephemeral-chat-7j66.onrender.com/](https://ephemeral-chat-7j66.onrender.com/)

## 🙏 Acknowledgments

- [Socket.IO](https://socket.io/) for real-time communication
- [Vite](https://vitejs.dev/) for fast development experience
- [Tailwind CSS](https://tailwindcss.com/) for utility-first CSS
- [Render](https://render.com/) for hosting

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
