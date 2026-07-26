/* ============================================================
   WizardScreen — 3-Step Training Wizard
   Steps: 1. Settings → 2. Arena → 3. Confirm
   Design: Midnight Gradient — card-within-card wizard
   ============================================================ */

import { useState, useMemo } from "react";
import { useApp, TrainingMode } from "@/contexts/AppContext";
import { CheckCircle2, ChevronRight, ChevronLeft, Search, Zap, Clock, Hash, Play, X } from "lucide-react";

const ARENA_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663547397718/Pvji6kDRrPHhdwxpb2BJTp/arena-bg-Wo2sYsRxfQ9rcbWDEFnJu8.webp";

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
  const { trainingConfig, setTrainingConfig, arenas, setScreen, startQuiz } = useApp();
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
    startQuiz();
  };

  const stepLabels = ["הגדרות", "זירה", "אישור"];

  return (
    <div className="h-full flex flex-col overflow-hidden" style={{ direction: "rtl" }}>
      {/* Header */}
      <div
        className="relative flex-shrink-0"
        style={{
          backgroundImage: `url(${ARENA_BG})`,
          backgroundSize: "cover",
          backgroundPosition: "center 30%",
        }}
      >
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0, 0, 0, 0.8) 0%, var(--background) 100%)" }} />
        <div className="relative z-10 px-4 pt-4 pb-6">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => setScreen("hub")}
              className="flex items-center gap-1 text-sm font-semibold"
              style={{ color: "var(--primary)" }}
            >
              <ChevronRight size={16} />
              חזרה
            </button>
            <span className="text-xs font-semibold" style={{ color: "#c2c2c2" }}>
              אשף הכנה לאימון
            </span>
          </div>

          {/* Step indicators */}
          <div className="flex items-center justify-center gap-2">
            {([1, 2, 3] as const).map((s) => {
              const isActive = step === s;
              const isCompleted = step > s;
              return (
                <button
                  key={s}
                  onClick={() => {
                    if (s < step || (s === 2 && canProceedToArena) || (s === 3 && canProceedToConfirm)) {
                      setStep(s);
                    }
                  }}
                  className="wizard-step-btn"
                  style={{
                    background: isActive ? "var(--primary)" : isCompleted ? "rgba(34, 197, 94, 0.2)" : "var(--muted)",
                    color: isActive ? "var(--primary-foreground)" : isCompleted ? "var(--success)" : "var(--muted-foreground)",
                    boxShadow: isActive ? "0 0 16px rgba(255, 165, 0, 0.35)" : "none",
                    border: isCompleted ? "1px solid rgba(34, 197, 94, 0.3)" : "1px solid transparent",
                  }}
                >
                  {isCompleted ? <CheckCircle2 size={14} /> : <span style={{ fontFamily: "Inter, sans-serif", fontWeight: 700 }}>{s}</span>}
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
        {step === 3 && <Step3Confirm config={trainingConfig} arenas={arenas} />}
      </div>

      {/* Footer navigation */}
      <div
        className="flex-shrink-0 p-4"
        style={{ borderTop: "1px solid var(--tf-border)", background: "var(--background)" }}
      >
        {step === 2 ? (
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="text-[10px] font-bold tracking-[0.08em] uppercase" style={{ color: "var(--muted-foreground)" }}>יעד נוכחי</div>
              <div className="text-sm font-black truncate" style={{ color: "var(--foreground)" }}>
                {trainingConfig.arenaName || "לא נבחרה זירה"}
              </div>
            </div>
            <button
              onClick={() => setStep(1)}
              className="px-3 py-2 rounded-xl font-semibold text-sm transition-all"
              style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
            >
              חזרה להגדרות
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedToConfirm}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
              style={{
                background: canProceedToConfirm ? "var(--primary)" : "var(--muted)",
                color: canProceedToConfirm ? "var(--primary-foreground)" : "var(--muted-foreground)",
                boxShadow: canProceedToConfirm ? "0 0 16px rgba(255, 165, 0, 0.3)" : "none",
              }}
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
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all"
                style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
              >
                <ChevronRight size={16} />
                חזרה
              </button>
            ) : (
              <button
                onClick={() => setScreen("hub")}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm"
                style={{ background: "var(--secondary)", color: "var(--secondary-foreground)", border: "1px solid var(--border)" }}
              >
                <X size={16} />
                ביטול
              </button>
            )}

            {step < 3 ? (
              <button
                onClick={() => setStep(s => (s + 1) as 1 | 2 | 3)}
                disabled={step === 1 ? !canProceedToArena : !canProceedToConfirm}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all"
                style={{
                  background: (step === 1 ? canProceedToArena : canProceedToConfirm) ? "var(--primary)" : "var(--muted)",
                  color: (step === 1 ? canProceedToArena : canProceedToConfirm) ? "var(--primary-foreground)" : "var(--muted-foreground)",
                  boxShadow: (step === 1 ? canProceedToArena : canProceedToConfirm) ? "0 0 16px rgba(255, 165, 0, 0.3)" : "none",
                }}
              >
                המשך
                <ChevronLeft size={16} />
              </button>
            ) : (
              <button
                onClick={handleStart}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-black text-base transition-all"
                style={{
                  background: "var(--success)",
                  color: "var(--success-foreground)",
                  boxShadow: "0 0 24px rgba(34, 197, 94, 0.4)",
                }}
              >
                <Play size={18} />
                התחל מבחן
              </button>
            )}
          </div>
        )}
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
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
      {/* Training mode */}
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color: "var(--foreground)" }}>
          <Zap size={14} className="inline ml-1" style={{ color: "var(--primary)" }} />
          מצב אימון
        </h3>
        <div className="flex flex-col gap-2">
          {TRAINING_MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => setConfig({ mode: mode.id })}
              className="flex items-center gap-3 p-3 rounded-xl text-right transition-all"
              style={{
                background: config.mode === mode.id ? "rgba(255, 165, 0, 0.15)" : "var(--tf-surface)",
                border: config.mode === mode.id ? "1px solid rgba(255, 165, 0, 0.5)" : "1px solid var(--tf-border)",
                boxShadow: config.mode === mode.id ? "0 0 12px rgba(255, 165, 0, 0.15)" : "none",
              }}
            >
              <span className="text-2xl">{mode.icon}</span>
              <div className="flex-1">
                <div className="font-bold text-sm" style={{ color: "var(--foreground)" }}>{mode.label}</div>
                <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>{mode.desc}</div>
              </div>
              {config.mode === mode.id && (
                <CheckCircle2 size={18} style={{ color: "var(--primary)", flexShrink: 0 }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Question count */}
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color: "var(--foreground)" }}>
          <Hash size={14} className="inline ml-1" style={{ color: "var(--primary)" }} />
          כמות שאלות
        </h3>
        <div className="flex gap-2 flex-wrap">
          {QUESTION_COUNTS.map(count => (
            <button
              key={count}
              onClick={() => setConfig({ questionCount: count })}
              className="px-4 py-2 rounded-xl font-bold text-sm transition-all"
              style={{
                background: config.questionCount === count ? "var(--primary)" : "var(--tf-surface)",
                color: config.questionCount === count ? "var(--primary-foreground)" : "var(--foreground)",
                border: config.questionCount === count ? "1px solid transparent" : "1px solid var(--tf-border)",
                boxShadow: config.questionCount === count ? "0 0 12px rgba(255, 165, 0, 0.3)" : "none",
                fontFamily: "Inter, sans-serif",
              }}
            >
              {count}
            </button>
          ))}
        </div>
      </div>

      {/* Time per question */}
      <div>
        <h3 className="text-sm font-bold mb-3" style={{ color: "var(--foreground)" }}>
          <Clock size={14} className="inline ml-1" style={{ color: "var(--primary)" }} />
          זמן לשאלה
        </h3>
        <div className="flex gap-2 flex-wrap">
          {TIME_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setConfig({ timePerQuestion: opt.value })}
              className="px-4 py-2 rounded-xl font-bold text-sm transition-all"
              style={{
                background: config.timePerQuestion === opt.value ? "var(--primary)" : "var(--tf-surface)",
                color: config.timePerQuestion === opt.value ? "var(--primary-foreground)" : "var(--foreground)",
                border: config.timePerQuestion === opt.value ? "1px solid transparent" : "1px solid var(--tf-border)",
                boxShadow: config.timePerQuestion === opt.value ? "0 0 12px rgba(255, 165, 0, 0.3)" : "none",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
  const visibleLabel = arenas.length === allArenas.length ? `${allArenas.length} מקצועות` : `${arenas.length} מתוך ${allArenas.length}`;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--tf-border)" }}>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <span className="badge-pill mb-2" style={{ background: "rgba(34, 197, 94, 0.15)", color: "var(--success)" }}>שלב 2 · טעינת זירה</span>
            <h3 className="text-2xl font-black mb-1" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>בחר את זירת המכירה</h3>
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
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex items-center justify-between text-xs font-bold py-3" style={{ color: "var(--muted-foreground)" }}>
          <span>{visibleLabel}</span>
          {search && (
            <button
              onClick={() => setSearch("")}
              className="underline"
              style={{ color: "var(--primary)", textUnderlineOffset: "3px" }}
            >
              הצג הכל
            </button>
          )}
        </div>
        <div className="arena-picker-grid">
          {arenas.map(arena => (
            <button
              key={arena.id}
              onClick={() => onSelect(arena.id, arena.name)}
              className={`arena-card text-right ${selectedId === arena.id ? "selected" : ""}`}
            >
              {arena.questionCount === maxQuestions && (
                <span className="badge-pill absolute top-2 left-2" style={{ background: "rgba(34, 197, 94, 0.2)", color: "var(--success)" }}>
                  מוביל
                </span>
              )}
              <div className="text-2xl mb-2">{arena.icon}</div>
              <div className="font-bold text-base mb-1" style={{ color: "var(--foreground)" }}>{arena.name}</div>
              <div className="text-xs mb-2" style={{ color: "var(--muted-foreground)" }}>{arena.summary}</div>
              <div className="flex items-center justify-between text-xs mt-3 pt-2 border-t" style={{ borderColor: "var(--tf-border)", color: "var(--muted-foreground)" }}>
                <span>{arena.questionCount} שאלות</span>
                <span>רמת קושי: {arena.difficultyLabel}</span>
              </div>
              {selectedId === arena.id && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 size={18} style={{ color: "var(--primary)" }} />
                </div>
              )}
            </button>
          ))}
        </div>
        {arenas.length === 0 && (
          <div className="text-center py-12" style={{ color: "var(--muted-foreground)" }}>
            <Search size={32} className="mx-auto mb-3 opacity-40" />
            <p>לא נמצאו זירות תואמות</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 3: Confirm ───────────────────────────────────────────

function Step3Confirm({ config, arenas }: {
  config: ReturnType<typeof useApp>["trainingConfig"];
  arenas: ReturnType<typeof useApp>["arenas"];
}) {
  const arena = arenas.find(a => a.id === config.arenaId);
  const modeLabel = TRAINING_MODES.find(m => m.id === config.mode)?.label ?? config.mode;
  const timeLabel = TIME_OPTIONS.find(t => t.value === config.timePerQuestion)?.label ?? `${config.timePerQuestion}שנ'`;

  return (
    <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
      <div className="text-center py-4">
        <div className="text-5xl mb-3">{arena?.icon ?? "🎯"}</div>
        <h2 className="text-2xl font-black mb-1" style={{ color: "var(--foreground)", fontFamily: "Heebo, sans-serif" }}>
          {arena?.name ?? config.arenaName}
        </h2>
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>מוכן להתחיל?</p>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--tf-border)" }}>
        {[
          { label: "מצב אימון", value: modeLabel },
          { label: "כמות שאלות", value: `${config.questionCount} שאלות` },
          { label: "זמן לשאלה", value: timeLabel },
          { label: "זירה", value: arena?.name ?? config.arenaName },
          { label: "שאלות במאגר", value: `${arena?.questionCount ?? "—"} שאלות` },
        ].map((row, i) => (
          <div
            key={row.label}
            className="flex items-center justify-between px-4 py-3"
            style={{
              background: i % 2 === 0 ? "var(--tf-surface)" : "var(--tf-surface-soft)",
              borderBottom: i < 4 ? "1px solid var(--tf-border)" : "none",
            }}
          >
            <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{row.label}</span>
            <span className="text-sm font-bold" style={{ color: "var(--foreground)" }}>{row.value}</span>
          </div>
        ))}
      </div>

      <div
        className="rounded-xl p-4 flex items-start gap-3"
        style={{ background: "rgba(255, 165, 0, 0.1)", border: "1px solid rgba(255, 165, 0, 0.25)" }}
      >
        <Zap size={18} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} />
        <p className="text-sm" style={{ color: "var(--foreground)" }}>
          לחץ <strong>התחל מבחן</strong> כדי להתחיל. לאחר תחילת המבחן לא ניתן לשנות הגדרות.
        </p>
      </div>
    </div>
  );
}
