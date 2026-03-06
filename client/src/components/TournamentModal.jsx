import React, { useState, useMemo } from 'react';
import { X, Trophy, Swords, Users, ChevronRight, Gamepad2, Shuffle, Plus, Minus } from 'lucide-react';
import { TOURNAMENT_FORMATS, TOURNAMENT_GAME_TYPES, GAME_LABELS } from '../utils/tournament';

const FORMAT_INFO = {
  [TOURNAMENT_FORMATS.SINGLE_ELIMINATION]: {
    label: 'Single Elimination',
    desc: 'Lose once and you\'re out',
    icon: '🏆'
  },
  [TOURNAMENT_FORMATS.DOUBLE_ELIMINATION]: {
    label: 'Double Elimination',
    desc: 'Must lose twice to be eliminated',
    icon: '🔄'
  },
  [TOURNAMENT_FORMATS.ROUND_ROBIN]: {
    label: 'Round Robin',
    desc: 'Everyone plays everyone',
    icon: '🔁'
  }
};

const TournamentModal = ({ isOpen, onClose, onCreateTournament, roomVibe, users = [] }) => {
  const [step, setStep] = useState(1); // 1: Game Type, 2: Format, 3: Settings
  const [gameType, setGameType] = useState(null);
  const [isMixed, setIsMixed] = useState(false); // Mixed-game tournament
  const [format, setFormat] = useState(TOURNAMENT_FORMATS.SINGLE_ELIMINATION);
  const [name, setName] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(8);
  const [bestOf, setBestOf] = useState(1); // Best of N for RPS
  const [triviaRounds, setTriviaRounds] = useState(5);
  // For mixed tournaments: array of game types per round
  const [roundGameTypes, setRoundGameTypes] = useState(['chess', 'trivia', 'rock-paper-scissors']);

  // 1v1 games only (trivia is group-based, only allowed in round-robin rounds for mixed)
  const BRACKET_GAME_TYPES = ['tic-tac-toe', 'rock-paper-scissors', 'chess'];

  if (!isOpen) return null;

  const vibeAccent = roomVibe === 'party' ? 'indigo' :
    roomVibe === 'chill' ? 'teal' :
      roomVibe === 'focus' ? 'orange' : 'blue';

  // Compute estimated rounds based on format and player count
  const estimatedRounds = useMemo(() => {
    if (format === TOURNAMENT_FORMATS.ROUND_ROBIN) return maxPlayers - 1;
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(maxPlayers)));
    if (format === TOURNAMENT_FORMATS.DOUBLE_ELIMINATION) return Math.log2(bracketSize) * 2 + 1;
    return Math.log2(bracketSize); // single elimination
  }, [format, maxPlayers]);

  const handleCreate = () => {
    if (!isMixed && !gameType) return;
    if (isMixed && roundGameTypes.length === 0) return;

    if (isMixed) {
      // Build roundGameTypes map: { 1: 'chess', 2: 'trivia', ... }
      const roundMap = {};
      roundGameTypes.forEach((gt, i) => { roundMap[i + 1] = gt; });
      onCreateTournament({
        name: name.trim() || 'Mixed Tournament',
        gameType: 'mixed',
        gameTypes: roundGameTypes,
        roundGameTypes: roundMap,
        format,
        maxPlayers,
        bestOf: 1,
      });
    } else {
      onCreateTournament({
        name: name.trim() || `${GAME_LABELS[gameType]?.label || gameType} Tournament`,
        gameType,
        format: gameType === 'trivia' ? TOURNAMENT_FORMATS.ROUND_ROBIN : format,
        maxPlayers,
        bestOf: gameType === 'rock-paper-scissors' ? bestOf : 1,
        triviaRounds: gameType === 'trivia' ? triviaRounds : undefined
      });
    }
    onClose();
    // Reset
    setStep(1);
    setGameType(null);
    setIsMixed(false);
    setFormat(TOURNAMENT_FORMATS.SINGLE_ELIMINATION);
    setName('');
    setMaxPlayers(8);
    setBestOf(1);
    setTriviaRounds(5);
    setRoundGameTypes(['chess', 'trivia', 'rock-paper-scissors']);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm z-[100]">
      <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[90vw] max-w-[380px] sm:max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 border border-${vibeAccent}-500/20 flex flex-col max-h-[90vh]`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-3 py-2 sm:p-4 border-b border-gray-200 dark:border-gray-700 bg-${vibeAccent}-50/30 dark:bg-${vibeAccent}-900/10 shrink-0`}>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white flex items-center">
            <Trophy className={`w-5 h-5 sm:w-6 sm:h-6 mr-1.5 sm:mr-2 text-${vibeAccent}-500`} />
            Create Tournament
          </h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center px-4 pt-3 gap-2">
          {[1, 2, 3].map(s => (
            <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${s <= step ? `bg-${vibeAccent}-500` : 'bg-gray-200 dark:bg-gray-700'}`} />
          ))}
        </div>

        <div className="p-3 sm:p-4 overflow-y-auto min-h-0 space-y-3">
          {/* Step 1: Choose Game Type */}
          {step === 1 && (
            <>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Choose Game</p>

              {/* Mixed-game toggle */}
              <button
                onClick={() => { setIsMixed(!isMixed); setGameType(null); }}
                className={`w-full p-2.5 rounded-xl border-2 transition-all text-left flex items-center gap-2 ${isMixed
                  ? `border-${vibeAccent}-500 bg-${vibeAccent}-50 dark:bg-${vibeAccent}-900/20 ring-2 ring-${vibeAccent}-500/20`
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Shuffle className={`w-5 h-5 ${isMixed ? `text-${vibeAccent}-500` : 'text-gray-400'}`} />
                <div>
                  <p className={`text-sm font-bold ${isMixed ? `text-${vibeAccent}-700 dark:text-${vibeAccent}-300` : 'text-gray-800 dark:text-gray-200'}`}>
                    Mixed Tournament
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Different game each round</p>
                </div>
              </button>

              {!isMixed ? (
                <div className="grid grid-cols-2 gap-2">
                  {TOURNAMENT_GAME_TYPES.map(gt => {
                    const info = GAME_LABELS[gt];
                    const selected = gameType === gt;
                    return (
                      <button
                        key={gt}
                        onClick={() => setGameType(gt)}
                        className={`p-3 rounded-xl border-2 transition-all text-left ${selected
                          ? `border-${vibeAccent}-500 bg-${vibeAccent}-50 dark:bg-${vibeAccent}-900/20 ring-2 ring-${vibeAccent}-500/20`
                          : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <span className="text-2xl">{info.emoji}</span>
                        <p className={`text-sm font-bold mt-1 ${selected ? `text-${vibeAccent}-700 dark:text-${vibeAccent}-300` : 'text-gray-800 dark:text-gray-200'}`}>
                          {info.label}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">{info.desc}</p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* Mixed: configure game per round */
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Assign a game to each round:</p>
                  {roundGameTypes.map((gt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-gray-600 dark:text-gray-400 w-12 shrink-0">R{idx + 1}</span>
                      <select
                        value={gt}
                        onChange={(e) => {
                          const updated = [...roundGameTypes];
                          updated[idx] = e.target.value;
                          setRoundGameTypes(updated);
                        }}
                        className={`flex-1 text-sm px-2 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white focus:ring-1 focus:ring-${vibeAccent}-500 outline-none`}
                      >
                        {TOURNAMENT_GAME_TYPES.map(g => (
                          <option key={g} value={g}>{GAME_LABELS[g]?.emoji} {GAME_LABELS[g]?.label}</option>
                        ))}
                      </select>
                      {roundGameTypes.length > 1 && (
                        <button
                          onClick={() => setRoundGameTypes(roundGameTypes.filter((_, i) => i !== idx))}
                          className="p-1 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-full text-red-500"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {roundGameTypes.length < 10 && (
                    <button
                      onClick={() => setRoundGameTypes([...roundGameTypes, 'chess'])}
                      className={`w-full py-1.5 rounded-lg text-xs font-bold text-${vibeAccent}-600 dark:text-${vibeAccent}-400 border border-dashed border-${vibeAccent}-300 dark:border-${vibeAccent}-700 hover:bg-${vibeAccent}-50 dark:hover:bg-${vibeAccent}-900/10 flex items-center justify-center gap-1`}
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Round
                    </button>
                  )}
                </div>
              )}

              <button
                onClick={() => {
                  if (!isMixed && !gameType) return;
                  if (isMixed) {
                    // Mixed: skip to format selection, trivia-only not applicable
                    setStep(2);
                  } else if (gameType === 'trivia') {
                    setFormat(TOURNAMENT_FORMATS.ROUND_ROBIN);
                    setStep(3);
                  } else {
                    setStep(2);
                  }
                }}
                disabled={!isMixed && !gameType}
                className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center space-x-2 btn-${vibeAccent} disabled:opacity-40 active:scale-95 transition-transform`}
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}

          {/* Step 2: Choose Format */}
          {step === 2 && (
            <>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Tournament Format</p>
              <div className="space-y-2">
                {Object.entries(FORMAT_INFO).map(([key, info]) => {
                  const selected = format === key;
                  // Trivia only supports round-robin
                  if (gameType === 'trivia' && key !== TOURNAMENT_FORMATS.ROUND_ROBIN) return null;
                  return (
                    <button
                      key={key}
                      onClick={() => setFormat(key)}
                      className={`w-full p-3 rounded-xl border-2 transition-all text-left flex items-center ${selected
                        ? `border-${vibeAccent}-500 bg-${vibeAccent}-50 dark:bg-${vibeAccent}-900/20`
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      <span className="text-xl mr-3">{info.icon}</span>
                      <div>
                        <p className={`text-sm font-bold ${selected ? `text-${vibeAccent}-700 dark:text-${vibeAccent}-300` : 'text-gray-800 dark:text-gray-200'}`}>
                          {info.label}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-400">{info.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setStep(1)} className="flex-1 py-2.5 rounded-xl font-bold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className={`flex-1 py-2.5 rounded-xl font-bold btn-${vibeAccent} active:scale-95 transition-transform`}
                >
                  Next
                </button>
              </div>
            </>
          )}

          {/* Step 3: Settings & Create */}
          {step === 3 && (
            <>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">Tournament Settings</p>

              {/* Tournament Name */}
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-1 block">Name (optional)</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isMixed ? 'Mixed Tournament' : `${GAME_LABELS[gameType]?.label || ''} Tournament`}
                  className={`w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 dark:text-white focus:ring-1 focus:ring-${vibeAccent}-500 outline-none`}
                  maxLength={60}
                />
              </div>

              {/* Max Players */}
              <div>
                <label className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-1 block">
                  Max Players: {maxPlayers}
                </label>
                <input
                  type="range"
                  min={2}
                  max={16}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(parseInt(e.target.value))}
                  className={`w-full accent-${vibeAccent}-500`}
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>2</span>
                  <span>16</span>
                </div>
              </div>

              {/* Best-of for RPS */}
              {!isMixed && gameType === 'rock-paper-scissors' && (
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-1 block">
                    Best of: {bestOf}
                  </label>
                  <div className="flex gap-2">
                    {[1, 3, 5].map(n => (
                      <button
                        key={n}
                        onClick={() => setBestOf(n)}
                        className={`flex-1 py-1.5 rounded-lg text-sm font-bold transition-colors ${bestOf === n
                          ? `bg-${vibeAccent}-500 text-white`
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Trivia Rounds */}
              {!isMixed && gameType === 'trivia' && (
                <div>
                  <label className="text-xs font-bold text-gray-600 dark:text-gray-400 mb-1 block">
                    Rounds: {triviaRounds}
                  </label>
                  <input
                    type="range"
                    min={3}
                    max={15}
                    value={triviaRounds}
                    onChange={(e) => setTriviaRounds(parseInt(e.target.value))}
                    className={`w-full accent-${vibeAccent}-500`}
                  />
                  <div className="flex justify-between text-[10px] text-gray-400">
                    <span>3</span>
                    <span>15</span>
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className={`p-3 rounded-lg bg-${vibeAccent}-50/50 dark:bg-${vibeAccent}-900/10 border border-${vibeAccent}-200/30 dark:border-${vibeAccent}-800/30`}>
                {isMixed ? (
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-gray-700 dark:text-gray-300">🎮 Mixed Tournament · {FORMAT_INFO[format]?.label} · Up to {maxPlayers} players</p>
                    <div className="flex flex-wrap gap-1">
                      {roundGameTypes.map((gt, i) => (
                        <span key={i} className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] bg-${vibeAccent}-100 dark:bg-${vibeAccent}-900/30 text-${vibeAccent}-700 dark:text-${vibeAccent}-300`}>
                          R{i+1}: {GAME_LABELS[gt]?.emoji} {GAME_LABELS[gt]?.label}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-bold">{GAME_LABELS[gameType]?.emoji} {GAME_LABELS[gameType]?.label}</span>
                    {' · '}
                    <span>{FORMAT_INFO[format]?.label}</span>
                    {' · '}
                    <span>Up to {maxPlayers} players</span>
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button onClick={() => setStep((!isMixed && gameType === 'trivia') ? 1 : 2)} className="flex-1 py-2.5 rounded-xl font-bold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  Back
                </button>
                <button
                  onClick={handleCreate}
                  className={`flex-1 py-2.5 rounded-xl font-bold btn-${vibeAccent} active:scale-95 transition-transform flex items-center justify-center space-x-2`}
                >
                  <Trophy className="w-4 h-4" />
                  <span>Create</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TournamentModal;
