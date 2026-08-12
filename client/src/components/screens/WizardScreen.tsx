/* ============================================================
   WizardScreen — 3-Step Training Wizard
   Steps: 1. Settings → 2. Arena → 3. Confirm
   Design: Midnight Gradient — card-within-card wizard
   ============================================================ */

import { useState, useMemo } from "react";
import { useApp, TrainingMode } from "@/contexts/AppContext";
import { CheckCircle2, ChevronRight, ChevronLeft, Search, Play, X, FlaskConical, Hash } from "lucide-react";
import { toast } from "sonner";

const TRAINING_MODES: { id: TrainingMode; label: string; desc: string; icon: string }[] = [
  { id: "full", label: "מבחן מלא", desc: "מבחן מקיף עם כל הנושאים", icon: "🎯" },
  { id: "quick", label: "אימון מהיר", desc: "5–10 שאלות, מהיר ויעיל", icon: "⚡" },
  { id: "mistakes", label: "חזרה על טעויות", desc: "תרגל שאלות שטעית בהן", icon: "🔄" },
];

const QUESTION_COUNTS = [5, 10, 15, 20, 30];
const TIME_OPTIONS = [
  { value: 30, label: "30 שנ'" },
  { value: 60, label: "60 שנ'" },
  { value: 90, label: "90 שנ'" },
  { value: 120, label: "2 דק'" },
  { value: 0, label: "ללא הגבלה" },
];

