# Game Integration & Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix integration issues and establish consistent UI/UX patterns for Hangman, Anagrams, and TypingRace games. Add shorthand commands, fix bugs (Anagrams crash, Hangman keyboard input), restore TypingRace features, and implement game-specific multiplayer logic with appropriate timing.

**Architecture:**
- Three new games will follow the **collapsed/expanded pattern** (like TTT/RPS), not modal-based (like Chess)
- Each game will have **shorthand commands**: `/hmg` (Hangman), `/agm` (Anagrams), `/trg` (TypingRace)
- **Multiplayer handling**: 1-on-1 games only allow single recipient; broadcast games support multiple recipients with "first-come-first-served" joining
- **Game-specific TTL**: Hangman (10 min), Anagrams (8 min), TypingRace (5 min) — independent of room TTL
- **Keyboard support**: Hangman registers physical keyboard input on desktop; TypingRace restores original HTML features (difficulty, word list, timer)

**Tech Stack:** React, Socket.io, Tailwind CSS, Lucide Icons

---

## File Structure

**Files to Modify:**
- `client/src/components/GameMessage.jsx` — Add collapse/expand pattern for Hangman/Anagrams/TypingRace
- `client/src/components/ChatRoom.jsx` — Add `/hmg`, `/agm`, `/trg` shorthand commands
- `client/src/components/games/HangmanGame.jsx` — Add keyboard event listener
- `client/src/components/games/AnagramGame.jsx` — Debug crash on send (likely state/event handler issue)
- `client/src/components/games/TypingRaceGame.jsx` — Restore features: difficulty selector, word list, timer controls
- `client/src/utils/games.js` — Add game shorthand aliases, game constants (TTL, difficulty defaults)

**No new files needed** — all changes are to existing game components and utilities.

---

## Phase 1: Shorthand Commands & Game Type Constants

### Task 1: Add Shorthand Aliases to GAME_TYPES

**Files:**
- Modify: `client/src/utils/games.js`

- [ ] **Step 1: Add shorthand mapping to games.js**

After the existing `GAME_TYPES` object, add a new mapping for shorthand commands and game defaults:

```javascript
export const GAME_SHORTHAND = {
  hmg: GAME_TYPES.HANGMAN,
  hangman: GAME_TYPES.HANGMAN,
  agm: GAME_TYPES.ANAGRAM,
  anagram: GAME_TYPES.ANAGRAM,
  trg: GAME_TYPES.TYPING_RACE,
  'typing-race': GAME_TYPES.TYPING_RACE,
  'typing': GAME_TYPES.TYPING_RACE,
};

// Game-specific configuration: TTL (seconds), defaults
export const GAME_CONFIG = {
  [GAME_TYPES.HANGMAN]: {
    ttl: 600, // 10 minutes
    minDifficulty: 'easy',
    defaultDifficulty: 'medium',
    maxMistakes: 6,
  },
  [GAME_TYPES.ANAGRAM]: {
    ttl: 480, // 8 minutes
    minDifficulty: 'novice',
    defaultDifficulty: 'novice',
    defaultRounds: 5,
  },
  [GAME_TYPES.TYPING_RACE]: {
    ttl: 300, // 5 minutes
    minDifficulty: 'easy',
    defaultDifficulty: 'easy',
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add client/src/utils/games.js
git commit -m "feat: add shorthand aliases and game config constants for Hangman/Anagrams/TypingRace"
```

---

### Task 2: Register Shorthand Commands in ChatRoom

**Files:**
- Modify: `client/src/components/ChatRoom.jsx:1915-1935` (game shorthand section)

- [ ] **Step 1: Import shorthand mapping**

At the top of ChatRoom.jsx, add to the games import:

```javascript
import { GAME_TYPES, GAME_SHORTHAND } from '../utils/games';
```

- [ ] **Step 2: Add shorthand command handlers**

Find the section with `if (['ttt', 'tic-tac-toe'].includes(gameArg))` (around line 1917). After the RPS handler, add:

