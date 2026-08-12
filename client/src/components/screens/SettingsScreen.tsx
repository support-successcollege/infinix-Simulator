import { useMemo, useState } from "react";
import { useApp, type TrainingMode } from "@/contexts/AppContext";
import { Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const MODE_OPTIONS: { value: TrainingMode; label: string }[] = [
  { value: "full", label: "מבחן מלא" },
  { value: "quick", label: "אימון מהיר" },
  { value: "mistakes", label: "חזרה על טעויות" },
];

const COUNT_OPTIONS = [5, 10, 15, 20, 30];
const TIME_OPTIONS = [0, 30, 60, 90, 120];

export default function SettingsScreen() {
  const { user, sessions, trainingConfig, setTrainingConfig, updateUserProfile, resetSessions, changePassword } = useApp();
  const sessionCount = sessions.length;

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
    <div className="h-full overflow-y-auto p-4 sm:px-6" style={{ direction: "rtl" }}>
      <div className="screen-form flex flex-col gap-8 py-2">
        <div className="pb-4" style={{ borderBottom: "var(--rule-heavy)" }}>
          <p className="eyebrow mb-2">תצורה</p>
          <h2 className="t-title mb-1" style={{ color: "var(--foreground)" }}>
            הגדרות מערכת
          </h2>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            התאמת סביבת העבודה שלך והעדפות ברירת המחדל לאימון.
          </p>
        </div>

        <section>
          <div className="section-head">
            <span className="section-head-index">01</span>
            <h3 className="section-head-title">פרופיל</h3>
          </div>
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

        <section>
          <div className="section-head">
            <span className="section-head-index">02</span>
            <h3 className="section-head-title">ברירות מחדל לאימון</h3>
          </div>
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

        <section>
          <div className="section-head">
            <span className="section-head-index">03</span>
            <h3 className="section-head-title">החלפת סיסמה</h3>
          </div>
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
                className="btn-primary text-sm"
              >
                {isChangingPassword ? "שומר..." : "החלף סיסמה"}
              </button>
              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                לפחות 8 תווים, הכוללים אות אחת וספרה אחת.
              </span>
            </div>
          </form>
        </section>

        <section>
          <div className="section-head">
            <span className="section-head-index">04</span>
            <h3 className="section-head-title">תחזוקה מקומית</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={restoreDefaults} className="btn-secondary text-sm">
              <RotateCcw size={14} /> שחזור ברירת מחדל
            </button>

            {/* Clearing the history is the only irreversible action in
                the app and it used to fire straight off a single
                click. A confirmation step earns its interruption
                here precisely because it is rare — the rest of the
                app stays free of them so this one still registers. */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  className="btn-secondary text-sm"
                  style={{ background: "var(--tint-danger)", color: "var(--destructive)", borderColor: "var(--line-danger)" }}
                >
                  נקה היסטוריית אימונים
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent style={{ direction: "rtl", textAlign: "right" }}>
                <AlertDialogHeader>
                  <AlertDialogTitle>למחוק את היסטוריית האימונים?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {sessionCount === 0
                      ? "אין מפגשים שמורים כרגע, ולכן לא ימחק דבר."
                      : sessionCount === 1
                        ? "מפגש אימון אחד יימחק מהמכשיר הזה, יחד עם הציון והסטטיסטיקות שלו. הפעולה אינה הפיכה."
                        : `${sessionCount} מפגשי אימון יימחקו מהמכשיר הזה, יחד עם הציונים והסטטיסטיקות שלהם. הפעולה אינה הפיכה.`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>ביטול</AlertDialogCancel>
                  {/* The confirm button carries the destructive colour,
                      not the brand one — the two buttons must not look
                      equally safe when only one of them deletes data. */}
                  <AlertDialogAction
                    style={{
                      background: "var(--destructive)",
                      color: "var(--destructive-foreground)",
                    }}
                    onClick={() => {
                      resetSessions();
                      toast.success("היסטוריית האימונים נוקתה");
                    }}
                  >
                    מחק היסטוריה
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>

        <div className="sticky bottom-0 py-2">
          <button disabled={!dirty} onClick={saveSettings} className="btn-primary w-full text-sm">
            <Save size={16} /> שמור הגדרות
          </button>
        </div>
      </div>
    </div>
  );
}
