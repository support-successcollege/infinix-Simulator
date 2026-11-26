/* ============================================================
   HubScreen — the student's home

   One question per screen: what do I do now. The student picks an
   arena (when they hold more than one), sees how ready they are and
   how long is left to the exam, and starts one of three things:
   a full exam in the real format, practice by topic, or their own
   mistakes. Managers also get the question-bank tools below.
   ============================================================ */

import { useEffect, useMemo, useRef, useState, type ChangeEventHandler } from "react";
import { useApp, type BankSource } from "@/contexts/AppContext";
import { EMPTY_FILTERS, toQuizQuestions } from "@/lib/questionBank";
import { daysUntil, examFormat, openMistakes, readiness, recentYears, READY_EXAMS } from "@/lib/exam";
import { readDraft, readExamDates, readOpenDraft, saveExamDate } from "@/lib/examDraft";
import OpenArenaHome from "@/components/screens/OpenArenaHome";
import { Clock, ChevronLeft, Upload, FlaskConical, AlertTriangle, Timer, BookOpen, RotateCcw, CheckCircle2, CalendarDays, PlayCircle } from "lucide-react";
import { toast } from "sonner";

const BANK_SOURCE_LABEL: Record<BankSource, string> = {
  shared: "משותף",
  local: "מקומי",
  bundled: "מובנה",
  none: "לא נטען",
};

function minutesLabel(minutes: number): string {
  if (minutes === 150) return "שעתיים וחצי";
  if (minutes === 90) return "שעה וחצי";
  if (minutes === 120) return "שעתיים";
  return `${minutes} דקות`;
}

const modeLabel = (mode: string) =>
  mode === "exam" ? "מבחן מלא" : mode === "full" ? "מבחן" : mode === "quick" ? "תרגול" : "הטעויות שלי";

const scoreColor = (score: number) =>
  score >= 75 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--destructive)";

