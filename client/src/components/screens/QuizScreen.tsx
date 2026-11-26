/* ============================================================
   QuizScreen — quiz engine

   The bar and the footer are translucent material floating over
   the question, not opaque strips carved out of the viewport:
   content passes underneath and blurs, which is what tells you the
   list continues past the chrome.

   Answers highlight on press (CSS `:active`) but only commit on
   release — an answer is not undoable, so a mis-touch has to be
   escapable by dragging away. Questions already answered can be
   opened again read-only, with the clock paused.
   ============================================================ */

import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { fadeOnly, springSettle, springSheet } from "@/lib/motion";
import { ChevronLeft, ChevronRight, Clock, AlertTriangle, CheckCircle2, XCircle, FlaskConical, History } from "lucide-react";

/** Fallback padding used until the chrome has been measured. */
const CHROME_TOP_FALLBACK = 92;
const CHROME_BOTTOM_FALLBACK = 92;

/** Answer keys in Hebrew order — matches how licensing exams label options. */
const HEBREW_KEYS = ["א", "ב", "ג", "ד", "ה", "ו"];

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

  const timeLimit = trainingConfig.timePerQuestion;
  // The clock carries the question it belongs to. A bare number
  // outlived its question: after a timeout it was still 0 when the
  // next question appeared, and that question was "timed out" on
  // arrival, before the reset could land.
  const [clock, setClock] = useState({ index: currentQuestionIndex, left: timeLimit || 60 });
  const timeLeft = clock.index === currentQuestionIndex ? clock.left : timeLimit || 60;
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  // An earlier question opened for another look, or null for the live one.
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const reviewing = reviewIndex !== null;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(Date.now());
  const reduceMotion = useReducedMotion();

  // The scroll area runs under the floating chrome, so it needs to
  // reserve exactly as much room as the chrome actually occupies.
  // Measured rather than hard-coded: the bar grows when the browser's
  // text-size setting is raised, and a fixed inset would clip the
  // first badge at large type.
  const topChromeRef = useRef<HTMLDivElement | null>(null);
  const [topInset, setTopInset] = useState(CHROME_TOP_FALLBACK);

  useEffect(() => {
    const el = topChromeRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      setTopInset(Math.ceil(entry.contentRect.height));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const totalQuestions = currentSession?.questions.length ?? 0;
  const progress = totalQuestions > 0 ? ((currentQuestionIndex) / totalQuestions) * 100 : 0;

  // Reset timer on new question
  useEffect(() => {
    setSelectedIndex(null);
    setReviewIndex(null);
    setClock({ index: currentQuestionIndex, left: timeLimit || 60 });
    startTimeRef.current = Date.now();
  }, [currentQuestionIndex, timeLimit]);

  // Countdown tick. Kept free of side effects: a state updater can be
  // invoked more than once per tick, so submitting from inside it
  // could record the same timeout answer twice. Paused while an
  // earlier question is open, so looking back costs no time.
  useEffect(() => {
    if (isShowingFeedback || reviewing || timeLimit === 0) return;

    const index = currentQuestionIndex;
    timerRef.current = setInterval(() => {
      setClock(c => (c.index === index ? { ...c, left: Math.max(0, c.left - 1) } : c));
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentQuestionIndex, isShowingFeedback, reviewing, timeLimit]);

  // Auto-submit once this question's own clock reaches zero.
  useEffect(() => {
    if (clock.index !== currentQuestionIndex || clock.left > 0) return;
    if (isShowingFeedback || selectedIndex !== null || reviewing) return;
    if (timeLimit === 0) return;

    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    submitAnswer(-1, timeSpent);
  }, [clock, currentQuestionIndex, isShowingFeedback, selectedIndex, reviewing, timeLimit, submitAnswer]);

  const handleSelect = useCallback((index: number) => {
    if (isShowingFeedback || selectedIndex !== null || reviewing) return;
    setSelectedIndex(index);
    if (timerRef.current) clearInterval(timerRef.current);
    const timeSpent = Math.round((Date.now() - startTimeRef.current) / 1000);
    submitAnswer(index, timeSpent);
  }, [isShowingFeedback, selectedIndex, submitAnswer]);

  // Keyboard: 1–6 picks an answer, Enter moves on after feedback.
  const optionCount = currentQuestion?.options.length ?? 0;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (!isShowingFeedback && !reviewing) {
        const n = Number(e.key);
        if (Number.isInteger(n) && n >= 1 && n <= optionCount) {
          e.preventDefault();
          handleSelect(n - 1);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isShowingFeedback, reviewing, optionCount, handleSelect]);

  if (!currentQuestion || !currentSession) {
    return (
      <div className="h-full flex items-center justify-center" style={{ direction: "rtl" }}>
        <div className="text-center">
          <p style={{ color: "var(--muted-foreground)" }}>טוען שאלה...</p>
        </div>
      </div>
    );
  }

  // What is on screen: the live question, or an earlier one opened
  // read-only with the answer that was given to it.
  const viewIndex = reviewIndex ?? currentQuestionIndex;
  const viewQuestion = currentSession.questions[viewIndex] ?? currentQuestion;
  const viewAnswer = reviewing ? currentSession.answers[viewIndex] ?? null : lastAnswer;
  const showAnswer = reviewing || isShowingFeedback;
  const footerVisible = reviewing || isShowingFeedback;
  const goBack = () => setReviewIndex(Math.max(0, viewIndex - 1));
  const goForward = () => setReviewIndex(viewIndex + 1 >= currentQuestionIndex ? null : viewIndex + 1);

  const timePct = timeLimit > 0 ? (timeLeft / timeLimit) * 100 : 100;
  const timerClass = timePct > 50 ? "timer-normal" : timePct > 25 ? "timer-warning" : "timer-danger";
  const timerColor = timePct > 50 ? "var(--foreground)" : timePct > 25 ? "var(--warning)" : "var(--destructive)";

  return (
    <div className="h-full relative overflow-hidden" style={{ direction: "rtl", background: "var(--background)" }}>
      {/* Question area — scrolls beneath the chrome at both ends. */}
      <div
        className="absolute inset-0 overflow-y-auto px-4 sm:px-6"
        style={{
          paddingTop: topInset,
          paddingBottom: footerVisible ? CHROME_BOTTOM_FALLBACK : 24,
        }}
      >
        <div className="screen-form flex flex-col gap-4">
        {/* Looking back at an answered question: say so plainly, the
            clock is paused and nothing here can be changed. */}
        {reviewing && (
          <div
            className="feedback-box p-3 flex items-center gap-2 text-sm font-semibold"
            style={{ background: "var(--tint-primary-weak)", borderInlineStart: "3px solid var(--foreground)", color: "var(--foreground)" }}
          >
            <History size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
            צפייה בשאלה {viewIndex + 1}, שכבר נענתה. השעון עצור.
          </div>
        )}

        {/* Tags. Outlined in their own colour — the fill is reserved
            for an answered state, so an unanswered question carries
            no filled colour at all. */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span className="badge-pill" style={{ color: "var(--muted-foreground)" }}>
            {viewQuestion.arena}
          </span>
          {currentSession.isDemo && (
            <span className="badge-pill" style={{ color: "var(--accent)" }}>
              <FlaskConical size={10} aria-hidden="true" />
              הדגמה
            </span>
          )}
          {viewQuestion.difficulty && (
            <span
              className="badge-pill"
              style={{
                color: viewQuestion.difficulty === "easy" ? "var(--success)" :
                  viewQuestion.difficulty === "medium" ? "var(--warning)" : "var(--destructive)",
              }}
            >
              {viewQuestion.difficulty === "easy" ? "קל" : viewQuestion.difficulty === "medium" ? "בינוני" : "קשה"}
            </span>
          )}
        </div>

        {/* The question is set as a headline, not boxed in a card. */}
        <h2 className="t-title quiz-stem" style={{ color: "var(--foreground)" }}>
          {viewQuestion.text}
        </h2>

        {/* Answer options */}
        <div className="flex flex-col gap-2.5">
          {viewQuestion.options.map((option, index) => {
            let optClass = "answer-option";
            if (showAnswer) {
              if (index === viewQuestion.correctIndex) {
                optClass += " correct-reveal";
              }
              if (viewAnswer && index === viewAnswer.selectedIndex) {
                optClass += viewAnswer.isCorrect ? " selected-correct" : " selected-wrong";
              }
            } else if (selectedIndex === index) {
              optClass += " selected-correct"; // temporary highlight
            }

            const isRevealedCorrect = showAnswer && index === viewQuestion.correctIndex;
            const isRevealedWrong = showAnswer && viewAnswer?.selectedIndex === index && !viewAnswer.isCorrect;

            return (
              <button
                key={index}
                className={optClass}
                onClick={() => handleSelect(index)}
                disabled={showAnswer || selectedIndex !== null}
              >
                <div className="flex items-center gap-3">
                  <span className="answer-key" aria-hidden="true">
                    {isRevealedCorrect ? (
                      <CheckCircle2 size={16} />
                    ) : isRevealedWrong ? (
                      <XCircle size={16} />
                    ) : (
                      HEBREW_KEYS[index] ?? index + 1
                    )}
                  </span>
                  <span className="flex-1 text-right">{option}</span>
                  {!showAnswer && index < 9 && (
                    <span className="kbd-hint hidden md:inline-flex" aria-hidden="true">{index + 1}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Feedback region — announced to screen readers on change. */}
        <div aria-live="polite" aria-atomic="true">
          {showAnswer && viewAnswer && (
            <FeedbackBox
              isCorrect={viewAnswer.isCorrect}
              timedOut={viewAnswer.selectedIndex === -1}
              selectedAnswer={viewQuestion.options[viewAnswer.selectedIndex] || ""}
              correctAnswer={viewQuestion.options[viewQuestion.correctIndex]}
              explanation={viewQuestion.explanation}
            />
          )}
        </div>

        {/* Back and forth through the questions already answered. */}
        {(viewIndex > 0 || reviewing) && (
          <div className="flex items-center justify-between gap-3">
            <button
              onClick={goBack}
              disabled={viewIndex === 0}
              className="flex items-center gap-1 text-sm font-bold py-2 disabled:opacity-40"
              style={{ color: "var(--foreground)" }}
            >
              <ChevronRight size={16} aria-hidden="true" />
              לשאלה הקודמת
            </button>
            {reviewing && (
              <button
                onClick={goForward}
                className="flex items-center gap-1 text-sm font-bold py-2"
                style={{ color: "var(--foreground)" }}
              >
                {viewIndex + 1 >= currentQuestionIndex ? "לשאלה הנוכחית" : "לשאלה הבאה"}
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        </div>
      </div>

      {/* ── Floating top chrome ── */}
      <div ref={topChromeRef} className="absolute top-0 inset-x-0 z-20 tf-chrome tf-chrome-top">
        <div className="screen-form flex items-center justify-between px-4 sm:px-6 py-3">
          {/* Exit */}
          <button
            onClick={() => setScreen("hub")}
            className="flex items-center gap-1 text-sm font-bold py-1"
            style={{ color: "var(--muted-foreground)" }}
          >
            <ChevronLeft size={16} />
            יציאה
          </button>

          {/* Question counter */}
          <div className="flex items-center gap-1.5 t-numeric">
            <span className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
              {currentQuestionIndex + 1}
            </span>
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>/ {totalQuestions}</span>
          </div>

          {/* Timer — polite so it isn't announced every single second. */}
          {timeLimit > 0 && (
            <div
              className={`timer-pill ${timerClass}`}
              style={{ color: timerColor }}
              role="timer"
              aria-live="off"
              aria-label={`נותרו ${timeLeft} שניות`}
            >
              <Clock size={15} aria-hidden="true" />
              {/* Tabular figures: a countdown that reflows every second
                  reads as jitter rather than as time passing. */}
              <span className="t-numeric font-black text-base" style={{ minWidth: "2ch" }}>
                {timeLeft}
              </span>
            </div>
          )}
        </div>

        {/* Progress */}
        <div className="screen-form px-4 sm:px-6 pb-3">
          <div className="flex items-center gap-3">
            <div
              className="flex-1 progress-bar-track"
              role="progressbar"
              aria-valuenow={currentQuestionIndex}
              aria-valuemin={0}
              aria-valuemax={totalQuestions}
              aria-label={`שאלה ${currentQuestionIndex + 1} מתוך ${totalQuestions}`}
            >
              {/* Scaled rather than resized: width is a layout
                  property and animating it costs a reflow every
                  frame, while a transform stays on the compositor.
                  Origin is the right edge because the layout is RTL. */}
              <motion.div
                className="progress-bar-fill"
                initial={false}
                animate={{ scaleX: progress / 100 }}
                transition={reduceMotion ? fadeOnly : springSettle}
                style={{
                  width: "100%",
                  transformOrigin: "right center",
                  transition: "none",
                  willChange: "transform",
                }}
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
      </div>

      {/* ── Floating footer ──
          Rises from the bottom edge and leaves the same way, so the
          control is clearly anchored to the foot of the screen. */}
      <AnimatePresence>
        {footerVisible && (
          <motion.div
            key="quiz-footer"
            className="absolute bottom-0 inset-x-0 z-20 p-4 sm:px-6 tf-chrome tf-chrome-bottom"
            initial={reduceMotion ? { opacity: 0 } : { y: "100%", opacity: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { y: "100%", opacity: 0 }}
            transition={reduceMotion ? fadeOnly : springSheet}
          >
            {reviewing ? (
              <button
                onClick={() => setReviewIndex(null)}
                className="btn-primary screen-form w-full text-base"
              >
                חזרה לשאלה {currentQuestionIndex + 1}
                <ChevronLeft size={18} />
              </button>
            ) : (
              <button
                onClick={nextQuestion}
                className="btn-primary screen-form w-full text-base"
                autoFocus
              >
                {currentQuestionIndex + 1 >= (currentSession?.questions.length ?? 0)
                  ? "סיים מבחן"
                  : "שאלה הבאה"}
                <ChevronLeft size={18} />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Feedback Box ──────────────────────────────────────────────

function FeedbackBox({ isCorrect, timedOut, selectedAnswer, correctAnswer, explanation }: {
  isCorrect: boolean;
  timedOut: boolean;
  selectedAnswer: string;
  correctAnswer: string;
  explanation?: string;
}) {
  const verdictColor = isCorrect ? "var(--success)" : timedOut ? "var(--warning)" : "var(--destructive)";
  const why = (explanation || "").trim();

  return (
    <div
      className="feedback-box p-4"
      style={{
        background: isCorrect ? "var(--tint-success-weak)" : timedOut ? "var(--tint-primary-weak)" : "var(--tint-danger-weak)",
        borderInlineStart: `3px solid ${verdictColor}`,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        {isCorrect
          ? <CheckCircle2 size={16} style={{ color: verdictColor, flexShrink: 0 }} aria-hidden="true" />
          : timedOut
            ? <AlertTriangle size={16} style={{ color: verdictColor, flexShrink: 0 }} aria-hidden="true" />
            : <XCircle size={16} style={{ color: verdictColor, flexShrink: 0 }} aria-hidden="true" />}
        <span className="eyebrow" style={{ color: verdictColor }}>
          {isCorrect ? "תשובה נכונה" : timedOut ? "הזמן נגמר, לא נבחרה תשובה" : "תשובה שגויה"}
        </span>
      </div>

      {/* The two answers as a ruled comparison — no nested boxes. */}
      <div className="data-list" style={{ borderTopColor: "color-mix(in srgb, currentColor 15%, transparent)" }}>
        {!isCorrect && !timedOut && (
          <div className="data-row" style={{ borderBottomColor: "color-mix(in srgb, currentColor 15%, transparent)" }}>
            <span className="data-row-label flex-shrink-0">בחרת</span>
            <span className="text-sm font-semibold text-left" style={{ color: "var(--destructive)" }}>
              {selectedAnswer}
            </span>
          </div>
        )}
        <div className="data-row" style={{ borderBottomColor: "transparent" }}>
          <span className="data-row-label flex-shrink-0">התשובה הנכונה</span>
          <span className="text-sm font-semibold text-left" style={{ color: "var(--foreground)" }}>
            {correctAnswer}
          </span>
        </div>
      </div>

      {why && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid color-mix(in srgb, currentColor 15%, transparent)" }}>
          <div className="eyebrow mb-1" style={{ color: "var(--foreground)" }}>הסבר</div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)", whiteSpace: "pre-line" }}>
            {why}
          </p>
        </div>
      )}
    </div>
  );
}