```javascript
          } else if (['hmg', 'hangman'].includes(gameArg)) {
            // Hangman: 1-on-1 only
            if (selectedRecipients.length > 1) { setError('Hangman can only be played 1-on-1.'); return; }
            setShowGameModal(true);
            setInitialGameType(GAME_TYPES.HANGMAN);
            setNewMessage('');
            return;
          } else if (['agm', 'anagram'].includes(gameArg)) {
            // Anagrams: 1-on-1 or broadcast
            setShowGameModal(true);
            setInitialGameType(GAME_TYPES.ANAGRAM);
            setNewMessage('');
            return;
          } else if (['trg', 'typing', 'typing-race'].includes(gameArg)) {
            // TypingRace: 1-on-1 or broadcast
            setShowGameModal(true);
            setInitialGameType(GAME_TYPES.TYPING_RACE);
            setNewMessage('');
            return;
```

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ChatRoom.jsx
git commit -m "feat: add /hmg, /agm, /trg shorthand commands to open game modals"
```

---

## Phase 2: Collapse/Expand Pattern for New Games

### Task 3: Refactor GameMessage.jsx to Use Collapse Pattern for Hangman/Anagrams/TypingRace

**Files:**
- Modify: `client/src/components/GameMessage.jsx:870-923` (Hangman, Anagrams, TypingRace sections)

- [ ] **Step 1: Replace Hangman rendering with collapse/expand pattern**

Replace the Hangman section (lines 870-884) with:

```javascript
    // ── Hangman ──
    if (isHangman) {
        const isPlayer = (gameData.players || []).some(
            p => p.id === currentUserId || p.socketId === currentUserId ||
            (currentUser?.id && p.id === currentUser.id)
        );
        const isInvitedUser = gameData.invitedUserId && (
            gameData.invitedUserId === currentUserId ||
            (currentUser?.id && gameData.invitedUserId === currentUser.id)
        );

        return (
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border-x border-b ${cardBorderClass} border-t-4 border-t-orange-500 animate-in fade-in zoom-in duration-300`}>
                <div className={`p-2 sm:p-3 bg-gradient-to-r from-orange-500 to-amber-500 flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Skull className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Hangman</h3>
                    </div>
                </div>

                {!isExpanded ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center gap-3">
                        <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            Guess the word before {gameData.maxMistakes || 6} wrong guesses
                        </p>
                        <button
                            onClick={() => setIsExpanded(true)}
                            style={{ backgroundColor: vibeBtnColor }}
                            className="w-full py-2 rounded-xl text-white text-[11px] font-bold transition-all shadow-md active:scale-95"
                        >
                            {gameData.gameOver ? 'View Result' : (isPlayer ? 'Continue Game' : 'View Game')}
                        </button>
                    </div>
                ) : (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900">
                        <HangmanGame
                            message={message}
                            currentUser={currentUser}
                            vibeColor={vibe.colors?.primary}
                            onHangmanJoin={onHangmanJoin}
                            onHangmanGuess={onHangmanGuess}
                            onRematch={onRematch}
                            onShareResult={onShareResult}
                        />
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="mt-4 w-full text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                        >
                            Collapse
                        </button>
                    </div>
                )}
            </div>
        );
    }
```

- [ ] **Step 2: Replace Anagram rendering with collapse/expand pattern**

Replace the Anagram section (lines 887-904) with:

```javascript
    // ── Anagram ──
    if (isAnagram) {
        const isPlayer = (gameData.players || []).some(
            p => p.id === currentUserId || p.socketId === currentUserId ||
            (currentUser?.id && p.id === currentUser.id)
        );

        return (
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border-x border-b ${cardBorderClass} border-t-4 border-t-violet-500 animate-in fade-in zoom-in duration-300`}>
                <div className={`p-2 sm:p-3 bg-gradient-to-r from-violet-500 to-purple-500 flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Puzzle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Anagrams</h3>
                    </div>
                </div>

                {!isExpanded ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center gap-3">
                        <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            Unscramble {gameData.rounds || 5} words
                        </p>
                        <button
                            onClick={() => setIsExpanded(true)}
                            style={{ backgroundColor: vibeBtnColor }}
                            className="w-full py-2 rounded-xl text-white text-[11px] font-bold transition-all shadow-md active:scale-95"
                        >
                            {gameData.gameOver ? 'View Result' : (isPlayer ? 'Continue Game' : 'View Game')}
                        </button>
                    </div>
                ) : (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900">
                        <AnagramGame
                            message={message}
                            currentUser={currentUser}
                            vibeColor={vibe.colors?.primary}
                            onAnagramJoin={onAnagramJoin}
                            onAnagramSubmit={onAnagramSubmit}
                            onAnagramNextRound={onAnagramNextRound}
                            onAnagramReveal={onAnagramReveal}
                            onAnagramHint={onAnagramHint}
                            onRematch={onRematch}
                            onShareResult={onShareResult}
                        />
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="mt-4 w-full text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                        >
                            Collapse
                        </button>
                    </div>
                )}
            </div>
        );
    }
