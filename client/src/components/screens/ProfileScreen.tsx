/* ============================================================
   ProfileScreen — performance analytics

   Editorial: figures in a ruled table, distributions as horizontal
   bars against a common baseline, history as a ruled list.
   ============================================================ */

import { useApp } from "@/contexts/AppContext";
import { Clock } from "lucide-react";

export default function ProfileScreen() {
  const { user, sessions, setScreen } = useApp();

  if (!user) return null;

  const avgScore = sessions.length > 0
    ? Math.round(sessions.reduce((s, sess) => s + sess.score, 0) / sessions.length)
    : 0;

  const bestScore = sessions.length > 0
    ? Math.max(...sessions.map(s => s.score))
    : 0;

  const totalCorrect = sessions.reduce((sum, s) => sum + s.answers.filter(a => a.isCorrect).length, 0);
  const totalAnswered = sessions.reduce((sum, s) => sum + s.answers.length, 0);
  const accuracy = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;

  // Score distribution for mini bar chart
  const scoreRanges = [
    { label: "90-100", count: sessions.filter(s => s.score >= 90).length, color: "var(--success)" },
    { label: "75-89", count: sessions.filter(s => s.score >= 75 && s.score < 90).length, color: "var(--primary)" },
    { label: "60-74", count: sessions.filter(s => s.score >= 60 && s.score < 75).length, color: "var(--warning)" },
    { label: "0-59", count: sessions.filter(s => s.score < 60).length, color: "var(--destructive)" },
  ];
  const maxCount = Math.max(...scoreRanges.map(r => r.count), 1);

  // Arena breakdown
  const arenaMap: Record<string, { count: number; totalScore: number }> = {};
  sessions.forEach(s => {
    if (!arenaMap[s.arenaName]) arenaMap[s.arenaName] = { count: 0, totalScore: 0 };
    arenaMap[s.arenaName].count++;
    arenaMap[s.arenaName].totalScore += s.score;
  });
  const arenaStats = Object.entries(arenaMap)
    .map(([name, data]) => ({ name, count: data.count, avg: Math.round(data.totalScore / data.count) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="h-full overflow-y-auto" style={{ direction: "rtl" }}>
      {/* Masthead */}
      <div className="masthead">
        <div className="screen-body px-4 sm:px-6 pt-8 pb-6 flex items-start gap-5">
          {/* An ink square with the initial. A gradient avatar is a
              badge; this is a printer's mark. */}
          <div
            className="w-14 h-14 flex items-center justify-center flex-shrink-0"
            style={{
              background: "var(--foreground)",
              color: "var(--background)",
              fontFamily: "var(--font-display)",
              fontSize: "1.5rem",
              fontWeight: 700,
            }}
            aria-hidden="true"
          >
            {user.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="eyebrow mb-2">
              {user.role === "manager" ? "מנהל" : "סטודנט"}
              {" · "}
              הצטרף {new Date(user.joinDate).toLocaleDateString("he-IL")}
            </p>
            <h1 className="t-title mb-1">{user.name}</h1>
            <p className="text-sm truncate" style={{ color: "var(--muted-foreground)" }}>{user.email}</p>
          </div>
        </div>
      </div>

      <div className="screen-body p-4 sm:px-6 flex flex-col gap-4">
        {/* Key figures — four cells of one ruled table. */}
        <div
          className="grid grid-cols-2 md:grid-cols-4"
          style={{ gap: "1px", background: "var(--tf-border)", border: "1px solid var(--tf-border)" }}
        >
          {[
            { label: "ממוצע ציון", value: `${avgScore}%` },
            { label: "ציון מקסימלי", value: `${bestScore}%` },
            { label: "מפגשים", value: sessions.length.toString() },
            { label: "דיוק כולל", value: `${accuracy}%` },
          ].map(({ label, value }) => (
            <div key={label} className="p-4" style={{ background: "var(--tf-surface)" }}>
              <div className="eyebrow mb-2">{label}</div>
              <div className="t-numeric leading-none" style={{ fontSize: "1.75rem", fontWeight: 500 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Score distribution — a horizontal ruled histogram reads
            better than four vertical bars at this size, and it lets
            the band labels sit on the same baseline as their counts. */}
        {sessions.length > 0 && (
          <section>
            <div className="section-head">
              <span className="section-head-index">01</span>
              <h3 className="section-head-title">התפלגות ציונים</h3>
            </div>
            <div className="flex flex-col gap-2.5">
              {scoreRanges.map(range => (
                <div key={range.label} className="flex items-center gap-3">
                  <span className="t-numeric text-xs w-16 flex-shrink-0" style={{ color: "var(--muted-foreground)" }}>
                    {range.label}
                  </span>
                  <div className="flex-1 h-3" style={{ background: "color-mix(in srgb, var(--foreground) 7%, transparent)" }}>
                    <div
                      style={{
                        width: `${(range.count / maxCount) * 100}%`,
                        height: "100%",
                        background: range.color,
                        transition: "width var(--dur-slow) var(--ease-settle)",
                      }}
                    />
                  </div>
                  <span className="t-numeric text-xs w-6 text-left flex-shrink-0" style={{ color: "var(--foreground)" }}>
                    {range.count}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Arena performance */}
        {arenaStats.length > 0 && (
          <section>
            <div className="section-head">
              <span className="section-head-index">02</span>
              <h3 className="section-head-title">ביצועים לפי זירה</h3>
            </div>
            <div className="flex flex-col gap-2.5">
              {arenaStats.map(arena => (
                <div key={arena.name} className="flex items-center gap-3">
                  <span className="text-sm font-semibold w-28 flex-shrink-0 truncate" style={{ color: "var(--foreground)" }}>
                    {arena.name}
                  </span>
                  <div className="flex-1 progress-bar-track">
                    <div className="progress-bar-fill" style={{ width: `${arena.avg}%` }} />
                  </div>
                  <span
                    className="t-numeric text-sm w-12 text-left flex-shrink-0"
                    style={{
                      fontWeight: 600,
                      color: arena.avg >= 80 ? "var(--success)" : arena.avg >= 60 ? "var(--warning)" : "var(--destructive)",
                    }}
                  >
                    {arena.avg}%
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Session history */}
        <section>
          <div className="section-head">
            <span className="section-head-index">03</span>
            <h3 className="section-head-title">היסטוריית מפגשים</h3>
            {sessions.length > 0 && (
              <span className="section-head-tail eyebrow">{sessions.length}</span>
            )}
          </div>

          {sessions.length === 0 ? (
            <div className="py-10 text-center" style={{ borderTop: "var(--rule-hair)", borderBottom: "var(--rule-hair)" }}>
              <p className="text-sm mb-4" style={{ color: "var(--muted-foreground)" }}>עדיין אין מפגשים</p>
              <button onClick={() => setScreen("wizard")} className="btn-primary text-sm">
                התחל אימון
              </button>
            </div>
          ) : (
            <div className="data-list">
              {sessions.map(session => (
                <div key={session.id} className="data-row">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                      {session.arenaName}
                    </div>
                    <div className="t-caption flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}>
                      <span>{session.mode === "full" ? "מבחן מלא" : session.mode === "quick" ? "אימון מהיר" : "חזרה"}</span>
                      <span aria-hidden="true">·</span>
                      <Clock size={10} aria-hidden="true" />
                      <span className="t-numeric">{new Date(session.startTime).toLocaleDateString("he-IL")}</span>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-4 flex-shrink-0">
                    <span className="t-numeric text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {session.answers.filter(a => a.isCorrect).length}/{session.questions.length || "—"}
                    </span>
                    <span
                      className="t-numeric"
                      style={{
                        fontSize: "1.0625rem",
                        fontWeight: 600,
                        color: session.score >= 80 ? "var(--success)" : session.score >= 60 ? "var(--warning)" : "var(--destructive)",
                      }}
                    >
                      {session.score}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="h-4" />
      </div>
    </div>
  );
}
