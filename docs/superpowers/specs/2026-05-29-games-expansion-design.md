# Games Expansion Design
**Date:** 2026-05-29

## Overview

Add 6 new games to ephemeral-chat: Tic-Tac-Toe, Connect Four, Snake, 2048, Checkers, Rock-Paper-Scissors. All games follow the existing Chess/Tetris architecture pattern (Panel + Message components, socket events, gameData in message, FloatingPanel). All games are vibe/theme-aware.

---

## Architecture Pattern (same as Chess/Tetris)

```
SlashCommand → emit 'send-message' (messageType: 'game', gameData)
  → Message card in chat (XxxMessage.jsx)
  → Click "Open/Join" → FloatingPanel with XxxPanel.jsx
  → Panel emits socket events → server updates gameData → re-renders
```

**New files per game:**
- `client/src/components/games/XxxEngine.js` — game logic / AI
- `client/src/components/XxxPanel.jsx` — FloatingPanel content
- `client/src/components/XxxMessage.jsx` — chat card

**Server:** `server/index.js` gets socket handlers for each game (same pattern as chess/tetris handlers).

---

## Targeting: Broadcast vs Private

**Default:** broadcast (same as now — game card appears for whole room).

**Private invite:** User can optionally `@mention` specific users before sending, e.g. `/ttt @alice @bob`. The game card is then only shown to those users + the sender (filtered in MessageList render).

`gameData` gains two fields:
```js
{ inviteOnly: boolean, invitedUsers: string[] /* userIds */ }
```

MessageList already renders per-message; just add a visibility check: if `inviteOnly`, only render for `userId in invitedUsers`.

---

## Games

### 1. Tic-Tac-Toe (`/ttt`)
- **Multiplayer:** 2 active players + queue rotation (like Chess). Spectators watch live.
- **Solo/CPU:** vs CPU — easy (random), medium (blocks wins), hard (minimax, unbeatable).
- **Board:** 3×3, styled with vibe `boardColors` as cell background.
- **Extra features:** Win line highlight animation, draw detection, rematch button, score tracker across rounds.
- **Socket events:** `ttt-move`, `ttt-move-made`, `ttt-game-over`, `ttt-rematch`, `ttt-join`.

### 2. Connect Four (`/c4`)
- **Multiplayer:** 2 active + queue rotation. Spectators watch.
- **Solo/CPU:** vs CPU — easy (random column), medium (blocks/wins 1-ply), hard (minimax depth 6).
- **Board:** 6×7 grid, disc drop animation. Player colors drawn from vibe accent palette.
- **Extra features:** Winning-4 highlight, column hover preview, rematch, score tracker.
- **Socket events:** `c4-drop`, `c4-drop-made`, `c4-game-over`, `c4-rematch`, `c4-join`.

### 3. Snake (`/snake`)
- **Multiplayer:** Race mode — all room members play simultaneously on the same grid dimensions but independent boards. Live score ticker shows everyone's current score. First to reach target score (or last alive) wins.
- **Solo:** Classic endless snake — just grow and survive, no win condition.
- **Controls:** Arrow keys / WASD / swipe (mobile).
- **Extra features:** Countdown start sync for multiplayer, ghost overlay of opponent scores, speed increases per level, power-up food (speed boost, score multiplier) spawns at same position for all.
- **Socket events:** `snake-ready`, `snake-score-update`, `snake-died`, `snake-winner`.
- **Note:** Snake board state is NOT synced frame-by-frame (too expensive). Only score/status synced.

### 4. 2048 (`/2048`)
- **Multiplayer:** Race mode — everyone plays the same starting seed simultaneously. First to reach 2048 tile (or highest tile when time limit expires) wins. Live leaderboard shows current best tile per player.
- **Solo:** Endless classic 2048, no opponents, no time limit.
- **Extra features:** Shared seed for fair race, 3-min timer in multiplayer, undo (solo only), animated tile merges, best score persistence (localStorage).
- **Socket events:** `2048-ready`, `2048-score-update`, `2048-reached-2048`, `2048-time-up`.
- **Note:** Tile state is NOT synced — only scores/milestones. Each player runs locally.

### 5. Checkers (`/checkers`)
- **Multiplayer:** 2 active + queue rotation (mirrors Chess exactly). Spectators watch.
- **Solo/CPU:** vs CPU — easy (random legal move), medium (greedy capture), hard (minimax depth 6 with king value heuristic).
- **Board:** 8×8, uses same vibe `boardColors` as Chess. Piece colors derived from vibe primary.
- **Extra features:** Forced capture enforcement, king promotion animation, multi-jump highlighting, move history, rematch, tag-out (same as Chess).
- **Socket events:** `checkers-move`, `checkers-move-made`, `checkers-game-over`, `checkers-rematch`, `checkers-join`.

### 6. Rock-Paper-Scissors (`/rps`)
- **Multiplayer:** All room members (up to the room limit) play simultaneously. Each round everyone secretly picks; all picks revealed at once. Points awarded per round (win=1, tie=0.5). 5-round match. Leaderboard shown after each reveal.
- **Solo/CPU:** vs CPU — easy (random), medium (counters your last move), hard (tracks your frequency distribution and picks counter to most common).
- **Extra features:** Simultaneous reveal animation, best-of-5 match structure, emoji pick (✊✋✌️), reaction emojis after reveal, round summary, final winner crown.
- **Socket events:** `rps-pick`, `rps-round-reveal`, `rps-match-over`, `rps-join`.

---

## UI / Theme Integration

All games use the existing vibe system:

| Element | Source |
|---------|--------|
| Board dark squares / grid cells | `vibe.boardColors.dark` |
| Board light squares / backgrounds | `vibe.boardColors.light` |
| Buttons, active states, highlights | `vibe.accentClass` |
| Panel background | `vibe.panelClass` |
| Badges (Open/Live/Finished) | Existing badge pattern from ChessMessage |

Dark/light mode: all components use Tailwind `dark:` variants consistent with rest of app. No hardcoded colors.

---

## Slash Commands Summary

| Command | Game | Notes |
|---------|------|-------|
| `/ttt` | Tic-Tac-Toe | `/ttt @user` for private |
| `/c4` | Connect Four | `/c4 @user` for private |
| `/snake` | Snake | `/snake solo` for solo |
| `/2048` | 2048 | `/2048 solo` for solo |
| `/checkers` | Checkers | `/checkers @user` for private |
| `/rps` | Rock-Paper-Scissors | `/rps solo` for solo |

---

## Additional Features (beyond user's initial list)

1. **Game notifications** — toast/ping when it's your turn in a queue-based game (Tic-Tac-Toe, Connect Four, Checkers).
2. **Spectator count** — show how many people are watching on the message card.
3. **Quick rematch** — one-click rematch available immediately after game over, same panel.
4. **Round history** — RPS and TTT show last N rounds inline on the card.
5. **Accessibility** — keyboard-only navigation for all games, ARIA labels on boards.
6. **i18n** — all new game strings added to all 10 locale files (en, ar, de, es, fr, hi, ja, pt, ru, zh).
7. **Mobile touch** — swipe controls for Snake; tap-to-place for TTT/C4/Checkers.
8. **In-game chat reactions** — emoji quick-react bar (👏🔥😮) overlaid on panel, same as existing reaction system.

---

## Implementation Order

1. Tic-Tac-Toe (simplest — validates the new pattern)
2. Rock-Paper-Scissors (unique multi-player mechanic)
3. Connect Four (extends TTT pattern)
4. Checkers (mirrors Chess architecture)
5. 2048 (solo + race mode)
6. Snake (most complex — race sync)
