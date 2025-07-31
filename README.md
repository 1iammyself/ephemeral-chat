# Ephemeral Chat

Anonymous, temporary chat rooms with real-time messaging.

## Features

- 🧾 **Room Creation**: Generate unique 6-digit room codes
- 🪪 **Anonymous Join**: Users join with temporary nicknames
- 🔁 **Real-Time Chat**: Instant messaging using WebSockets
- 🕐 **Message TTL**: Messages auto-delete after set time
- 🧼 **Room Expiry**: Rooms close after inactivity
- 🔐 **Optional Security**: Room passwords and rate limiting

## Quick Start

### Prerequisites
- Node.js (v16 or higher)
- Redis (optional for enhanced features)

### Installation

1. Clone and navigate to the project:
```bash
cd ephemeral-chat
```

2. Install dependencies:
```bash
npm install
```

3. Install client dependencies:
```bash
cd client && npm install && cd ..
```

4. Start Redis (optional, for TTL and enhanced features):
```bash
redis-server
```

5. Run the application:
```bash
npm run dev
```

The server will start on http://localhost:3001 and the client on http://localhost:5173

## Project Structure

```
ephemeral-chat/
├── client/                  # React frontend
│   ├── public/
│   └── src/
│       ├── components/
│       ├── App.jsx
│       └── socket.js
├── server/                  # Express + Socket.IO backend
│   ├── index.js            # Entry point
│   ├── rooms.js            # Room management
│   └── utils.js            # Utilities
├── .env
├── package.json
└── README.md
```

## Usage

1. **Create a Room**: Click "Create a New Room" on the home page
2. **Join a Room**: Enter a 6-digit room code and your nickname
3. **Chat**: Send messages in real-time with other participants
4. **Privacy**: Messages can be set to auto-delete after specified time

## Configuration

Edit `.env` file to configure:
- `PORT`: Server port (default: 3001)
- `REDIS_URL`: Redis connection URL
- `ROOM_EXPIRY_MINUTES`: Room auto-expiry time
- `MAX_MESSAGES_PER_MINUTE`: Rate limiting

## License

MIT License
