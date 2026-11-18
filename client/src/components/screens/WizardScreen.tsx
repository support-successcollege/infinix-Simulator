/* ============================================================
   WizardScreen — 3-Step Training Wizard
   Steps: 1. Settings → 2. Arena → 3. Confirm
   Design: Midnight Gradient — card-within-card wizard
   ============================================================ */

import { useState, useMemo } from "react";
import { useApp, TrainingMode, QuestionFilters } from "@/contexts/AppContext";
import { EMPTY_FILTERS, buildFacets, filterQuestions, toQuizQuestions, type Facet } from "@/lib/questionBank";
import { CheckCircle2, ChevronRight, ChevronLeft, Search, Play, X, FlaskConical, Hash, SlidersHorizontal, Repeat2 } from "lucide-react";
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
  const { trainingConfig, setTrainingConfig, arenas, setScreen, startQuiz, isDemoContent, questionBankData } = useApp();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [arenaSearch, setArenaSearch] = useState("");

  const filteredArenas = useMemo(() =>
    arenas.filter(a =>
      a.name.includes(arenaSearch) ||
      a.category.includes(arenaSearch) ||
      a.summary.includes(arenaSearch)
    ), [arenas, arenaSearch]);

  const filters = trainingConfig.filters ?? EMPTY_FILTERS;

  // The practice pool of the arena the trainee actually picked. Demo
  // content carries no exam taxonomy, so it stays out of the filters.
  const arenaQuestions = useMemo(() => {
    if (isDemoContent) return [];
    const arenaName = arenas.find(a => a.id === trainingConfig.arenaId)?.name || trainingConfig.arenaName;
    if (!arenaName) return [];
    return toQuizQuestions(questionBankData?.categories?.[arenaName]?.questions, arenaName);
  }, [arenas, isDemoContent, questionBankData, trainingConfig.arenaId, trainingConfig.arenaName]);

  const facets = useMemo(() => buildFacets(arenaQuestions), [arenaQuestions]);
  const matchCount = useMemo(
    () => filterQuestions(arenaQuestions, filters).length,
    [arenaQuestions, filters]
  );

  const hasFilters =
    filters.years.length > 0 ||
    filters.topics.length > 0 ||
    filters.qtypes.length > 0 ||
    filters.repeatedOnly;
  // Only a real pool can be emptied by a filter; demo runs are never blocked.
  const noMatches = arenaQuestions.length > 0 && matchCount === 0;

  const setFilters = (patch: Partial<QuestionFilters>) =>
    setTrainingConfig({ filters: { ...filters, ...patch } });

  const clearFilters = () => setTrainingConfig({ filters: EMPTY_FILTERS });

  const canProceedToArena = !!trainingConfig.mode;
  const canProceedToConfirm = !!trainingConfig.arenaId;

  const handleStart = () => {
    if (noMatches) {
      toast.error("אין שאלות שמתאימות לסינון שבחרת");
      return;
    }
    const result = startQuiz();
    if (!result.ok) toast.error(result.error || "לא ניתן להתחיל את האימון");
  };

  const stepLabels = ["הגדרות", "נושא", "אישור"];

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
          <Step3Confirm
            config={trainingConfig}
            arenas={arenas}
            isDemoContent={isDemoContent}
            filters={filters}
            setFilters={setFilters}
            clearFilters={clearFilters}
            facets={facets}
            totalCount={arenaQuestions.length}
            matchCount={matchCount}
            hasFilters={hasFilters}
            noMatches={noMatches}
          />
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
                {trainingConfig.arenaName || "לא נבחר נושא"}
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
                disabled={noMatches}
                title={noMatches ? "אין שאלות שמתאימות לסינון שבחרת" : undefined}
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TRAINING_MODES.map(mode => {
            const isSelected = config.mode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setConfig({ mode: mode.id })}
                aria-pressed={isSelected}
                className={`arena-card w-full flex items-start gap-3 ${isSelected ? "selected" : ""}`}
              >
                <span className="text-2xl leading-none" aria-hidden="true">{mode.icon}</span>
                <div className="flex-1">
                  <div className="t-heading">{mode.label}</div>
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
                  background: isSelected ? "var(--primary)" : "var(--tf-surface)",
                  color: isSelected ? "var(--primary-foreground)" : "var(--foreground)",
                  borderColor: isSelected ? "var(--primary)" : "var(--tf-border)",
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
                  background: isSelected ? "var(--primary)" : "var(--tf-surface)",
                  color: isSelected ? "var(--primary-foreground)" : "var(--foreground)",
                  borderColor: isSelected ? "var(--primary)" : "var(--tf-border)",
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
  const visibleLabel = arenas.length === allArenas.length ? `${allArenas.length} נושאים` : `${arenas.length} מתוך ${allArenas.length}`;

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
            <p className="eyebrow mb-2">שלב 02 · בחירת נושא</p>
            <h3 className="t-title mb-1" style={{ color: "var(--foreground)" }}>בחר נושא לתרגול</h3>
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              הסימולטור יתאים את השאלות לתחום שתבחר. מומלץ לבחור נושא אחד ולהשלים סבב מלא.
            </p>
          </div>
          <div className="relative w-full md:max-w-xs">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: "var(--muted-foreground)" }} />
            <input
              type="text"
              className="tf-input"
              placeholder="חיפוש נושא..."
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
            <p>לא נמצאו נושאים תואמים</p>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Confirm ───────────────────────────────────────────

