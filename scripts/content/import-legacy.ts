/* ============================================================
   import-legacy — one-off migration into the canonical schema

   The runtime used to carry two parsers that guessed at file shapes
   (`parseQuestionBank(x) || parseLegacyMergedExamSchema(x)`), which
   meant the content model was "whatever the last uploaded file
   happened to contain". Being liberal about input is right for a
   migration and wrong for a runtime, so that logic lives here now.

   Usage:
     pnpm import:legacy <input.json> [--subject ethics] [--title "…"]
                                     [--topic ethics.unassigned] [--out <path>]

   Every imported question lands as status "review", never
   "published". That is the structural guarantee that questions with
   empty explanations — the reason explanations were pulled from the
   UI in the first place — cannot reach a learner.
   ============================================================ */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { SubjectFileSchema, formatIssues, normalizeText } from "../../client/src/content/schema";
import type { Difficulty, Question, SubjectFile, Topic } from "../../client/src/content/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const subjectsDir = path.resolve(projectRoot, "client", "src", "content", "subjects");

/** Option keys as they appear on Israeli exam papers. */
const HEBREW_OPTION_ORDER = ["א", "ב", "ג", "ד", "ה", "ו"];

/* ── Args ────────────────────────────────────────────────────── */

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const inputPath = process.argv[2];
if (!inputPath || inputPath.startsWith("--")) {
  console.error(
    "\nשימוש: pnpm import:legacy <input.json> [--subject ethics] [--title \"…\"] [--topic <topicId>] [--out <path>]\n"
  );
  process.exit(1);
}

const subjectId = arg("subject") ?? "ethics";
const defaultTopicId = arg("topic") ?? `${subjectId}.unassigned`;
const outPath = arg("out") ?? path.resolve(subjectsDir, `${subjectId}.json`);

if (!fs.existsSync(inputPath)) {
  console.error(`\n✗ קובץ הקלט לא נמצא: ${inputPath}\n`);
  process.exit(1);
}

/* ── Report ──────────────────────────────────────────────────── */

interface ImportReport {
  imported: number;
  droppedNoStem: number;
  droppedTooFewOptions: number;
  missingCorrectAnswer: string[];
  duplicateStems: string[];
  needsTopicAssignment: number;
  withExplanation: number;
}

const report: ImportReport = {
  imported: 0,
  droppedNoStem: 0,
  droppedTooFewOptions: 0,
  missingCorrectAnswer: [],
  duplicateStems: [],
  needsTopicAssignment: 0,
  withExplanation: 0,
};

/* ── Shape-tolerant readers ──────────────────────────────────── */

interface RawQuestion {
  id?: string;
  number?: number;
  stem?: string;
  question?: string;
  options?: Record<string, string> | string[];
  correctAnswer?: string;
  correctIndex?: number;
  explanation?: string;
  coachNote?: string;
  difficulty?: string;
  status?: string;
}

/**
 * Resolve options into a canonical array plus the key order used to
 * interpret `correctAnswer`. Object keys are sorted by the Hebrew
 * exam-paper order (א, ב, ג, …), with unknown keys collated after.
 */
