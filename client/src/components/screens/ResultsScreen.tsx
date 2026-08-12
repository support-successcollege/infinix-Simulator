/* ============================================================
   ResultsScreen — results and debrief

   Editorial: the score is the headline, the breakdown is a ruled
   list, and colour appears only where it means correct or wrong.
   ============================================================ */

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { useApp } from "@/contexts/AppContext";
import { RotateCcw, Home, CheckCircle2, XCircle } from "lucide-react";

/* The verdict band. Emoji are gone — the number and the wording
   carry it, and a printed report does not wink at you. */
function getScoreClass(score: number) {
  if (score >= 90) return { label: "שליטה מלאה", color: "var(--success)", line: "var(--success)" };
  if (score >= 75) return { label: "ביצוע טוב", color: "var(--foreground)", line: "var(--foreground)" };
  if (score >= 60) return { label: "סביר", color: "var(--warning)", line: "var(--warning)" };
  return { label: "דורש שיפור", color: "var(--destructive)", line: "var(--destructive)" };
}

export default function ResultsScreen() {
  const { currentSession, setScreen, trainingConfig } = useApp();
  const [displayScore, setDisplayScore] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  const reduceMotion = useReducedMotion();

  const score = currentSession?.score ?? 0;
  const scoreInfo = getScoreClass(score);

  // Score count-up.
  //
  // The old version stepped a fixed amount on a 20ms setInterval, so
  // the number climbed at a constant rate and then stopped dead —
  // motion with no deceleration reads as a machine counting, not as
  // a value arriving. This decelerates into the final number on the
  // display's own clock (rAF), and honours reduced motion by simply
  // showing the result.
  useEffect(() => {
    if (reduceMotion) {
      setDisplayScore(score);
      return;
    }

    let frame = 0;
    const durationMs = 900;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // Cubic ease-out: fast off the mark, settling into the target.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayScore(Math.round(score * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score, reduceMotion]);

  useEffect(() => {
    const t = setTimeout(() => setShowDetails(true), 700);
    return () => clearTimeout(t);
  }, []);

  if (!currentSession) {
    return (
      <div className="h-full flex items-center justify-center" style={{ direction: "rtl" }}>
        <p style={{ color: "var(--muted-foreground)" }}>אין תוצאות להציג</p>
      </div>
    );
  }

  const totalQ = currentSession.questions.length;
  const correctCount = currentSession.answers.filter(a => a.isCorrect).length;
  const wrongCount = Math.max(0, totalQ - correctCount);
  const avgTime = currentSession.answers.length > 0
    ? Math.round(currentSession.answers.reduce((s, a) => s + a.timeSpent, 0) / currentSession.answers.length)
    : 0;

  return (
    <div className="h-full overflow-y-auto" style={{ direction: "rtl" }}>
      {/* Masthead.
          The score is the headline: set at display size in the mono
          face, with a rule underneath carrying the same value. The
          dial it replaces said nothing the number did not. */}
      <div className="masthead">
        <div className="screen-body px-4 sm:px-6 pt-8 pb-6">
          <p className="eyebrow mb-3">
            תוצאות · {currentSession.arenaName} · {currentSession.mode === "full" ? "מבחן מלא" : currentSession.mode === "quick" ? "אימון מהיר" : "חזרה על טעויות"}
          </p>

          <div className="flex items-end justify-between gap-6 flex-wrap mb-4">
            <span
              className="score-number t-numeric leading-none"
              style={{ fontSize: "clamp(3.5rem, 12vw, 6rem)", fontWeight: 500, color: scoreInfo.color }}
            >
              {displayScore}%
            </span>
            <h2 className="t-title pb-2">{scoreInfo.label}</h2>
          </div>

          <div className="progress-bar-track" role="presentation">
            <div
              className="progress-bar-fill"
              style={{
                width: `${score}%`,
                background: scoreInfo.color,
                transition: "width 1.2s var(--ease-settle) 0.2s",
              }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="screen-body px-4 sm:px-6 py-6 flex flex-col gap-8">
        {/* Figures */}
        <div
          className="grid grid-cols-3"
          style={{ gap: "1px", background: "var(--tf-border)", border: "1px solid var(--tf-border)" }}
        >
          {[
            { label: "נכון", value: String(correctCount), color: "var(--success)" },
            { label: "שגוי", value: String(wrongCount), color: "var(--destructive)" },
            { label: "זמן ממוצע", value: `${avgTime}″`, color: "var(--foreground)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-4" style={{ background: "var(--tf-surface)" }}>
              <div className="eyebrow mb-2">{label}</div>
              <div className="t-numeric leading-none" style={{ fontSize: "1.75rem", fontWeight: 500, color }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Debrief — a paragraph under a rule, the way a report reads. */}
        <section>
          <div className="section-head">
            <span className="section-head-index">01</span>
            <h3 className="section-head-title">דיבריף</h3>
          </div>
          <p className="t-body max-w-prose" style={{ color: "var(--foreground)" }}>
            {score >= 90
              ? `ענית נכון על ${correctCount} מתוך ${totalQ} שאלות. השליטה שלך בחומר של זירת ${currentSession.arenaName} מלאה.`
              : score >= 75
                ? `ענית נכון על ${correctCount} מתוך ${totalQ} שאלות. נותרו ${wrongCount} שאלות שטעית בהן — שם נמצא הפער.`
                : score >= 60
                  ? `ענית נכון על ${correctCount} מתוך ${totalQ} שאלות. מומלץ לחזור על הנושאים שגרמו לטעויות לפני הסבב הבא.`
                  : `ענית נכון על ${correctCount} מתוך ${totalQ} שאלות. מומלץ לחזור על החומר ולהריץ סבב נוסף.`
            }
            {" "}
            {score >= trainingConfig.questionCount * 8
              ? "המשך באותו קצב כדי לשמור על הרמה."
              : "סבב נוסף בזירה הזו יסגור את הפער מהר יותר מאשר מעבר לזירה חדשה."}
          </p>
        </section>

        {/* Question breakdown — a ruled list, one row per question. */}
        {showDetails && currentSession.answers.length > 0 && (
          <section>
            <div className="section-head">
              <span className="section-head-index">02</span>
              <h3 className="section-head-title">פירוט שאלות</h3>
              <span className="section-head-tail eyebrow">
                {correctCount}/{totalQ}
              </span>
            </div>

            <div className="data-list">
              {currentSession.questions.map((q, idx) => {
                const answer = currentSession.answers[idx];
                if (!answer) return null;
                return (
                  <div key={q.id} className="data-row items-start">
                    <span
                      className="t-numeric flex-shrink-0 pt-0.5"
                      style={{ color: "var(--muted-foreground)", fontSize: "0.75rem", minWidth: "2ch" }}
                    >
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    {answer.isCorrect
                      ? <CheckCircle2 size={15} style={{ color: "var(--success)", flexShrink: 0, marginTop: 3 }} aria-label="נכון" />
                      : <XCircle size={15} style={{ color: "var(--destructive)", flexShrink: 0, marginTop: 3 }} aria-label="שגוי" />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-snug" style={{ color: "var(--foreground)" }}>
                        {q.text.length > 90 ? q.text.slice(0, 90) + "…" : q.text}
                      </p>
                      {!answer.isCorrect && (
                        <p className="t-caption mt-1" style={{ color: "var(--success)" }}>
                          {q.options[q.correctIndex]}
                        </p>
                      )}
                    </div>
                    <span className="t-numeric text-xs flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>
                      {answer.timeSpent}″
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {/* Action buttons */}
        <div className="flex gap-3">
          <button onClick={() => setScreen("wizard")} className="btn-primary flex-1 text-sm">
            <RotateCcw size={15} />
            אימון נוסף
          </button>
          <button onClick={() => setScreen("hub")} className="btn-secondary flex-1 text-sm">
            <Home size={15} />
            בית
          </button>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
