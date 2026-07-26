/* ============================================================
   ProfileScreen — User Performance Analytics
   Design: Midnight Gradient — stats, charts, session history
   ============================================================ */

import { useApp } from "@/contexts/AppContext";
import { TrendingUp, Award, BookOpen, Target, Clock, CheckCircle2, XCircle, Calendar, Zap } from "lucide-react";

export default function ProfileScreen() {
  const { user, sessions, setScreen } = useApp();

  if (!user) return null;

  const avgScore = sessions.length > 0
    ? Math.round(sessions.reduce((s, sess) => s + sess.scorePct, 0) / sessions.length)
    : 0;

  const bestScore = sessions.length > 0
    ? Math.max(...sessions.map(s => s.scorePct))
    : 0;

  const totalCorrect = sessions.reduce((sum, s) => sum + s.answers.filter(a => a.outcome === "correct").length, 0);
  const totalAnswered = sessions.reduce((sum, s) => sum + s.answers.length, 0);
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  // Score distribution for mini bar chart
  const scoreRanges = [
    { label: "90-100", count: sessions.filter(s => s.scorePct >= 90).length, color: "var(--success)" },
    { label: "75-89", count: sessions.filter(s => s.scorePct >= 75 && s.scorePct < 90).length, color: "var(--primary)" },
    { label: "60-74", count: sessions.filter(s => s.scorePct >= 60 && s.scorePct < 75).length, color: "var(--warning)" },
    { label: "0-59", count: sessions.filter(s => s.scorePct < 60).length, color: "var(--destructive)" },
  ];
  const maxCount = Math.max(...scoreRanges.map(r => r.count), 1);

  // Arena breakdown
  const arenaMap: Record<string, { count: number; totalScore: number }> = {};
  sessions.forEach(s => {
    if (!arenaMap[s.subjectTitle]) arenaMap[s.subjectTitle] = { count: 0, totalScore: 0 };
    arenaMap[s.subjectTitle].count++;
    arenaMap[s.subjectTitle].totalScore += s.scorePct;
  });
  const arenaStats = Object.entries(arenaMap)
    .map(([name, data]) => ({ name, count: data.count, avg: Math.round(data.totalScore / data.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="h-full overflow-y-auto" style={{ direction: "rtl" }}>
      {/* Header */}
      <div
        className="px-4 pt-6 pb-8 relative overflow-hidden"
        style={{ background: "linear-gradient(135deg, rgba(255, 165, 0, 0.15), rgba(183, 146, 79, 0.1))" }}
      >
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, var(--primary), #b7924f)",
              color: "white",
              fontFamily: "Heebo, sans-serif",
            }}
          >
            {user.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-2xl font-black" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>
              {user.name}
            </h1>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{user.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className="badge-pill"
                style={{
                  background: user.role === "manager" ? "rgba(183, 146, 79, 0.2)" : "rgba(255, 165, 0, 0.2)",
                  color: user.role === "manager" ? "var(--warning)" : "var(--primary)",
                  border: `1px solid ${user.role === "manager" ? "rgba(183, 146, 79, 0.3)" : "rgba(255, 165, 0, 0.3)"}`,
                }}
              >
                {user.role === "manager" ? "מנהל" : "סטודנט"}
              </span>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                <Calendar size={10} className="inline ml-1" />
                הצטרף {new Date(user.joinDate).toLocaleDateString("he-IL")}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-4">
        {/* Key stats */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "ממוצע ציון", value: `${avgScore}%`, icon: TrendingUp, color: "var(--primary)" },
            { label: "ציון מקסימלי", value: `${bestScore}%`, icon: Award, color: "var(--success)" },
            { label: "מפגשים", value: sessions.length.toString(), icon: BookOpen, color: "var(--warning)" },
            { label: "דיוק כולל", value: `${accuracy}%`, icon: Target, color: "var(--destructive)" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
                  <Icon size={14} style={{ color }} />
                </div>
                <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</span>
              </div>
              <div className="text-2xl font-black" style={{ color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Score distribution */}
        {sessions.length > 0 && (
          <div className="rounded-xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
            <h3 className="font-bold text-sm mb-4" style={{ color: "var(--foreground)" }}>
              <TrendingUp size={14} className="inline ml-1" style={{ color: "var(--primary)" }} />
              התפלגות ציונים
            </h3>
            <div className="flex items-end gap-3 h-20">
              {scoreRanges.map(range => (
                <div key={range.label} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center" style={{ height: "60px" }}>
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${(range.count / maxCount) * 60}px`,
                        background: range.color,
                        minHeight: range.count > 0 ? "4px" : "0",
                        opacity: range.count > 0 ? 1 : 0.2,
                      }}
                    />
                  </div>
                  <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                    {range.label}
                  </span>
                  <span className="text-xs font-bold" style={{ color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>
                    {range.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Arena performance */}
        {arenaStats.length > 0 && (
          <div className="rounded-xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
            <h3 className="font-bold text-sm mb-3" style={{ color: "var(--foreground)" }}>
              <Zap size={14} className="inline ml-1" style={{ color: "var(--primary)" }} />
              ביצועים לפי זירה
            </h3>
            <div className="flex flex-col gap-2">
              {arenaStats.map(arena => (
                <div key={arena.name} className="flex items-center gap-3">
                  <span className="text-sm font-semibold w-24 flex-shrink-0" style={{ color: "var(--foreground)" }}>
                    {arena.name}
                  </span>
                  <div className="flex-1 progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${arena.avg}%` }} />
                  </div>
                  <span className="text-sm font-black w-10 text-left flex-shrink-0"
                    style={{
                      color: arena.avg >= 80 ? "var(--success)" : arena.avg >= 60 ? "var(--warning)" : "var(--destructive)",
                      fontFamily: "Inter, sans-serif",
                    }}>
                    {arena.avg}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Session history */}
        <div>
          <h3 className="font-bold text-sm mb-3" style={{ color: "var(--foreground)" }}>היסטוריית מפגשים</h3>
          {sessions.length === 0 ? (
            <div className="text-center py-10 rounded-xl" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
              <BookOpen size={32} className="mx-auto mb-3" style={{ color: "var(--muted-foreground)", opacity: 0.4 }} />
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>עדיין אין מפגשים</p>
              <button
                onClick={() => setScreen("wizard")}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-bold"
                style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                התחל אימון
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className="flex items-center gap-3 p-3 rounded-xl"
                  style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}
                >
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm flex-shrink-0"
                    style={{
                      background: session.scorePct >= 80 ? "rgba(34, 197, 94, 0.2)" :
                        session.scorePct >= 60 ? "rgba(255, 165, 0, 0.2)" : "rgba(220, 38, 38, 0.2)",
                      color: session.scorePct >= 80 ? "var(--success)" :
                        session.scorePct >= 60 ? "var(--warning)" : "var(--destructive)",
                      fontFamily: "Inter, sans-serif",
                    }}
                  >
                    {session.scorePct}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{session.subjectTitle}</div>
                    <div className="text-xs flex items-center gap-2" style={{ color: "var(--muted-foreground)" }}>
                      <span>{session.mode === "full" ? "מבחן מלא" : session.mode === "quick" ? "אימון מהיר" : "חזרה"}</span>
                      <span>•</span>
                      <Clock size={10} className="inline" />
                      <span>{new Date(session.startedAt).toLocaleDateString("he-IL")}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <CheckCircle2 size={12} style={{ color: "var(--success)" }} />
                    <span className="text-xs" style={{ color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>
                      {session.answers.filter(a => a.outcome === "correct").length}/{session.questionCount || "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