function readOptions(raw: RawQuestion["options"]): { options: string[]; keys: string[] } {
  if (Array.isArray(raw)) {
    const options = raw.map(o => String(o ?? "").trim()).filter(Boolean);
    return { options, keys: options.map((_, i) => String(i)) };
  }
  if (raw && typeof raw === "object") {
    const entries = Object.entries(raw as Record<string, string>).sort((a, b) => {
      const ai = HEBREW_OPTION_ORDER.indexOf(a[0]);
      const bi = HEBREW_OPTION_ORDER.indexOf(b[0]);
      if (ai === -1 && bi === -1) return a[0].localeCompare(b[0], "he");
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return {
      keys: entries.map(([k]) => k),
      options: entries.map(([, v]) => String(v ?? "").trim()).filter(Boolean),
    };
  }
  return { options: [], keys: [] };
}

function normalizeDifficulty(v: string | undefined): Difficulty {
  const key = String(v ?? "").toLowerCase();
  if (key.includes("easy") || key.includes("קל")) return "easy";
  if (key.includes("hard") || key.includes("קשה")) return "hard";
  return "medium";
}

const seenStems = new Map<string, string>();
const usedIds = new Set<string>();

function makeId(prefix: string, n: number): string {
  const base = `${subjectId}.${slug(prefix)}.${String(n).padStart(3, "0")}`;
  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }
  let i = 2;
  while (usedIds.has(`${base}-${i}`)) i += 1;
  const id = `${base}-${i}`;
  usedIds.add(id);
  return id;
}

function slug(s: string): string {
  const cleaned = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "import";
}

function convert(raw: RawQuestion, idPrefix: string, index: number, examPeriod?: string): Question | null {
  const stem = String(raw.stem ?? raw.question ?? "").trim();
  if (!stem) {
    report.droppedNoStem += 1;
    return null;
  }

  const { options, keys } = readOptions(raw.options);
  if (options.length < 2) {
    report.droppedTooFewOptions += 1;
    return null;
  }

  const number = Number(raw.number) || index + 1;
  const id = raw.id ? String(raw.id) : makeId(idPrefix, number);
  if (raw.id) usedIds.add(id);

  let correctIndex = 0;
  const answerKey = String(raw.correctAnswer ?? "").trim();
  if (answerKey) {
    const byKey = keys.indexOf(answerKey);
    correctIndex = byKey >= 0 ? byKey : 0;
    if (byKey < 0) report.missingCorrectAnswer.push(id);
  } else if (Number.isInteger(raw.correctIndex)) {
    correctIndex = Number(raw.correctIndex);
  } else {
    report.missingCorrectAnswer.push(id);
  }
  correctIndex = Math.max(0, Math.min(options.length - 1, correctIndex));

  const stemKey = normalizeText(stem);
  const firstId = seenStems.get(stemKey);
  if (firstId) {
    report.duplicateStems.push(`${id} ↔ ${firstId}`);
    return null;
  }
  seenStems.set(stemKey, id);

  const explanation = String(raw.explanation ?? "").trim();
  if (explanation) report.withExplanation += 1;
  report.needsTopicAssignment += 1;
  report.imported += 1;

  return {
    id,
    stem,
    options,
    correctIndex,
    explanation,
    coachNote: String(raw.coachNote ?? "").trim(),
    legalRefs: [],
    subjectId,
    // Everything lands in triage; a human assigns real topics before publishing.
    topicId: defaultTopicId,
    difficulty: normalizeDifficulty(raw.difficulty),
    tags: [],
    // Never "published" — this is the guarantee, not a default.
    status: "review",
    source: {
      examPeriod,
      originalNumber: Number(raw.number) || undefined,
      importedFrom: "ETHIC_MERGED",
    },
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

/* ── Read input ──────────────────────────────────────────────── */

let input: unknown;
try {
  input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (err) {
  console.error(`\n✗ JSON לא תקין ב-${inputPath}: ${(err as Error).message}\n`);
  process.exit(1);
}

const questions: Question[] = [];

const asMerged = input as {
  subject?: string;
  exams?: Array<{ id?: string; examPeriod?: string; questions?: RawQuestion[] }>;
};
const asCategories = input as {
  categories?: Record<string, { questions?: RawQuestion[] }>;
};

if (Array.isArray(asMerged.exams) && asMerged.exams.length > 0) {
  asMerged.exams.forEach((exam, examIdx) => {
    const prefix = String(exam.id ?? `exam-${examIdx + 1}`);
    (exam.questions ?? []).forEach((q, i) => {
      const converted = convert(q, prefix, i, exam.examPeriod);
      if (converted) questions.push(converted);
    });
  });
} else if (asCategories.categories && typeof asCategories.categories === "object") {
  for (const [name, cat] of Object.entries(asCategories.categories)) {
    (cat?.questions ?? []).forEach((q, i) => {
      const converted = convert(q, name, i);
      if (converted) questions.push(converted);
    });
  }
} else {
  console.error(
    "\n✗ מבנה קובץ לא מוכר. נתמכים: { exams: [...] } בפורמט ETHIC_MERGED, או { categories: {...} }.\n"
  );
  process.exit(1);
}

/* ── Merge into the existing subject file ────────────────────── */

let existing: SubjectFile | null = null;
if (fs.existsSync(outPath)) {
  const parsed = SubjectFileSchema.safeParse(JSON.parse(fs.readFileSync(outPath, "utf8")));
  if (!parsed.success) {
    console.error(`\n✗ קובץ היעד הקיים אינו תקין: ${path.relative(projectRoot, outPath)}`);
    for (const line of formatIssues(parsed.error)) console.error(`  • ${line}`);
    process.exit(1);
  }
  existing = parsed.data as SubjectFile;
}

if (!existing) {
  console.error(
    `\n✗ לא נמצא קובץ מקצוע ב-${path.relative(projectRoot, outPath)}.\n` +
      `  צור אותו תחילה עם הגדרת subject ו-topics (כולל "${defaultTopicId}").\n`
  );
  process.exit(1);
}

const topicIds = new Set(existing.topics.map((t: Topic) => t.id));
if (!topicIds.has(defaultTopicId)) {
  console.error(
    `\n✗ נושא הקליטה "${defaultTopicId}" אינו קיים ב-${path.relative(projectRoot, outPath)}.\n`
  );
  process.exit(1);
}

// Existing questions win: re-running the import must not clobber human edits.
const existingIds = new Set(existing.questions.map(q => q.id));
const existingStems = new Set(existing.questions.map(q => normalizeText(q.stem)));
const fresh = questions.filter(
  q => !existingIds.has(q.id) && !existingStems.has(normalizeText(q.stem))
);
const skippedAsExisting = questions.length - fresh.length;

const merged: SubjectFile = {
  ...existing,
  questions: [...existing.questions, ...fresh],
};

const validated = SubjectFileSchema.safeParse(merged);
if (!validated.success) {
  console.error("\n✗ התוצאה אינה עוברת אימות:");
  for (const line of formatIssues(validated.error)) console.error(`  • ${line}`);
  process.exit(1);
}

fs.writeFileSync(outPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

/* ── Report ──────────────────────────────────────────────────── */

console.log(`\n✓ יובאו ${fresh.length} שאלות חדשות → ${path.relative(projectRoot, outPath)}\n`);
console.log(`  סה"כ במקצוע:            ${merged.questions.length}`);
console.log(`  נקראו מהקלט:            ${report.imported}`);
if (skippedAsExisting > 0) console.log(`  דולגו (קיימות כבר):     ${skippedAsExisting}`);
if (report.droppedNoStem > 0) console.log(`  נזרקו (ללא נוסח):       ${report.droppedNoStem}`);
if (report.droppedTooFewOptions > 0)
  console.log(`  נזרקו (פחות מ-2 אפשרויות): ${report.droppedTooFewOptions}`);
if (report.duplicateStems.length > 0)
  console.log(`  נזרקו (נוסח כפול):      ${report.duplicateStems.length}`);
console.log(`  עם הסבר:                ${report.withExplanation} / ${report.imported}`);

console.log("\n  הצעדים הבאים:");
console.log(`   1. שייך את השאלות מ-"${defaultTopicId}" לנושאים אמיתיים.`);
console.log("   2. כתוב הסברים והוסף הפניות לחוק.");
console.log('   3. שנה status ל-"published" — האימות יחסום שאלה ללא הסבר או מקור.');
console.log("   4. הרץ pnpm build:content כדי לאמת ולעדכן את דוח התוכן.\n");

if (report.missingCorrectAnswer.length > 0) {
  console.log(
    `⚠ ${report.missingCorrectAnswer.length} שאלות ללא תשובה נכונה מזוהה — נקבע ברירת מחדל 0, חובה לבדוק ידנית:`
  );
  for (const id of report.missingCorrectAnswer.slice(0, 20)) console.log(`   • ${id}`);
  if (report.missingCorrectAnswer.length > 20) {
    console.log(`   … ועוד ${report.missingCorrectAnswer.length - 20}`);
  }
  console.log("");
}