function FilterChips({ title, options, selected, onToggle }: {
  title: string;
  options: Facet[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <div className="text-xs font-bold mb-2" style={{ color: "var(--muted-foreground)" }}>{title}</div>
      <div className="flex gap-2 flex-wrap">
        {options.map(opt => {
          const isOn = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => onToggle(opt.value)}
              aria-pressed={isOn}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs transition-all"
              style={{
                background: isOn ? "var(--primary)" : "var(--tf-surface)",
                color: isOn ? "var(--primary-foreground)" : "var(--foreground)",
                border: isOn ? "1px solid transparent" : "1px solid var(--tf-border)",
                boxShadow: isOn ? "var(--shadow-raised)" : "none",
              }}
            >
              {opt.label}
              <span className="t-numeric opacity-70">
                {opt.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Step3Confirm({
  config,
  arenas,
  isDemoContent,
  filters,
  setFilters,
  clearFilters,
  facets,
  totalCount,
  matchCount,
  hasFilters,
  noMatches,
}: {
  config: ReturnType<typeof useApp>["trainingConfig"];
  arenas: ReturnType<typeof useApp>["arenas"];
  isDemoContent: boolean;
  filters: QuestionFilters;
  setFilters: (patch: Partial<QuestionFilters>) => void;
  clearFilters: () => void;
  facets: ReturnType<typeof buildFacets>;
  totalCount: number;
  matchCount: number;
  hasFilters: boolean;
  noMatches: boolean;
}) {
  const arena = arenas.find(a => a.id === config.arenaId);
  const modeLabel = TRAINING_MODES.find(m => m.id === config.mode)?.label ?? config.mode;
  const timeLabel = TIME_OPTIONS.find(t => t.value === config.timePerQuestion)?.label ?? `${config.timePerQuestion}שנ'`;

  const hasFacets =
    facets.years.length > 0 || facets.topics.length > 0 || facets.qtypes.length > 0;

  const toggle = <T extends number | string>(list: T[], value: T): T[] =>
    list.includes(value) ? list.filter(v => v !== value) : [...list, value];

  // Questions are never repeated to pad a short pool, so a request for
  // more than the arena holds simply yields a shorter quiz. Say so up
  // front rather than surprising the trainee mid-session.
  const available = totalCount > 0 ? matchCount : arena?.questionCount ?? 0;
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
          { label: "נושא", value: arena?.name ?? config.arenaName },
          {
            label: hasFilters ? "שאלות אחרי סינון" : "שאלות במאגר",
            value: hasFilters && totalCount > 0
              ? `${matchCount} מתוך ${totalCount}`
              : `${available || "—"}`,
          },
        ].map(row => (
          <div key={row.label} className="data-row">
            <span className="data-row-label">{row.label}</span>
            <span className="data-row-value">{row.value}</span>
          </div>
        ))}
      </div>

      {/* Practice-pool filters */}
      {hasFacets && (
        <div className="rounded-2xl p-4 flex flex-col gap-4" style={{ background: "var(--tf-surface)", border: "1px solid var(--tf-border)" }}>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
              <SlidersHorizontal size={14} className="inline ml-1" style={{ color: "var(--primary)" }} />
              סינון מאגר השאלות
            </h3>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="text-xs font-bold underline"
                style={{ color: "var(--accent)", textUnderlineOffset: "3px" }}
              >
                נקה סינון
              </button>
            )}
          </div>

          <FilterChips
            title="מועד בחינה"
            options={facets.years}
            selected={filters.years.map(String)}
            onToggle={value => setFilters({ years: toggle(filters.years, Number(value)) })}
          />
          <FilterChips
            title="נושא"
            options={facets.topics}
            selected={filters.topics}
            onToggle={value => setFilters({ topics: toggle(filters.topics, value) })}
          />
          <FilterChips
            title="סוג שאלה"
            options={facets.qtypes}
            selected={filters.qtypes}
            onToggle={value => setFilters({ qtypes: toggle(filters.qtypes, value) })}
          />

          <button
            role="switch"
            aria-checked={filters.repeatedOnly}
            onClick={() => setFilters({ repeatedOnly: !filters.repeatedOnly })}
            className="flex items-center gap-3 p-3 rounded-xl text-right transition-all"
            style={{
              background: filters.repeatedOnly ? "rgba(255, 165, 0, 0.15)" : "var(--tf-surface-soft)",
              border: filters.repeatedOnly ? "1px solid rgba(255, 165, 0, 0.5)" : "1px solid var(--tf-border)",
            }}
          >
            <Repeat2 size={18} style={{ color: filters.repeatedOnly ? "var(--primary)" : "var(--muted-foreground)", flexShrink: 0 }} aria-hidden="true" />
            <div className="flex-1">
              <div className="font-bold text-sm" style={{ color: "var(--foreground)" }}>
                שאלות שחזרו ביותר ממועד אחד
              </div>
              <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {facets.repeated} שאלות במאגר הנושא
              </div>
            </div>
            <span
              className="flex items-center rounded-full transition-all"
              style={{
                width: 40,
                height: 22,
                padding: 3,
                flexShrink: 0,
                background: filters.repeatedOnly ? "var(--primary)" : "var(--muted)",
                justifyContent: filters.repeatedOnly ? "flex-start" : "flex-end",
              }}
            >
              <span className="rounded-full" style={{ width: 16, height: 16, background: "var(--background)" }} />
            </span>
          </button>

          <div
            className="text-xs font-bold pt-1"
            style={{ color: noMatches ? "var(--destructive)" : "var(--muted-foreground)" }}
            role="status"
          >
            {noMatches
              ? "אין שאלות שמתאימות לסינון שבחרת — שנה או נקה את הסינון כדי להתחיל."
              : `${matchCount} שאלות מתאימות לסינון הנוכחי, מתוך ${totalCount} בנושא.`}
          </div>
        </div>
      )}

      {isDemoContent && (
        <div
          role="status"
          className="p-4 flex items-start gap-3"
          style={{ background: "var(--tint-primary-weak)", borderInlineStart: "3px solid var(--accent)" }}
        >
          <FlaskConical size={16} style={{ color: "var(--accent)", flexShrink: 0, marginTop: 3 }} aria-hidden="true" />
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            <strong>לא נטען מאגר שאלות</strong> — אין שאלות לתרגול עד שיועלה מאגר.
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
            {hasFilters ? "לסינון שבחרת מתאימות" : "בנושא הזה יש"} {available} שאלות בלבד, ולכן
            האימון יכלול {actualCount} שאלות ולא {config.questionCount}. שאלות לא חוזרות על עצמן
            באותו מבחן.
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
