/* ============================================================
   OpenArenaHome — the home of an open-question arena (מקצועית ב׳)

   Same shape as the multiple-choice arena home: readiness, the exam
   date, and the ways to practise. A full exam here is one complete
   past sitting; practice is one case at a time, picked at random, by
   topic, or from the cases the student scored low on.
   ============================================================ */

import { useMemo, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { openQuestionsIn, shuffle } from "@/lib/questionBank";
import { examFormat, readiness, READY_EXAMS } from "@/lib/exam";
import type { QuestionBankEntry } from "@/types/app";
import { Timer, BookOpen, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";

/** A sitting counts as a full exam when its parts carry most of the 100 points. */
const FULL_SITTING_POINTS = 90;

const pointsOf = (q: QuestionBankEntry) => (q.parts || []).reduce((s, p) => s + Number(p.points || 0), 0);

export default function OpenArenaHome({ arenaName, index }: { arenaName: string; index: string }) {
  const { practiceBankData, sessions, startOpen } = useApp();
  const format = examFormat(arenaName);
  const r = readiness(sessions, arenaName);
  const [topic, setTopic] = useState("");

  const pool = useMemo(
    () => openQuestionsIn(practiceBankData?.categories?.[arenaName]?.questions),
    [practiceBankData, arenaName]
  );

  // Past sittings, newest first, with their questions in exam order.
  const sittings = useMemo(() => {
    const by = new Map<string, QuestionBankEntry[]>();
    pool.forEach(q => {
      const label = q.examLabel || "";
      if (!label) return;
      by.set(label, [...(by.get(label) || []), q]);
    });
    return Array.from(by.entries())
      .map(([label, qs]) => ({ label, year: Number(qs[0]?.year) || 0, questions: qs, points: qs.reduce((s, q) => s + pointsOf(q), 0) }))
      .filter(s => s.points >= FULL_SITTING_POINTS)
      .sort((a, b) => b.year - a.year || b.label.localeCompare(a.label, "he"));
  }, [pool]);

  const topics = useMemo(() => {
    const counts = new Map<string, number>();
    pool.forEach(q => q.topicLabel && counts.set(q.topicLabel, (counts.get(q.topicLabel) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [pool]);

  // Cases with a part the student scored under 60% on, in the latest grading of that part.
  const toRedo = useMemo(() => {
    const latest = new Map<string, boolean>();
    sessions
      .filter(s => s.arenaName === arenaName)
      .slice()
      .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime))
      .forEach(s => s.answers.forEach(a => a.questionId.includes("#") && latest.set(a.questionId, a.isCorrect)));
    const ids = new Set<string>();
    latest.forEach((ok, key) => !ok && ids.add(key.split("#")[0]));
    return pool.filter(q => ids.has(q.id!));
  }, [arenaName, pool, sessions]);

  const practise = (qs: QuestionBankEntry[]) => {
    if (qs.length === 0) {
      toast.error("אין שאלות מתאימות");
      return;
    }
    startOpen({ mode: "practice", arenaName, questionIds: shuffle(qs).slice(0, 10).map(q => q.id!) });
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="section-head">
        <span className="section-head-index">{index}</span>
        <h2 className="section-head-title">{arenaName}</h2>
      </div>

      <div className="surface-card p-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="eyebrow">מד מוכנות</span>
          {r.ready && <span className="badge-pill" style={{ color: "var(--success)" }}>מוכן למבחן</span>}
        </div>
        <div className="t-numeric leading-none mb-3" style={{ fontSize: "2.75rem", fontWeight: 600 }}>{r.percent}%</div>
        <div className="progress-bar-track mb-3">
          <div className="progress-bar-fill" style={{ width: `${r.percent}%` }} />
        </div>
        <p className="text-sm">
          {r.qualifying} מתוך {READY_EXAMS} מבחנים מלאים בשבוע האחרון בציון {r.readyScore} ומעלה.
        </p>
        <p className="t-caption mt-1" style={{ color: "var(--muted-foreground)" }}>
          שאלות פתוחות, נבדקות אוטומטית מול תשובה לדוגמה ומחוון. בדיקה לתרגול בלבד.
        </p>
      </div>

      {/* Full exam: a whole past sitting. */}
      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Timer size={22} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden="true" />
          <div>
            <h3 className="t-heading">מבחן מלא, מבחן עבר שלם</h3>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              שעתיים וחצי · עובר ב-{format.pass} · מותר מחשבון. כותבים תשובות לכל השאלות, ובהגשה כולן נבדקות.
            </p>
          </div>
        </div>
        {sittings.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {sittings.map(s => (
              <button
                key={s.label}
                onClick={() => startOpen({ mode: "exam", arenaName, examLabel: s.label, questionIds: s.questions.map(q => q.id!) })}
                className="btn-secondary text-sm"
              >
                {s.label.replace(/^מקצועית ב׳?\s*·\s*/, "")} · {s.questions.length} שאלות
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>עדיין אין מבחן עבר שלם במאגר.</p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface-card p-5 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <BookOpen size={20} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden="true" />
            <div>
              <div className="t-heading">תרגול שאלה אחר שאלה</div>
              <div className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
                כותבים תשובה, לוחצים "בדיקה" ומקבלים ציון, משוב ותשובה לדוגמה.
              </div>
            </div>
          </div>
          <label className="sr-only" htmlFor="open-topic">נושא</label>
          <select id="open-topic" className="tf-input" value={topic} onChange={e => setTopic(e.target.value)}>
            <option value="">כל הנושאים ({pool.length})</option>
            {topics.map(([t, n]) => (
              <option key={t} value={t}>{t} ({n})</option>
            ))}
          </select>
          <button onClick={() => practise(topic ? pool.filter(q => q.topicLabel === topic) : pool)} className="btn-primary text-sm">
            <Sparkles size={15} aria-hidden="true" />
            התחל תרגול
          </button>
        </div>

        <button onClick={() => practise(toRedo)} disabled={toRedo.length === 0} className="surface-card p-5 text-right flex items-start gap-3 disabled:opacity-60">
          <RotateCcw size={20} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden="true" />
          <div>
            <div className="t-heading">שאלות לחזרה{toRedo.length > 0 ? ` (${toRedo.length})` : ""}</div>
            <div className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              {toRedo.length > 0
                ? "שאלות שבהן קיבלת פחות מ-60% מהנקודות בסעיף כלשהו."
                : "אין כרגע שאלות לחזרה. הן יופיעו כאן אחרי תרגול."}
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}
