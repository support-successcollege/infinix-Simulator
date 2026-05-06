/* ============================================================
   ResultsScreen — Quiz Results & Debrief
   Design: Midnight Gradient — score ring, debrief, session summary
   ============================================================ */

import { useEffect, useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { RotateCcw, Home, TrendingUp, CheckCircle2, XCircle, Clock, Award } from "lucide-react";

const RESULTS_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663547397718/Pvji6kDRrPHhdwxpb2BJTp/results-bg-MC6m2ntyXenPL8zYqMWMYr.webp";

function getScoreClass(score: number) {
  if (score >= 90) return { label: "מצוין! 🏆", color: "var(--success)", bg: "rgba(34, 197, 94, 0.15)" };
  if (score >= 75) return { label: "טוב מאוד 👍", color: "var(--primary)", bg: "rgba(255, 165, 0, 0.15)" };
  if (score >= 60) return { label: "בסדר 📈", color: "var(--warning)", bg: "rgba(255, 165, 0, 0.15)" };
  return { label: "צריך שיפור 💪", color: "var(--destructive)", bg: "rgba(220, 38, 38, 0.15)" };
}

export default function ResultsScreen() {
  const { currentSession, setScreen, trainingConfig } = useApp();
  const [displayScore, setDisplayScore] = useState(0);
  const [showDetails, setShowDetails] = useState(false);

  const score = currentSession?.score ?? 0;
  const scoreInfo = getScoreClass(score);

  // Animate score count-up
  useEffect(() => {
    let current = 0;
    const step = score / 50;
    const timer = setInterval(() => {
      current = Math.min(current + step, score);
      setDisplayScore(Math.round(current));
      if (current >= score) clearInterval(timer);
    }, 20);
    return () => clearInterval(timer);
  }, [score]);

  useEffect(() => {
    const t = setTimeout(() => setShowDetails(true), 800);
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

  // Score ring: circumference for r=45 = 2π*45 ≈ 283
  const circumference = 283;
  const strokeOffset = circumference * (1 - score / 100);

  return (
    <div className="h-full overflow-y-auto" style={{ direction: "rtl" }}>
      {/* Hero with results bg */}
      <div
        className="relative flex flex-col items-center justify-center py-10 px-4"
        style={{
          backgroundImage: `url(${RESULTS_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          minHeight: "280px",
        }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0, 0, 0, 0.75) 0%, var(--background) 100%)" }} />

        <div className="relative z-10 flex flex-col items-center gap-4">
          {/* Score ring */}
          <div className="relative w-36 h-36">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="6" />
              <circle
                cx="50" cy="50" r="45" fill="none"
                stroke={scoreInfo.color}
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference}
                style={{
                  strokeDashoffset: strokeOffset,
                  transition: "stroke-dashoffset 1.5s ease-out 0.3s",
                }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span
                className="score-number text-4xl font-black"
                style={{ color: scoreInfo.color, fontFamily: "Inter, sans-serif" }}
              >
                {displayScore}%
              </span>
            </div>
          </div>

          <div className="text-center">
            <h2 className="text-2xl font-black text-white mb-1" style={{ fontFamily: "Heebo, sans-serif" }}>
              {scoreInfo.label}
            </h2>
            <p className="text-sm" style={{ color: "#dfdfdf" }}>
              {currentSession.arenaName} • {currentSession.mode === "full" ? "מבחן מלא" : currentSession.mode === "quick" ? "אימון מהיר" : "חזרה על טעויות"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-4">
        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "נכון", value: correctCount, icon: CheckCircle2, color: "var(--success)" },
            { label: "שגוי", value: wrongCount, icon: XCircle, color: "var(--destructive)" },
            { label: "זמן ממוצע", value: `${avgTime}שנ'`, icon: Clock, color: "var(--warning)" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="stat-card items-center text-center">
              <Icon size={20} style={{ color }} />
              <div className="text-2xl font-black" style={{ color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>{value}</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Debrief */}
        <div
          className="rounded-2xl p-5"
          style={{ background: scoreInfo.bg, border: `1px solid ${scoreInfo.color}30` }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Award size={18} style={{ color: scoreInfo.color }} />
            <h3 className="font-black text-base" style={{ color: scoreInfo.color }}>דיבריף</h3>
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
            {score >= 90
              ? `ביצועים מצוינים! ענית נכון על ${correctCount} מתוך ${totalQ} שאלות. אתה שולט היטב בחומר של זירת ${currentSession.arenaName}.`
              : score >= 75
                ? `ביצועים טובים מאוד! ענית נכון על ${correctCount} מתוך ${totalQ} שאלות. יש עוד מקום לשיפור ב-${wrongCount} שאלות שטעית בהן.`
                : score >= 60
                  ? `ביצועים סבירים. ענית נכון על ${correctCount} מתוך ${totalQ} שאלות. מומלץ לחזור על הנושאים שגרמו לטעויות.`
                  : `יש מקום לשיפור. ענית נכון על ${correctCount} מתוך ${totalQ} שאלות. מומלץ לחזור על החומר ולנסות שוב.`
            }
          </p>
        </div>

        {/* Question breakdown */}
        {showDetails && currentSession.answers.length > 0 && (
          <div>
            <h3 className="font-bold text-sm mb-3" style={{ color: "var(--foreground)" }}>פירוט שאלות</h3>
            <div className="flex flex-col gap-2">
              {currentSession.questions.map((q, idx) => {
                const answer = currentSession.answers[idx];
                if (!answer) return null;
                return (
                  <div
                    key={q.id}
                    className="flex items-start gap-3 p-3 rounded-xl"
                    style={{
                      background: answer.isCorrect ? "rgba(34, 197, 94, 0.08)" : "rgba(220, 38, 38, 0.08)",
                      border: `1px solid ${answer.isCorrect ? "rgba(34, 197, 94, 0.2)" : "rgba(220, 38, 38, 0.2)"}`,
                    }}
                  >
                    {answer.isCorrect
                      ? <CheckCircle2 size={16} style={{ color: "var(--success)", flexShrink: 0, marginTop: 2 }} />
                      : <XCircle size={16} style={{ color: "var(--destructive)", flexShrink: 0, marginTop: 2 }} />
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-snug" style={{ color: "var(--foreground)" }}>
                        {idx + 1}. {q.text.length > 80 ? q.text.slice(0, 80) + "..." : q.text}
                      </p>
                      {!answer.isCorrect && (
                        <p className="text-xs mt-1" style={{ color: "var(--success)" }}>
                          ✓ {q.options[q.correctIndex]}
                        </p>
                      )}
                    </div>
                    <span className="text-xs flex-shrink-0" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                      {answer.timeSpent}שנ'
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Performance trend */}
        <div className="rounded-xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} style={{ color: "var(--primary)" }} />
            <span className="text-sm font-bold" style={{ color: "var(--foreground)" }}>מגמת ביצועים</span>
          </div>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {score >= trainingConfig.questionCount * 8
              ? "אתה בדרך הנכונה! המשך לאמן כדי לשמור על הרמה."
              : "כל אימון מביא אותך קרוב יותר למטרה. אל תוותר!"}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => setScreen("wizard")}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
            style={{
              background: "var(--primary)",
              color: "var(--primary-foreground)",
              boxShadow: "0 0 16px rgba(255, 165, 0, 0.3)",
            }}
          >
            <RotateCcw size={16} />
            אימון נוסף
          </button>
          <button
            onClick={() => setScreen("hub")}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
            style={{
              background: "var(--secondary)",
              color: "var(--secondary-foreground)",
              border: "1px solid var(--border)",
            }}
          >
            <Home size={16} />
            בית
          </button>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