export default function HubScreen() {
  const {
    user,
    setScreen,
    sessions,
    arenas,
    trainingConfig,
    setTrainingConfig,
    practiceBankData,
    startQuiz,
    startExam,
    resumeExam,
    startOpen,
    importQuestionBank,
    clearImportedQuestionBank,
    bankSource,
    isDemoContent,
    storageAvailable,
  } = useApp();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isManager = user?.role === "manager";

  // The arena on screen: the one chosen before, or the only one there is.
  const selected = arenas.find(a => a.name === trainingConfig.arenaName) ?? (arenas.length === 1 ? arenas[0] : null);
  useEffect(() => {
    if (selected && trainingConfig.arenaName !== selected.name) {
      setTrainingConfig({ arenaId: selected.id, arenaName: selected.name });
    }
  }, [selected, setTrainingConfig, trainingConfig.arenaName]);

  const draft = readDraft(user?.id);
  const openDraft = readOpenDraft(user?.id);
  const draftLeft = draft ? Math.max(0, Math.round((draft.deadline - Date.now()) / 60_000)) : 0;

  const pool = useMemo(
    () => (selected ? toQuizQuestions(practiceBankData?.categories?.[selected.name]?.questions, selected.name) : []),
    [practiceBankData, selected]
  );
  const years = useMemo(() => recentYears(pool, 5), [pool]);
  const mistakes = useMemo(() => {
    if (!selected) return 0;
    const open = openMistakes(sessions, selected.name);
    return pool.filter(q => open.has(q.id)).length;
  }, [pool, selected, sessions]);

  const [dates, setDates] = useState<Record<string, string>>(() => readExamDates(user?.id));
  const examDate = selected ? dates[selected.name] || "" : "";
  const daysLeft = daysUntil(examDate);

  const recent = sessions.slice(0, 4);

  const choose = (arenaId: string, arenaName: string) => setTrainingConfig({ arenaId, arenaName });

  const begin = (result: { ok: boolean; error?: string }) => {
    if (!result.ok) toast.error(result.error || "לא ניתן להתחיל");
  };

  const handleFilePicked: ChangeEventHandler<HTMLInputElement> = async e => {
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

  return (
    <div className="h-full overflow-y-auto" style={{ direction: "rtl" }}>
      {/* Masthead */}
      <div className="masthead">
        <div className="screen-body-wide pt-10 pb-8 px-4 sm:px-6">
          <p className="eyebrow mb-3">INFINIX · סימולטור בחינות</p>
          <h1 className="t-display mb-2">שלום, {user?.name?.split(" ")[0] ?? "סטודנט"}</h1>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {selected ? `מתכוננים ל${selected.name}.` : "בחרו זירה כדי להתחיל."}
          </p>
        </div>
      </div>

      <div className="screen-body-wide px-4 sm:px-6 py-6 flex flex-col gap-6">
        {isDemoContent && (
          <div role="status" className="p-4 flex items-start gap-3 rounded-xl" style={{ background: "var(--tint-primary-weak)", borderInlineStart: "3px solid var(--accent)" }}>
            <FlaskConical size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }} />
            <div className="text-sm" style={{ color: "var(--foreground)" }}>
              <strong>לא נטען מאגר שאלות.</strong> אין כרגע שאלות לתרגול.
            </div>
          </div>
        )}

        {!storageAvailable && (
          <div role="alert" className="p-4 flex items-start gap-3 rounded-xl" style={{ background: "var(--tint-danger-weak)", borderInlineStart: "3px solid var(--destructive)" }}>
            <AlertTriangle size={16} style={{ color: "var(--destructive)", flexShrink: 0, marginTop: 3 }} />
            <div className="text-sm" style={{ color: "var(--foreground)" }}>
              הדפדפן חוסם שמירה מקומית. התרגולים נשמרים בשרת, אבל מבחן שנקטע לא יחזור מאותה נקודה.
            </div>
          </div>
        )}

        {/* An exam left open comes first: it is the thing to do now. */}
        {draft && (
          <div className="banner-card">
            <PlayCircle size={22} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="eyebrow mb-1">המשך מאיפה שעצרת</div>
              <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                מבחן מלא ב{draft.session.arenaName}
                {" · "}
                {draftLeft > 0 ? `נשארו ${draftLeft} דקות` : "הזמן נגמר, נגיש את מה שסימנת"}
              </div>
            </div>
            <button onClick={() => resumeExam()} className="btn-primary flex-shrink-0 text-sm">
              המשך מבחן
            </button>
          </div>
        )}

        {openDraft && (
          <div className="banner-card">
            <PlayCircle size={22} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <div className="eyebrow mb-1">המשך מאיפה שעצרת</div>
              <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                {openDraft.run.examLabel || openDraft.run.arenaName}
                {" · "}
                {openDraft.deadline > Date.now() ? `נשארו ${Math.round((openDraft.deadline - Date.now()) / 60_000)} דקות` : "הזמן נגמר, נגיש לבדיקה"}
              </div>
            </div>
            <button onClick={() => startOpen({ ...openDraft.run })} className="btn-primary flex-shrink-0 text-sm">
              המשך מבחן
            </button>
          </div>
        )}

        {/* Arena choice, for a student who holds more than one. */}
        {arenas.length > 1 && (
          <section>
            <div className="section-head">
              <span className="section-head-index">01</span>
              <h2 className="section-head-title">הזירות שלי</h2>
            </div>
            <div className="arena-picker-grid">
              {arenas.map(arena => {
                const r = readiness(sessions, arena.name);
                const isSelected = selected?.id === arena.id;
                return (
                  <button
                    key={arena.id}
                    onClick={() => choose(arena.id, arena.name)}
                    aria-pressed={isSelected}
                    className={`arena-card text-right ${isSelected ? "selected" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <span className="t-heading">{arena.name}</span>
                      {r.ready && <CheckCircle2 size={16} aria-label="מוכן" />}
                    </div>
                    <div className="flex items-baseline justify-between t-caption mb-1.5" style={{ opacity: 0.85 }}>
                      <span>מוכנות</span>
                      <span className="t-numeric font-bold">{r.percent}%</span>
                    </div>
                    <div className="progress-bar-track">
                      <div className="progress-bar-fill" style={{ width: `${r.percent}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {arenas.length === 0 && !isDemoContent && (
          <div className="surface-card p-6 text-center text-sm" style={{ color: "var(--muted-foreground)" }}>
            עדיין לא נפתחו לך זירות תרגול. הזירות נפתחות לפי הקורסים שלך במערכת הלימוד, ואפשר לפנות למכללה.
          </div>
        )}

        {selected?.kind === "open" && (
          <OpenArenaHome key={selected.id} arenaName={selected.name} index={arenas.length > 1 ? "02" : "01"} />
        )}

        {selected && selected.kind !== "open" && <ArenaHome
          key={selected.id}
          arenaName={selected.name}
          index={arenas.length > 1 ? "02" : "01"}
          years={years}
          mistakes={mistakes}
          examDate={examDate}
          daysLeft={daysLeft}
          onDate={date => {
            if (!user) return;
            saveExamDate(user.id, selected.name, date);
            setDates(readExamDates(user.id));
          }}
          onExam={scope => begin(startExam(scope))}
          onTopics={() => {
            setTrainingConfig({ mode: "quick", timePerQuestion: 0, arenaId: selected.id, arenaName: selected.name });
            setScreen("wizard");
          }}
          onMistakes={() =>
            begin(
              startQuiz({
                mode: "mistakes",
                questionCount: 20,
                timePerQuestion: 0,
                filters: EMPTY_FILTERS,
                arenaId: selected.id,
                arenaName: selected.name,
              })
            )
          }
        />}

        {/* Recent practice */}
        {recent.length > 0 && (
          <section>
            <div className="section-head">
              <span className="section-head-index">{arenas.length > 1 ? "03" : "02"}</span>
              <h2 className="section-head-title">תרגולים אחרונים</h2>
              <button onClick={() => setScreen("profile")} className="section-head-tail flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--accent)" }}>
                הכל <ChevronLeft size={13} />
              </button>
            </div>
            <div className="data-list surface-card px-4">
              {recent.map(session => (
                <div key={session.id} className="data-row">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate" style={{ color: "var(--foreground)" }}>
                      {session.arenaName}
                    </div>
                    <div className="t-caption flex items-center gap-1.5" style={{ color: "var(--muted-foreground)" }}>
                      <span>{modeLabel(session.mode)}</span>
                      <span aria-hidden="true">·</span>
                      <Clock size={10} aria-hidden="true" />
                      <span className="t-numeric">{new Date(session.startTime).toLocaleDateString("he-IL")}</span>
                    </div>
                  </div>
                  <div className="t-numeric flex-shrink-0" style={{ fontSize: "1.125rem", fontWeight: 600, color: scoreColor(session.score) }}>
                    {session.score}%
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Question bank — managers only. Importing here changes this
            browser; publishing from the manager screen changes what
            every student sees. */}
        {isManager && (
          <section>
            <div className="section-head">
              <span className="section-head-index">·</span>
              <h2 className="section-head-title">מאגר שאלות</h2>
              <span className="section-head-tail eyebrow">{BANK_SOURCE_LABEL[bankSource]}</span>
            </div>
            <div className="surface-card p-4 flex items-start gap-3 flex-wrap">
              <input ref={fileInputRef} type="file" accept=".json,application/json" className="hidden" onChange={handleFilePicked} />
              <Upload size={16} style={{ color: "var(--muted-foreground)", marginTop: 3 }} />
              <p className="flex-1 min-w-[10rem] text-sm" style={{ color: "var(--muted-foreground)" }}>
                {bankSource === "shared"
                  ? "המאגר המשותף שפורסם על ידי המנהל."
                  : bankSource === "local"
                    ? "מאגר שיובא לדפדפן הזה בלבד. תלמידים אחרים לא רואים אותו."
                    : bankSource === "bundled"
                      ? "המאגר שנבנה יחד עם האתר."
                      : "העלה קובץ מאגר כדי להתחיל לתרגל."}
              </p>
              {bankSource === "local" && (
                <button onClick={clearImportedQuestionBank} className="btn-chip flex-shrink-0">הסר</button>
              )}
              <button onClick={() => fileInputRef.current?.click()} className="btn-chip flex-shrink-0">העלה</button>
            </div>
          </section>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}

// ── One arena: readiness, countdown and the three ways to practise ──

function ArenaHome({
  arenaName,
  index,
  years,
  mistakes,
  examDate,
  daysLeft,
  onDate,
  onExam,
  onTopics,
  onMistakes,
}: {
  arenaName: string;
  index: string;
  years: number[];
  mistakes: number;
  examDate: string;
  daysLeft: number | null;
  onDate: (date: string) => void;
  onExam: (scope: "all" | "last5") => void;
  onTopics: () => void;
  onMistakes: () => void;
}) {
  const { sessions } = useApp();
  const format = examFormat(arenaName);
  const r = readiness(sessions, arenaName);
  const span = years.length ? (years.length > 1 ? `${years[years.length - 1]}–${years[0]}` : String(years[0])) : "";

  return (
    <section className="flex flex-col gap-4">
      <div className="section-head">
        <span className="section-head-index">{index}</span>
        <h2 className="section-head-title">{arenaName}</h2>
      </div>

      {/* Readiness and the countdown, side by side. */}
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="surface-card p-5">
          <div className="flex items-baseline justify-between mb-2">
            <span className="eyebrow">מד מוכנות</span>
            {r.ready && <span className="badge-pill" style={{ color: "var(--success)" }}>מוכן למבחן</span>}
          </div>
          <div className="t-numeric leading-none mb-3" style={{ fontSize: "2.75rem", fontWeight: 600 }}>{r.percent}%</div>
          <div className="progress-bar-track mb-3">
            <div className="progress-bar-fill" style={{ width: `${r.percent}%` }} />
          </div>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            {r.qualifying} מתוך {READY_EXAMS} מבחנים מלאים בשבוע האחרון בציון {r.readyScore} ומעלה.
          </p>
          <p className="t-caption mt-1" style={{ color: "var(--muted-foreground)" }}>
            {r.lastScore === null ? "עדיין לא עשית מבחן מלא בזירה הזו." : `ציון אחרון במבחן מלא: ${r.lastScore}.`}
          </p>
        </div>

        <div className="surface-card p-5 flex flex-col gap-3">
          <span className="eyebrow flex items-center gap-1.5"><CalendarDays size={13} aria-hidden="true" /> תאריך המבחן שלי</span>
          {daysLeft !== null ? (
            <div>
              <span className="t-numeric leading-none" style={{ fontSize: "2.25rem", fontWeight: 600 }}>{daysLeft}</span>
              <span className="text-sm mr-2">{daysLeft === 1 ? "יום למבחן" : "ימים למבחן"}</span>
            </div>
          ) : (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>הזינו תאריך ונספור איתכם לאחור.</p>
          )}
          <label className="sr-only" htmlFor="exam-date">תאריך המבחן</label>
          <input id="exam-date" type="date" className="tf-input" value={examDate} onChange={e => onDate(e.target.value)} style={{ direction: "ltr" }} />
        </div>
      </div>

      {/* Full exam: the main action. */}
      <div className="surface-card p-5 flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Timer size={22} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden="true" />
          <div>
            <h3 className="t-heading">מבחן מלא, כמו ביום המבחן</h3>
            <p className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              {format.questions} שאלות · {minutesLabel(format.minutes)} · עובר ב-{format.pass}
              {format.calculator ? " · מותר מחשבון" : ""}. שעון אחד לכל המבחן, אפשר לחזור לשאלות ולשנות תשובות עד ההגשה.
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button onClick={() => onExam("all")} className="btn-primary text-sm">שאלות מכל השנים</button>
          <button onClick={() => onExam("last5")} disabled={years.length === 0} className="btn-secondary text-sm">
            רק 5 השנים האחרונות{span ? ` (${span})` : ""}
          </button>
        </div>
      </div>

      {/* The other two ways to practise. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={onTopics} className="surface-card p-5 text-right flex items-start gap-3 hover:opacity-90">
          <BookOpen size={20} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden="true" />
          <div>
            <div className="t-heading">תרגול לפי נושא</div>
            <div className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              בוחרים פרק ומתרגלים בלי לחץ זמן, עם הסבר אחרי כל שאלה.
            </div>
          </div>
        </button>
        <button onClick={onMistakes} disabled={mistakes === 0} className="surface-card p-5 text-right flex items-start gap-3 disabled:opacity-60">
          <RotateCcw size={20} style={{ color: "var(--accent)", flexShrink: 0 }} aria-hidden="true" />
          <div>
            <div className="t-heading">הטעויות שלי{mistakes > 0 ? ` (${mistakes})` : ""}</div>
            <div className="text-sm mt-1" style={{ color: "var(--muted-foreground)" }}>
              {mistakes > 0
                ? "שאלות שטעית בהן חוזרות עד שעונים עליהן נכון פעמיים ברצף."
                : "אין כרגע טעויות פתוחות. הן יופיעו כאן אחרי תרגול."}
            </div>
          </div>
        </button>
      </div>
    </section>
  );
}