export default function WizardScreen() {
  const { trainingConfig, setTrainingConfig, arenas, setScreen, startQuiz, isDemoContent } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [arenaSearch, setArenaSearch] = useState("");

  const filteredArenas = useMemo(() =>
    arenas.filter(a =>
      a.name.includes(arenaSearch) ||
      a.category.includes(arenaSearch) ||
      a.summary.includes(arenaSearch)
    ), [arenas, arenaSearch]);

  const canProceedToArena = !!trainingConfig.mode;
  const canProceedToConfirm = !!trainingConfig.arenaId;

  const handleStart = () => {
    const result = startQuiz();
    if (!result.ok) toast.error(result.error || "לא ניתן להתחיל את האימון");
  };

  const stepLabels = ["הגדרות", "זירה", "אישור"];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ direction: "rtl" }}>
      {/* Masthead */}
      <div className="masthead flex-shrink-0">
        <div className="screen-body px-4 sm:px-6 pt-5 pb-4">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setScreen("hub")}
              className="flex items-center gap-1 text-sm font-semibold py-1"
              style={{ color: "var(--accent)" }}
            >
              <ChevronRight size={15} />
              חזרה
            </button>
            <span className="eyebrow">אשף הכנה לאימון</span>
          </div>

          {/* Step indicators. State is carried by the outline and the
              fill, not by three different colours — a completed step
              is outlined in ink, the live one is filled with it. */}
          <div className="flex items-center gap-2">
            {([1, 2, 3] as const).map((s) => {
              const isActive = step === s;
              const isCompleted = step > s;
              const stateClass = isActive ? "active" : isCompleted ? "completed" : "inactive";
              return (
                <button
                  key={s}
                  onClick={() => {
                    if (s < step || (s === 2 && canProceedToArena) || (s === 3 && canProceedToConfirm)) {
                      setStep(s);
                    }
                  }}
                  className={`wizard-step-btn ${stateClass}`}
                  aria-current={isActive ? "step" : undefined}
                >
                  {isCompleted
                    ? <CheckCircle2 size={13} aria-hidden="true" />
                    : <span className="t-numeric">{String(s).padStart(2, "0")}</span>}
                  <span>{stepLabels[s - 1]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {step === 1 && <Step1Settings config={trainingConfig} setConfig={setTrainingConfig} />}
        {step === 2 && (
          <Step2Arena
            arenas={filteredArenas}
            allArenas={arenas}
            selectedId={trainingConfig.arenaId}
            search={arenaSearch}
            setSearch={setArenaSearch}
            onSelect={(id, name) => setTrainingConfig({ arenaId: id, arenaName: name })}
          />
        )}
        {step === 3 && (
          <Step3Confirm config={trainingConfig} arenas={arenas} isDemoContent={isDemoContent} />
        )}
      </div>

      {/* Footer navigation */}
      <div className="flex-shrink-0 p-4 sm:px-6 tf-chrome tf-chrome-bottom">
        {/* The footer tracks the measure of the step above it, so the
            Back/Next pair sits under the content rather than at the
            window's edges. */}
        <div className={step === 2 ? "screen-body-wide" : "screen-form"}>
        {step === 2 ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="t-caption font-bold uppercase" style={{ color: "var(--muted-foreground)", letterSpacing: "0.08em" }}>יעד נוכחי</div>
              <div className="text-sm font-black truncate" style={{ color: "var(--foreground)" }}>
                {trainingConfig.arenaName || "לא נבחרה זירה"}
              </div>
            </div>
            <button onClick={() => setStep(1)} className="btn-secondary text-sm">
              חזרה להגדרות
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedToConfirm}
              className="btn-primary text-sm"
            >
              המשך לאישור
              <ChevronLeft size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            {step > 1 ? (
              <button
                onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}
                className="btn-secondary text-sm"
              >
                <ChevronRight size={16} />
                חזרה
              </button>
            ) : (
              <button onClick={() => setScreen("hub")} className="btn-secondary text-sm">
                <X size={16} />
                ביטול
              </button>
            )}

            {step < 3 ? (
              <button
                onClick={() => setStep(s => (s + 1) as 1 | 2 | 3)}
                disabled={step === 1 ? !canProceedToArena : !canProceedToConfirm}
                className="btn-primary text-sm"
              >
                המשך
                <ChevronLeft size={16} />
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="btn-primary text-base"
              >
                <Play size={18} />
                התחל מבחן
              </button>
            )}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ── Step 1: Settings ──────────────────────────────────────────

function Step1Settings({ config, setConfig }: {
  config: ReturnType<typeof useApp>["trainingConfig"];
  setConfig: ReturnType<typeof useApp>["setTrainingConfig"];
}) {
  return (
    <div className="flex-1 overflow-y-auto p-4 sm:px-6">
      <div className="screen-form flex flex-col gap-8 pt-6">
      {/* Training mode. Selection is an ink fill, not a tint plus a
          glow plus a tick — one signal is enough when it is total. */}
      <section>
        <div className="section-head">
          <span className="section-head-index">01</span>
          <h3 className="section-head-title">מצב אימון</h3>
        </div>
        <div style={{ borderTop: "var(--rule-hair)" }}>
          {TRAINING_MODES.map(mode => {
            const isSelected = config.mode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setConfig({ mode: mode.id })}
                aria-pressed={isSelected}
                className="w-full flex items-center gap-3 px-3 py-3.5 text-right"
                style={{
                  borderBottom: "var(--rule-hair)",
                  background: isSelected ? "var(--foreground)" : "transparent",
                  color: isSelected ? "var(--background)" : "var(--foreground)",
                  transition: "background-color var(--dur-fast) var(--ease-settle), color var(--dur-fast) var(--ease-settle)",
                }}
              >
                <div className="flex-1">
                  <div className="font-semibold text-sm">{mode.label}</div>
                  <div
                    className="t-caption"
                    style={{ color: isSelected ? "inherit" : "var(--muted-foreground)", opacity: isSelected ? 0.75 : 1 }}
                  >
                    {mode.desc}
                  </div>
                </div>
                {isSelected && <CheckCircle2 size={16} className="flex-shrink-0" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* Question count */}
      <section>
        <div className="section-head">
          <span className="section-head-index">02</span>
          <h3 className="section-head-title">כמות שאלות</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          {QUESTION_COUNTS.map(count => {
            const isSelected = config.questionCount === count;
            return (
              <button
                key={count}
                onClick={() => setConfig({ questionCount: count })}
                aria-pressed={isSelected}
                className="btn-chip"
                style={{
                  background: isSelected ? "var(--foreground)" : "transparent",
                  color: isSelected ? "var(--background)" : "var(--foreground)",
                  borderColor: "var(--foreground)",
                  minWidth: "3.25rem",
                }}
              >
                {count}
              </button>
            );
          })}
        </div>
      </section>

      {/* Time per question */}
      <section>
        <div className="section-head">
          <span className="section-head-index">03</span>
          <h3 className="section-head-title">זמן לשאלה</h3>
        </div>
        <div className="flex gap-2 flex-wrap">
          {TIME_OPTIONS.map(opt => {
            const isSelected = config.timePerQuestion === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setConfig({ timePerQuestion: opt.value })}
                aria-pressed={isSelected}
                className="btn-chip"
                style={{
                  background: isSelected ? "var(--foreground)" : "transparent",
                  color: isSelected ? "var(--background)" : "var(--foreground)",
                  borderColor: "var(--foreground)",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>
      </div>
    </div>
  );
}

// ── Step 2: Arena Picker ──────────────────────────────────────

function Step2Arena({ arenas, allArenas, selectedId, search, setSearch, onSelect }: {
  arenas: ReturnType<typeof useApp>["arenas"];
  allArenas: ReturnType<typeof useApp>["arenas"];
  selectedId: string | null;
  search: string;
  setSearch: (v: string) => void;
  onSelect: (id: string, name: string) => void;
}) {
  const maxQuestions = allArenas.reduce((m, a) => Math.max(m, a.questionCount), 0);
  // "Leading" only means something if one arena actually leads. When
  // every arena holds the same number of questions the badge was
  // rendering on all of them at once.
  const leaderCount = allArenas.filter(a => a.questionCount === maxQuestions).length;
  const hasSoleLeader = maxQuestions > 0 && leaderCount === 1;
  const visibleLabel = arenas.length === allArenas.length ? `${allArenas.length} זירות` : `${arenas.length} מתוך ${allArenas.length}`;

  const difficultyLabel = (count: number) => {
    if (count >= 80) return "גבוהה";
    if (count >= 35) return "בינונית";
    return "קלה";
  };

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex-shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b" style={{ borderColor: "var(--tf-border)" }}>
        <div className="screen-body-wide flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <p className="eyebrow mb-2">שלב 02 · טעינת זירה</p>
            <h3 className="t-title mb-1" style={{ color: "var(--foreground)" }}>בחר את זירת המכירה</h3>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              הסימולטור יתאים את השאלות לתחום שתבחר. מומלץ לבחור זירה אחת ולהשלים סבב מלא.
            </p>
          </div>
          <div className="relative w-full md:max-w-xs">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }} />
            <input
              type="text"
              className="tf-input"
              placeholder="חיפוש זירה..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingRight: "2.5rem" }}
            />
          </div>
        </div>
      </div>

      {/* Arena grid — scrollable */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 pb-4">
        <div className="screen-body-wide">
        <div className="flex items-center justify-between py-3">
          <span className="eyebrow">{visibleLabel}</span>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-xs font-semibold underline"
              style={{ color: "var(--accent)", textUnderlineOffset: "3px" }}
            >
              הצג הכל
            </button>
          )}
        </div>
        <div className="arena-picker-grid">
          {arenas.map(arena => {
            const isSelected = selectedId === arena.id;
            return (
              <button
                key={arena.id}
                onClick={() => onSelect(arena.id, arena.name)}
                className={`arena-card text-right ${isSelected ? "selected" : ""}`}
                aria-pressed={isSelected}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-xl leading-none" aria-hidden="true">{arena.icon}</span>
                  {hasSoleLeader && arena.questionCount === maxQuestions && !isSelected && (
                    <span className="badge-pill" style={{ color: "var(--accent)" }}>מוביל</span>
                  )}
                  {isSelected && <CheckCircle2 size={16} className="flex-shrink-0" aria-hidden="true" />}
                </div>
                <div className="t-heading mb-1">{arena.name}</div>
                <div
                  className="t-caption mb-3"
                  style={{ color: isSelected ? "inherit" : "var(--muted-foreground)", opacity: isSelected ? 0.8 : 1 }}
                >
                  {arena.summary}
                </div>
                <div
                  className="flex items-center justify-between t-caption pt-2"
                  style={{
                    borderTop: `1px solid ${isSelected ? "color-mix(in srgb, currentColor 25%, transparent)" : "var(--tf-border)"}`,
                    color: isSelected ? "inherit" : "var(--muted-foreground)",
                    opacity: isSelected ? 0.8 : 1,
                  }}
                >
                  <span><span className="t-numeric">{arena.questionCount}</span> שאלות</span>
                  <span>קושי: {difficultyLabel(arena.questionCount)}</span>
                </div>
              </button>
            );
          })}
        </div>
        {arenas.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--muted-foreground)" }}>
            <Search size={32} className="mx-auto mb-3 opacity-40" />
            <p>לא נמצאו זירות תואמות</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Confirm ───────────────────────────────────────────

function Step3Confirm({ config, arenas, isDemoContent }: {
  config: ReturnType<typeof useApp>["trainingConfig"];
  arenas: ReturnType<typeof useApp>["arenas"];
  isDemoContent: boolean;
}) {
  const arena = arenas.find(a => a.id === config.arenaId);
  const modeLabel = TRAINING_MODES.find(m => m.id === config.mode)?.label ?? config.mode;
  const timeLabel = TIME_OPTIONS.find(t => t.value === config.timePerQuestion)?.label ?? `${config.timePerQuestion}שנ'`;

  // Questions are never repeated to pad a short pool, so a request for
  // more than the arena holds simply yields a shorter quiz. Say so up
  // front rather than surprising the trainee mid-session.
  const available = arena?.questionCount ?? 0;
  const actualCount = available > 0 ? Math.min(config.questionCount, available) : config.questionCount;
  const isTrimmed = available > 0 && config.questionCount > available;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:px-6">
      <div className="screen-form flex flex-col gap-6 pt-6">
      <div>
        <p className="eyebrow mb-2">שלב 03 · אישור</p>
        <h2 className="t-display mb-1">{arena?.name ?? config.arenaName}</h2>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          בדוק את ההגדרות לפני שהשעון מתחיל לרוץ.
        </p>
      </div>

      {/* The brief, set as a spec table. */}
      <div className="data-list">
        {[
          { label: "מצב אימון", value: modeLabel },
          { label: "כמות שאלות", value: `${actualCount}` },
          { label: "זמן לשאלה", value: timeLabel },
          { label: "זירה", value: arena?.name ?? config.arenaName },
          { label: "שאלות במאגר", value: `${available || "—"}` },
        ].map(row => (
          <div key={row.label} className="data-row">
            <span className="data-row-label">{row.label}</span>
            <span className="data-row-value">{row.value}</span>
          </div>
        ))}
      </div>

      {isDemoContent && (
        <div
          role="status"
          className="p-4 flex items-start gap-3"
          style={{ background: "var(--tint-primary-weak)", borderInlineStart: "3px solid var(--accent)" }}
        >
          <FlaskConical size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            <strong>תוכן הדגמה</strong> — האימון ירוץ על שאלות דוגמה, לא על חומר לימוד אמיתי.
          </p>
        </div>
      )}

      {isTrimmed && (
        <div
          role="status"
          className="p-4 flex items-start gap-3"
          style={{ background: "var(--tint-accent-weak)", borderInlineStart: "3px solid var(--foreground)" }}
        >
          <Hash size={16} style={{ color: "var(--foreground)", flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            בזירה הזו יש {available} שאלות בלבד, ולכן האימון יכלול {actualCount} שאלות ולא{" "}
            {config.questionCount}. שאלות לא חוזרות על עצמן באותו מבחן.
          </p>
        </div>
      )}

      <p className="t-caption" style={{ color: "var(--muted-foreground)" }}>
        לאחר תחילת המבחן לא ניתן לשנות הגדרות.
      </p>
      </div>
    </div>
  );
}
