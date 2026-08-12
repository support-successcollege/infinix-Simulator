/* ============================================================
   HubScreen — training hub

   Editorial layout: a typographic masthead instead of a photo
   band, then numbered sections divided by rules. The weekly goal
   is a figure and a bar rather than a ring — a dial is decoration
   where a number and a line carry the same reading.
   ============================================================ */

import { useRef, type ChangeEventHandler } from "react";
import { useApp, type BankSource } from "@/contexts/AppContext";
import { Clock, ChevronLeft, Upload, Play, FlaskConical, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const BANK_SOURCE_LABEL: Record<BankSource, string> = {
  shared: "משותף",
  local: "מקומי",
  bundled: "מובנה",
  none: "הדגמה",
};

export default function HubScreen() {
  const {
    user,
    setScreen,
    sessions,
    trainingConfig,
    importQuestionBank,
    clearImportedQuestionBank,
    bankSource,
    isDemoContent,
    weeklyProgress,
    storageAvailable,
  } = useApp();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const recentSessions = sessions.slice(0, 3);
  const avgScore = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + s.score, 0) / sessions.length)
    : 0;

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

  const modeLabel = (mode: string) =>
    mode === "full" ? "מבחן מלא" : mode === "quick" ? "אימון מהיר" : "חזרה על טעויות";

  const scoreColor = (score: number) =>
    score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--destructive)";

  return (
    <div className="h-full overflow-y-auto" style={{ direction: "rtl" }}>
      {/* Masthead */}
      <div className="masthead">
        <div className="screen-body-wide pt-8 pb-6 px-4 sm:px-6">
          <div className="flex items-end justify-between gap-8 flex-wrap">
            <div className="min-w-0">
              <p className="eyebrow mb-3">INFINIX · לוח אימון</p>
              <h1 className="t-display mb-2">מוכן לאמן?</h1>
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                שלום, {user?.name?.split(" ")[0] ?? "סטודנט"}
                {" · "}
                {sessions.length === 0
                  ? "התחל את מסע האימון שלך היום"
                  : sessions.length === 1
                    ? "מפגש אימון אחד הושלם"
                    : `${sessions.length} מפגשי אימון הושלמו`}
              </p>
            </div>

            {/* Weekly goal — a figure, a ratio and a rule. */}
            <div className="flex-shrink-0 w-44">
              <div className="flex items-baseline justify-between mb-1.5">
                <span className="eyebrow">יעד שבועי</span>
                <span className="t-numeric text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {weeklyProgress}/{weeklyGoal}
                </span>
              </div>
              <div className="t-numeric leading-none mb-2" style={{ fontSize: "2.25rem", fontWeight: 500 }}>
                {weeklyPct}%
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" style={{ width: `${weeklyPct}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="screen-body-wide px-4 sm:px-6 py-6 flex flex-col gap-6">

        {/* Demo-content notice — the arenas and questions below are
            placeholders until a real question bank is imported. */}
        {isDemoContent && (
          <div
            role="status"
            className="p-4 flex items-start gap-3"
            style={{
              background: "var(--tint-primary-weak)",
              borderInlineStart: "3px solid var(--accent)",
            }}
          >
            <FlaskConical size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }} />
            <div className="flex-1">
              <div className="eyebrow mb-1" style={{ color: "var(--accent)" }}>תוכן הדגמה</div>
              <div className="text-sm" style={{ color: "var(--foreground)" }}>
                הזירות והשאלות המוצגות הן דוגמאות בלבד ואינן חומר לימוד אמיתי.
                העלה מאגר שאלות כדי להחליף אותן.
              </div>
            </div>
          </div>
        )}

        {/* Storage unavailable — nothing will be remembered. */}
        {!storageAvailable && (
          <div
            role="alert"
            className="p-4 flex items-start gap-3"
            style={{
              background: "var(--tint-danger-weak)",
              borderInlineStart: "3px solid var(--destructive)",
            }}
          >
            <AlertTriangle size={16} style={{ color: "var(--destructive)", flexShrink: 0, marginTop: 3 }} />
            <div className="flex-1">
              <div className="eyebrow mb-1" style={{ color: "var(--destructive)" }}>אחסון מקומי חסום</div>
              <div className="text-sm" style={{ color: "var(--foreground)" }}>
                הדפדפן חוסם שמירה מקומית, ולכן היסטוריית האימונים לא תישמר בין ביקורים.
                נסה לצאת ממצב גלישה פרטית או לאפשר עוגיות.
              </div>
            </div>
          </div>
        )}

        {/* Two columns once there is room to hold them. */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
          <div className="flex flex-col gap-8">

            {/* 01 — start */}
            <section>
              <div className="section-head">
                <span className="section-head-index">01</span>
                <h2 className="section-head-title">אימון חדש</h2>
              </div>
              <div className="flex items-center justify-between gap-6 flex-wrap">
                <p className="text-sm max-w-sm" style={{ color: "var(--muted-foreground)" }}>
                  בחר זירת מכירה, קבע כמות שאלות וזמן לשאלה, והתחל סבב אימון.
                </p>
                <button onClick={() => setScreen("wizard")} className="btn-primary flex-shrink-0">
                  <Play size={15} />
                  התחל אימון
                </button>
              </div>
            </section>

            {/* 02 — performance */}
            <section>
              <div className="section-head">
                <span className="section-head-index">02</span>
                <h2 className="section-head-title">ביצועים</h2>
              </div>

              {/* Figures share their rules with their neighbours: a
                  1px grid gap over the border colour, so three cells
                  read as one ruled table. */}
              <div
                className="grid grid-cols-3"
                style={{ gap: "1px", background: "var(--tf-border)", border: "1px solid var(--tf-border)" }}
              >
                {[
                  { label: "ממוצע ציון", value: `${avgScore}%` },
                  { label: "מפגשים", value: sessions.length.toString() },
                  { label: "שבוע זה", value: `${weeklyProgress}/${weeklyGoal}` },
                ].map(({ label, value }) => (
                  <div key={label} className="p-4" style={{ background: "var(--tf-surface)" }}>
                    <div className="eyebrow mb-2">{label}</div>
                    <div className="t-numeric leading-none" style={{ fontSize: "1.75rem", fontWeight: 500 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <p className="t-caption mt-3" style={{ color: "var(--muted-foreground)" }}>
                {weeklyGoal - weeklyProgress > 0
                  ? `עוד ${weeklyGoal - weeklyProgress} מפגשים להשלמת היעד השבועי.`
                  : "היעד השבועי הושג."}
              </p>
            </section>

          </div>

          <div className="flex flex-col gap-8">

            {/* 03 — recent */}
            {recentSessions.length > 0 && (
              <section>
                <div className="section-head">
                  <span className="section-head-index">03</span>
                  <h2 className="section-head-title">מפגשים אחרונים</h2>
                  <button
                    onClick={() => setScreen("profile")}
                    className="section-head-tail flex items-center gap-1 text-xs font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    הכל <ChevronLeft size={13} />
                  </button>
                </div>

                <div className="data-list">
                  {recentSessions.map(session => (
                    <div key={session.id} className="data-row">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                          {session.arenaName}
                        </div>
                        <div className="t-caption flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}>
                          <span>{modeLabel(session.mode)}</span>
                          <span aria-hidden="true">·</span>
                          <Clock size={10} aria-hidden="true" />
                          <span className="t-numeric">
                            {new Date(session.startTime).toLocaleDateString("he-IL")}
                          </span>
                        </div>
                      </div>
                      <div
                        className="t-numeric flex-shrink-0"
                        style={{ fontSize: "1.125rem", fontWeight: 600, color: scoreColor(session.score) }}
                      >
                        {session.score}%
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Continue where the last configuration left off */}
            {trainingConfig.arenaId && (
              <div className="banner-card">
                <div className="flex-1 min-w-0">
                  <div className="eyebrow mb-1">המשך מבחן</div>
                  <div className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                    {trainingConfig.arenaName}
                  </div>
                </div>
                <button onClick={() => setScreen("wizard")} className="btn-chip flex-shrink-0">
                  המשך
                </button>
              </div>
            )}

            {/* 04 — question bank.
                Naming the source matters now that there are three of
                them: a manager who imports here changes only their own
                browser, while publishing from the admin screen changes
                what every student sees. */}
            <section>
              <div className="section-head">
                <span className="section-head-index">04</span>
                <h2 className="section-head-title">מאגר שאלות</h2>
                <span className="section-head-tail eyebrow">{BANK_SOURCE_LABEL[bankSource]}</span>
              </div>

              <div className="flex items-start gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={handleFilePicked}
                />
                <Upload size={16} style={{ color: "var(--muted-foreground)", marginTop: 3 }} />
                <p className="flex-1 min-w-[10rem] text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {bankSource === "shared"
                    ? "המאגר המשותף שפורסם על ידי המנהל."
                    : bankSource === "local"
                      ? "מאגר שיובא לדפדפן הזה בלבד. תלמידים אחרים לא רואים אותו."
                      : bankSource === "bundled"
                        ? "המאגר שנבנה יחד עם האתר."
                        : "העלה קובץ question_bank_infinitycloser.json כדי להחליף את תוכן ההדגמה."}
                </p>
                {bankSource === "local" && (
                  <button onClick={clearImportedQuestionBank} className="btn-chip flex-shrink-0">
                    הסר
                  </button>
                )}
                <button onClick={handleUploadClick} className="btn-chip flex-shrink-0">
                  העלה
                </button>
              </div>
            </section>

          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
