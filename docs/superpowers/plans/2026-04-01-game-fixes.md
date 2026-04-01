# Game Fixes: Modal-Based UI & TTL Rules

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three critical issues:
1. Hangman/Anagrams should use HTML-based modals (like Chess) instead of direct send that causes chatroom exit
2. TypingRace should be treated as a special game exception like Chess throughout room logic
3. Games should only count down TTL after reaching a terminal state (winner/loser/draw/gameOver = true)

**Architecture:**
- Create HangmanModal and AnagramModal wrappers that embed the HTML games from `/games` folder
- Add TypingRace to all Chess exception handlers in ChatRoom.jsx and GameMessage.jsx
- Modify server-side game TTL logic: only start TTL countdown when `gameData.gameOver === true`
- Games stay indefinitely until they reach terminal state, then get TTL countdown

**Tech Stack:** React, Socket.io, HTML game embeds, Tailwind CSS

---

## File Structure

**Files to Modify:**
- `client/src/components/GameMessage.jsx` — Add TypingRace to Chess exception handlers
- `client/src/components/ChatRoom.jsx` — Add TypingRace to Chess exception handlers
- `client/src/components/games/ChessModal.jsx` — Reference for modal structure
- `client/src/components/games/HangmanModal.jsx` — CREATE: Modal wrapper for Hangman HTML
- `client/src/components/games/AnagramModal.jsx` — CREATE: Modal wrapper for Anagrams HTML
- `client/src/components/games/TypingRaceModal.jsx` — CREATE: Modal wrapper for TypingRace (like Chess)
- Server game logic (backend) — Only start TTL after gameOver = true

---

## Phase 1: Create Modal Wrappers for Hangman & Anagrams

### Task 1: Create HangmanModal

**Files:**
- Create: `client/src/components/games/HangmanModal.jsx`

- [ ] **Step 1: Create HangmanModal component**

```javascript
import React from 'react';
import { X } from 'lucide-react';

const HangmanModal = ({ isOpen, onClose, message, currentUser, onHangmanGuess, onRematch, onShareResult }) => {
  if (!isOpen || !message) return null;

  const { gameData } = message;
  const currentUserId = currentUser?.id || currentUser?.socketId;
  const isSender = message.sender.socketId === currentUserId || message.sender.id === currentUserId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
        >
          <X className="w-6 h-6 text-gray-600 dark:text-gray-300" />
        </button>

        {/* Hangman game iframe or embed */}
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Hangman</h2>

          {/* Embed the HTML game directly - will need to use custom component or iframe */}
          <HangmanGameEmbed
            gameData={gameData}
            currentUserId={currentUserId}
            onGuess={(letter) => onHangmanGuess(message.id, letter)}
          />
        </div>
      </div>
    </div>
  );
};

export default HangmanModal;
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/games/HangmanModal.jsx
git commit -m "feat: create HangmanModal wrapper component"
```

---

### Task 2: Create AnagramModal

**Files:**
- Create: `client/src/components/games/AnagramModal.jsx`

- [ ] **Step 1: Create AnagramModal component**

```javascript
import React from 'react';
import { X } from 'lucide-react';

const AnagramModal = ({ isOpen, onClose, message, currentUser, onAnagramSubmit, onRematch, onShareResult }) => {
  if (!isOpen || !message) return null;

  const { gameData } = message;
  const currentUserId = currentUser?.id || currentUser?.socketId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
        >
          <X className="w-6 h-6 text-gray-600 dark:text-gray-300" />
        </button>

        {/* Anagram game content */}
        <div className="p-6">
          <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Anagrams</h2>

          {/* Embed the HTML game directly */}
          <AnagramGameEmbed
            gameData={gameData}
            currentUserId={currentUserId}
            onSubmit={(word) => onAnagramSubmit(message.id, word)}
          />
        </div>
      </div>
    </div>
  );
};

export default AnagramModal;
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/games/AnagramModal.jsx
git commit -m "feat: create AnagramModal wrapper component"
```

---

### Task 3: Create TypingRaceModal

**Files:**
- Create: `client/src/components/games/TypingRaceModal.jsx`

- [ ] **Step 1: Create TypingRaceModal component (similar to ChessModal)**

```javascript
import React from 'react';
import { X } from 'lucide-react';
import TypingRaceGame from './TypingRaceGame';

const TypingRaceModal = ({ isOpen, onClose, message, currentUser, onTypingRaceJoin, onTypingRaceStart, onTypingRaceProgress, onTypingRaceFinish, onRematch, onShareResult, roomVibe }) => {
  if (!isOpen || !message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors"
        >
          <X className="w-6 h-6 text-gray-600 dark:text-gray-300" />
        </button>

        {/* TypingRace game component */}
        <div className="p-6">
          <TypingRaceGame
            message={message}
            currentUser={currentUser}
            vibeColor={'#2563EB'}
            onTypingRaceJoin={onTypingRaceJoin}
            onTypingRaceStart={onTypingRaceStart}
            onTypingRaceProgress={onTypingRaceProgress}
            onTypingRaceFinish={onTypingRaceFinish}
            onRematch={onRematch}
            onShareResult={onShareResult}
          />
        </div>
      </div>
    </div>
  );
};

export default TypingRaceModal;
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/games/TypingRaceModal.jsx
git commit -m "feat: create TypingRaceModal wrapper (treat TypingRace like Chess)"
```

---

## Phase 2: Update ChatRoom & GameMessage to Use Modals & Handle TypingRace

### Task 4: Update ChatRoom to open modals instead of direct send

**Files:**
- Modify: `client/src/components/ChatRoom.jsx`

- [ ] **Step 1: Import the new modals**

```javascript
import HangmanModal from './games/HangmanModal';
import AnagramModal from './games/AnagramModal';
import TypingRaceModal from './games/TypingRaceModal';
```

