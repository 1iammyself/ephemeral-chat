import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Brain, Clock, CheckCircle2, XCircle, Trophy, Zap, Crown, ChevronDown, ChevronUp, PlusCircle, Send, Flame } from 'lucide-react';
import socketManager from '../socket';

// ─── Trivia Scoreboard ──────────────────────────────────────
const TriviaScoreboard = ({ scores, currentUserId, accentColor }) => {
  const sorted = useMemo(() => {
    return Object.entries(scores)
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.score - a.score);
  }, [scores]);

  return (
    <div className="space-y-1">
      {sorted.map((entry, idx) => {
        const isMe = entry.id === currentUserId;
        return (
          <div
            key={entry.id}
            className={`flex items-center justify-between px-2 py-1 rounded-lg text-xs ${
              isMe ? `bg-${accentColor}-50 dark:bg-${accentColor}-900/10 font-bold` : ''
            }`}
          >
            <div className="flex items-center gap-1.5">
              <span className="w-5 text-center">
                {idx === 0 ? <Crown className="w-3.5 h-3.5 text-amber-500 inline" /> :
                 idx === 1 ? <span className="text-gray-400">2</span> :
                 idx === 2 ? <span className="text-amber-700">3</span> :
                 <span className="text-gray-500">{idx + 1}</span>}
              </span>
              <span className={`truncate max-w-[100px] ${isMe ? `text-${accentColor}-700 dark:text-${accentColor}-300` : 'text-gray-700 dark:text-gray-300'}`}>
                {entry.nickname}
              </span>
              {entry.streak >= 3 && (
                <span className="flex items-center text-orange-500" title={`${entry.streak} streak!`}>
                  <Flame className="w-3 h-3" />
                  <span className="text-[9px] font-bold">{entry.streak}</span>
                </span>
              )}
            </div>
            <span className={`font-bold text-${accentColor}-600 dark:text-${accentColor}-400`}>{entry.score}</span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Question Creator (for tournament host) ─────────────────
// DEPRECATED: Questions are now auto-generated from the trivia bank.
// Kept as a fallback for legacy manual trivia question submission.
const QuestionCreator = ({ messageId, roundNumber, totalRounds, onSubmit }) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [answer, setAnswer] = useState(0);
  const [timer, setTimer] = useState(15);

  const addOption = () => {
    if (options.length < 6) setOptions([...options, '']);
  };

  const removeOption = (idx) => {
    if (options.length > 2) {
      const newOpts = options.filter((_, i) => i !== idx);
      setOptions(newOpts);
      if (answer >= newOpts.length) setAnswer(0);
    }
  };

  const handleSubmit = () => {
    if (!question.trim() || options.some(o => !o.trim())) return;
    onSubmit({ messageId, question: question.trim(), options: options.map(o => o.trim()), answer, timer });
    setQuestion('');
    setOptions(['', '']);
    setAnswer(0);
  };

  return (
    <div className="p-2 space-y-2">
      <div className="text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-1">
        <Brain className="w-3.5 h-3.5" />
        Round {roundNumber}/{totalRounds} — Create Question
      </div>

      <input
        type="text"
        placeholder="Enter your question..."
        value={question}
        onChange={e => setQuestion(e.target.value)}
        maxLength={200}
        className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-amber-500"
      />

      <div className="space-y-1">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-1">
            <button
              onClick={() => setAnswer(i)}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                answer === i ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 dark:border-gray-600'
              }`}
            >
              {answer === i && <CheckCircle2 className="w-3 h-3" />}
            </button>
            <input
              type="text"
              placeholder={`Option ${i + 1}`}
              value={opt}
              onChange={e => {
                const newOpts = [...options];
                newOpts[i] = e.target.value;
                setOptions(newOpts);
              }}
              maxLength={100}
              className="flex-1 px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            />
            {options.length > 2 && (
              <button onClick={() => removeOption(i)} className="text-red-400 hover:text-red-500 text-xs">✕</button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button onClick={addOption} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1">
            <PlusCircle className="w-3 h-3" /> Add option
          </button>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
          <Clock className="w-3 h-3" />
          <select
            value={timer}
            onChange={e => setTimer(parseInt(e.target.value))}
            className="bg-transparent border-none text-xs font-medium"
          >
            {[5, 10, 15, 20, 30, 45, 60].map(t => (
              <option key={t} value={t}>{t}s</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!question.trim() || options.some(o => !o.trim())}
          className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white disabled:opacity-40 flex items-center gap-1 active:scale-95 transition-transform"
        >
          <Send className="w-3 h-3" /> Send
        </button>
      </div>
    </div>
  );
};

// ─── Active Question (answering phase) ──────────────────────
const ActiveQuestion = ({ round, messageId, currentUserId, hasAnswered }) => {
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState(null);

  useEffect(() => {
    const elapsed = (Date.now() - round.startedAt) / 1000;
    const remaining = Math.max(0, round.timer - elapsed);
    setTimeLeft(Math.ceil(remaining));

    const interval = setInterval(() => {
      const el = (Date.now() - round.startedAt) / 1000;
      const rem = Math.max(0, round.timer - el);
      setTimeLeft(Math.ceil(rem));
      if (rem <= 0) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [round.startedAt, round.timer]);

  const handleAnswer = (choice) => {
    if (hasAnswered || timeLeft <= 0) return;
    setSelectedChoice(choice);
    socketManager.emit('tournament-trivia-answer', { messageId, choice });
  };

  const timerPercent = (timeLeft / round.timer) * 100;
  const timerColor = timeLeft <= 5 ? 'bg-red-500' : timeLeft <= 10 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="p-2 space-y-2">
      {/* Timer bar */}
      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full ${timerColor} transition-all duration-1000 ease-linear rounded-full`}
          style={{ width: `${timerPercent}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500">
          Round {round.roundNumber}
        </span>
        <span className={`text-xs font-bold ${timeLeft <= 5 ? 'text-red-500 animate-pulse' : 'text-gray-500 dark:text-gray-400'}`}>
          <Clock className="w-3 h-3 inline mr-0.5" />{timeLeft}s
        </span>
      </div>

      <div className="text-sm font-bold text-gray-800 dark:text-gray-200">
        {round.question}
      </div>

      <div className="space-y-1">
        {round.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => handleAnswer(i)}
            disabled={hasAnswered || timeLeft <= 0}
            className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
              selectedChoice === i
                ? 'bg-amber-500 text-white font-bold scale-[0.98]'
                : hasAnswered
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 active:scale-[0.98]'
            }`}
          >
            <span className="font-bold mr-2 opacity-60">{String.fromCharCode(65 + i)}</span>
            {opt}
          </button>
        ))}
      </div>

      {hasAnswered && (
        <div className="text-center text-xs text-amber-600 dark:text-amber-400 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />
          Answer locked in! Waiting for others...
        </div>
      )}
    </div>
  );
};

