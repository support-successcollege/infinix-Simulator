/* ============================================================
   ExamScreen — a full exam in the real format

   One clock for the whole exam, free movement between questions,
   answers that can change until hand-in, a "check again" mark, and
   no grading until the end, as in the exam hall. Every change is
   saved to this browser (examDraft.ts), so a reload resumes at the
   same question with the same clock.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { examFormat } from "@/lib/exam";
import { readDraft, saveDraft, type ExamDraft } from "@/lib/examDraft";
import { ChevronLeft, ChevronRight, Flag, Grid3x3, Send, X, Calculator } from "lucide-react";
import { toast } from "sonner";

const HEBREW_KEYS = ["א", "ב", "ג", "ד", "ה", "ו"];

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export default function ExamScreen() {
  const { currentSession, submitExam, setScreen, user } = useApp();
  const session = currentSession?.mode === "exam" ? currentSession : null;

  // The draft written when the exam started, or a fresh one if this
  // browser lost it (storage blocked): the clock then starts now.
  const initial = useMemo<ExamDraft | null>(() => {
    if (!session) return null;
    const saved = readDraft(user?.id);
    if (saved && saved.session.id === session.id) return saved;
    const n = session.questions.length;
    return {
      userId: user?.id || "",
      session,
      selections: Array(n).fill(-1),
      flags: Array(n).fill(false),
      spent: Array(n).fill(0),
      current: 0,
      deadline: Date.now() + examFormat(session.arenaName).minutes * 60_000,
      scope: "all",
    };
    // The draft is read once per exam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const [selections, setSelections] = useState<number[]>(initial?.selections ?? []);
  const [flags, setFlags] = useState<boolean[]>(initial?.flags ?? []);
  const [current, setCurrent] = useState(initial?.current ?? 0);
  const [now, setNow] = useState(() => Date.now());
  const [showMap, setShowMap] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const spentRef = useRef<number[]>(initial?.spent.slice() ?? []);
  const submittedRef = useRef(false);

  const deadline = initial?.deadline ?? Date.now();
  const secondsLeft = Math.max(0, Math.round((deadline - now) / 1000));

  const persist = useCallback(
    (patch: Partial<ExamDraft> = {}) => {
      if (!initial || !user || submittedRef.current) return;
      saveDraft({ ...initial, selections, flags, current, spent: spentRef.current, ...patch });
    },
    [initial, user, selections, flags, current]
  );

  useEffect(() => {
    persist();
  }, [persist]);

  const handIn = useCallback(
    (reason?: "time") => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      if (reason === "time") toast.info("הזמן נגמר. המבחן הוגש עם התשובות שסימנת.");
      submitExam(selections, spentRef.current);
    },
    [selections, submitExam]
  );

  // One clock: seconds go to the question on screen, and time up hands it in.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      spentRef.current[current] = (spentRef.current[current] || 0) + 1;
      if (t >= deadline) handIn("time");
    }, 1000);
    return () => window.clearInterval(id);
  }, [current, deadline, handIn]);

  // Save the time spent every so often, not only on clicks.
  useEffect(() => {
    if (secondsLeft % 10 === 0) persist();
  }, [secondsLeft, persist]);

  // Keyboard: 1–5 picks an option, arrows move between questions.
  const total = session?.questions.length ?? 0;
  const go = useCallback((index: number) => setCurrent(Math.max(0, Math.min(total - 1, index))), [total]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const q = session?.questions[current];
      if (!q) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= q.options.length) {
        setSelections(prev => prev.map((v, i) => (i === current ? n - 1 : v)));
      } else if (e.key === "ArrowLeft") go(current + 1);
      else if (e.key === "ArrowRight") go(current - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming, current, go, session]);

  if (!session || !initial) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ direction: "rtl" }}>
        <p style={{ color: "var(--muted-foreground)" }}>אין מבחן פעיל</p>
        <button className="btn-secondary" onClick={() => setScreen("hub")}>חזרה לבית</button>
      </div>
    );
  }

  const format = examFormat(session.arenaName);
  const question = session.questions[current];
  const answered = selections.filter(v => v >= 0).length;
  const unanswered = total - answered;
  const flagged = flags.filter(Boolean).length;
  const lowTime = secondsLeft <= 5 * 60;

  const choose = (index: number) => setSelections(prev => prev.map((v, i) => (i === current ? index : v)));
  const toggleFlag = () => setFlags(prev => prev.map((v, i) => (i === current ? !v : v)));

  const leave = () => {
    persist();
    toast.info("המבחן נשמר. אפשר לחזור אליו ממסך הבית, השעון ממשיך לרוץ.");
    setScreen("hub");
  };

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ direction: "rtl", background: "var(--background)" }}>
      {/* Top bar: what this is, how long is left, hand in. */}
      <div className="flex-shrink-0 tf-chrome tf-chrome-top">
        <div className="screen-form flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <button onClick={leave} className="flex items-center gap-1 text-sm font-bold py-1" style={{ color: "var(--muted-foreground)" }}>
            <X size={16} aria-hidden="true" />
            יציאה
          </button>
          <div className="text-center min-w-0">
            <div className="text-xs font-bold truncate" style={{ color: "var(--muted-foreground)" }}>
              מבחן מלא · {session.arenaName}
            </div>
            <div
              className="t-numeric text-lg font-bold"
              role="timer"
              aria-live="off"
              aria-label={`נותרו ${formatClock(secondsLeft)}`}
              style={{ color: lowTime ? "var(--destructive)" : "var(--foreground)" }}
            >
              {formatClock(secondsLeft)}
            </div>
          </div>
          <button onClick={() => setConfirming(true)} className="btn-primary text-sm">
            <Send size={15} aria-hidden="true" />
            הגשה
          </button>
        </div>
      </div>

      {/* Question */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="screen-form flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="eyebrow">
              שאלה <span className="t-numeric">{current + 1}</span> מתוך <span className="t-numeric">{total}</span>
              {" · "}
              <span className="t-numeric">{answered}</span> נענו
            </span>
            <div className="flex items-center gap-2">
              {format.calculator && (
                <span className="badge-pill" style={{ color: "var(--muted-foreground)" }}>
                  <Calculator size={11} aria-hidden="true" />
                  מותר מחשבון
                </span>
              )}
              <button
                onClick={toggleFlag}
                aria-pressed={flags[current]}
                className="btn-chip text-xs"
                style={{
                  background: flags[current] ? "var(--accent-bright)" : "var(--tf-surface)",
                  color: flags[current] ? "#140e02" : "var(--foreground)",
                }}
              >
                <Flag size={13} aria-hidden="true" />
                {flags[current] ? "מסומנת לבדיקה" : "לבדוק שוב"}
              </button>
            </div>
          </div>

          <h2 className="t-title quiz-stem" style={{ color: "var(--foreground)", whiteSpace: "pre-line" }}>
            {question.text}
          </h2>

          <div className="flex flex-col gap-2.5" role="radiogroup" aria-label={`תשובות לשאלה ${current + 1}`}>
            {question.options.map((option, index) => {
              const chosen = selections[current] === index;
              return (
                <button
                  key={index}
                  role="radio"
                  aria-checked={chosen}
                  className={`answer-option ${chosen ? "selected-neutral" : ""}`}
                  onClick={() => choose(index)}
                >
                  <div className="flex items-center gap-3">
                    <span className="answer-key" aria-hidden="true">{HEBREW_KEYS[index] ?? index + 1}</span>
                    <span className="flex-1 text-right">{option}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {showMap && (
            <div className="surface-card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-bold">מפת המבחן</span>
                <span className="t-caption" style={{ color: "var(--muted-foreground)" }}>
                  מלא = נענתה · נקודה = לבדוק שוב
                </span>
              </div>
              <div className="exam-map">
                {session.questions.map((q, i) => (
                  <button
                    key={q.id}
                    onClick={() => go(i)}
                    className={`exam-map-cell ${selections[i] >= 0 ? "answered" : ""} ${i === current ? "current" : ""}`}
                    aria-label={`שאלה ${i + 1}${selections[i] >= 0 ? ", נענתה" : ""}${flags[i] ? ", מסומנת לבדיקה" : ""}`}
                    aria-current={i === current ? "true" : undefined}
                  >
                    {i + 1}
                    {flags[i] && <span className="flag-dot" aria-hidden="true" />}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom bar: back, map, next. */}
      <div className="flex-shrink-0 tf-chrome tf-chrome-bottom">
        <div className="screen-form flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <button onClick={() => go(current - 1)} disabled={current === 0} className="btn-secondary text-sm disabled:opacity-40">
            <ChevronRight size={16} aria-hidden="true" />
            הקודמת
          </button>
          <button onClick={() => setShowMap(v => !v)} aria-expanded={showMap} className="btn-chip text-sm">
            <Grid3x3 size={14} aria-hidden="true" />
            {showMap ? "הסתר מפה" : "כל השאלות"}
          </button>
          {current < total - 1 ? (
            <button onClick={() => go(current + 1)} className="btn-primary text-sm">
              הבאה
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          ) : (
            <button onClick={() => setConfirming(true)} className="btn-primary text-sm">
              <Send size={15} aria-hidden="true" />
              הגשה
            </button>
          )}
        </div>
      </div>

      {/* Hand-in check: say what is still open before it is final. */}
      {confirming && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center p-4"
          style={{ background: "rgba(10, 8, 4, 0.55)" }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="exam-confirm-title"
        >
          <div className="surface-card p-6 w-full max-w-sm flex flex-col gap-4" style={{ background: "var(--background)" }}>
            <h3 id="exam-confirm-title" className="t-title">להגיש את המבחן?</h3>
            <p className="text-sm" style={{ color: "var(--foreground)" }}>
              {unanswered > 0
                ? `נשארו ${unanswered} שאלות בלי תשובה. שאלה בלי תשובה נספרת כשגויה.`
                : "ענית על כל השאלות."}
              {flagged > 0 && ` ${flagged} שאלות מסומנות לבדיקה חוזרת.`}
            </p>
            <p className="t-caption" style={{ color: "var(--muted-foreground)" }}>
              אחרי ההגשה אי אפשר לשנות תשובות. נשארו {formatClock(secondsLeft)}.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handIn()} className="btn-primary flex-1 text-sm">הגשה</button>
              <button onClick={() => setConfirming(false)} className="btn-secondary flex-1 text-sm">חזרה למבחן</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