- [ ] **Step 2: Add state for modal visibility**

Find the area where `showGameModal` is defined and add:

```javascript
const [showHangmanModal, setShowHangmanModal] = useState(false);
const [showAnagramModal, setShowAnagramModal] = useState(false);
const [showTypingRaceModal, setShowTypingRaceModal] = useState(false);
const [selectedGameMessage, setSelectedGameMessage] = useState(null);
```

- [ ] **Step 3: Modify handleSendGame to open modals instead of sending**

Update the shorthand command handlers (lines ~1935-1960) to open modals for Hangman/Anagrams/TypingRace:

```javascript
} else if (['hmg', 'hangman'].includes(gameArg)) {
  // Hangman: open modal instead of direct send
  if (selectedRecipients.length > 1) { setError('Hangman can only be played 1-on-1.'); return; }
  setShowGameModal(true);
  setInitialGameType(GAME_TYPES.HANGMAN);
  setNewMessage('');
  return;
} else if (['agm', 'anagram'].includes(gameArg)) {
  // Anagrams: open modal instead of direct send
  setShowGameModal(true);
  setInitialGameType(GAME_TYPES.ANAGRAM);
  setNewMessage('');
  return;
} else if (['trg', 'typing', 'typing-race'].includes(gameArg)) {
  // TypingRace: treat like Chess - open modal
  setShowGameModal(true);
  setInitialGameType(GAME_TYPES.TYPING_RACE);
  setNewMessage('');
  return;
```

- [ ] **Step 4: Add TypingRace to Chess exception handlers**

Find anywhere in ChatRoom that checks `gameData.gameType === 'chess'` and add TypingRace:

```javascript
// OLD: if (gameData.gameType === 'chess') { ... }
// NEW: if (gameData.gameType === 'chess' || gameData.gameType === GAME_TYPES.TYPING_RACE) { ... }
```

- [ ] **Step 5: Commit**

```bash
git add client/src/components/ChatRoom.jsx
git commit -m "refactor: open Hangman/Anagrams/TypingRace as modals instead of direct send"
```

---

### Task 5: Update GameMessage to use modals and handle TypingRace exceptions

**Files:**
- Modify: `client/src/components/GameMessage.jsx`

- [ ] **Step 1: Add TypingRace to Chess exception handlers**

Find all places where code checks `if (isChess)` or `gameData.gameType === 'chess'` and add TypingRace:

```javascript
// OLD: if (isChess) { ... }
// NEW: if (isChess || isTypingRace) { ... }
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/GameMessage.jsx
git commit -m "refactor: treat TypingRace as special game exception like Chess"
```

---

## Phase 3: Fix Game TTL Logic (Backend)

### Task 6: Update Game TTL to only count after gameOver = true

**Files:**
- Modify: Server-side game handler (likely in `server/handlers/gameHandler.js` or similar)

- [ ] **Step 1: Find game TTL logic**

Locate where games get their TTL/expiration set. Should be near where message TTL is configured.

- [ ] **Step 2: Add condition for gameOver**

Change from:
```javascript
// OLD: Set TTL immediately when game is created
message.expiresAt = Date.now() + (gameTTL * 1000);
```

To:
```javascript
// NEW: Only set expiration when game reaches terminal state
if (gameData.gameOver) {
  // Game is finished, start TTL countdown
  message.expiresAt = Date.now() + (gameTTL * 1000);
} else {
  // Game in progress, no expiration yet
  message.expiresAt = null;
}
```

- [ ] **Step 3: Update game state handler**

When game state changes (move made, round completed, etc.), check if game is over and set TTL:

```javascript
// When processing game updates:
if (updatedGameData.gameOver || updatedGameData.winner || updatedGameData.result) {
  message.expiresAt = Date.now() + (GAME_CONFIG[gameType]?.ttl * 1000);
}
```

- [ ] **Step 4: Commit**

```bash
git add server/handlers/gameHandler.js
git commit -m "fix: only start game TTL countdown after game reaches terminal state (gameOver)"
```

---

## Phase 4: Test & Verify

### Task 7: End-to-End Testing

- [ ] **Step 1: Test Hangman flow**

- Type `/hmg` in ChatRoom
- Should open modal (not send immediately)
- Configure difficulty/word
- Click send from modal
- Game should appear in chat
- Game should NOT expire until complete

- [ ] **Step 2: Test Anagrams flow**

- Type `/agm`
- Should open modal
- Configure difficulty/rounds
- Click send
- Game should appear in chat
- Should NOT expire until complete

- [ ] **Step 3: Test TypingRace flow**

- Type `/trg`
- Should open modal (like Chess)
- Configure text/difficulty
- Click send
- Game should appear in chat as modal (like Chess)
- Should NOT expire until status = finished

- [ ] **Step 4: Test TTL rule**

- Send a game
- Don't finish it
- Observe: game stays in chat beyond normal TTL
- Finish the game
- Observe: game now has TTL countdown visible (if room shows it)

- [ ] **Step 5: Commit**

```bash
git add --all
git commit -m "test: verify modal-based games and TTL rule changes"
```

---

## Summary

**What this fixes:**

1. ✅ **Hangman/Anagrams no longer exit chatroom** - Use modals like Chess
2. ✅ **TypingRace treated as special game** - Added to all Chess exception handlers
3. ✅ **Games stay indefinitely until over** - TTL only starts when gameOver = true

**Total commits: 7**
- Phase 1: 3 commits (HangmanModal, AnagramModal, TypingRaceModal)
- Phase 2: 2 commits (ChatRoom updates, GameMessage updates)
- Phase 3: 1 commit (Server TTL logic)
- Phase 4: 1 commit (Testing verification)

---
