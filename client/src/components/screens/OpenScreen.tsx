/* ============================================================
   OpenScreen — open questions (מקצועית ב׳), graded by AI

   Practice: one case at a time. The student writes an answer to each
   part, presses "בדיקה", and gets points per part, what earned them
   and what was missing, and the model answer.

   Full exam: one past sitting in full, one clock of two and a half
   hours, free movement between cases, answers saved in this browser
   as they are typed. At hand-in every case is graded and the result
   counts towards readiness like any full exam.

   Grading runs on the server (/api/grade) against the model answer
   and rubric in the bank; the client never sees a score it made up.
   ============================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { examFormat } from "@/lib/exam";
import { openQuestionsIn } from "@/lib/questionBank";
import { clearOpenDraft, readOpenDraft, saveOpenDraft } from "@/lib/examDraft";
import type { QuestionBankEntry, QuizAnswer, QuizSession } from "@/types/app";
import { ChevronLeft, ChevronRight, Send, X, CheckCircle2, Loader2, BookOpen, ListChecks } from "lucide-react";
import { toast } from "sonner";

interface CriterionGrade {
  index: number;
  awarded: number;
  max: number;
  note: string;
}
interface PartGrade {
  label: string;
  score: number;
  max: number;
  feedback: string;
  criteria: CriterionGrade[];
}
interface QuestionGrade {
  grades: PartGrade[];
  total: number;
  max: number;
}

type Answers = Record<string, Record<string, string>>;

const GRADE_ENDPOINT = "/api/grade";
const PASS_SHARE = 0.6;

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h > 0 ? `${h}:` : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const partTitle = (label: string) => (label ? `סעיף ${label}׳` : "התשובה");

export default function OpenScreen() {
  const { openRun, practiceBankData, setScreen, authToken, user, recordSession } = useApp();

  const questions = useMemo(() => {
    if (!openRun) return [];
    const pool = openQuestionsIn(practiceBankData?.categories?.[openRun.arenaName]?.questions);
    const byId = new Map(pool.map(q => [q.id!, q]));
    return openRun.questionIds.map(id => byId.get(id)).filter((q): q is QuestionBankEntry => !!q);
  }, [openRun, practiceBankData]);

  const isExam = openRun?.mode === "exam";
  const format = examFormat(openRun?.arenaName || "");

  // A full exam resumes from the draft kept in this browser.
  const draft = useMemo(() => (isExam ? readOpenDraft(user?.id) : null), [isExam, user?.id]);
  const resumed = draft && draft.run.id === openRun?.id ? draft : null;

  const [answers, setAnswers] = useState<Answers>(resumed?.answers ?? {});
  const [current, setCurrent] = useState(resumed?.current ?? 0);
  const [deadline] = useState(() => resumed?.deadline ?? Date.now() + format.minutes * 60_000);
  const [now, setNow] = useState(() => Date.now());
  const [grades, setGrades] = useState<Record<string, QuestionGrade>>({});
  const [grading, setGrading] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [gradingOff, setGradingOff] = useState(false);
  const submittedRef = useRef(false);

  const question = questions[current];
  const secondsLeft = Math.max(0, Math.round((deadline - now) / 1000));

  // Keep the exam draft current.
  useEffect(() => {
    if (!isExam || !openRun || !user || finished) return;
    saveOpenDraft({ userId: user.id, run: openRun, answers, current, deadline });
  }, [isExam, openRun, user, answers, current, deadline, finished]);

  const setAnswer = (qid: string, label: string, text: string) =>
    setAnswers(prev => ({ ...prev, [qid]: { ...(prev[qid] || {}), [label]: text } }));

  const gradeOne = useCallback(
    async (q: QuestionBankEntry): Promise<QuestionGrade | null> => {
      const res = await fetch(GRADE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ questionId: q.id, answers: answers[q.id!] || {} }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 503) {
        setGradingOff(true);
        return null;
      }
      if (!res.ok) throw new Error(body?.error || "הבדיקה נכשלה, נסו שוב");
      return body as QuestionGrade;
    },
    [answers, authToken]
  );

  /** The graded parts as session answers: a part counts as right at 60% of its points. */
  const toAnswers = useCallback(
    (graded: Record<string, QuestionGrade>): QuizAnswer[] =>
      questions.flatMap(q =>
        (graded[q.id!]?.grades || []).map(g => ({
          questionId: `${q.id}#${g.label}`,
          selectedIndex: -1,
          isCorrect: g.max > 0 && g.score >= g.max * PASS_SHARE,
          timeSpent: 0,
          score: g.score,
          max: g.max,
        }))
      ),
    [questions]
  );

  const sessionOf = useCallback(
    (graded: Record<string, QuestionGrade>): QuizSession | null => {
      if (!openRun) return null;
      const gradedQs = questions.filter(q => graded[q.id!]);
      if (gradedQs.length === 0) return null;
      const got = gradedQs.reduce((s, q) => s + graded[q.id!].total, 0);
      const max = isExam
        ? questions.reduce((s, q) => s + (q.parts || []).reduce((t, p) => t + Number(p.points || 0), 0), 0)
        : gradedQs.reduce((s, q) => s + graded[q.id!].max, 0);
      return {
        id: openRun.id,
        arenaName: openRun.arenaName,
        mode: isExam ? "exam" : "quick",
        questions: gradedQs.map(q => ({ id: q.id!, text: "", options: [], correctIndex: 0, explanation: "", arena: openRun.arenaName })),
        answers: toAnswers(graded),
        startTime: openRun.startTime,
        endTime: new Date().toISOString(),
        score: max > 0 ? Math.round((got / max) * 100) : 0,
        isDemo: false,
      };
    },
    [isExam, openRun, questions, toAnswers]
  );

  // Practice: grade the case on screen.
  const checkCurrent = async () => {
    if (!question) return;
    const written = Object.values(answers[question.id!] || {}).some(t => t.trim());
    if (!written) {
      toast.error("כתבו תשובה לפחות לסעיף אחד");
      return;
    }
    setGrading(question.id!);
    try {
      const result = await gradeOne(question);
      if (result) {
        const next = { ...grades, [question.id!]: result };
        setGrades(next);
        const session = sessionOf(next);
        if (session) recordSession(session);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setGrading(null);
    }
  };

  // Exam: grade every case, three at a time.
  const handIn = useCallback(
    async (reason?: "time") => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setConfirming(false);
      if (reason === "time") toast.info("הזמן נגמר. המבחן הוגש לבדיקה.");
      setProgress({ done: 0, total: questions.length });
      const graded: Record<string, QuestionGrade> = {};
      let next = 0;
      let failed = 0;
      const worker = async () => {
        while (next < questions.length) {
          const q = questions[next++];
          try {
            const r = await gradeOne(q);
            if (r) graded[q.id!] = r;
          } catch {
            failed += 1;
          }
          setProgress(p => (p ? { ...p, done: p.done + 1 } : p));
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      setGrades(graded);
      setFinished(true);
      setProgress(null);
      clearOpenDraft();
      if (failed) toast.error(`${failed} שאלות לא נבדקו. אפשר לראות את התשובה לדוגמה שלהן.`);
      const session = sessionOf(graded);
      if (session && Object.keys(graded).length === questions.length) recordSession(session);
    },
    [gradeOne, questions, recordSession, sessionOf]
  );

  useEffect(() => {
    if (!isExam || finished) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) handIn("time");
    }, 1000);
    return () => window.clearInterval(id);
  }, [isExam, finished, deadline, handIn]);

  if (!openRun || questions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4" style={{ direction: "rtl" }}>
        <p style={{ color: "var(--muted-foreground)" }}>אין שאלות להצגה</p>
        <button className="btn-secondary" onClick={() => setScreen("hub")}>חזרה לבית</button>
      </div>
    );
  }

  const leave = () => {
    if (isExam && !finished) toast.info("המבחן נשמר. אפשר לחזור אליו ממסך הבית, השעון ממשיך לרוץ.");
    setScreen("hub");
  };

  // ── Results of a full exam ──
  if (isExam && finished) {
    const got = questions.reduce((s, q) => s + (grades[q.id!]?.total || 0), 0);
    const max = questions.reduce((s, q) => s + (q.parts || []).reduce((t, p) => t + Number(p.points || 0), 0), 0);
    const score = max > 0 ? Math.round((got / max) * 100) : 0;
    const allGraded = questions.every(q => grades[q.id!]);
    return (
      <div className="h-full overflow-y-auto" style={{ direction: "rtl" }}>
        <div className="masthead">
          <div className="screen-body px-4 sm:px-6 pt-8 pb-6">
            <p className="eyebrow mb-3">תוצאות · {openRun.examLabel || openRun.arenaName}</p>
            {allGraded ? (
              <div className="flex items-end justify-between gap-6 flex-wrap">
                <span className="t-numeric leading-none" style={{ fontSize: "clamp(3.5rem, 12vw, 6rem)", fontWeight: 500 }}>{score}</span>
                <h2 className="t-title pb-2" style={{ color: score >= format.pass ? "var(--success)" : "var(--destructive)" }}>
                  {score >= format.pass ? "עברת" : "לא עברת"}
                </h2>
              </div>
            ) : (
              <h2 className="t-title">{gradingOff ? "הבדיקה האוטומטית עוד לא הופעלה" : "חלק מהשאלות לא נבדקו"}</h2>
            )}
            <p className="text-sm mt-2" style={{ color: "var(--muted-foreground)" }}>
              {allGraded ? `${Math.round(got * 10) / 10} מתוך ${max} נקודות · ציון עובר ${format.pass}` : "אפשר להשוות את התשובות שלך לתשובות לדוגמה."}
              {" · "}בדיקה ממוחשבת, לתרגול בלבד
            </p>
          </div>
        </div>
        <div className="screen-body px-4 sm:px-6 py-6 flex flex-col gap-6">
          {questions.map((q, i) => (
            <CaseReview key={q.id} index={i} question={q} answers={answers[q.id!] || {}} grade={grades[q.id!]} />
          ))}
          <button onClick={() => setScreen("hub")} className="btn-primary text-sm">לבית הזירה</button>
          <div className="h-4" />
        </div>
      </div>
    );
  }

  const grade = grades[question.id!];
  const parts = question.parts || [];
  const caseAnswers = answers[question.id!] || {};

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ direction: "rtl", background: "var(--background)" }}>
      <div className="flex-shrink-0 tf-chrome tf-chrome-top">
        <div className="screen-form flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <button onClick={leave} className="flex items-center gap-1 text-sm font-bold py-1" style={{ color: "var(--muted-foreground)" }}>
            <X size={16} aria-hidden="true" />
            יציאה
          </button>
          <div className="text-center min-w-0">
            <div className="text-xs font-bold truncate" style={{ color: "var(--muted-foreground)" }}>
              {isExam ? `מבחן מלא · ${openRun.examLabel || ""}` : `תרגול · ${openRun.arenaName}`}
            </div>
            {isExam ? (
              <div className="t-numeric text-lg font-bold" role="timer" aria-live="off" style={{ color: secondsLeft <= 600 ? "var(--destructive)" : "var(--foreground)" }}>
                {formatClock(secondsLeft)}
              </div>
            ) : (
              <div className="text-sm font-bold">שאלה {current + 1} מתוך {questions.length}</div>
            )}
          </div>
          {isExam ? (
            <button onClick={() => setConfirming(true)} className="btn-primary text-sm" disabled={!!progress}>
              <Send size={15} aria-hidden="true" />
              הגשה
            </button>
          ) : (
            <span className="w-16" aria-hidden="true" />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="screen-form flex flex-col gap-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="eyebrow">שאלה {current + 1}{isExam ? ` מתוך ${questions.length}` : ""}</span>
            {question.topicLabel && <span className="badge-pill" style={{ color: "var(--muted-foreground)" }}>{question.topicLabel}</span>}
            {!isExam && question.examLabel && <span className="badge-pill" style={{ color: "var(--muted-foreground)" }}>{question.examLabel}</span>}
          </div>

          {question.question && (
            <div className="surface-card p-4 text-base leading-relaxed" style={{ whiteSpace: "pre-wrap", color: "var(--foreground)" }}>
              {question.question}
            </div>
          )}

          {parts.map(part => {
            const pg = grade?.grades.find(g => g.label === part.label);
            return (
              <section key={part.label} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="t-heading">{partTitle(part.label)}</h3>
                  <span className="t-numeric text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {pg ? `${pg.score} מתוך ${pg.max}` : `${part.points} נק׳`}
                  </span>
                </div>
                <p className="text-sm leading-relaxed" style={{ whiteSpace: "pre-wrap", color: "var(--foreground)" }}>{part.prompt}</p>
                <label className="sr-only" htmlFor={`ans-${question.id}-${part.label}`}>התשובה שלך ל{partTitle(part.label)}</label>
                <textarea
                  id={`ans-${question.id}-${part.label}`}
                  className="tf-input"
                  rows={6}
                  value={caseAnswers[part.label] || ""}
                  onChange={e => setAnswer(question.id!, part.label, e.target.value)}
                  readOnly={!!grade}
                  placeholder="כתבו את התשובה כאן. נמקו, וחשבו בצעדים."
                  style={{ minHeight: "8rem", lineHeight: 1.6 }}
                />
                {pg && <PartFeedback part={part} grade={pg} />}
                {!pg && gradingOff && <ModelAnswer part={part} />}
              </section>
            );
          })}
        </div>
      </div>

      <div className="flex-shrink-0 tf-chrome tf-chrome-bottom">
        <div className="screen-form flex items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0} className="btn-secondary text-sm disabled:opacity-40">
            <ChevronRight size={16} aria-hidden="true" />
            הקודמת
          </button>
          {!isExam && !grade && (
            <button onClick={checkCurrent} disabled={!!grading} className="btn-primary text-sm">
              {grading ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <ListChecks size={15} aria-hidden="true" />}
              {grading ? "בודקים…" : "בדיקה"}
            </button>
          )}
          {current < questions.length - 1 ? (
            <button onClick={() => setCurrent(c => c + 1)} className={isExam || grade ? "btn-primary text-sm" : "btn-secondary text-sm"}>
              הבאה
              <ChevronLeft size={16} aria-hidden="true" />
            </button>
          ) : isExam ? (
            <button onClick={() => setConfirming(true)} className="btn-primary text-sm" disabled={!!progress}>
              <Send size={15} aria-hidden="true" />
              הגשה
            </button>
          ) : (
            <button onClick={() => setScreen("hub")} className="btn-secondary text-sm">סיום</button>
          )}
        </div>
      </div>

      {confirming && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ background: "rgba(10, 8, 4, 0.55)" }} role="dialog" aria-modal="true" aria-labelledby="open-confirm-title">
          <div className="surface-card p-6 w-full max-w-sm flex flex-col gap-4" style={{ background: "var(--background)" }}>
            <h3 id="open-confirm-title" className="t-title">להגיש לבדיקה?</h3>
            <p className="text-sm">
              {(() => {
                const empty = questions.filter(q => !Object.values(answers[q.id!] || {}).some(t => t.trim())).length;
                return empty > 0 ? `${empty} שאלות בלי תשובה בכלל. ` : "";
              })()}
              כל השאלות ייבדקו עכשיו, זה לוקח כדקה.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handIn()} className="btn-primary flex-1 text-sm">הגשה</button>
              <button onClick={() => setConfirming(false)} className="btn-secondary flex-1 text-sm">חזרה למבחן</button>
            </div>
          </div>
        </div>
      )}

      {progress && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4" style={{ background: "rgba(10, 8, 4, 0.55)" }} role="status" aria-live="polite">
          <div className="surface-card p-6 w-full max-w-sm flex flex-col items-center gap-3 text-center" style={{ background: "var(--background)" }}>
            <Loader2 size={28} className="animate-spin" aria-hidden="true" />
            <p className="t-heading">בודקים את המבחן</p>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {progress.done} מתוך {progress.total} שאלות נבדקו
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelAnswer({ part }: { part: NonNullable<QuestionBankEntry["parts"]>[number] }) {
  return (
    <details className="surface-card p-3">
      <summary className="text-sm font-bold cursor-pointer flex items-center gap-1.5">
        <BookOpen size={14} aria-hidden="true" /> תשובה לדוגמה
      </summary>
      <p className="text-sm leading-relaxed mt-2" style={{ whiteSpace: "pre-wrap" }}>{part.modelAnswer}</p>
      {part.rubric?.length > 0 && (
        <ul className="mt-2 text-xs flex flex-col gap-1" style={{ color: "var(--muted-foreground)" }}>
          {part.rubric.map((r, i) => (
            <li key={i}>({r.points} נק׳) {r.criterion}</li>
          ))}
        </ul>
      )}
      <p className="t-caption mt-2" style={{ color: "var(--muted-foreground)" }}>תשובה ראשונית, בבדיקת צוות INFINIX.</p>
    </details>
  );
}

function PartFeedback({ part, grade }: { part: NonNullable<QuestionBankEntry["parts"]>[number]; grade: PartGrade }) {
  const ok = grade.max > 0 && grade.score >= grade.max * PASS_SHARE;
  return (
    <div className="flex flex-col gap-2">
      <div
        className="p-3 rounded-xl text-sm"
        style={{
          background: ok ? "var(--tint-success-weak)" : "var(--tint-danger-weak)",
          borderInlineStart: `3px solid ${ok ? "var(--success)" : "var(--destructive)"}`,
        }}
      >
        <div className="font-bold mb-1 flex items-center gap-1.5">
          {ok && <CheckCircle2 size={14} aria-hidden="true" />}
          {grade.score} מתוך {grade.max} נקודות
        </div>
        {grade.feedback && <p className="leading-relaxed">{grade.feedback}</p>}
        <ul className="mt-2 flex flex-col gap-1 text-xs">
          {grade.criteria.map(c => (
            <li key={c.index}>
              <span className="t-numeric font-bold" dir="ltr">{c.awarded}/{c.max}</span> · {part.rubric?.[c.index]?.criterion}
              {c.note ? ` · ${c.note}` : ""}
            </li>
          ))}
        </ul>
      </div>
      <ModelAnswer part={part} />
    </div>
  );
}

function CaseReview({ index, question, answers, grade }: { index: number; question: QuestionBankEntry; answers: Record<string, string>; grade?: QuestionGrade }) {
  return (
    <details className="surface-card p-4" open={index === 0}>
      <summary className="cursor-pointer flex items-center justify-between gap-3">
        <span className="t-heading">שאלה {index + 1}{question.topicLabel ? ` · ${question.topicLabel}` : ""}</span>
        <span className="t-numeric text-sm">{grade ? `${grade.total} מתוך ${grade.max}` : "לא נבדקה"}</span>
      </summary>
      <div className="flex flex-col gap-4 mt-3">
        {(question.parts || []).map(part => {
          const pg = grade?.grades.find(g => g.label === part.label);
          return (
            <div key={part.label} className="flex flex-col gap-2">
              <div className="text-sm font-bold">{partTitle(part.label)}: {part.prompt.length > 140 ? `${part.prompt.slice(0, 140)}…` : part.prompt}</div>
              <p className="text-sm p-2 rounded-lg" style={{ background: "var(--tf-surface-soft)", whiteSpace: "pre-wrap" }}>
                {answers[part.label]?.trim() || "לא נכתבה תשובה."}
              </p>
              {pg ? <PartFeedback part={part} grade={pg} /> : <ModelAnswer part={part} />}
            </div>
          );
        })}
      </div>
    </details>
  );
}
