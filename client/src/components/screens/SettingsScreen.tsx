import { useMemo, useState } from "react";
import { useApp, type TrainingMode } from "@/contexts/AppContext";
import { Save, RotateCcw, Shield, SlidersHorizontal, UserRound, KeyRound } from "lucide-react";
import { toast } from "sonner";

const MODE_OPTIONS: { value: TrainingMode; label: string }[] = [
  { value: "full", label: "מבחן מלא" },
  { value: "quick", label: "אימון מהיר" },
  { value: "mistakes", label: "חזרה על טעויות" },
];

const COUNT_OPTIONS = [5, 10, 15, 20, 30];
const TIME_OPTIONS = [0, 30, 60, 90, 120];

export default function SettingsScreen() {
  const { user, trainingConfig, setTrainingConfig, updateUserProfile, resetSessions, changePassword } = useApp();

  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  const [name, setName] = useState(user?.name || "");
  const [weeklyGoal, setWeeklyGoal] = useState<number>(user?.weeklyGoal || 5);
  const [mode, setMode] = useState<TrainingMode>(trainingConfig.mode);
  const [questionCount, setQuestionCount] = useState<number>(trainingConfig.questionCount);
  const [timePerQuestion, setTimePerQuestion] = useState<number>(trainingConfig.timePerQuestion);

  const dirty = useMemo(() => {
    return (
      name !== (user?.name || "") ||
      weeklyGoal !== (user?.weeklyGoal || 5) ||
      mode !== trainingConfig.mode ||
      questionCount !== trainingConfig.questionCount ||
      timePerQuestion !== trainingConfig.timePerQuestion
    );
  }, [name, weeklyGoal, mode, questionCount, timePerQuestion, user, trainingConfig]);

  const saveSettings = () => {
    const safeGoal = Math.max(1, Math.min(20, Number(weeklyGoal) || 5));
    updateUserProfile({ name: name.trim() || user?.name || "סטודנט", weeklyGoal: safeGoal });
    setTrainingConfig({ mode, questionCount, timePerQuestion });
    toast.success("ההגדרות נשמרו בהצלחה");
  };

  const submitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nextPassword !== confirmPassword) {
      toast.error("הסיסמאות אינן תואמות");
      return;
    }
    setIsChangingPassword(true);
    try {
      await changePassword(currentPassword, nextPassword);
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      toast.success("הסיסמה הוחלפה בהצלחה");
    } catch (err) {
      toast.error((err as Error)?.message || "החלפת הסיסמה נכשלה");
    } finally {
      setIsChangingPassword(false);
    }
  };

  const restoreDefaults = () => {
    setMode("full");
    setQuestionCount(10);
    setTimePerQuestion(60);
    setWeeklyGoal(5);
    setName(user?.name || "");
    toast.info("שוחזרו ערכי ברירת מחדל");
  };

  return (
    <div className="h-full overflow-y-auto p-4" style={{ direction: "rtl" }}>
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        <div
          className="rounded-2xl p-4"
          style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}
        >
          <h2 className="text-xl font-black mb-1" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>
            הגדרות מערכת
          </h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            התאמת סביבת העבודה שלך והעדפות ברירת המחדל לאימון.
          </p>
        </div>

        <section className="rounded-2xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
          <h3 className="font-bold text-sm mb-3" style={{ color: "var(--foreground)" }}>
            <UserRound size={14} className="inline ml-1" /> פרופיל
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span style={{ color: "var(--muted-foreground)" }}>שם תצוגה</span>
              <input className="tf-input mt-1" value={name} onChange={e => setName(e.target.value)} />
            </label>
            <label className="text-sm">
              <span style={{ color: "var(--muted-foreground)" }}>יעד אימונים שבועי</span>
              <input
                className="tf-input mt-1"
                type="number"
                min={1}
                max={20}
                value={weeklyGoal}
                onChange={e => setWeeklyGoal(Number(e.target.value || 5))}
              />
            </label>
          </div>
        </section>

        <section className="rounded-2xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
          <h3 className="font-bold text-sm mb-3" style={{ color: "var(--foreground)" }}>
            <SlidersHorizontal size={14} className="inline ml-1" /> ברירות מחדל לאימון
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <span style={{ color: "var(--muted-foreground)" }}>מצב אימון</span>
              <select className="tf-input mt-1" value={mode} onChange={e => setMode(e.target.value as TrainingMode)}>
                {MODE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span style={{ color: "var(--muted-foreground)" }}>כמות שאלות</span>
              <select className="tf-input mt-1" value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))}>
                {COUNT_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span style={{ color: "var(--muted-foreground)" }}>זמן לשאלה</span>
              <select className="tf-input mt-1" value={timePerQuestion} onChange={e => setTimePerQuestion(Number(e.target.value))}>
                {TIME_OPTIONS.map(opt => <option key={opt} value={opt}>{opt === 0 ? "ללא הגבלה" : `${opt} שניות`}</option>)}
              </select>
            </label>
          </div>
        </section>

        <section className="rounded-2xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
          <h3 className="font-bold text-sm mb-3" style={{ color: "var(--foreground)" }}>
            <KeyRound size={14} className="inline ml-1" /> החלפת סיסמה
          </h3>
          <form onSubmit={submitPasswordChange} className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <span style={{ color: "var(--muted-foreground)" }}>סיסמה נוכחית</span>
              <input
                className="tf-input mt-1"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                style={{ direction: "ltr", textAlign: "left" }}
              />
            </label>
            <label className="text-sm">
              <span style={{ color: "var(--muted-foreground)" }}>סיסמה חדשה</span>
              <input
                className="tf-input mt-1"
                type="password"
                autoComplete="new-password"
                value={nextPassword}
                onChange={e => setNextPassword(e.target.value)}
                style={{ direction: "ltr", textAlign: "left" }}
              />
            </label>
            <label className="text-sm">
              <span style={{ color: "var(--muted-foreground)" }}>אימות סיסמה</span>
              <input
                className="tf-input mt-1"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={{ direction: "ltr", textAlign: "left" }}
              />
            </label>
            <div className="md:col-span-3 flex items-center gap-3 flex-wrap">
              <button
                type="submit"
                disabled={isChangingPassword || !currentPassword || !nextPassword}
                className="px-4 py-2 rounded-xl text-sm font-bold"
                style={{
                  background:
                    isChangingPassword || !currentPassword || !nextPassword
                      ? "var(--muted)"
                      : "var(--primary)",
                  color:
                    isChangingPassword || !currentPassword || !nextPassword
                      ? "var(--muted-foreground)"
                      : "var(--primary-foreground)",
                }}
              >
                {isChangingPassword ? "שומר..." : "החלף סיסמה"}
              </button>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                לפחות 8 תווים, הכוללים אות אחת וספרה אחת.
              </span>
            </div>
          </form>
        </section>

        <section className="rounded-2xl p-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
          <h3 className="font-bold text-sm mb-3" style={{ color: "var(--foreground)" }}>
            <Shield size={14} className="inline ml-1" /> תחזוקה מקומית
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={restoreDefaults}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
            >
              <RotateCcw size={14} className="inline ml-1" /> שחזור ברירת מחדל
            </button>
            <button
              onClick={() => {
                resetSessions();
                toast.success("היסטוריית האימונים נוקתה");
              }}
              className="px-4 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(220, 38, 38, 0.16)", color: "var(--destructive)", border: "1px solid rgba(220, 38, 38, 0.32)" }}
            >
              נקה היסטוריית אימונים
            </button>
          </div>
        </section>

        <div className="sticky bottom-0 py-2">
          <button
            disabled={!dirty}
            onClick={saveSettings}
            className="w-full py-3 rounded-xl font-black text-sm transition-all"
            style={{
              background: dirty ? "var(--primary)" : "var(--muted)",
              color: dirty ? "var(--primary-foreground)" : "var(--muted-foreground)",
              boxShadow: dirty ? "0 0 14px rgba(255, 165, 0, 0.3)" : "none",
            }}
          >
            <Save size={16} className="inline ml-1" /> שמור הגדרות
          </button>
        </div>
      </div>
    </div>
  );
}
