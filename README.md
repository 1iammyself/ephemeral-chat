## Secure Credential Setup

All sensitive credentials (ExpressTURN, Agora, Metered) are now loaded from environment variables using a `.env` file in the `client/` directory. Never commit your real `.env` to version control.

1. Copy `client/.env.example` to `client/.env` and fill in your real credentials:

   ```bash
   cp client/.env.example client/.env
   # Edit client/.env and set your real TURN and Agora credentials
   ```

2. The app will automatically use these variables at runtime. For production, set these as environment variables in your deployment environment.

3. **Do not hardcode credentials in source files.**

### Example .env

```
VITE_EXPRESS_TURN_USER=your_expressturn_user
VITE_EXPRESS_TURN_PASS=your_expressturn_pass
VITE_AGORA_APP_ID=your_agora_app_id
VITE_AGORA_TOKEN=your_agora_token
VITE_AGORA_UID=your_agora_uid
VITE_METERED_USER=your_metered_user
VITE_METERED_PASS=your_metered_pass
```

**Note:** The app will fall back to demo credentials if environment variables are not set, but you should always use your own for production.
# Hybrid Call Routing: State Machine Architecture

This project uses a sophisticated hybrid architecture for call routing:

1. **Primary Mode (P2P):** Uses WebRTC with Google STUN and ExpressTURN. Metered TURN is present but only as a redundant backup.
2. **Fallback Mode (Agora):** Uses Agora SDK for ultra-reliable, server-based calls when P2P fails or for group/poor network scenarios.

## ICE Server Configuration

The ICE server array is prioritized as follows:

```
[
   { urls: "stun:stun.l.google.com:19302" },
   { urls: "turn:free.expressturn.com:3478?transport=udp", username: "efPU52K4SLOQ34W2QY", credential: "1TJPNFxHKXrZfelz" },
   { urls: "turn:free.expressturn.com:3478?transport=tcp", username: "efPU52K4SLOQ34W2QY", credential: "1TJPNFxHKXrZfelz" },
   { urls: "turn:relay.metered.ca:80", username: "YOUR_METERED_USER", credential: "YOUR_METERED_PASS" }
]
```

## State Machine Logic

- **1-on-1 calls:** Use P2P (WebRTC) unless connection fails or is blocked, then switch to Agora.
- **Group calls (>3 participants):** Use Agora from the start.
- **Poor network (packet loss > 5%):** Auto-switch to Agora.
- **Metered TURN:** Only used if all other ICE servers fail.

## Credentials

ExpressTURN and Agora credentials are stored securely and accessed at runtime. See `client/src/utils/credentials.js` for details.

## Developer Checklist

- Update ICE server config as above.
- Remove all Metered logic except for ICE config.
- Implement participant count check before call.
- Add ICE connection state watcher.
- Add network quality monitor (packet loss).
- Implement `switchToAgora()` handover function.
- Document the state machine and failover logic.

## 🎥 Demo Video

