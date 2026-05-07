/* ============================================================
   HubScreen — Training Hub / Selection Screen
   Design: Midnight Gradient — dashboard with banners and stats
   ============================================================ */

import { useRef, type ChangeEventHandler } from "react";
import { useApp } from "@/contexts/AppContext";
import { BookOpen, Target, TrendingUp, Clock, Award, ChevronLeft, Upload, Play } from "lucide-react";
import { toast } from "sonner";

const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663547397718/Pvji6kDRrPHhdwxpb2BJTp/hero-bg-oGqfpceyfXMJ44A5hLQiGu.webp";

export default function HubScreen() {
  const {
    user,
    setScreen,
    sessions,
    trainingConfig,
    importQuestionBank,
    clearImportedQuestionBank,
    questionBankLoaded,
    arenas,
  } = useApp();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const recentSessions = sessions.slice(0, 3);
  const avgScore = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + s.score, 0) / sessions.length)
    : 0;

  const weeklyProgress = user?.weeklyProgress ?? 0;
  const weeklyGoal = user?.weeklyGoal ?? 5;
  const weeklyPct = Math.min(100, Math.round((weeklyProgress / weeklyGoal) * 100));

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFilePicked: ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importQuestionBank(file);
      toast.success(`המאגר נטען בהצלחה: ${file.name}`);
    } catch (err) {
      toast.error(`טעינת JSON נכשלה: ${(err as Error)?.message || "קובץ לא תקין"}`);
    } finally {
      e.target.value = "";
    }
  };

  const arenaIconByName = (name: string) => arenas.find(a => a.name === name)?.icon || "💼";

  return (
    <div className="h-full overflow-y-auto" style={{ direction: "rtl" }}>
      {/* Hero banner */}
      <div
        className="relative overflow-hidden"
        style={{
          backgroundImage: `url(${HERO_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
          minHeight: "200px",
        }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0, 0, 0, 0.7) 0%, var(--background) 100%)" }} />
        <div className="relative z-10 p-6 pb-8">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium mb-1" style={{ color: "var(--primary)" }}>
                שלום, {user?.name?.split(" ")[0] ?? "סטודנט"} 👋
              </p>
              <h1 className="text-3xl font-black text-white mb-2" style={{ fontFamily: "Heebo, sans-serif" }}>
                מוכן לאמן?
              </h1>
              <p className="text-sm" style={{ color: "#dfdfdf" }}>
                {sessions.length > 0
                  ? `${sessions.length} מפגשי אימון הושלמו`
                  : "התחל את מסע האימון שלך היום"}
              </p>
            </div>

            {/* Weekly goal ring */}
            <div className="flex flex-col items-center gap-1">
              <div className="relative w-16 h-16">
                <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="rgba(255, 255, 255, 0.14)" strokeWidth="5" />
                  <circle
                    cx="32" cy="32" r="26" fill="none"
                    stroke="var(--primary)"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray="163.4"
                    strokeDashoffset={163.4 * (1 - weeklyPct / 100)}
                    style={{ transition: "stroke-dashoffset 1s ease" }}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-black text-white">{weeklyPct}%</span>
                </div>
              </div>
              <span className="text-xs text-center" style={{ color: "#c2c2c2" }}>
                יעד שבועי
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-4">

        {/* Quick start CTA */}
        <div
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, rgba(255, 165, 0, 0.2), rgba(183, 146, 79, 0.16))",
            border: "1px solid rgba(255, 165, 0, 0.35)",
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black mb-1" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>
                התחל אימון חדש
              </h2>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                בחר זירה, הגדר פרמטרים, ותתחיל לאמן
              </p>
            </div>
            <button
              onClick={() => setScreen("wizard")}
              className="flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all"
              style={{
                background: "var(--primary)",
                color: "var(--primary-foreground)",
                boxShadow: "0 0 20px rgba(255, 165, 0, 0.35)",
              }}
            >
              <Play size={16} />
              התחל
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "ממוצע ציון", value: `${avgScore}%`, icon: TrendingUp, color: "var(--primary)" },
            { label: "מפגשים", value: sessions.length.toString(), icon: BookOpen, color: "var(--success)" },
            { label: "שבוע זה", value: `${weeklyProgress}/${weeklyGoal}`, icon: Target, color: "#b7924f" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="stat-card">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-2"
                style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
                <Icon size={16} style={{ color }} />
              </div>
              <div className="text-xl font-black" style={{ color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>{value}</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Weekly progress bar */}
        <div className="rounded-xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>התקדמות שבועית</span>
            <span className="text-sm font-bold" style={{ color: "var(--primary)" }}>{weeklyProgress} / {weeklyGoal} מפגשים</span>
          </div>
          <div className="progress-bar-track">
            <div className="progress-bar-fill" style={{ width: `${weeklyPct}%` }} />
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
            {weeklyGoal - weeklyProgress > 0
              ? `עוד ${weeklyGoal - weeklyProgress} מפגשים להשלמת היעד השבועי`
              : "🎉 השגת את היעד השבועי!"}
          </p>
        </div>

        {/* Recent sessions */}
        {recentSessions.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm" style={{ color: "var(--foreground)" }}>מפגשים אחרונים</h3>
              <button
                onClick={() => setScreen("profile")}
                className="flex items-center gap-1 text-xs font-semibold"
                style={{ color: "var(--primary)" }}
              >
                הכל <ChevronLeft size={14} />
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {recentSessions.map(session => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-3 rounded-xl"
                  style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-base"
                      style={{ background: "var(--accent)" }}
                    >
                      {arenaIconByName(session.arenaName)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>{session.arenaName}</div>
                      <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        {session.mode === "full" ? "מבחן מלא" : session.mode === "quick" ? "אימון מהיר" : "חזרה על טעויות"} •{" "}
                        <Clock size={10} className="inline" /> {new Date(session.startTime).toLocaleDateString("he-IL")}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="text-lg font-black"
                      style={{
                        color: session.score >= 80 ? "var(--success)" :
                          session.score >= 60 ? "var(--warning)" : "var(--destructive)",
                        fontFamily: "Inter, sans-serif"
                      }}
                    >
                      {session.score}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Continue last session banner */}
        {trainingConfig.arenaId && (
          <div className="banner-card">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(183, 146, 79, 0.2)", border: "1px solid rgba(183, 146, 79, 0.35)" }}>
              <Award size={20} style={{ color: "var(--warning)" }} />
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold" style={{ color: "var(--foreground)" }}>המשך מבחן</div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                זירה: {trainingConfig.arenaName}
              </div>
            </div>
            <button
              onClick={() => setScreen("wizard")}
              className="text-xs font-bold px-3 py-1.5 rounded-lg"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              המשך
            </button>
          </div>
        )}

        {/* JSON upload */}
        <div
          className="rounded-xl p-4 flex items-center gap-3"
          style={{ background: "var(--tf-surface-soft)", border: "1px dashed var(--tf-border)" }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleFilePicked}
          />
          <Upload size={18} style={{ color: "var(--muted-foreground)" }} />
          <div className="flex-1">
            <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>טעינת מאגר שאלות</div>
            <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {questionBankLoaded ? "מאגר פעיל נטען מהמערכת/JSON" : "העלה קובץ question_bank_infinitycloser.json"}
            </div>
          </div>
          {questionBankLoaded && (
            <button
              onClick={clearImportedQuestionBank}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
            >
              איפוס
            </button>
          )}
          <button
            onClick={handleUploadClick}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
          >
            העלה
          </button>
        </div>

        <div className="h-4" /> {/* Bottom padding */}
      </div>
    </div>
  );
}
