/* ============================================================
   questionBank.ts — Parsing and selection logic

   Pure functions only: no React, no storage, no fetch. Everything
   here is unit-tested in questionBank.test.ts.
   ============================================================ */

import type {
  Arena,
  Question,
  QuestionBankCategory,
  QuestionBankData,
  QuestionBankEntry,
  QuestionFilters,
} from "@/types/app";

/** Answer keys used by Hebrew exam exports, in their natural order. */
const HEBREW_OPTION_ORDER = ["א", "ב", "ג", "ד", "ה", "ו"];

export function normalizeDifficulty(v?: string): Question["difficulty"] {
  if (!v) return undefined;
  const key = String(v).toLowerCase();
  if (key.includes("easy") || key.includes("קל")) return "easy";
  if (key.includes("hard") || key.includes("קשה")) return "hard";
  if (key.includes("medium") || key.includes("בינ")) return "medium";
  return undefined;
}

export function buildArenaSummary(meta?: QuestionBankCategory): string {
  if (!meta) return "תרגול שאלות מבחינות עבר.";
  const pains = Array.isArray(meta.painPoints) ? meta.painPoints.filter(Boolean) : [];
  if (pains.length > 0) return `דגשים: ${pains.slice(0, 2).join(" ו")}.`;
  if (meta.product && meta.nextStep) return `${meta.product}, דגש על ${meta.nextStep}.`;
  return "תרגול שאלות מבחינות עבר.";
}

/** The native InfinityCloser shape: { categories: { name: {...} } }. */
export function parseQuestionBank(input: unknown): QuestionBankData | null {
  if (!input || typeof input !== "object") return null;
  const data = input as QuestionBankData;
  if (!data.categories || typeof data.categories !== "object") return null;
  return data;
}

interface LegacyExamQuestion {
  number?: number;
  stem?: string;
  options?: Record<string, string> | string[];
  correctAnswer?: string;
}

interface LegacyExamSchema {
  subject?: string;
  exams?: Array<{ id?: string; examPeriod?: string; note?: string; questions?: LegacyExamQuestion[] }>;
}

