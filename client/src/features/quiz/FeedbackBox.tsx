/* ============================================================
   FeedbackBox — the moment a learner actually learns

   Previously this showed "you picked X, the correct answer is Y" and
   nothing else. `explanation` and `coachNote` existed on the question,
   were editable in the manager panel, and were rendered nowhere —
   deliberately, because imported exam data had empty explanations and
   an empty labelled box looks broken (commits fe64b95, 4301e0e).

   The fix is upstream: a question cannot be published without an
   explanation or a citation, so the "full" branch is safe to render.
   The remaining states are handled explicitly rather than by
   scattering `explanation && <div>` truthiness checks.

   Worse than the missing explanation was the timeout path: the old
   QuizScreen hid this component entirely when the clock ran out, so a
   learner who timed out was not even shown the correct answer.

   `variant` exists so the post-exam review screen renders the exact
   same component as in-quiz feedback.
   ============================================================ */

import { useState } from "react";
import { AlertTriangle, BookOpen, CheckCircle2, ChevronDown, Flag, Lightbulb, XCircle } from "lucide-react";

import { getExplanationState } from "@/content/completeness";
import { optionLabel } from "@/lib/hebrew";
import type { Question } from "@/content/types";

export type AnswerOutcome = "correct" | "wrong" | "timeout" | "skipped";

export interface FeedbackBoxProps {
  question: Question;
  outcome: AnswerOutcome;
  /** Null when the learner ran out of time or skipped. */
  selectedIndex: number | null;
  variant?: "inline" | "review";
  onReport?: (question: Question) => void;
}

const OUTCOME_STYLE: Record<AnswerOutcome, { label: string; color: string; tint: string }> = {
  correct: { label: "תשובה נכונה! 🎉", color: "var(--success)", tint: "rgba(34, 197, 94, 0.2)" },
  wrong: { label: "תשובה שגויה", color: "var(--destructive)", tint: "rgba(220, 38, 38, 0.2)" },
  timeout: { label: "הזמן נגמר", color: "var(--warning)", tint: "rgba(255, 165, 0, 0.2)" },
  skipped: { label: "לא נענתה", color: "var(--muted-foreground)", tint: "rgba(120, 120, 120, 0.2)" },
};

export default function FeedbackBox({
  question,
  outcome,
  selectedIndex,
  variant = "inline",
  onReport,
}: FeedbackBoxProps) {
  const [coachOpen, setCoachOpen] = useState(false);
  const style = OUTCOME_STYLE[outcome];
  const explanationState = getExplanationState(question);
  const isCorrect = outcome === "correct";

  return (
    <div
      className="feedback-box rounded-2xl overflow-hidden"
      style={{ border: `1px solid ${style.color}66` }}
    >
      <div className="flex items-center gap-3 px-4 py-3" style={{ background: style.tint }}>
        {isCorrect ? (
          <CheckCircle2 size={20} style={{ color: style.color, flexShrink: 0 }} />
        ) : outcome === "wrong" ? (
          <XCircle size={20} style={{ color: style.color, flexShrink: 0 }} />
        ) : (
          <AlertTriangle size={20} style={{ color: style.color, flexShrink: 0 }} />
        )}
        <span className="font-black text-base" style={{ color: style.color }}>
          {style.label}
        </span>
      </div>

      <div className="px-4 py-4 flex flex-col gap-3" style={{ background: "var(--tf-surface)" }}>
        {variant === "review" && (
          <p className="text-sm font-bold leading-relaxed" style={{ color: "var(--foreground)" }}>
            {question.stem}
          </p>
        )}

        {/* What you picked — omitted when there was nothing to pick. */}
        {selectedIndex !== null && (
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--background)", border: "1px solid var(--tf-border)" }}
          >
            <p className="text-xs font-semibold mb-1" style={{ color: "var(--muted-foreground)" }}>
              בחרת:
            </p>
            <p className="text-sm font-bold" style={{ color: isCorrect ? "var(--success)" : "var(--destructive)" }}>
              {optionLabel(selectedIndex)}. {question.options[selectedIndex] ?? ""}
            </p>
          </div>
        )}

        {/* The correct answer is always shown — including on timeout, which used
            to render nothing at all. */}
        <div
          className="rounded-lg p-3"
          style={{ background: "rgba(34, 197, 94, 0.1)", border: "1px solid rgba(34, 197, 94, 0.2)" }}
        >
          <p className="text-xs font-semibold mb-1" style={{ color: "var(--success)" }}>
            תשובה נכונה:
          </p>
          <p className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
            {optionLabel(question.correctIndex)}. {question.options[question.correctIndex]}
          </p>
        </div>

        {explanationState === "full" && (
          <div
            className="rounded-lg p-3"
            style={{ background: "var(--background)", border: "1px solid var(--tf-border)" }}
          >
            <p className="text-xs font-semibold mb-1.5" style={{ color: "var(--primary)" }}>
              למה זו התשובה הנכונה
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
              {question.explanation}
            </p>
          </div>
        )}

        {question.legalRefs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <BookOpen size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
            {question.legalRefs.map((ref, i) => {
              const text = ref.section ? `${ref.law} · ${ref.section}` : ref.law;
              return ref.url ? (
                <a
                  key={i}
                  href={ref.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="badge-pill"
                  style={{
                    background: "rgba(183, 146, 79, 0.15)",
                    color: "var(--warning)",
                    border: "1px solid rgba(183, 146, 79, 0.3)",
                    textDecoration: "underline",
                  }}
                >
                  {text}
                </a>
              ) : (
                <span
                  key={i}
                  className="badge-pill"
                  style={{
                    background: "rgba(183, 146, 79, 0.15)",
                    color: "var(--warning)",
                    border: "1px solid rgba(183, 146, 79, 0.3)",
                  }}
                >
                  {text}
                </span>
              );
            })}
          </div>
        )}

        {explanationState === "reference-only" && (
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            ההסבר המלא לשאלה זו טרם נכתב.
          </p>
        )}

        {/* No filler text. A missing explanation becomes a work item instead. */}
        {explanationState === "missing" && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              לשאלה זו עדיין אין הסבר.
            </p>
            {onReport && (
              <button
                type="button"
                onClick={() => onReport(question)}
                className="text-xs font-semibold px-2.5 py-1 rounded-lg flex items-center gap-1 flex-shrink-0"
                style={{
                  background: "var(--secondary)",
                  color: "var(--secondary-foreground)",
                  border: "1px solid var(--border)",
                }}
              >
                <Flag size={11} /> דווח על שאלה
              </button>
            )}
          </div>
        )}

        {question.coachNote.trim().length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setCoachOpen(v => !v)}
              aria-expanded={coachOpen}
              className="w-full flex items-center gap-2 text-xs font-semibold py-1"
              style={{ color: "var(--primary)" }}
            >
              <Lightbulb size={13} />
              טיפ לבחינה
              <ChevronDown
                size={13}
                style={{
                  marginInlineStart: "auto",
                  transform: coachOpen ? "rotate(180deg)" : "none",
                  transition: "transform 0.2s",
                }}
              />
            </button>
            {coachOpen && (
              <p
                className="text-sm leading-relaxed mt-1 rounded-lg p-3"
                style={{
                  color: "var(--foreground)",
                  background: "var(--background)",
                  border: "1px solid var(--tf-border)",
                }}
              >
                {question.coachNote}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