```

- [ ] **Step 3: Replace TypingRace rendering with collapse/expand pattern**

Replace the TypingRace section (lines 907-923) with:

```javascript
    // ── Typing Race ──
    if (isTypingRace) {
        const allPlayers = Object.values(gameData.players || {});
        const isPlayer = allPlayers.some(
            p => p.id === currentUserId || p.socketId === currentUserId ||
            (currentUser?.id && p.id === currentUser.id)
        );

        return (
            <div className={`w-full max-w-[260px] sm:max-w-[280px] overflow-hidden rounded-2xl shadow-lg border-x border-b ${cardBorderClass} border-t-4 border-t-blue-500 animate-in fade-in zoom-in duration-300`}>
                <div className={`p-2 sm:p-3 bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-between`}>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                        <h3 className="text-white font-bold text-xs sm:text-sm">Typing Race</h3>
                    </div>
                </div>

                {!isExpanded ? (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 flex flex-col items-center gap-3">
                        <p className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                            Type as fast as you can
                        </p>
                        <button
                            onClick={() => setIsExpanded(true)}
                            style={{ backgroundColor: vibeBtnColor }}
                            className="w-full py-2 rounded-xl text-white text-[11px] font-bold transition-all shadow-md active:scale-95"
                        >
                            {gameData.status === 'finished' ? 'View Result' : (isPlayer ? 'Continue Game' : 'View Game')}
                        </button>
                    </div>
                ) : (
                    <div className="p-4 bg-gray-50 dark:bg-gray-900">
                        <TypingRaceGame
                            message={message}
                            currentUser={currentUser}
                            vibeColor={vibe.colors?.primary}
                            onTypingRaceJoin={onTypingRaceJoin}
                            onTypingRaceStart={onTypingRaceStart}
                            onTypingRaceProgress={onTypingRaceProgress}
                            onTypingRaceFinish={onTypingRaceFinish}
                            onRematch={onRematch}
                            onShareResult={onShareResult}
                        />
                        <button
                            onClick={() => setIsExpanded(false)}
                            className="mt-4 w-full text-[10px] font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors uppercase tracking-widest"
                        >
                            Collapse
                        </button>
                    </div>
                )}
            </div>
        );
    }