// ─── Round Results ──────────────────────────────────────────
const RoundResults = ({ round, scores }) => {
  const correctIdx = round.answer;

  return (
    <div className="p-2 space-y-1.5">
      <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500">
        Round {round.roundNumber} Results
      </div>
      <div className="text-xs font-bold text-gray-800 dark:text-gray-200">{round.question}</div>
      <div className="space-y-0.5">
        {round.options.map((opt, i) => {
          const isCorrect = i === correctIdx;
          const answeredCount = Object.values(round.answers || {}).filter(a => a.choice === i).length;
          return (
            <div
              key={i}
              className={`flex items-center justify-between px-2 py-1 rounded text-xs ${
                isCorrect
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 font-bold'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              <span>
                {isCorrect ? <CheckCircle2 className="w-3 h-3 inline mr-1 text-green-500" /> : <XCircle className="w-3 h-3 inline mr-1 text-gray-300" />}
                {opt}
              </span>
              <span className="text-[10px]">{answeredCount}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Main Trivia Component ──────────────────────────────────
const TournamentTrivia = ({ message, currentUser, accentColor }) => {
  const { tournamentData } = message;
  const triviaData = tournamentData?.triviaData;
  const [showScoreboard, setShowScoreboard] = useState(true);
  const [showPastRounds, setShowPastRounds] = useState(false);

  if (!triviaData) return null;

  const currentUserId = currentUser?.id || currentUser?.socketId;
  const isCreator = tournamentData.createdBy === currentUserId;
  const { scores, rounds, currentRound, totalRounds, status: triviaStatus } = triviaData;

  const lastRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;
  const isAnswering = triviaStatus === 'answering' && lastRound?.status === 'active';
  const hasAnswered = isAnswering && lastRound?.answers?.[currentUserId] != null;
  const isWaitingQuestion = triviaStatus === 'waiting-question';
  const isComplete = triviaStatus === 'complete';

  const handleSubmitQuestion = useCallback((data) => {
    socketManager.emit('tournament-trivia-question', data);
  }, []);

  return (
    <div className="space-y-1">
      {/* Active question */}
      {isAnswering && lastRound && (
        <ActiveQuestion
          round={lastRound}
          messageId={message.id}
          currentUserId={currentUserId}
          hasAnswered={hasAnswered}
        />
      )}

      {/* Last round results (when round just ended) */}
      {!isAnswering && lastRound?.status === 'complete' && (
        <RoundResults round={lastRound} scores={scores} />
      )}

      {/* Waiting for next auto-generated question */}
      {isWaitingQuestion && !isComplete && (
        <div className="p-2 text-center text-xs text-gray-400 dark:text-gray-500">
          <Zap className="w-4 h-4 inline mr-1 animate-pulse text-amber-500" />
          {currentRound === 0 ? 'Starting trivia...' : `Next question coming up... (${currentRound + 1}/${totalRounds})`}
        </div>
      )}

      {/* Tournament complete */}
      {isComplete && (
        <div className="p-2 text-center">
          <div className="flex items-center justify-center gap-1 text-sm font-bold text-amber-600 dark:text-amber-400 mb-1">
            <Trophy className="w-4 h-4" />
            Tournament Complete!
          </div>
        </div>
      )}

      {/* Scoreboard toggle */}
      <button
        onClick={() => setShowScoreboard(!showScoreboard)}
        className="w-full py-1 text-[10px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded flex items-center justify-center gap-1"
      >
        {showScoreboard ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {showScoreboard ? 'Hide' : 'Show'} Scoreboard
      </button>

      {showScoreboard && (
        <TriviaScoreboard
          scores={scores}
          currentUserId={currentUserId}
          accentColor={accentColor}
        />
      )}

      {/* Past rounds */}
      {rounds.length > 1 && (
        <>
          <button
            onClick={() => setShowPastRounds(!showPastRounds)}
            className="w-full py-1 text-[10px] font-medium text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded flex items-center justify-center gap-1"
          >
            {showPastRounds ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showPastRounds ? 'Hide' : 'Show'} Past Rounds ({rounds.length - (isAnswering ? 1 : 0)})
          </button>
          {showPastRounds && (
            <div className="space-y-1 max-h-[200px] overflow-y-auto">
              {rounds
                .filter(r => r.status === 'complete')
                .reverse()
                .slice(0, -1) // Skip the most recent (already shown above)
                .map(r => (
                  <RoundResults key={r.roundNumber} round={r} scores={scores} />
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TournamentTrivia;
