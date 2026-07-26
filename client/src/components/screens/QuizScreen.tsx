/* ============================================================
   QuizScreen — practice runner

   Changes from the previous version:

   • Option letters are Hebrew (א/ב/ג/ד) via `optionLabel`, not
     `String.fromCharCode(65 + index)`, which produced A/B/C/D on an
     all-Hebrew RTL exam paper.
   • The countdown is wall-clock based and its expiry side effect lives
     in an effect, not inside a `setState` updater. See useQuestionTimer.
   • Feedback is the shared FeedbackBox, so a timeout now shows the
     correct answer and the explanation — previously the whole box was
     hidden when the clock ran out and the learner saw nothing.
   • Options are a radiogroup with keyboard support and the timer is a
     live region, so the screen is usable without a mouse or sight.
   ============================================================ */

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { ChevronLeft, Clock, CheckCircle2, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";

import FeedbackBox, { type AnswerOutcome } from "@/features/quiz/FeedbackBox";
import { useQuestionTimer } from "@/features/quiz/useQuestionTimer";
import { reportQuestion } from "@/features/quiz/reports";
import { optionLabel } from "@/lib/hebrew";
import type { Question } from "@/content/types";

/** Recorded when the clock runs out with nothing selected. */
const TIMEOUT_INDEX = -1;

const DIFFICULTY_TEXT = { easy: "קל", medium: "בינוני", hard: "קשה" } as const;

export default function QuizScreen() {
  const {
    currentSession,
    currentQuestion,
    currentQuestionIndex,
    isShowingFeedback,
    lastAnswer,
    submitAnswer,
    nextQuestion,
    trainingConfig,
    setScreen,
  } = useApp();

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const totalQuestions = currentSession?.questions.length ?? 0;
  const progress = totalQuestions > 0 ? (currentQuestionIndex / totalQuestions) * 100 : 100;

  useEffect(() => {
    setSelectedIndex(null);
    startTimeRef.current = Date.now();
  }, [currentQuestionIndex]);

  const handleExpire = useCallback(() => {
    if (isShowingFeedback || selectedIndex !== null) return;
    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    submitAnswer(TIMEOUT_INDEX, timeSpent);
  }, [isShowingFeedback, selectedIndex, submitAnswer]);

  const timeLimit = trainingConfig.timePerQuestion;
  const timer = useQuestionTimer({
    limitSeconds: timeLimit,
    resetKey: currentQuestionIndex,
    paused: isShowingFeedback,
    onExpire: handleExpire,
  });

  const handleSelect = useCallback(
    (index: number) => {
      if (isShowingFeedback || selectedIndex !== null) return;
      setSelectedIndex(index);
      const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
      submitAnswer(index, timeSpent);
    },
    [isShowingFeedback, selectedIndex, submitAnswer]
  );

  const handleReport = useCallback((question: Question) => {
    reportQuestion(question, "missing-explanation");
    toast.success("תודה — השאלה סומנה לבדיקה");
  }, []);

  /** Arrow keys move between options, as a radiogroup should. */
  const handleOptionKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number, count: number) => {
      if (isShowingFeedback || selectedIndex !== null) return;
      // In RTL the visual direction of Left/Right is mirrored, but Up/Down
      // are unambiguous, so map both pairs to previous/next in reading order.
      let next: number | null = null;
      if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = (index + 1) % count;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") next = (index - 1 + count) % count;
      if (next === null) return;
      e.preventDefault();
      optionRefs.current[next]?.focus();
    },
    [isShowingFeedback, selectedIndex]
  );

  if (!currentQuestion || !currentSession) {
    return (
      <div className="h-full flex items-center justify-center" style={{ direction: "rtl" }}>
        <p style={{ color: "var(--muted-foreground)" }}>טוען שאלה...</p>
      </div>
    );
  }

  const timePct = timer.fraction * 100;
  const timerClass = timePct > 50 ? "timer-normal" : timePct > 25 ? "timer-warning" : "timer-danger";
  const timerColor =
    timePct > 50 ? "var(--foreground)" : timePct > 25 ? "var(--warning)" : "var(--destructive)";

  const outcome: AnswerOutcome | null = !lastAnswer
    ? null
    : lastAnswer.selectedIndex === TIMEOUT_INDEX
      ? "timeout"
      : lastAnswer.isCorrect
        ? "correct"
        : "wrong";

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ direction: "rtl", background: "var(--background)" }}
    >
      {/* Top bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--tf-border)", background: "var(--tf-surface)" }}
      >
        <button
          onClick={() => setScreen("hub")}
          className="flex items-center gap-1 text-sm font-semibold"
          style={{ color: "var(--muted-foreground)" }}
        >
          <ChevronLeft size={16} />
          יציאה
        </button>

        <div className="flex items-center gap-2">
          <span
            className="text-sm font-bold"
            style={{ color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}
          >
            {currentQuestionIndex + 1}
          </span>
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            / {totalQuestions}
          </span>
        </div>

        {timeLimit > 0 && (
          <div
            className={`flex items-center gap-1.5 ${timerClass}`}
            style={{ color: timerColor }}
            role="timer"
            aria-live="off"
            aria-label={`נותרו ${timer.secondsLeft} שניות`}
          >
            <Clock size={15} />
            <span
              className="font-black text-base"
              style={{ fontFamily: "Inter, sans-serif", minWidth: "2ch" }}
            >
              {timer.secondsLeft}
            </span>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="flex-shrink-0 px-4 pt-3 pb-1">
        <div className="flex items-center gap-3">
          <div
            className="flex-1 progress-bar-track"
            role="progressbar"
            aria-valuenow={currentQuestionIndex}
            aria-valuemin={0}
            aria-valuemax={totalQuestions}
            aria-label={`שאלה ${currentQuestionIndex + 1} מתוך ${totalQuestions}`}
          >
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          {timeLimit > 0 && (
            <div className="relative w-6 h-6 flex-shrink-0" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="w-full h-full -rotate-90">
                <circle cx="12" cy="12" r="9" fill="none" stroke="var(--muted)" strokeWidth="2.5" />
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  stroke={timerColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="56.5"
                  strokeDashoffset={56.5 * (1 - timer.fraction)}
                  style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s ease" }}
                />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span
            className="badge-pill"
            style={{
              background: "rgba(255, 165, 0, 0.15)",
              color: "var(--primary)",
              border: "1px solid rgba(255, 165, 0, 0.25)",
            }}
          >
            <Zap size={10} />
            {currentSession.arenaName}
          </span>
          <span
            className="badge-pill"
            style={{
              background:
                currentQuestion.difficulty === "easy"
                  ? "rgba(34, 197, 94, 0.15)"
                  : currentQuestion.difficulty === "medium"
                    ? "rgba(255, 165, 0, 0.15)"
                    : "rgba(220, 38, 38, 0.15)",
              color:
                currentQuestion.difficulty === "easy"
                  ? "var(--success)"
                  : currentQuestion.difficulty === "medium"
                    ? "var(--warning)"
                    : "var(--destructive)",
            }}
          >
            {DIFFICULTY_TEXT[currentQuestion.difficulty]}
          </span>
        </div>

        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border-strong)" }}
        >
          <p
            id="quiz-stem"
            className="text-lg font-bold leading-relaxed"
            style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}
          >
            {currentQuestion.stem}
          </p>
        </div>

        <div
          className="flex flex-col gap-2.5"
          role="radiogroup"
          aria-labelledby="quiz-stem"
          key={currentQuestion.id}
        >
          {currentQuestion.options.map((option, index) => {
            const isCorrectOption = index === currentQuestion.correctIndex;
            const isChosen = lastAnswer?.selectedIndex === index;

            let optClass = "answer-option";
            if (isShowingFeedback) {
              if (isCorrectOption) optClass += " correct-reveal";
              if (isChosen) optClass += lastAnswer!.isCorrect ? " selected-correct" : " selected-wrong";
            } else if (selectedIndex === index) {
              optClass += " selected-correct";
            }

            const disabled = isShowingFeedback || selectedIndex !== null;

            return (
              <button
                key={index}
                ref={el => {
                  optionRefs.current[index] = el;
                }}
                role="radio"
                aria-checked={selectedIndex === index || isChosen}
                tabIndex={disabled ? -1 : selectedIndex === null && index === 0 ? 0 : -1}
                className={optClass}
                onClick={() => handleSelect(index)}
                onKeyDown={e => handleOptionKeyDown(e, index, currentQuestion.options.length)}
                disabled={disabled}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
                    style={{
                      background:
                        isShowingFeedback && isCorrectOption
                          ? "rgba(34, 197, 94, 0.25)"
                          : isShowingFeedback && isChosen && !lastAnswer!.isCorrect
                            ? "rgba(220, 38, 38, 0.25)"
                            : "var(--accent)",
                      color:
                        isShowingFeedback && isCorrectOption
                          ? "var(--success)"
                          : isShowingFeedback && isChosen && !lastAnswer!.isCorrect
                            ? "var(--destructive)"
                            : "var(--accent-foreground)",
                      fontFamily: "Heebo, sans-serif",
                    }}
                  >
                    {isShowingFeedback && isCorrectOption ? (
                      <CheckCircle2 size={14} />
                    ) : isShowingFeedback && isChosen && !lastAnswer!.isCorrect ? (
                      <XCircle size={14} />
                    ) : (
                      optionLabel(index)
                    )}
                  </span>
                  <span className="flex-1 text-right">{option}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div aria-live="polite">
          {isShowingFeedback && outcome && (
            <FeedbackBox
              question={currentQuestion}
              outcome={outcome}
              selectedIndex={lastAnswer!.selectedIndex === TIMEOUT_INDEX ? null : lastAnswer!.selectedIndex}
              onReport={handleReport}
            />
          )}
        </div>
      </div>

      {/* Footer */}
      {isShowingFeedback && (
        <div
          className="flex-shrink-0 p-4"
          style={{ borderTop: "1px solid var(--tf-border)", background: "var(--background)" }}
        >
          <button
            onClick={nextQuestion}
            autoFocus
            className="w-full py-3.5 rounded-xl font-black text-base transition-all flex items-center justify-center gap-2"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              boxShadow: "0 0 20px rgba(255, 165, 0, 0.35)",
            }}
          >
            {currentQuestionIndex + 1 >= totalQuestions ? "סיים מבחן" : "שאלה הבאה"}
            <ChevronLeft size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