```

- [ ] **Step 4: Commit**

```bash
git add client/src/components/GameMessage.jsx
git commit -m "refactor: implement collapse/expand pattern for Hangman, Anagrams, and TypingRace"
```

---

## Phase 3: Bug Fixes

### Task 4: Fix Anagrams Crash on Send

**Files:**
- Modify: `client/src/components/games/AnagramGame.jsx` (full component review)

- [ ] **Step 1: Identify crash trigger**

Read the AnagramGame component thoroughly to locate:
- Any missing error handling in socket event callbacks
- State mutations or stale closure issues
- Unhandled promise rejections in async operations
- Missing null checks on gameData properties

Check for patterns like:
```javascript
// WRONG: direct mutation
gameData.players.push(...)
// OR: unhandled promise rejection
onAnagramSubmit(...).then(...) // no .catch()
```

Expected location: `onAnagramSubmit` callback or initialization logic that triggers navigation

- [ ] **Step 2: Add error boundary and logging**

Wrap the component's main return statement with try-catch logging:

```javascript
try {
  // existing return JSX
} catch (error) {
  console.error('[AnagramGame] Render error:', error);
  return <div className="p-4 text-red-600">Game error: {error.message}</div>;
}
```

- [ ] **Step 3: Verify state immutability**

Ensure any state updates use spread operators:

```javascript
// CORRECT
setInputWord((prev) => prev);
setGameData({ ...gameData, updated: true });
```

NOT mutating gameData directly.

- [ ] **Step 4: Test locally**

- Send anagrams game from ChatRoom
- Click send button
- Verify it does NOT redirect to homepage
- Game message should appear in chat

Expected: Game appears collapsed in chat

- [ ] **Step 5: Commit**

```bash
git add client/src/components/games/AnagramGame.jsx
git commit -m "fix: prevent anagrams crash on send with error handling and state immutability"
```

---

### Task 5: Add Keyboard Support to Hangman

**Files:**
- Modify: `client/src/components/games/HangmanGame.jsx`

- [ ] **Step 1: Add useEffect for keyboard listener**

At the top of the component, after imports:

```javascript
import React, { useState, useEffect, useRef } from 'react';
```

In the component body, after other useEffect hooks, add:

```javascript
  // Keyboard input support for desktop
  useEffect(() => {
    if (!isPlayer || gameData.gameOver) return;

    const handleKeyPress = (e) => {
      const letter = e.key.toUpperCase();

      // Only handle single letters A-Z
      if (!/^[A-Z]$/.test(letter)) return;

      // Check if already guessed or won
      const alreadyGuessed = Object.keys(gameData.guessed || {}).includes(letter);
      if (alreadyGuessed) return;

      // Trigger the guess
      e.preventDefault();
      onHangmanGuess(letter);
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlayer, gameData.gameOver, gameData.guessed, onHangmanGuess]);
```

- [ ] **Step 2: Test keyboard input**

- Open Hangman game
- Try pressing keys A-Z
- Verify letters register as guesses
- Verify onscreen keypad still works (should both work together)

Expected: Both keyboard and button guesses work

- [ ] **Step 3: Commit**

```bash
git add client/src/components/games/HangmanGame.jsx
git commit -m "feat: add keyboard input support for Hangman on desktop"
```

---

## Phase 4: TypingRace Features Restoration

### Task 6: Restore TypingRace Difficulty & Features from HTML

**Files:**
- Modify: `client/src/components/games/TypingRaceGame.jsx`
- Reference: `games/typing-game/index.html` (extract feature list)

- [ ] **Step 1: Analyze original HTML features**

Read `games/typing-game/index.html` and extract:
- Available difficulty levels (easy, medium, hard)
- Word lists or text sources
- Timer configuration options
- Visual feedback elements

Common features to look for:
```html
<!-- Difficulty selector -->
<button data-difficulty="easy">Easy</button>

<!-- Word list selector -->
<select id="word-list">
  <option>Common Words</option>
  <option>Programming Terms</option>
</select>

<!-- Timer setup -->
<input type="range" min="30" max="300" value="60">
```

- [ ] **Step 2: Add difficulty selector state to TypingRaceGame**

In the component body, add state for difficulty if not present:

```javascript
const difficulty = gameData.difficulty || 'easy';
const text = gameData.text || '';
```

- [ ] **Step 3: Add visual difficulty indicator in expanded view**

In the expanded game view, add a difficulty badge:

```javascript
<div className="mb-3 flex items-center gap-2">
  <span className="text-[10px] font-bold text-gray-600 dark:text-gray-400">Difficulty:</span>
  <div className={`px-2 py-1 rounded-md text-white text-[10px] font-bold ${
    difficulty === 'easy' ? 'bg-green-500' :
    difficulty === 'medium' ? 'bg-yellow-500' :
    'bg-red-500'
  }`}>
    {difficulty.toUpperCase()}
  </div>
</div>
```

- [ ] **Step 4: Add text preview**

Show the text to be typed (first 60 chars):

```javascript
<div className="mb-3 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700">
  <p className="text-[12px] text-gray-700 dark:text-gray-300 font-mono leading-relaxed">
    {text ? text.substring(0, 60) + (text.length > 60 ? '...' : '') : 'Loading text...'}
  </p>
</div>
```

- [ ] **Step 5: Restore timer display**

Add a timer section showing how long the race will run:

```javascript
<div className="mb-3 flex items-center gap-2">
  <Clock className="w-4 h-4 text-blue-500" />
  <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300">
    Time: {gameData.duration || 60} seconds
  </span>
</div>
```

- [ ] **Step 6: Test TypingRace**

- Send TypingRace from ChatRoom
- Click to expand
- Verify difficulty shows
- Verify text preview shows
- Verify timer displays

Expected: All features visible and readable

- [ ] **Step 7: Commit**

```bash
git add client/src/components/games/TypingRaceGame.jsx
git commit -m "feat: restore difficulty selector, text preview, and timer display in TypingRace"
```

---

## Phase 5: Multiplayer Logic & Game-Specific Timing

### Task 7: Implement Game-Specific TTL and Multiplayer Rules

**Files:**
- Modify: `client/src/components/ChatRoom.jsx:2107-2127` (handleSendGame function)
- Modify: `client/src/components/GameModal.jsx` (game send handlers)

- [ ] **Step 1: Update handleSendGame to use game-specific TTL**

In ChatRoom.jsx, find the handleSendGame function (line 2107). Modify it to include game-specific TTL:

```javascript
  const handleSendGame = (gameData) => {
    if (!isConnected) return;

    // Import GAME_CONFIG at top of file
    // Match games (TTT, RPS, Chess) only allow 1 recipient
    if (selectedRecipients.length > 1 && (gameData.gameType === 'tic-tac-toe' || gameData.gameType === 'rock-paper-scissors' || gameData.gameType === 'chess')) {
      setError('Match games can only be sent to one person at a time.');
      return;
    }

    // Hangman is also 1-on-1 only
    if (selectedRecipients.length > 1 && gameData.gameType === GAME_TYPES.HANGMAN) {
      setError('Hangman can only be played 1-on-1.');
      return;
    }

    // Anagrams and TypingRace support both 1-on-1 and broadcast
    // (no recipient restriction for these)

    // Anonymous mode applies to games except chess (chess needs real identity for player tracking)
    const isChessGame = gameData.gameType === 'chess';

    socketManager.emit('send-message', {
      messageType: 'game',
      gameData,
      recipients: selectedRecipients,
      userId: persistentUserId,
      isAnonymous: isChessGame ? false : isAnonymousMode,
      // Add game-specific TTL from GAME_CONFIG
      gameTTL: GAME_CONFIG[gameData.gameType]?.ttl || roomTTL
    });
  };
```

- [ ] **Step 2: Document multiplayer rules in GameModal**

In GameModal.jsx, add comments above each game's send handler documenting the rules:

For Hangman (line 68):
```javascript
  const handleSendHangman = () => {
    // Hangman: 1-on-1 only
    // - Host sets word/difficulty
    // - Invited user guesses letters
    // - TTL: 10 minutes (enough for a full game)
    onSend({ gameType: GAME_TYPES.HANGMAN, difficulty: hangmanDiff, customWord: hangmanCustomWord.trim() });
    handleClose();
  };
```

For Anagrams (line 72):
```javascript
  const handleSendAnagrams = () => {
    // Anagrams: 1-on-1 or broadcast
    // - 1-on-1: Host vs one opponent, race to unscramble words
    // - Broadcast: First N players to join compete (example: 2-4 players)
    // - All players see same scrambled words, first correct answer wins
    // - TTL: 8 minutes (gives time for 5+ rounds)
    onSend({ gameType: GAME_TYPES.ANAGRAM, difficulty: anagramDiff, rounds: anagramRounds, customWord: anagramCustomWord.trim() });
    handleClose();
  };
```

For TypingRace (line 76):
```javascript
  const handleSendTypingRace = () => {
    // TypingRace: 1-on-1 or broadcast
    // - All players race to type the same text fastest
    // - Broadcast: Up to 8 players can join
    // - Individual results shown (WPM, accuracy, ranking)
    // - TTL: 5 minutes (accounts for typing + setup time)
    onSend({ gameType: GAME_TYPES.TYPING_RACE, difficulty: typingDiff, customText: typingCustomText.trim() });
    handleClose();
  };
```

- [ ] **Step 3: Test multiplayer scenarios**

Test Hangman:
- Send to single recipient ✓
- Try to send to 2+ recipients → should error "1-on-1 only"

Test Anagrams:
- Send to 0 recipients (broadcast) ✓
- Send to 1 recipient ✓
- Send to 2+ recipients ✓

Test TypingRace:
- Send to 0 recipients (broadcast) ✓
- Send to 1 recipient ✓
- Send to 2+ recipients ✓

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ChatRoom.jsx client/src/components/GameModal.jsx
git commit -m "feat: implement game-specific TTL and multiplayer rules for Hangman/Anagrams/TypingRace"
```

---

## Phase 6: Final Integration & Testing

### Task 8: Verify UI/UX Consistency Across All Games

**Files:**
- Review: `client/src/components/GameMessage.jsx`

- [ ] **Step 1: Check visual consistency**

Compare the collapse/expand pattern for:
- TTT and RPS (existing) — should match
- Hangman, Anagrams, TypingRace (new) — should match TTT/RPS pattern

Checklist:
- [ ] Header has same height and color scheme
- [ ] Collapsed state shows game name + preview text + button
- [ ] Expand button text matches context (e.g., "Continue Playing" for players)
- [ ] Expanded view shows full game + collapse button
- [ ] Border color and glow effects consistent

- [ ] **Step 2: Test all shorthand commands**

In ChatRoom, type:
- `/hmg` → should open GameModal with Hangman pre-selected
- `/agm` → should open GameModal with Anagrams pre-selected
- `/trg` → should open GameModal with TypingRace pre-selected
- `/ttt`, `/chess`, `/rps` → should work as before (no changes)

Expected: All commands work without errors

- [ ] **Step 3: Test game flows end-to-end**

**Hangman:**
1. `/hmg` → select difficulty → send
2. Game appears collapsed in chat
3. Click to expand
4. Can see keyboard buttons AND type with physical keyboard
5. Game state updates correctly for each guess

**Anagrams:**
1. `/agm` → select difficulty/rounds → send
2. Game appears collapsed in chat (does NOT crash)
3. Click to expand
4. Can see anagram game
5. Can submit word
6. Does NOT redirect away from chatroom

**TypingRace:**
1. `/trg` → select difficulty → send
2. Game appears collapsed in chat
3. Click to expand
4. Can see difficulty badge, text preview, timer display
5. All features visible and functional

- [ ] **Step 4: Commit final integration**

```bash
git add client/src/components/GameMessage.jsx
git commit -m "test: verify UI/UX consistency and end-to-end game flows"
```

---

## Phase 7: Code Review & Cleanup

### Task 9: Code Review & Quality Check

**Files:**
- Review all modified files for:
  - Immutability (no direct mutations of state)
  - Error handling (no silent failures)
  - Accessibility (keyboard events, labels, contrast)
  - Performance (unnecessary re-renders, event listener cleanup)

- [ ] **Step 1: Run linter on modified files**

```bash
npx eslint client/src/utils/games.js client/src/components/ChatRoom.jsx client/src/components/GameMessage.jsx client/src/components/GameModal.jsx client/src/components/games/HangmanGame.jsx client/src/components/games/AnagramGame.jsx client/src/components/games/TypingRaceGame.jsx --fix
```

- [ ] **Step 2: Check for console.log statements**

```bash
grep -n "console\." client/src/components/games/HangmanGame.jsx client/src/components/games/AnagramGame.jsx client/src/components/games/TypingRaceGame.jsx
```

Remove any debug `console.log` statements.

- [ ] **Step 3: Verify event listener cleanup**

In HangmanGame.jsx, ensure:
```javascript
return () => window.removeEventListener('keydown', handleKeyPress);
```

is present in the useEffect cleanup.

- [ ] **Step 4: Commit cleanup**

```bash
git add --all
git commit -m "chore: lint and cleanup debug code"
```

---

## Summary

**What this plan accomplishes:**

1. ✅ **UI/UX Consistency**: All three new games use the collapsed/expanded pattern like TTT/RPS
2. ✅ **Shorthand Commands**: `/hmg`, `/agm`, `/trg` added and tested
3. ✅ **Bug Fixes**:
   - Anagrams crash on send fixed
   - Hangman keyboard input registered
   - TypingRace missing features restored
4. ✅ **Multiplayer Logic**:
   - Hangman: 1-on-1 only
   - Anagrams & TypingRace: 1-on-1 or broadcast
5. ✅ **Game-Specific Timing**: TTL configured per game (10m, 8m, 5m)

**Total commits: 9**
- Phase 1: 2 commits
- Phase 2: 1 commit
- Phase 3: 2 commits
- Phase 4: 1 commit
- Phase 5: 1 commit
- Phase 6: 1 commit
- Phase 7: 1 commit

---