[![Demo Video](screenshots/chatroompic.png)](https://youtu.be/gnvoWkvkkho)

Watch a quick demo of Ephemeral Chat in action!

---

## 📸 Screenshots

Here’s a sneak peek at the app interface:

<p align="center">
   <img src="screenshots/homepage_picture.png" alt="Home Screen" width="400"/>
   <img src="screenshots/join room pic.png" alt="Join Room UI" width="400"/>
</p>

## 🔒 CI/CD & Code Quality

- **GitHub Actions**: Automated workflows for building, testing, and analyzing code.
- **CodeQL**: Security analysis for JavaScript/Node.js and Java/Android code.
- **Gradle Build**: Ensures Android app builds successfully on every push.

<div align="center">
  <h1>Ephemeral Chat</h1>

  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
  [![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/cLLeB/ephemeral-chat/issues)
   [![Live Demo](https://img.shields.io/badge/🌐-Live_Demo-2ea44f)](https://chat.kyere.me/)

  <p>A secure, anonymous, and ephemeral chat application with self-destructing messages. Installable as a Progressive Web App (PWA) for native-like experience.</p>
   <p>A secure, anonymous, and ephemeral chat application with self-destructing messages. Installable as a Progressive Web App (PWA) for native-like experience. <strong>Can also be distributed as a Trusted Web Activity (TWA) for Android via the Play Store.</strong></p>

  [Report Bug](https://github.com/cLLeB/ephemeral-chat/issues) · [Request Feature](https://github.com/cLLeB/ephemeral-chat/issues/new?assignees=&labels=enhancement&template=feature_request.md&title=)
</div>

## ✨ Features

### 💬 Rich Messaging
- **Real-Time Messaging**: Lightning-fast message delivery using Socket.io
- **📞 Voice Calls**: Crystal clear peer-to-peer audio calls using WebRTC
- **🎤 Universal Voice Notes**: Record audio on any device (iOS, Android, Desktop) and play it anywhere.
    - *Technical Feat*: Server-side conversion to AAC (.m4a) ensures seamless playback on Safari and all modern browsers.
- **📸 Image Sharing**: Share images securely with view-once capability
- **Self-Destructing Messages**: Messages disappear after being read or after a set time

### 🏠 Room Management
- **Instant Room Creation**: Generate unique chat rooms instantly with 6-digit codes
- **🚪 Knock-to-Join System**: Guests enter a lobby and must be approved by the host
- **👑 Host Controls**: Room creators can approve or deny entry to pending guests
- **🔄 Host Handover**: Automatic ownership transfer if the host leaves
- **Anonymous Participation**: No accounts or personal information required
- **Auto-Cleanup**: Rooms automatically close after inactivity

### 🛡️ Security & Privacy
- **🔐 Client-Side Encryption (E2EE)**: Messages are encrypted in the browser using AES-GCM. The key is in the URL hash and never reaches the server.
- **No Message Persistence**: Messages are never stored permanently on the server
- **🔒 Password Protection**: Optional password protection for rooms
- **🤖 Bot Protection**: Integrated Proof-of-Work CAPTCHA to prevent spam
- **🛡️ Brute Force Protection**: Failed attempt tracking and automatic lockout
- **✅ Input Validation**: XSS prevention and credential sanitization

### 📱 Progressive Web App (PWA)
- **Installable**: Add to home screen on any device
- **Native Feel**: App-like experience with splash screen and theme colors
- **Offline Capable**: Core shell works offline

## 🛠️ Tech Stack


### Frontend
- **React**: UI library
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **Socket.io Client**: Real-time communication
- **WebRTC**: Peer-to-peer audio calls
- **Lucide React**: Beautiful icons

### Android Distribution
- **Trusted Web Activity (TWA)**: The project includes an `android/` directory with a Gradle project, allowing the PWA to be packaged and distributed as a native Android app on the Google Play Store.

### Backend
- **Node.js & Express**: Server runtime and framework
- **Socket.io**: Real-time event-based communication
- **FFmpeg**: Audio processing and conversion (with static binaries)
- **@cap.js**: Proof-of-Work CAPTCHA system
- **Redis** (Optional): For scaling across multiple instances

### Audio Processing
- **Universal Compatibility**: Automated conversion of WebM/Ogg (Android/Chrome) to AAC (iOS/Safari).
- **Smart Copy**: Intelligent detection of AAC inputs to avoid unnecessary re-encoding.
- **Robust Normalization**: Auto-correction of sample rates and timestamps for glitch-free playback.

### PWA
- **Vite PWA Plugin**: PWA generation and management
- **Workbox**: Service worker libraries

## 🚀 Quick Start

### Prerequisites
- Node.js (v16 or higher)
- npm (v8 or higher) or yarn
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
   Copy the existing `.env` file or create one with these settings:
   ```env
   # Server Configuration
   PORT=3001
   NODE_ENV=development

   # Security Settings (already configured)
   INACTIVITY_TIMEOUT_MINUTES=10
   MAX_FAILED_ATTEMPTS=5
   LOCKOUT_DURATION_MINUTES=10
   ROOM_CODE_SALT=your-secure-salt-here
   CAP_SECRET=your-captcha-secret-key

   # Room Settings
   ROOM_EXPIRY_MINUTES=60
   INVITE_TOKEN_EXPIRY_MINUTES=5
   MAX_MESSAGES_PER_MINUTE=30
   ```

4. **Start the development server**
   ```bash
   # Start both client and server concurrently
   npm run dev
   ```

5. **Access the application**
   - Frontend: http://localhost:5173 (Vite dev server)
   - Backend API: http://localhost:3001

## 📱 Progressive Web App (PWA)

Your chat application is a fully-featured PWA that can be installed on any device!

### Installation
1. **Open in browser** and visit the live demo
2. **Look for install prompt** in your browser's address bar
3. **Click "Install"** or "Add to Home Screen"
4. **Launch from home screen** like a native app

### PWA Features
- **Offline functionality** - Chat works without internet
- **Native app feel** - Custom splash screen and theme colors
- **Auto-updates** - Always runs the latest version
- **Fast loading** - Cached assets for instant access

##  Documentation

### User Documentation
- [User Guide](docs/USER_GUIDE.md) - Complete guide for end users

## 🤝 Contributing

Contributions are welcome! Here's how you can help:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** and test them thoroughly
4. **Commit your changes**: `git commit -m 'Add amazing feature'`
5. **Push to the branch**: `git push origin feature/amazing-feature`
6. **Open a Pull Request**

See our [Contributing Guidelines](https://github.com/cLLeB/ephemeral-chat/issues) for more details.

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.

## 📞 Contact

- **Project Link**: [https://github.com/cLLeB/ephemeral-chat](https://github.com/cLLeB/ephemeral-chat)
- **Live Demo**: [https://chat.kyere.me/](https://chat.kyere.me/)
- **Email**: kyereboatengcaleb@gmail.com

## 🙏 Acknowledgments

- [Socket.IO](https://socket.io/) for real-time communication
- [React](https://reactjs.org/) for the amazing UI framework
- [Vite](https://vitejs.dev/) for fast development experience
- [Tailwind CSS](https://tailwindcss.com/) for utility-first CSS
- [Render](https://render.com/) for hosting
- [Progressive Web Apps](https://developers.google.com/web/progressive-web-apps) for native-like web experience

---

## 🏗️ Project Structure

```
ephemeral-chat/
├── android/                  # Android TWA project (wraps the PWA for Play Store distribution)
│   ├── app/                  # Android app module
│   ├── build.gradle          # Gradle build files
│   ├── gradlew, gradlew.bat  # Gradle wrapper scripts
│   └── ...                   # Other Android/Gradle files
├── client/                   # React frontend (Vite + PWA)
│   ├── public/               # PWA assets & manifest
│   │   ├── manifest.json     # Web app manifest
│   │   ├── sw.js             # Service worker
│   │   └── *.png             # PWA icons
│   ├── src/                  # React source code
│   │   ├── components/       # Reusable UI components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API integrations
│   │   └── utils/            # Helper functions
│   ├── vite.config.js        # Vite configuration with PWA
│   └── package.json
│
├── server/                   # Express + Socket.IO backend
│   ├── auth-utils.js         # Authentication utilities
│   ├── index.js              # Server entry point
│   ├── rooms.js              # Room management
│   ├── security.js           # Security middleware
│   └── utils.js              # Utility functions
│
├── docs/                     # Documentation
│   └── USER_GUIDE.md         # User guide
│
├── .env                      # Environment variables
├── package.json              # Root dependencies
└── README.md
```

## 📱 Android TWA Distribution

This project can be distributed as a native Android app using Trusted Web Activity (TWA). The `android/` directory contains a Gradle project that wraps the PWA, allowing you to publish the app on the Google Play Store for a seamless, native-like experience.

### Building the Android App

```bash
cd android
./gradlew assembleDebug  # or assembleRelease for production
```
The output APK will be in `android/app/build/outputs/apk/`.

You can customize the TWA settings and assets in the `android/` directory as needed.

## ⚙️ Configuration

### Environment Variables
The application uses the following environment variables (see `.env` file):

```env
# Server
PORT=3001
NODE_ENV=development

# Security (REQUIRED)
INACTIVITY_TIMEOUT_MINUTES=10
MAX_FAILED_ATTEMPTS=5
LOCKOUT_DURATION_MINUTES=10
ROOM_CODE_SALT=your-secure-salt-here

# Room Settings
ROOM_EXPIRY_MINUTES=60
INVITE_TOKEN_EXPIRY_MINUTES=5
MAX_MESSAGES_PER_MINUTE=30

# Redis (optional)
# REDIS_URL=redis://localhost:6379
```

### Available Scripts
- `npm run dev`: Start development servers (client + server)
- `npm run server`: Start backend server only
- `npm run client`: Start frontend client only
- `npm run build`: Build frontend for production
- `npm start`: Start production server

## 🔧 Development

### Frontend Development
The client is built with React and Vite:

```bash
cd client
npm run dev  # Starts on http://localhost:5173
```

### Backend Development
The server uses Node.js with Express and Socket.IO:

```bash
npm run server  # Starts on http://localhost:3001
```

### API Endpoints
- `GET /` - Health check
- `POST /api/rooms` - Create room
- `GET /api/rooms/:code` - Get room info
- WebSocket events: `joinRoom`, `sendMessage`, `leaveRoom`

## 🚀 Deployment

The application is currently deployed on **Render**:

- **Frontend**: Static site deployment
- **Backend**: Web service
- **URL**: https://chat.kyere.me/

### Deployment Configuration
The deployment uses the `render.yaml` configuration for automatic builds and deployments.

---

*Built with ❤️ for privacy-focused communication*
