/* ============================================================
   QuizScreen — Quiz Engine
   Design: Midnight Gradient — full-screen quiz with timer
   Features: countdown timer, progress bar, answer feedback
   ============================================================ */

import { useState, useEffect, useCallback, useRef } from "react";
import { useApp } from "@/contexts/AppContext";
import { ChevronLeft, Clock, AlertTriangle, CheckCircle2, XCircle, MessageSquare, Zap } from "lucide-react";

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

  const [timeLeft, setTimeLeft] = useState(trainingConfig.timePerQuestion || 60);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const totalQuestions = currentSession?.questions.length ?? 0;
  const progress = totalQuestions > 0 ? ((currentQuestionIndex) / totalQuestions) * 100 : 0;

  // Reset timer on new question
  useEffect(() => {
    setSelectedIndex(null);
    setTimeLeft(trainingConfig.timePerQuestion || 60);
    startTimeRef.current = Date.now();
  }, [currentQuestionIndex, trainingConfig.timePerQuestion]);

  // Countdown timer
  useEffect(() => {
    if (isShowingFeedback || trainingConfig.timePerQuestion === 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          // Auto-submit with no answer (timeout)
          if (!isShowingFeedback && selectedIndex === null) {
            const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
            submitAnswer(-1, timeSpent);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentQuestionIndex, isShowingFeedback, trainingConfig.timePerQuestion, submitAnswer, selectedIndex]);

  const handleSelect = useCallback((index: number) => {
    if (isShowingFeedback || selectedIndex !== null) return;
    setSelectedIndex(index);
    if (timerRef.current) clearInterval(timerRef.current);
    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    submitAnswer(index, timeSpent);
  }, [isShowingFeedback, selectedIndex, submitAnswer]);

  if (!currentQuestion || !currentSession) {
    return (
      <div className="h-full flex items-center justify-center" style={{ direction: "rtl" }}>
        <div className="text-center">
          <p style={{ color: "var(--muted-foreground)" }}>טוען שאלה...</p>
        </div>
      </div>
    );
  }

  const timeLimit = trainingConfig.timePerQuestion;
  const timePct = timeLimit > 0 ? (timeLeft / timeLimit) * 100 : 100;
  const timerClass = timePct > 50 ? "timer-normal" : timePct > 25 ? "timer-warning" : "timer-danger";
  const timerColor = timePct > 50 ? "var(--foreground)" : timePct > 25 ? "var(--warning)" : "var(--destructive)";

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ direction: "rtl", background: "var(--background)" }}>
      {/* Top bar */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--tf-border)", background: "var(--tf-surface)" }}
      >
        {/* Exit */}
        <button
          onClick={() => setScreen("hub")}
          className="flex items-center gap-1 text-sm font-semibold"
          style={{ color: "var(--muted-foreground)" }}
        >
          <ChevronLeft size={16} />
          יציאה
        </button>

        {/* Question counter */}
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>
            {currentQuestionIndex + 1}
          </span>
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>/ {totalQuestions}</span>
        </div>

        {/* Timer */}
        {timeLimit > 0 && (
          <div className={`flex items-center gap-1.5 ${timerClass}`} style={{ color: timerColor }}>
            <Clock size={15} />
            <span className="font-black text-base" style={{ fontFamily: "Inter, sans-serif", minWidth: "2ch" }}>
              {timeLeft}
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex-shrink-0 px-4 pt-3 pb-1">
        <div className="flex items-center gap-3">
          <div className="flex-1 progress-bar-track">
            <div
              className="progress-bar-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          {/* Timer ring (if time-limited) */}
          {timeLimit > 0 && (
            <div className="relative w-6 h-6 flex-shrink-0">
              <svg viewBox="0 0 24 24" className="w-full h-full -rotate-90">
                <circle cx="12" cy="12" r="9" fill="none" stroke="var(--muted)" strokeWidth="2.5" />
                <circle
                  cx="12" cy="12" r="9" fill="none"
                  stroke={timerColor}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="56.5"
                  strokeDashoffset={56.5 * (1 - timePct / 100)}
                  style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s ease" }}
                />
              </svg>
            </div>
          )}
        </div>
      </div>

      {/* Question area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        {/* Arena badge */}
        <div className="flex items-center gap-2">
          <span
            className="badge-pill"
            style={{ background: "rgba(255, 165, 0, 0.15)", color: "var(--primary)", border: "1px solid rgba(255, 165, 0, 0.25)" }}
          >
            <Zap size={10} />
            {currentQuestion.arena}
          </span>
          {currentQuestion.difficulty && (
            <span
              className="badge-pill"
              style={{
                background: currentQuestion.difficulty === "easy" ? "rgba(34, 197, 94, 0.15)" :
                  currentQuestion.difficulty === "medium" ? "rgba(255, 165, 0, 0.15)" : "rgba(220, 38, 38, 0.15)",
                color: currentQuestion.difficulty === "easy" ? "var(--success)" :
                  currentQuestion.difficulty === "medium" ? "var(--warning)" : "var(--destructive)",
              }}
            >
              {currentQuestion.difficulty === "easy" ? "קל" : currentQuestion.difficulty === "medium" ? "בינוני" : "קשה"}
            </span>
          )}
        </div>

        {/* Question text */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border-strong)" }}
        >
          <p className="text-lg font-bold leading-relaxed" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>
            {currentQuestion.text}
          </p>
        </div>

        {/* Answer options */}
        <div className="flex flex-col gap-2.5">
          {currentQuestion.options.map((option, index) => {
            let optClass = "answer-option";
            if (isShowingFeedback) {
              if (index === currentQuestion.correctIndex) {
                optClass += " correct-reveal";
              }
              if (lastAnswer && index === lastAnswer.selectedIndex) {
                optClass += lastAnswer.isCorrect ? " selected-correct" : " selected-wrong";
              }
            } else if (selectedIndex === index) {
              optClass += " selected-correct"; // temporary highlight
            }

            return (
              <button
                key={index}
                className={optClass}
                onClick={() => handleSelect(index)}
                disabled={isShowingFeedback || selectedIndex !== null}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
                    style={{
                      background: isShowingFeedback && index === currentQuestion.correctIndex
                        ? "rgba(34, 197, 94, 0.25)"
                        : isShowingFeedback && lastAnswer?.selectedIndex === index && !lastAnswer.isCorrect
                          ? "rgba(220, 38, 38, 0.25)"
                          : "var(--accent)",
                      color: isShowingFeedback && index === currentQuestion.correctIndex
                        ? "var(--success)"
                        : isShowingFeedback && lastAnswer?.selectedIndex === index && !lastAnswer.isCorrect
                          ? "var(--destructive)"
                          : "var(--accent-foreground)",
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    {isShowingFeedback && index === currentQuestion.correctIndex ? (
                      <CheckCircle2 size={14} />
                    ) : isShowingFeedback && lastAnswer?.selectedIndex === index && !lastAnswer.isCorrect ? (
                      <XCircle size={14} />
                    ) : (
                      String.fromCharCode(65 + index) // A, B, C, D
                    )}
                  </span>
                  <span className="flex-1 text-right">{option}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Timeout message */}
        {isShowingFeedback && lastAnswer?.selectedIndex === -1 && (
          <div
            className="feedback-box rounded-xl p-4 flex items-center gap-3"
            style={{ background: "rgba(255, 165, 0, 0.15)", border: "1px solid rgba(255, 165, 0, 0.3)" }}
          >
            <AlertTriangle size={20} style={{ color: "var(--warning)", flexShrink: 0 }} />
            <p className="text-sm font-semibold" style={{ color: "var(--warning)" }}>
              הזמן נגמר! לא נבחרה תשובה.
            </p>
          </div>
        )}

        {/* Feedback box */}
        {isShowingFeedback && lastAnswer && lastAnswer.selectedIndex !== -1 && (
          <FeedbackBox
            isCorrect={lastAnswer.isCorrect}
            explanation={currentQuestion.explanation}
            coach={currentQuestion.coach}
            correctAnswer={currentQuestion.options[currentQuestion.correctIndex]}
          />
        )}
      </div>

      {/* Footer — next button */}
      {isShowingFeedback && (
        <div
          className="flex-shrink-0 p-4"
          style={{ borderTop: "1px solid var(--tf-border)", background: "var(--background)" }}
        >
          <button
            onClick={nextQuestion}
            className="w-full py-3.5 rounded-xl font-black text-base transition-all flex items-center justify-center gap-2"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              boxShadow: "0 0 20px rgba(255, 165, 0, 0.35)",
            }}
          >
            {currentQuestionIndex + 1 >= (currentSession?.questions.length ?? 0)
              ? "סיים מבחן"
              : "שאלה הבאה"}
            <ChevronLeft size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Feedback Box ──────────────────────────────────────────────

function FeedbackBox({ isCorrect, explanation, coach, correctAnswer }: {
  isCorrect: boolean;
  explanation: string;
  coach?: string;
  correctAnswer: string;
}) {
  return (
    <div
      className="feedback-box rounded-2xl overflow-hidden"
      style={{
        border: `1px solid ${isCorrect ? "rgba(34, 197, 94, 0.4)" : "rgba(220, 38, 38, 0.4)"}`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{
          background: isCorrect ? "rgba(34, 197, 94, 0.2)" : "rgba(220, 38, 38, 0.2)",
        }}
      >
        {isCorrect ? (
          <CheckCircle2 size={20} style={{ color: "var(--success)", flexShrink: 0 }} />
        ) : (
          <XCircle size={20} style={{ color: "var(--destructive)", flexShrink: 0 }} />
        )}
        <span className="font-black text-base" style={{ color: isCorrect ? "var(--success)" : "var(--destructive)" }}>
          {isCorrect ? "תשובה נכונה! 🎉" : "תשובה שגויה"}
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-4 flex flex-col gap-3" style={{ background: "var(--tf-surface)" }}>
        {!isCorrect && (
          <div className="rounded-lg p-3" style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.2)" }}>
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--success)" }}>תשובה מומלצת:</p>
            <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{correctAnswer}</p>
          </div>
        )}

        <div>
          <p className="text-xs font-semibold mb-1" style={{ color: "var(--muted-foreground)" }}>הסבר:</p>
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{explanation}</p>
        </div>

        {coach && (
          <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: "rgba(255, 165, 0, 0.1)", border: "1px solid rgba(255, 165, 0, 0.2)" }}>
            <MessageSquare size={14} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} />
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: "var(--primary)" }}>טיפ מהמאמן:</p>
              <p className="text-sm" style={{ color: "var(--foreground)" }}>{coach}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