function orderLegacyOptions(rawOptions: LegacyExamQuestion["options"]): {
  options: string[];
  orderedKeys: string[];
} {
  if (Array.isArray(rawOptions)) {
    const options = rawOptions.map(o => String(o || "").trim()).filter(Boolean);
    return { options, orderedKeys: options.map((_, i) => String(i)) };
  }

  if (rawOptions && typeof rawOptions === "object") {
    const entries = Object.entries(rawOptions as Record<string, string>).sort((a, b) => {
      const ai = HEBREW_OPTION_ORDER.indexOf(a[0]);
      const bi = HEBREW_OPTION_ORDER.indexOf(b[0]);
      if (ai === -1 && bi === -1) return a[0].localeCompare(b[0], "he");
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return {
      orderedKeys: entries.map(([k]) => k),
      options: entries.map(([, v]) => String(v || "").trim()).filter(Boolean),
    };
  }

  return { options: [], orderedKeys: [] };
}

/** The ETHIC_MERGED-style export: { subject, exams: [{ questions: [...] }] }. */
export function parseLegacyMergedExamSchema(input: unknown): QuestionBankData | null {
  if (!input || typeof input !== "object") return null;
  const data = input as LegacyExamSchema;
  if (!Array.isArray(data.exams) || data.exams.length === 0) return null;

  const mergedQuestions: QuestionBankEntry[] = [];
  data.exams.forEach((exam, examIdx) => {
    const questions = (exam.questions || [])
      .map((q, qIdx): QuestionBankEntry | null => {
        const stem = String(q.stem || "").trim();
        if (!stem) return null;

        const { options, orderedKeys } = orderLegacyOptions(q.options);
        if (options.length < 2) return null;

        const answerKey = String(q.correctAnswer || "").trim();
        let correctIndex = 0;
        if (answerKey) {
          const byKey = orderedKeys.indexOf(answerKey);
          correctIndex = byKey >= 0 ? byKey : 0;
        }
        correctIndex = Math.max(0, Math.min(options.length - 1, correctIndex));

        const baseId = String(exam.id || `exam-${examIdx + 1}`);
        const qNumber = Number(q.number) || qIdx + 1;
        return {
          id: `${baseId}-${String(qNumber).padStart(3, "0")}`,
          question: stem,
          options,
          correctIndex,
          difficulty: "medium",
          // Without an answer key we can't grade it, so park it as a draft.
          status: answerKey ? "active" : "draft",
          explanation: "",
          coachNote: "",
        };
      })
      .filter((q): q is QuestionBankEntry => q !== null);
    mergedQuestions.push(...questions);
  });

  return {
    categories: {
      אתיקה: {
        icon: "📘",
        product: String(data.subject || "בנק מבחנים"),
        nextStep: "פתרון מבחן מלא",
        painPoints: ["דיוק משפטי", "ניהול זמן בבחינה", "בחירה בין תשובות דומות"],
        questions: mergedQuestions,
      },
    },
  };
}

/**
 * Lay add-on banks (shipped as their own static files) under the main
 * bank. The main bank wins on a name clash, so a manager who publishes
 * a category of the same name replaces the shipped one rather than
 * being silently overridden by it. Returns null only when every input
 * is empty.
 */
export function mergeBanks(
  main: QuestionBankData | null,
  ...addOns: Array<QuestionBankData | null>
): QuestionBankData | null {
  const present = addOns.filter((b): b is QuestionBankData => Boolean(b?.categories));
  if (present.length === 0) return main;
  const categories = { ...(main?.categories || {}) };
  present.forEach(addOn => {
    Object.entries(addOn.categories || {}).forEach(([name, meta]) => {
      if (!(name in categories)) categories[name] = meta;
    });
  });
  if (!main && Object.keys(categories).length === 0) return null;
  return { ...(main || {}), categories };
}

/** Accepts either supported schema; returns null if neither matches. */
export function parseAnyQuestionBank(input: unknown): QuestionBankData | null {
  return parseQuestionBank(input) || parseLegacyMergedExamSchema(input);
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Draw up to `count` DISTINCT items.
 *
 * A previous version padded short pools by cycling, which put the
 * same question — same `id` — into one session several times. That
 * corrupted mistake-tracking (one wrong answer marked every copy)
 * and let scores double-count. A short pool now simply yields a
 * shorter quiz, and callers surface the real number to the user.
 */
export function pickQuestions<T>(pool: T[], count: number): T[] {
  if (pool.length === 0 || count <= 0) return [];
  return shuffle(pool).slice(0, Math.min(count, pool.length));
}

/** Map stored bank entries onto the runtime Question shape. */
export function toQuizQuestions(
  entries: QuestionBankEntry[] | undefined,
  arenaName: string
): Question[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter(q => q.status !== "archived" && q.status !== "draft")
    .filter(q => typeof q.question === "string" && Array.isArray(q.options) && q.options.length >= 2)
    .map((q, idx) => {
      const options = (q.options || []).map(o => String(o));
      const correct = Number(q.correctIndex);
      const year = Number(q.year);
      const timesAsked = Number(q.timesAsked);
      return {
        id: q.id || `${arenaName}-${idx + 1}`,
        text: String(q.question || ""),
        options,
        correctIndex:
          Number.isInteger(correct) && correct >= 0 && correct < options.length ? correct : 0,
        explanation: String(q.explanation || ""),
        coach: q.coachNote ? String(q.coachNote) : undefined,
        arena: arenaName,
        difficulty: normalizeDifficulty(q.difficulty),
        // Exam taxonomy — absent on older banks, so every field stays optional.
        year: Number.isFinite(year) && q.year != null ? year : undefined,
        moed: q.moed ? String(q.moed) : undefined,
        topic: q.topic ? String(q.topic) : undefined,
        topicLabel: q.topicLabel ? String(q.topicLabel) : undefined,
        qtype: q.qtype ? String(q.qtype) : undefined,
        qtypeLabel: q.qtypeLabel ? String(q.qtypeLabel) : undefined,
        subtags: Array.isArray(q.subtags) ? q.subtags.map(t => String(t)) : undefined,
        timesAsked: Number.isFinite(timesAsked) && q.timesAsked != null ? timesAsked : undefined,
      } satisfies Question;
    });
}

// ── Practice-pool filtering ───────────────────────────────────

export const EMPTY_FILTERS: QuestionFilters = {
  years: [],
  topics: [],
  qtypes: [],
  repeatedOnly: false,
};

/**
 * Narrow a pool by exam year, topic and question type.
 *
 * An EMPTY array on an axis means "no constraint on that axis" — a
 * trainee who has picked no year should still see every year. Axes
 * combine with AND, values inside one axis with OR. A question that
 * lacks the field an axis filters on cannot satisfy that axis, so it
 * drops out once the axis is constrained.
 */
export function filterQuestions(questions: Question[], filters?: QuestionFilters): Question[] {
  if (!Array.isArray(questions)) return [];
  if (!filters) return questions;

  const years = Array.isArray(filters.years) ? filters.years : [];
  const topics = Array.isArray(filters.topics) ? filters.topics : [];
  const qtypes = Array.isArray(filters.qtypes) ? filters.qtypes : [];
  const repeatedOnly = !!filters.repeatedOnly;

  if (years.length === 0 && topics.length === 0 && qtypes.length === 0 && !repeatedOnly) {
    return questions;
  }

  return questions.filter(q => {
    if (years.length > 0 && (q.year == null || !years.includes(q.year))) return false;
    if (topics.length > 0 && (!q.topic || !topics.includes(q.topic))) return false;
    if (qtypes.length > 0 && (!q.qtype || !qtypes.includes(q.qtype))) return false;
    // An unlabelled question is assumed to have been asked once.
    if (repeatedOnly && (q.timesAsked ?? 1) <= 1) return false;
    return true;
  });
}

/** One selectable filter value plus how many questions carry it. */
export interface Facet {
  value: string;
  label: string;
  count: number;
}

function tally(
  questions: Question[],
  pick: (q: Question) => { value: string; label: string } | null
): Facet[] {
  const byValue = new Map<string, Facet>();
  questions.forEach(q => {
    const hit = pick(q);
    if (!hit) return;
    const existing = byValue.get(hit.value);
    if (existing) existing.count += 1;
    else byValue.set(hit.value, { value: hit.value, label: hit.label, count: 1 });
  });
  return Array.from(byValue.values());
}

/**
 * Options for the filter UI, counted over the questions passed in.
 * Years run newest first; topics and question types run by volume so
 * the heaviest chunks of the syllabus surface first.
 */
export function buildFacets(questions: Question[]): {
  years: Facet[];
  topics: Facet[];
  qtypes: Facet[];
  repeated: number;
} {
  const list = Array.isArray(questions) ? questions : [];

  const years = tally(list, q =>
    q.year == null ? null : { value: String(q.year), label: String(q.year) }
  ).sort((a, b) => Number(b.value) - Number(a.value));

  const byCount = (a: Facet, b: Facet) =>
    b.count - a.count || a.label.localeCompare(b.label, "he");

  const topics = tally(list, q =>
    q.topic ? { value: q.topic, label: q.topicLabel || q.topic } : null
  ).sort(byCount);

  const qtypes = tally(list, q =>
    q.qtype ? { value: q.qtype, label: q.qtypeLabel || q.qtype } : null
  ).sort(byCount);

  return {
    years,
    topics,
    qtypes,
    repeated: list.filter(q => (q.timesAsked ?? 1) > 1).length,
  };
}

/** Derive the arena list shown in the wizard from a loaded bank. */
export function buildArenas(bank: QuestionBankData | null): Arena[] {
  const cats = bank?.categories;
  if (!cats) return [];
  return Object.keys(cats)
    .sort((a, b) => a.localeCompare(b, "he"))
    .map((name, idx) => {
      const meta = cats[name];
      const questions = Array.isArray(meta?.questions) ? meta.questions : [];
      return {
        id: `arena-${idx + 1}`,
        name,
        icon: meta?.icon || "🎯",
        // Count only what a trainee can actually be served.
        questionCount: toQuizQuestions(questions, name).length,
        category: meta?.product || "זירת מכירה",
        summary: buildArenaSummary(meta),
      };
    });
}

/** Percentage of correct answers, rounded. Empty quiz scores 0. */
export function calculateScore(correctCount: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correctCount / total) * 100);
}
