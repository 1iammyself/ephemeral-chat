# Game Rules & Features Research — All 6 Games
**Date:** 2026-05-30  
**Source:** 6 parallel web research agents (WRPSA, Wikipedia, Cornell, MIT, lidraughts, FMJD, ACF, Tromp solver, arXiv, Nokia Wiki, MDPI Games, etc.)

---

## CHECKERS (Draughts)

### History & Origins
- Descends from **Alquerque**, played in Egypt as early as 1400 BCE — 5×5 grid, 10 pieces per side, pieces move along line intersections.
- Modern draughts emerged in 12th-century southern France: Alquerque mechanics merged with the 8×8 chessboard.
- By 1243, crowned-piece rule existed (mentioned in Philippe Mouskés's *Chronique*).
- 1300–1600: philosophical split — *le Jeu Forcé* (mandatory captures) vs *le Jeu Plaisant* (optional).
- William Payne codified English rules in 1756.
- 10×10 international game ("Polish Draughts") emerged ~1700.
- **American checkers weakly solved in 2007** by Jonathan Schaeffer's team (University of Alberta) after ~18 years of computation: perfect play by both sides = draw.

### Core Rules — American/English
- **Board:** 8×8, 32 dark squares only. Dark square in each player's lower-left. 12 pieces per side on 3 nearest rows. Black/Red moves first.
- **Men:** move diagonally forward only, 1 square.
- **Kings:** move diagonally in any direction, 1 square (American). Flying kings (any distance) in International/Russian/Brazilian.
- **Captures:** jump diagonally over adjacent opponent piece to empty square beyond. Jumped piece removed **after full sequence**.
- **Mandatory capture:** if a jump exists, it **must** be taken. American: free choice which sequence. International/Brazilian: must maximize pieces captured.
- **Multi-jump:** after a jump, if another jump is available the piece **must** continue. A piece already jumped cannot be jumped again in the same sequence.
- **King promotion:** man reaching opponent's back rank is crowned. **Turn ends immediately** — even if jumps are available. Exception: Russian draughts (promotes mid-sequence, continues as flying king).
- **Win:** capture all opponent pieces OR block all opponent pieces. Being unable to move = **loss** (not draw — unlike chess stalemate).
- **Stalemate is always a loss in all standard checkers variants.**
- **Draw:** mutual agreement; threefold repetition; **40-move no-progress rule** (no capture, no man advance for 40 consecutive moves).

### The "Huff" (Historical — Now Defunct)
In old English draughts, if a player failed to make a mandatory capture, the opponent could "huff" (remove) the offending piece as a penalty without capturing it. Modern rules instead require the player to make the mandatory capture. No huffing in any current standard.

### No Piece Hierarchy in American/English
Any piece (man or king) can capture any opponent piece (man or king). Italian draughts is the major exception: men cannot capture kings.

### Flying King vs Short King
- American/English kings: **short kings** — 1 square per move only.
- International, Russian, Brazilian, Canadian, Pool kings: **flying kings** — unlimited diagonal range, like a chess bishop.
- Creates vastly different strategic landscapes.

### Variants
| Variant | Board | Flying Kings | Men Capture Backward | Majority Capture | Promote Mid-Sequence |
|---|---|---|---|---|---|
| American/English | 8×8 | No (1 sq) | No | No | No — turn ends |
| International | 10×10 | Yes | Yes | Yes | No — must end on back rank |
| Russian | 8×8 | Yes | Yes | No | Yes — continues as king |
| Brazilian | 8×8 | Yes | Yes | Yes | No |
| Turkish | 8×8 | Yes (orthogonal) | No | Yes | Deferred to next turn |
| Italian | 8×8 | Yes | No | Yes (complex priority) | No |
| Pool Checkers | 8×8 | Yes | Yes | No | No |
| Canadian | 12×12 | Yes | Yes | Yes | No |
| Suicide/Giveaway | 8×8 | No | No | Yes | — |

**International Draughts (10×10):**
- 20 pieces per side, 4 opening rows per player.
- Men can capture both forward and backward.
- Flying kings; majority capture mandatory.
- Key rule: if a man only **passes through** the back rank during a capture sequence (but doesn't end there), it does NOT promote. Promotion requires ending the move on the back rank.

**Russian Draughts:**
- If a man reaches the back rank mid-sequence AND can continue capturing as a king, it promotes immediately and continues the sequence as a flying king. Turn ends only when no further captures remain.
- Draw: 15 consecutive king-only moves (tournament); complex endgame move tables.

**Turkish Draughts:**
- Orthogonal movement (forward and sideways, NOT diagonal) — unique among major variants.
- Men: forward or sideways, 1 square; cannot move backward.
- Captures: forward and sideways only (not backward for men).
- Flying kings: move any number of squares orthogonally in any direction.
- World championship began 2014.

**Italian Draughts:**
- Men cannot capture kings — only kings can capture kings.
- Mandatory capture with complex priority:
  1. Must maximize pieces captured
  2. If equal, must use a king (not a man)
  3. If still equal, must capture the most enemy kings
  4. If still equal, must capture first enemy king earliest in sequence

**Suicide/Giveaway Checkers:**
- Same rules as standard, but **reversed winning condition**: first player to lose all pieces OR be unable to move wins.
- Forces players to sacrifice pieces and construct forced-capture sequences against themselves.

### Draw Conditions Across Variants
| Condition | American | International | Russian |
|---|---|---|---|
| Threefold repetition | Yes | Yes | Yes |
| No-progress rule | 40 moves (no capture, no man advance) | 25 consecutive king-only moves | 15 king-only moves (tournament) |
| Material-specific limits | No (referee discretion) | 1 king vs 3: 16 moves; 1 king vs 1-2: 5 moves | Complex endgame table |
| Mutual agreement | Yes | Yes | Yes |

### Strategy Concepts
- **Tempo:** having the "move" (forcing opponent to move disadvantageously) — wins ~80% of master games.
- **Center control:** squares 13,14,20,21 maximize diagonal range; improves win rate ~47%. However, over-commitment without flank support reduces that advantage.
- **Sacrifice tactics:** mandatory capture rule makes forced-capture sacrifices extremely powerful. Calculated sacrifices create forced lines where material or positional gain follows inevitably.
- **Back row defense:** keeping pieces in back row prevents opponent from promoting. Excessive back row holding creates mobility loss — opponent exploits immobile pieces.
- **King promotion timing:** first to promote wins ~76% of equal-material endgames; premature promotion drops this to ~42%.
- **King opposition:** maintaining direct king-to-king positioning (1-square gap) wins ~94% of such positions.
- **Double corner defense:** strongest defensive fortress for lone king — extremely difficult to breach.
- **Piece mobility:** maintaining 3+ potential moves per piece correlates with ~81% win rate. Pinning opponent pieces against edges reduces their mobility by ~40%.
- **Opening theory:** Opening 11-15 has highest empirical win rate (~48%) in GAYP play. Bristol Opening leads to aggressive middlegame despite appearing defensive.
- **Two kings vs one king:** forced win with correct technique; requires systematic reduction of lone king's squares.

### Tournament Rules (ACF/WCDF)
- **GAYP (Go As You Please):** First move unrestricted.
- **Two-Move Restriction:** First two moves randomly balloted from approved list.
- **Three-Move Restriction (standard in U.S. championships since 1934):** First three moves drawn from 156 approved openings (3 excluded: proven wins). Each opening played **twice** — once with each player moving first — to neutralize opening advantage.
- **Time controls:** Standard WCDF format: 30 moves/hour for first hour, then 15 moves per half-hour; digital increment (e.g., 35 minutes + 3 seconds per move).
- **Scoring:** Win both games in round = 4 pts; 1W+1D = 4 pts; both drawn = 2 each; split = 2 each; bye = 4 pts. Swiss System pairing.
- **Illegal moves:** First offense = warning + move recalled; subsequent = game forfeiture. Examples: omitting mandatory capture, incomplete multi-jump, moving man backward.
- **No agreed draws or collusion** — both players receive zero points.
- **Draw claim procedure:** Player demonstrates to referee that the next move would create the same position for the third time.

### Governing Bodies
- **WCDF** (World Checkers Draughts Federation): governs English/American 8×8 internationally.
- **FMJD** (Fédération Mondiale du Jeu de Dames): governs International (10×10).
- **IDF** (International Draughts Federation): coordinates 8×8 diagonal variants including Brazilian and Russian.
- **ACF** (American Checker Federation): U.S. national governing body.

### Implementation Features Status
- Multi-jump continuation ✅ (implemented — was critical bug fix)
- 40-move no-progress counter ✅ (implemented)
- Multi-jump visual highlight ✅ (implemented — blue ring + pulse)
- Piece count, captured count, king count ✅
- Board flip button ✅
- Mandatory capture enforcement ✅
- King promotion (turn ends) ✅

---

## CONNECT FOUR

### Core Rules
- **Board:** 6 rows × 7 columns = 42 spaces. Held vertically; gravity — pieces fall to lowest empty row.
- **Setup:** board starts empty; players choose colors (typically Red and Yellow).
- **Turn:** drop one disc into any non-full column. Disc falls straight down. No picking up or shifting.
- **Win:** 4 in a row — horizontal, vertical, or diagonal (either direction). Game ends immediately.
- **Draw:** board fills (42 pieces) with no winner.

### Solved State (1988)
- **First player wins with perfect play** — proven independently by James Dow Allen (Oct 1, 1988) and Victor Allis (Oct 16, 1988) via a knowledge-based approach using 9 strategic rules.
- First move **center column (col 4):** P1 can force win by move 41 at the latest.
- First move cols 3 or 5: draw with perfect play by both sides.
- First move cols 1, 2, 6, or 7: P2 can force a win.
- **John Tromp (1995):** strongly solved all 4,531,985,219,092 positions in a 12KB compressed file. Used negamax with alpha-beta pruning, move ordering, transposition tables. ~40,000 CPU-hours on Sun/SGI workstations at CWI.
- **Fhourstones benchmark:** Tromp's Connect Four solver became a standard integer computation benchmark in computer science.
- **Game tree complexity:** ~10^21 nodes.
- **Misère Connect Four** (completing four = loss): second player wins with perfect play. Solved October 2024 by Robert Steele and Daniel B. Larremore (arXiv, then peer-reviewed).
- **"Seven Theorem":** Not a widely published result by that name. The number 7 (board width) is significant; research shows solved outcomes change with board dimensions based on whether width is odd/even and row parity interactions.

### Strategy Concepts
- **Center column advantage:** col 4 participates in 16 possible four-in-a-rows; corner cells participate in only 3. Why optimal first move is center.
- **Double threats (Forks / Trap Setups):** Two simultaneous threats force opponent to only block one. Named configurations:
  - **J/L configuration:** Three pieces in an L/J shape creating two win paths.
  - **Seven trap (figure-7 configuration):** Three pieces forming "7" shape, generating two simultaneous threats.
- **Odd/Even Threat Theory (Victor Allis):** Rows numbered 1–6 from bottom. Odd rows = 1,3,5; even = 2,4,6.
  - **P1 should create threats on odd rows** (will be "theirs" to fill in endgame).
  - **P2 should create threats on even rows.**
  - Odd threat = advantageous for P1. Even threat = advantageous for P2.
  - Basis for nearly all advanced strategy.
- **Column parity:** Which player "owns" remaining empty spaces as board fills determines zugzwang endgame outcomes.
- **Zugzwang:** Any move worsens the mover's situation. Expert play aims for positions where, as board fills, opponent is always compelled to move into losing positions.

### Variants

**Pop Out:**
- On your turn: either drop a disc in from top OR "pop out" one of your own discs from the bottom.
- Remaining pieces above fall down one row.
- You can only pop your own color.
- Makes game significantly less deterministic; cannot be mapped to 2D solution.

**Pop 10:**
- Board starts fully filled (players alternate filling from bottom up first).
- Each turn: remove own disc from bottom. If it was part of a four-in-a-row at removal, keep it aside + take another turn. Otherwise, reinsert through top.
- First to set aside 10 discs wins.

**Connect 5:**
- 6×9 board (standard 7-col board + 2 extra columns pre-filled with alternating colors on left/right sides).
- Win: 5 in a row.

**Connect 6 (Prof. I-Chen Wu, 2003):**
- Played on 19×19 (up to 59×59) Go-like board.
- First player places 1 stone; thereafter both place 2 per turn.
- Win: 6 or more in a row.
- Specifically designed to correct the structural first-player advantage of Connect Four — significantly fairer without compensatory rules.

**Power Up / Power Checkers (Hasbro):**
- Special power tokens (single-use per game):
  - **Anvil:** drops into column, immediately pops out all pieces below it, stays at bottom.
  - **Wall:** disc placed, cannot be part of any four-in-a-row (blocks column dynamics).
  - **Play 2:** immediately play 2 extra normal discs.
  - **Bomb:** immediately pops out opponent's discs in a column.

**Twist & Turn (Winning Moves, 2015):**
- Vertical tower with 5 independently twistable rings. After placing a disc, player may twist any one ring.
- Twisting reorganizes piece positions; cannot be mapped to a 2D solution.

**3D Connect Four (4×4×4):**
- Discs stack in 3D. Win: 4 in a row in any direction including 3D diagonals.

**Non-standard board sizes:** 5×4, 6×5, 8×7, 9×7, 10×7, 8×8, and theoretical infinite boards. Cylinder-Infinite Connect-Four wraps horizontally.

### Undo Rules
- Official Hasbro rules: **no undo**.
- Most digital implementations: optional undo limited to 1 ply (last move only).
- Some platforms: unlimited undo by mutual consent.
- Undo disabled in ranked/competitive play.

### Tournament & Competitive Rules
- No single globally standardized format; competitive play typically includes:
  - **Alternating first player:** strict alternation each game to counterbalance proven P1 advantage.
  - **Scoring:** Win = 1 pt, draw = 0.5, loss = 0. First to target (e.g., 7 pts) wins match. Hasbro physical game includes built-in scoring slider.
  - **Timed play:** 30–60 seconds per turn online; some formats use total-time clock similar to chess.
  - **Draw handling:** because draw is theoretically impossible with perfect play, draws in competitive play are replayed or half-points depending on format.
  - Online platforms (game.tv): bracket-style esports tournaments with ELO-style ranking.

### Accessibility Features
- **Tactile (physical):** Red discs have a hole in center; yellow discs are solid/flat — blind or low-vision players distinguish by touch. Braille versions exist.
- **Digital color modes:** High-contrast or color-blind modes (shapes — circle vs X — in addition to colors).
- **Screen reader support:** Some apps announce column numbers and board states.
- **Difficulty scaling:** AI levels make game accessible to new players.
- **Giant outdoor sets:** Inherently more accessible for players with limited fine motor control.

### Implementation Features Status
- Ghost disc preview at landing row ✅ (implemented)
- Threat column highlighting ✅
- Disc count display ✅
- Win animation ✅
- Column hover indicator ✅
- Mobile column-tap buttons ✅
- Alternating first player across matches: not yet tracked

---

## TIC-TAC-TOE

### Core Rules (3×3)
- 3×3 grid, 9 cells. X goes first. Players alternate placing marks. No retracting once placed.
- **Win:** 3 in a row — any row, column, or diagonal (8 possible winning lines).
- **Draw (Cat's Game):** board full, no winner.
- **Game state space:** 362,880 total possible orderings; 255,168 unique states; 5,478 distinct positions accounting for symmetry.
- **Solved:** weakly and strongly solved. With perfect play both players always draw, provably.

### The Solved Nature — Technical Detail
- **Classification:** Weakly solved (optimal strategy from start) and strongly solved (optimal from any position).
- **Game tree depth:** Max 9 plies. Branching factor shrinks rapidly; full tree has at most 9! = 362,880 leaves.
- **Minimax:** Assigns +10 to AI win, -10 to AI loss, 0 to draw, then propagates upward. Unbeatable AI implementable in ~50 lines of code.
- **Design implication:** Naive 1v1 is boring for skilled players. Competitive play is only meaningful across multiple rounds or in variants with larger state spaces.
- **AI difficulty levels:**
  - Perfect (unbeatable): pure minimax
  - Hard: minimax with occasional random move
  - Medium: 65% random moves so it makes visible mistakes
  - Easy: mostly random with occasional blocks

### Optimal Strategy Priority (every move)
1. Win immediately (complete your own 3-in-a-row)
2. Block immediately (opponent has 2 in a row)
3. Fork (create 2 simultaneous winning threats)
4. Block opponent's fork (if one fork: block directly; if two forks: create a forcing threat)
5. Center (access to 4 winning lines: 2 diagonals + 1 row + 1 col)
6. Opposite corner (if opponent is in a corner, play the opposite corner)
7. Empty corner (2 diagonals + 1 row/col = up to 3 winning lines)
8. Empty edge (weakest — only 2 winning lines)

### Classic Fork Trap
X takes center → X takes two opposite (non-adjacent) corners → O cannot block both diagonal threats → X wins. O's only counter: respond to X's first corner with an edge or other corner of the same side.

**Second-player (O) optimal counters:**
- Against center opening: play any corner.
- Against corner opening: play center.
- Against edge opening: play center, an adjacent corner, or the opposite edge.

### Variants

**Ultimate Tic-Tac-Toe:**
- 3×3 grid of 9 mini TTT boards = 81 cells total.
- X goes first, may play in any cell of any mini-board.
- **Sending mechanic:** where you play within a mini-board determines which mini-board your opponent must play in next. Play in top-right cell → opponent plays in top-right mini-board.
- **Won mini-boards:** get 3-in-a-row on a mini-board = claim it on global grid.
- **Full/tied mini-boards:** filled with no winner = neutral (neither player's). A neutral board cannot contribute to winning globally.
- **Free choice rule:** if sent to a won or full board, play in any empty cell on any open mini-board.
- **Global win:** 3 claimed mini-boards in a row on the global grid.
- **Global draw:** all 9 mini-boards resolved, no 3-in-a-row globally.
- **NOT trivially solved** — enormous state complexity. Winning a mini-board can be strategically inferior if it grants opponent free choice.

**Misère TTT:**
- First player to complete 3-in-a-row **loses**.
- Solved: with perfect play, result is a draw.
- Center is the only non-losing opening for X. P1 has more exposure (takes 5 turns vs O's 4).

**Wild TTT (Devil's Tic-Tac-Toe):**
- On each turn, a player may place either an X or an O in any empty cell.
- Can be played in normal mode (3-in-a-row wins) or misère mode.
- Players can "help" set up wins by placing opponent's symbol.

**Numerical TTT (Number Scrabble):**
- Numbers 1–9 available. One player uses odd (1,3,5,7,9); other uses even (2,4,6,8).
- Win: any three of your numbers sum to 15.
- **Isomorphic to standard TTT** via the 3×3 magic square — every row/col/diagonal sums to 15:
  ```
  2 | 7 | 6
  9 | 5 | 1
  4 | 3 | 8
  ```
- Center = 5, corners = even numbers, edges = odd numbers other than 5.

**3D Tic-Tac-Toe (Qubic):**
- 4×4×4 cube, 64 cells. 76 possible winning lines (including space diagonals).
- **Solved:** first player wins with perfect play (Eugene Mahalko 1976; complete strategy: Oren Patashnik 1980).
- 8 corner cells and 8 face-center cells most powerful (each in 6 winning lines).
- Marketed as "Qubic" physical acrylic tower.

**Notakto:**
- Both players place X (impartial game). Completing 3-in-a-row closes that board.
- Usually played on multiple boards simultaneously. Player who closes the last open board **loses**.
- Single board: second player wins with perfect play.
- Mathematically analyzed; winning strategy depends on number of boards.

**Gomoku (5×5+ / 15×15):**
- 15×15 Go board, 5-in-a-row wins. Proven first-player advantage → competitive play uses handicapping (Pro rule, Swap2).

### Multi-Round Scoring
- **Point system:** Win=3, Draw=1, Loss=0 (football scoring — incentivizes wins over safe draws).
- Alternate who plays X each game (X has structural first-mover advantage).
- Best of N (odd N): first to ceil(N/2) wins.
- Online platforms apply ELO/Glicko rating; primarily meaningful in Ultimate TTT or larger variants.

### Common UI/UX Patterns
- Grid lines as CSS borders or SVG lines; cells square (aspect ratio locked).
- X and O use high-contrast colors (e.g., blue X, red O).
- Winning line highlighted with strike-through animation.
- Hover state on empty cells previews mark (ghost/semi-transparent).
- Win: confetti, board shake, line animation, score increment.
- Draw: board flash or neutral message.
- Score counter persistent across rounds; "New Game" resets score; "Play Again" resets only board.
- Mobile: large tap targets (minimum 44×44pt per Apple HIG).
- Keyboard: Tab to cells, Enter/Space to play. ARIA labels.

### Speed / Simultaneous Variants
- **Speed Tapping:** both players on shared device simultaneously; first tap claims cell. Millisecond timestamp resolves conflicts.
- **Timer-per-move (Blitz):** fixed time per move (e.g., 5 seconds); exceeding forfeits turn.
- **Sealed move:** both secretly choose; simultaneous reveal. If same cell: both blocked (contested). Eliminates turn-order advantage.

### Tournament Formats
- **Worldwide Tic Tac Toe Championship (WorldwideHighScore.com):** 8-week seasonal online tournament, daily competition, live leaderboard, weekly spotlights.
- **Academic AI tournaments:** bots play round-robin (each pair plays as both X and O); scored 3/1/0. Standard evaluation for student-built minimax agents.
- **Hackathon format:** build a TTT bot in N hours, bots play tournament-style.

### Edge Cases to Handle Correctly
- Win check must occur immediately after each move.
- Both players cannot win simultaneously.
- Full board with no winner → draw, regardless of who placed last mark.
- Ultimate TTT: if sent to won board → free choice among ALL cells of ALL open boards. Tied mini-board counts as neither X nor O globally.

### Implementation Features Status
- Hover ghost mark ✅ (implemented)
- Hint button (💡) ✅ (implemented — 6-rule priority system)
- Win line highlight ✅
- Move counter ✅
- CPU difficulty levels ✅

---

## SNAKE

### History & Lineage
- **Nokia Snake I (1997, Nokia 6110):** Original. Solid outer walls = death. Simple dot food. No bonus food, no level progression beyond speed. Numeric keypad controls.
- **Nokia Snake II (2000, Nokia 3310):** Major evolution. 9 selectable difficulty levels. Wrap-around walls introduced. 5 selectable maze layouts. Bonus food appears every 5 regular items. Most implementations people remember are based on Snake II.

### Core Mechanics
- Grid of cells (20×20 standard). Snake occupies one cell per segment. **Tick-based:** head advances 1 cell per tick; tail vacates last cell (net length constant unless food just eaten).
- **180° reversal blocked** — only forward or perpendicular turns. Reverse input ignored.
- **Food:** spawns at random empty cell. Eating grows snake by 1 (tail NOT removed that tick).
- **Death:** wall collision (solid mode) OR self-collision.
- **Starvation (rare):** some implementations impose a move limit — if snake doesn't eat within N moves, it dies. Prevents infinite safe spiraling.

### Scoring Systems
- Basic: `score += 10 * level` per regular food.
- **Level formula:** `level = Math.floor(score/100) + 1`.
- **Speed formula:** `speed = Math.max(80, 200 - (level-1)*15)` ms/tick.
- Nokia Snake II: higher difficulty level = more points per food (level 9 earns significantly more than level 1).
- **Length multiplier (some games):** `points = base × current_length`.
- **Speed-based bonus:** bonus food gives more points the faster you eat it after it appears.
- **Time bonus:** some arcade variants add a per-food countdown; leftover time added to score.
- **Perfect game:** snake fills entire grid (399 segments on 20×20) = special win condition.

### Special Food Types
- **Regular food:** +points, +1 length, permanent until eaten.
- **Bonus/Blinking food (Nokia Snake II):** appears after every 5 regular foods eaten; blinks/flashes; timed 5–10 sec; **+50 or more points** (decreasing the longer you wait); does **NOT grow snake**; disappears if not eaten.
- **Super food / Level-skip food:** instantly advances to next level.
- **Speed Boost food:** temporary speed increase for 5 seconds.
- **Slow-Motion food:** reduces speed for 5 seconds.
- **Invincibility food:** allows passing through own body temporarily.
- **Magnet food:** attracts all nearby pellets to head for 15 seconds.
- **Growth Multiplier food:** each subsequent food grows snake by 5 for a duration.
- **Shrink food:** reduces snake length (useful in tight situations).

### Wall Modes
- **Solid walls (Nokia Snake I):** hit boundary = instant death.
- **Wrap-around / Toroidal (Nokia Snake II):** exit right → re-enter from left; same top/bottom. No wall deaths.
- **Wall Mode (Spawning obstacles, Google Snake):** new solid wall tile spawns on grid every other food eaten from first food. Playable area shrinks over time.
- **Maze walls:** fixed internal wall layouts chosen before game (Nokia Snake II: 5 maze options).
- **Partial/Open walls:** some games allow gaps in outer boundary acting as selective portals.
- **No walls (Peaceful mode):** no death boundaries; only self-collision.

### Google Snake Modes
- Classic, Fast, Slow, Wall Mode (random walls spawn), Peaceful (no death), Portal Mode, Twin Mode (two snakes), Winged Mode.
- 3 map sizes, 3 speeds, 4 apple-count options.
- "Blender Mode" mixes any combination.

### Obstacles
- **Static blocks:** fixed obstacle cells (maze walls, pillars). Contact = death.
- **Random spawning walls:** generated dynamically as game progresses.
- **Moving obstacles:** advanced implementations; patrol fixed routes. Contact = death.

### Multiplayer Snake
- **Shared grid (competitive):** all snakes on same grid; dead snake leaves body as obstacles or pellets; last alive wins.
- **Separate grids (race mode):** each player has own grid; first to target length/score wins.
- **Slither.io model:** massive shared free-form arena; grow by consuming pellets and remains of dead snakes; kill by making opponent collide head-first into your body. Speed boost sacrifices mass. Goal: longest snake on server.
- **Two-Player same grid:** collision with opponent's body = death; cooperative or competitive.

### Portal / Tunnel / Warp Tiles
- **Standard portal pairs:** when head enters one portal, exits from the other in the same direction.
- **Google Snake Portal Mode (June 2020):** two randomly placed portals enabling shortcut routing.
- **PortalSnake (puzzle variant):** portals can be repositioned and stretched — stretched portals resize anything passing through them.
- **Wrapping walls as implicit portals:** functionally equivalent to four portal pairs along each edge.

### Grid Sizes & Impact
| Grid | Cells | Character |
|---|---|---|
| 10×10 | 100 | Tiny/chaotic, very hard, fills fast |
| 15×15 | 225 | Small, tight but playable |
| 20×20 | 400 | Standard balance ✅ (our implementation) |
| 25×25 | 625 | Comfortable, more forgiving |
| 30×20 | 600 | Widescreen, natural for 16:9 |
| 37×27 | 999 | Nokia-style ratio |
| 40×40 | 1600 | Long games, high-score runs |
- Cell size calculation: `cellSize = floor(min(canvasWidth, canvasHeight) / gridCells)`

### AI / CPU Snake Approaches
- **Greedy nearest-food:** always move toward nearest food. Simple but leads to traps.
- **A\* pathfinding:** calculate shortest safe path to food on each tick. Avoids known obstacles.
- **Hamiltonian cycle:** pre-compute path visiting every cell exactly once, follow it. Guarantees never dying but slow to reach food; used as "perfect AI" reference.
- **Slither.io AI:** all other snakes are bots (named with "(bot)" suffix); faster than human PvP; use only solid-color skins; chase food, encircle smaller snakes, boost into path of larger.

### Visual Polish (from research)
- **Snake body gradient:** head = brightest color, each segment dims toward tail. Index-based HSL/RGB interpolation.
- **Head/tail distinction:** head rendered as rounded rectangle or with eyes; tail tapered or rounded.
- **Particle effects on eat:** 8–16 particles with random velocities, fade over 20–30 frames.
- **Smooth interpolation (sub-tick):** lerp visual position between previous and next cell based on elapsed time within tick. Snake glides rather than jumps. Uses `fillPercent` (0→1) to draw rectangle of dynamic width/height within cell.
- **Bloom / Glow effects (GPU):** post-processing — Bloom, Chromatic Aberration, Vignette.
- **Food animation:** pulses in scale (breathes). Bonus food blinks faster.
- **Screen flash on death:** brief red flash or screen shake.
- **Score pop:** floating "+10" or "+50" text rises and fades at food location.

### Mobile Adaptations
- **Swipe controls:** single-finger swipe in 4 cardinal directions. Most natural.
- **Virtual D-pad:** on-screen directional buttons.
- **Virtual joystick:** draggable analog joystick; threshold converts to cardinal direction.
- **Follow / Tap-to-turn:** snake turns toward tap. Simple but can cause diagonal intent issues.
- **Speed boost on mobile:** double-tap to activate, or hold finger on screen.
- **Responsive grid:** `cellSize` dynamically calculated to fill screen with minimum ~10 cells per dimension.

### Advanced Polish Features (from popular implementations)
- **Theme/Skin selection:** body color, food appearance, grid background.
- **Sound effects:** distinct sounds for eat, death, level-up, bonus food.
- **Achievement system:** "Eat 100 foods", "Reach length 50", "Survive 5 minutes".
- **Ghost/Replay mode:** records best run; replays ghost snake in subsequent games.
- **Countdown start:** 3-2-1-Go before movement begins each game.
- **Input buffering:** queue last 1–2 inputs so rapid keypresses at high speed are not dropped.
- **Daily challenge:** fixed seed determines food positions for the day; global leaderboard.
- **Twin Mode:** control two snakes simultaneously with same inputs; both must survive.

### High Score Persistence
- Browser: `localStorage.setItem("highScore", value)` — survives refresh and browser close.
- Mobile apps: SharedPreferences (Android), UserDefaults (iOS).
- Cloud: server-side leaderboards for multiplayer.
- Pattern: on game over, compare `currentScore > savedHighScore`; if true, overwrite + update display.

### Implementation Features Status
- Bonus/blinking food ✅ (implemented — every 5 foods, +50, no growth, 7s timer)
- Wrap-around walls ✅ (implemented — selectable in config dialog)
- Snake body gradient ✅ (implemented — head white, dims to dark)
- Config dialog pre-send ✅ (fixed)
- Paused at start ✅
- Best score ✅
- Level progress bar ✅
- Pause/resume ✅
- Input buffering: not yet implemented
- Ghost/replay mode: not yet implemented

---

## 2048

### History & Origin
- Created by **Gabriele Cirulli**, a 19-year-old Italian developer, over a single weekend as a personal challenge.
- Released **March 9, 2014** as free, open-source software under the **MIT License**, written in JavaScript and CSS.
- Went viral immediately — over 4 million visitors in under a week. iOS and Android ports followed May 2014.
- Cirulli declined to monetize because he did not invent the core concept.
- **Lineage:** Threes! (February 2014, Asher Vollmer and Greg Wohlwend, 14 months in development) → 1024 (clone, 21 days later) → 2048 (clone of 1024, March 9 2014).

### Core Mechanics
- **Grid:** 4×4 (16 cells).
- **Slide:** ALL tiles move as far as possible in chosen direction. Invalid move (no tile moves) = no new tile spawns.
- **Merge rule:** equal adjacent tiles merge to combined value. A merged tile **cannot merge again in the same move** — no chain reactions.
- **Three-tile edge case:** [2][2][2][2] sliding left → [4][4] not [8]. The two farthest in direction of motion merge first; third slides against result but doesn't merge again.
- **Tile spawn:** after every valid move, one new tile at random empty cell. **90% = value 2; 10% = value 4.**
- **Starting state:** 2 tiles pre-placed (each independently 90/10 weighted).
- **WASD:** supported in many clones alongside arrow keys.

### Scoring
- Score = sum of all merge values. Two 4s merge → +8. Two 512s merge → +1024.
- Spawned tiles add nothing — only merges score.
- **Theoretical max score on 4×4: 3,932,100** (achievable only via perfect sequence producing 131,072 tile with all preceding merges — probability < 1 in 10^15).
- **Maximum possible moves in a perfect game:** 131,038.

### Win / Lose
- **Win:** create a 2048 tile. Original shows "You win!" overlay but allows continuing.
- **Continue:** reaches 4096, 8192, 16384, 32768, 65536, 131072.
- **Highest achievable tile:** 2^17 = **131,072** (because 4-tiles can spawn, not just 2-tiles, adding a small ceiling beyond 2^16).
- **Lose:** board completely full AND no valid merge (no two horizontally or vertically adjacent tiles share the same value).

### Probability Data (AI-achieved, 2025 research)
- Reaching 16,384: ~99.9%
- Reaching 32,768: ~86.1%
- Reaching 65,536: ~8.4%
- Reaching 131,072: extremely rare even for optimal AI

### Merge Rules — One Merge Per Move
Critical strategic rule: within a single swipe, a tile produced by a merge is "locked" — it cannot merge again even if it ends up adjacent to an equal tile. Prevents cascade reactions and forces multi-move planning.

### Undo Design Consensus
- Original game: **no undo**. Threes!: **no undo** (designers intentionally excluded to preserve tension).
- Community consensus: 0–1 undos preserves strategic depth; 3+ trivializes.
- **Our implementation:** 3 undos for solo mode ✅

### Color Scheme (Original Cirulli — exact)
| Tile | Background | Text |
|---|---|---|
| 2 | rgb(238,228,218) / #eee4da | Dark #776e65 |
| 4 | rgb(237,224,200) / #ede0c8 | Dark #776e65 |
| 8 | rgb(242,177,121) / #f2b179 | White #f9f6f2 |
| 16 | rgb(245,149,99) / #f59563 | White |
| 32 | rgb(246,124,95) / #f67c5f | White |
| 64 | rgb(246,94,59) / #f65e3b | White |
| 128 | rgb(237,207,114) / #edcf72 | White |
| 256 | rgb(237,204,97) / #edcc61 | White |
| 512 | rgb(237,200,80) / #edc850 | White |
| 1024 | rgb(237,197,63) / #edc53f | White |
| 2048 | rgb(237,194,46) / #edc22e | White |
| >2048 | Near-black | White |
- Board background: warm grey #bbada0. Empty cells: slightly lighter tile color.
- Progression: 2 and 4 = light tan; 8–64 = warm oranges and reds; 128+ = golden yellows; >2048 = near-black.

### Strategy (Expert Level)
- **Corner strategy:** pick one corner (bottom-right conventional); never let highest tile leave it; never swipe in the direction that moves it away from its corner.
- **Snake/zigzag pattern:** decreasing-value chain that winds across the board. Merge from tail toward head.
- **Monotone rows:** every row/column in the chain must be strictly decreasing in exactly one direction. A single out-of-order tile blocks a cascade merge.
- **Three-direction discipline:** restrict to 3 directions as much as possible; 4th only when absolutely necessary.
- **Empty cell management:** empty cells = oxygen. Scattered low-value tiles = dead weight.
- **Smoothness:** adjacent tiles should be close in value for natural cascading.

### AI Approaches
- **Minimax:** treats tile spawning as adversarial (worst-case placement). Win rate for reaching 2048: ~37%.
- **Expectimax (more accurate):** treats spawning as stochastic event weighted by probability (90/10). Win rate: ~56% at basic depth; ~100% with deep lookahead.
- **Key AI heuristics (weighted):**
  1. Empty cell count (highest weight)
  2. Monotonicity — tiles in consistent decreasing order
  3. Smoothness — adjacent tiles have similar values
  4. Corner/edge positioning — large tiles near corners
  5. Merge potential — number of immediately available merges
- **4×3 version:** strongly solved (exact optimal play computed).

### Threes! — The Predecessor (Full Comparison)
- Released February 2014 by Asher Vollmer and Greg Wohlwend after **14 months of development**.
- **Core difference:** tiles slide only **ONE space** per swipe (not as far as possible).
- **Merge rule:** 1+2=3 (or 2+1=3); then 3+3=6; 6+6=12 — the special 1+2 rule is unique.
- **New tile preview:** next tile to appear shown above the board.
- **New tile range:** can spawn values from 1 up to 1/8th of board's highest tile.
- **No undo.**
- Considered significantly harder than 2048. The Threes creators tested the "slide all tiles" mechanic and discarded it as making the game too easy.
- Cirulli initially said he had not played Threes before releasing 2048.

### Variants
| Grid | Target | Notes |
|---|---|---|
| 4×4 (classic) | 2048 | Standard |
| 5×5 | 4096+ | More forgiving; more room for error |
| 6×6 | 8192+ | "Very Easy" relative to 4×4 |
| 7×7, 8×8 | Higher | Rarely played competitively |
| 3×3 | 512 | Very difficult |
| 1D (single row) | Varies | Dramatically harder |

**Spatial topology variants:** Hexagonal grid (6 slide directions), Cylinder (left/right wrap), 3D cube (faces of rotating cube), Circular/radial (concentric rings).

**Number system variants:**
- **Fibonacci 2048:** tiles follow Fibonacci sequence (1,1,2,3,5,8,13...); tile merges with Fibonacci neighbor; goal 5,702,887 on 6×6.
- **Threes!-rule hybrid:** Threes merging within 2048-style full-slide grid.
- **Negative tiles (±13 variant):** positives and negatives cancel; goal: have both +13 and −13 simultaneously.

**Mechanic variants:**
- **Wildcard tiles:** merge with any tile.
- **× tile:** doubles value of tile it merges with.
- **Bomb tile:** clears adjacent tiles.
- **Holes:** some cells permanently blocked.

**Multiplayer 2048:**
- Race mode: both on separate boards; first to target tile wins.
- Penalty tile mechanics: reaching milestones sends blocking tiles to opponent's board.
- Power-up disruptions: flip opponent's board, freeze inputs, add junk tiles.
- Asynchronous leaderboard competition (1-min and 5-min timer modes).

### Timer Modes
- No-timer (classic): play at own pace.
- 1-minute sprint: maximize score in 60 seconds.
- 5-minute challenge: leaderboards.
- Speed 2048: race to reach specific tile; human records for reaching 2048 under 2 minutes for skilled players.

### Accessibility
- Keyboard-only play inherently supported (4 inputs).
- Some clones: ARIA live regions announce tile merges and spawns.
- High-contrast themes available in subset.
- Color-blind modes NOT standard in original — orange-to-yellow gradient problematic for some.

### Implementation Features Status
- Score delta animation (+N popup) ✅ (implemented)
- Config dialog pre-send ✅ (fixed)
- Undo stack (3) ✅
- Best score ✅
- Move counter ✅
- 2048 win then "Keep Going" ✅
- Paused at start ✅
- Timer mode: not yet implemented
- Grid size selector (5×5 etc.): not yet implemented

---

## ROCK-PAPER-SCISSORS

### History
- Origins in ancient China: evidence from the Han Dynasty (206 BCE – 220 CE); called *shoushiling* (gesture game).
- Japanese Janken formalized during Edo period (1603–1868).
- Introduced to the West in the early 20th century.
- World RPS Society founded in Toronto, 1918 (disputed); modern **WRPSA (World Rock Paper Scissors Association, wrpsa.com)** is the current governing body.

### Core Rules (WRPSA 2026)
- **Legal throws:** Rock (closed fist), Paper (flat open hand, palm horizontal), Scissors (index and middle finger extended in V).
- **What beats what:** Rock crushes Scissors; Scissors cuts Paper; Paper covers Rock. Cyclic dominance — no dominant strategy.
- **Simultaneous reveal:** count "Rock, Paper, Scissors, Shoot!" — both reveal on "Shoot." Revealing after seeing opponent's hand = **late throw foul.**
- **Late throw:** round forfeiture on first offense; repeated = match forfeiture.
- **Illegal throw (unrecognizable hand shape):** round forfeiture on first offense.
- **Draw:** same gesture → immediate replay. Unlimited replays. No point awarded for tie.
- **Nash Equilibrium:** 1/3 probability each = provably unexploitable.

### Draw Resolution Variants
- **Replay (standard/official):** WRPSA mandates this.
- **Janken draw call:** "Aiko desho!" chanted; reveal again on final syllable.
- **Point-split:** some casual/digital formats award 0.5 points each for a drawn round.
- **Set-score alternative:** some formats define a "set" as 3 throws; net-zero set = drawn, no set point.

### Tournament Formats (WRPSA)
- Standard match: **best of 3** (first to 2 wins). No ties possible with odd format.
- Semifinals/finals: **best of 5**.
- **Team events:** 3 members per team. Each member plays best-of-3 against counterpart. Each individual match win = 1 team point. First team to 2 team points wins. Draws at individual level: replayed.
- **Round-robin scoring:** win=1, draw=0.5 (optional), loss=0.
- **9-set format:** match divided into 9 sets; set won on positive net score across 3 throws; match ends when one player has 5 set points.
- **Swiss format:** paired by current score each round without elimination.
- **Single/Double elimination:** WRPSA World Championship uses single elimination for individual events.
- **Tiebreakers:** 1) head-to-head; 2) record among tied group; 3) total round wins; 4) Sonneborn-Berger scoring (borrowed from chess); 5) live sudden-death throw-off.
- **Prize:** $10,000 USD individual championship winner. Rankings updated after each sanctioned event via ATP/WTA-style system.

### Psychology & Strategy (Research-Backed)
- **Throw frequency statistics (large-scale data, 1M+ games):**
  - Rock: **35.66%** (most common)
  - Paper: **32.12%**
  - Scissors: **32.23%** (least common)
- Men throw Rock **42% more** than women in opening rounds.
- Women throw Scissors more than men statistically.
- **Counter-strategy against average player:** lead with Paper (counters rock bias).
- **Win-Stay, Lose-Shift:** winners tend to repeat their winning throw; losers shift clockwise through the cycle (Rock→Scissors→Paper). Documented as statistically significant at population level (Scientific Reports, 2016, Nature/PMC). Later study (2021) found it does not describe majority of individual players' full patterns.
- **Gambler's fallacy:** each throw is statistically independent. "Rock is due" is false.
- **Hot-hand fallacy:** winning streaks don't make a throw "hot" — over-repetition is exploitable.
- **Emotional state reading:** angry/annoyed players gravitate toward Rock (aggressive, power symbol). Calm players tend toward Paper.
- **Pre-round conditioning (priming):** verbally or visually introduce a symbol before count — exploits subconscious mimicry in inexperienced opponents. Mentioning "dynamite" (rock-shaped) just before play subtly biases opponent toward Rock.
- **Information gathering:** WRPSA recommends at least 3 rounds of observable data before attempting counter-frequency play.

### AI Difficulty Levels (implemented)
| Level | Approach |
|---|---|
| Easy | Pure 1/3 random — unexploitable, wins ~33% |
| Medium | Counter the player's last move (simple reactive) |
| Hard | Markov chain — track P[previous→next] transitions; predict from last throw; fall back to frequency counter |

### Full Markov Chain AI (Hard Mode — as implemented)
- Build transition matrix from history: `transitions[from][to]` counts.
- Look up last throw; find most probable next throw from matrix.
- Play the counter of the prediction.
- If total transitions from last throw = 0 (not enough data): fall back to counter-frequency (find most common overall throw, counter it).
- Needs at least 2 rounds of history to start building meaningful transitions.

### Extended Variants
**RPSLS (5-symbol — Rock, Paper, Scissors, Lizard, Spock):**
- Invented by Sam Kass and Karen Bryla; popularized by The Big Bang Theory.
- Each symbol beats exactly 2 and loses to exactly 2:
  - Scissors cuts Paper; Scissors decapitates Lizard
  - Paper covers Rock; Paper disproves Spock
  - Rock crushes Lizard; Rock crushes Scissors
  - Lizard poisons Spock; Lizard eats Paper
  - Spock smashes Scissors; Spock vaporizes Rock
- **Math rule:** any odd n = 2k+1 symbols → symbol m beats (n-1)/2 others, loses to (n-1)/2. Adding 2 moves at a time preserves balance.

**RPS-7 (David C. Lovelace):** adds Fire, Water, Air, Sponge. Each beats 3, loses to 3.  
**RPS-9:** adds Gun, Human. Each beats 4.  
**RPS-11:** intermediate bridge.  
**RPS-15:** adds Lightning, Dragon, Devil, more. Each beats 7.  
**RPS-25:** 25 gestures, each beating 12.  
**RPS-101 (umop.com / rps101.pythonanywhere.com):** 101 gestures, 5,050 unique matchup outcomes, 23×35-inch poster maps all relationships.

**Custom gestures found in documented variants:**
- **Well** (fingertips to thumb): beats Rock and Scissors, loses to Paper.
- **Fire, Water, Dynamite, Rope, Poison, Devil, Dragon, Lightning, Gun, Human:** used in various multi-symbol extensions.
- Regional informal variants globally use animals, tools, natural phenomena specific to cultural context.

### Speed Variants
- **Rapid Fire (Continuous):** throw continuously without stopping, set to rhythm. First to target win count. No breaks between rounds.
- **Countdown Timer:** countdown displayed; players must reveal by time = 0. Post-timer throws disqualified.
- **Blitz:** entire best-of-3 match must complete within a set clock (e.g., 30 seconds total). Penalizes slow throwers.

### Statistics to Display (Digital Implementations)
- Win rate (%) / Draw rate (%) / Loss rate (%)
- Pick distribution — % of rounds each symbol chosen (pie or bar chart)
- Current streak (unbroken wins/losses)
- Longest win streak (session or all-time)
- Total rounds played
- Session vs all-time toggle
- Opponent's pick distribution (PvP modes)
- Last 5–10 round history log (icon pair + result color: green=win, red=loss, yellow=draw)

### Visual Feedback: Animated Throw Reveal (Standard Convention)
1. Player selects throw (hidden or shown immediately).
2. Countdown animation: "3... 2... 1..." with fist-pumping icons.
3. Both choices revealed simultaneously on "0" / "Shoot."
4. Winner's icon scales up, glows, or plays particle effect.
5. Loser's icon grays out, shrinks, or shows cross overlay.
6. Outcome text fades in: "You Win!", "You Lose!", "Draw!"
7. Score counter increments with number-pop animation.
8. Round result appended to history log.
9. Multiplayer: brief "waiting for opponent" spinner before reveal.

### Mobile & Touch UI Patterns
1. **Large tap targets:** 3 gesture icons in triangle or row. 80–120px recommended (WCAG 48px min).
2. **Swipe-to-select:** swipe left=Rock, up=Paper, right=Scissors.
3. **Hold-and-release radial menu:** drag to zone, release to throw.
4. **Countdown-locked:** must tap before countdown expires; late taps rejected.
5. **Camera gesture recognition (novelty):** ML hand-pose model reads physical gesture.
6. **Shake-to-throw:** shaking device randomizes throw (casual mode only).
7. **Haptic feedback:** distinct vibration patterns for win/loss/draw.

### Janken (Japanese Variant) — Full Ceremony
**Pronunciation and gestures:**
- Guu (グー) = Rock — closed fist; named for squeezing sound.
- Choki (チョキ) = Scissors — V-fingers; named for cutting sound.
- Paa (パー) = Paper — open flat hand; named for opening sound.

**Ceremony sequence:**
1. Both players pump fists chanting **"Saisho wa guu!"** ("Starting with rock!") — synchronized fist-pumping builds rhythm.
2. Both chant **"Janken pon!"** — on "pon" both reveal their throw.
3. If draw: both immediately chant **"Aiko desho!"** ("It's a draw, isn't it?") — on "sho!" both reveal again. Repeat until winner.

**Acchi Muite Hoi (sequel game):** After janken resolves a winner, winner points a direction ("acchi muite hoi" = "look that way") while loser must look in a **different** direction. If loser accidentally looks the direction pointed, loser loses completely.

**Historical Japanese variants:**
- **Mushi-ken (虫拳):** Frog (thumb), slug (little finger), snake (index finger). Snake eats frog, frog eats slug, slug defeats snake.
- **Kitsune-ken (狐拳):** Fox, village headman, hunter — using full hand shapes.

**Cultural significance:** Used to resolve disputes, assign tasks, determine turn order, select contestants in game shows. Deeply embedded in Japanese school, workplace, and sports culture.

### Handicap / Points Weighting Systems
1. **Spot handicap:** weaker player starts with a score lead.
2. **Point weighting:** weaker player's wins count as 1.5 points; stronger player's wins count as 1.
3. **Reduced win requirement:** stronger player needs higher score to win.
4. **Asymmetric throw pools:** stronger player prohibited from their statistically most successful symbol.
5. **ELO-style dynamic ratings:** win against higher-rated player = larger rating gain. Over time ratings converge to reflect true skill.
6. **Mathematical guarantee:** for any weighting of victory conditions, a proportional throw distribution adjustment restores expected value to zero.

### Implementation Features Status
- Markov chain AI (hard mode) ✅ (implemented)
- Config dialog pre-send ✅ (fixed)
- Round history ✅
- Win streak ✅
- Pick speed ✅
- Pick distribution ✅
- RPSLS (5-symbol variant): not yet implemented
- Camera gesture recognition: not applicable
- Janken animation ceremony: not yet implemented

---

## Summary: What Was Implemented

### Critical Rules Fixes ✅
1. **Checkers multi-jump continuation** — turn stays on same player after a capture if more jumps exist (king promotion still ends turn)
2. **Pre-send config dialogs** — `/rps`, `/2048`, `/snake` now open config modals before sending

### Major Features ✅
3. **Snake: bonus/blinking food** — every 5 regular foods, +50 pts, blinks gold, 7s timer, no growth, countdown badge
4. **Snake: wrap-around walls** — Solid / Wrap toggle in config dialog; passed through `gameData.wrapWalls`
5. **Snake: body gradient** — head white, each segment dims progressively toward tail
6. **Snake: wall mode config dialog** — pre-send selection with Solid / Wrap buttons

### Polish Features ✅
7. **TicTacToe: hover ghost mark** — semi-transparent X/O on empty cells during human player's turn
8. **TicTacToe: hint button (💡)** — 6-rule priority system; highlights best cell in yellow for 2 seconds
9. **ConnectFour: ghost disc preview** — semi-transparent disc at exact landing row when hovering a column
10. **Checkers: 40-move no-progress counter** — warning at 20+, draw claim message at 40+
11. **Checkers: mid-jump visual** — blue ring on jumping piece, pulsing blue targets, "⚡ Continue your jump!" status
12. **RPS: Markov chain AI** — hard mode now tracks transition probabilities, not just frequency
13. **2048: score delta animation** — "+N" bounces above score counter on each merge batch

### Already Implemented Before This Session ✅
- All 6 games: delete/trash button with 2-step confirm (creator only)
- Checkers: board flip, piece counts, king display, captured counts, mandatory capture enforcement
- Connect Four: threat column detection, mobile tap buttons, disc counts, CPU AI with alpha-beta
- TicTacToe: move counter, CPU difficulties (easy/medium/hard), win line highlight
- RPS: round history (last 5), win streak badge (🔥×N), pick speed, pick distribution at match end
- Snake: level progress bar, best score, paused-at-start overlay, pause/resume with P key
- 2048: undo stack (3 deep), session best score, move counter, "Keep Going" after 2048, started-state overlay

### Not Yet Implemented (Future Opportunities)
- Checkers: variant selector (American / International / Russian rules)
- TTT: Ultimate Tic-Tac-Toe mode
- Connect Four: alternating first-player tracking across a match
- RPS: RPSLS (5-symbol) mode; Janken animation ceremony
- Snake: input buffering; ghost/replay mode; daily challenge (fixed seed)
- 2048: timer mode (1-min / 5-min sprint); grid size selector (5×5 etc.); Threes! mode
- 2048: smooth tile slide/merge CSS animation on the grid itself
