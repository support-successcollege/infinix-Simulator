/* ============================================================
   build-content — validate authored content, emit the manifest

   Replaces scripts/sync-question-bank.mjs, which read a path OUTSIDE
   the repository (`../question_bank_infinitycloser.json`). That path
   never existed in CI, so every build took the "missing" branch and
   wrote a fallback bank with `"categories": {}` — and still exited 0.
   Production has been serving an empty bank since the first commit.

   The rule here is the opposite: invalid or missing content fails the
   build loudly. Run with `--allow-empty` only for a bootstrap build
   where no subject files exist yet.
   ============================================================ */

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ExamBlueprintSchema, SubjectFileSchema, formatIssues } from "../../client/src/content/schema";
import {
  buildSubjectManifestEntry,
  emptyCounts,
  mergeCounts,
} from "../../client/src/content/manifestUtils";
import type {
  ContentManifest,
  ExamBlueprint,
  SubjectFile,
  SubjectManifestEntry,
} from "../../client/src/content/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const contentDir = path.resolve(projectRoot, "client", "src", "content");
const subjectsDir = path.resolve(contentDir, "subjects");
const blueprintsDir = path.resolve(contentDir, "blueprints");
const manifestPath = path.resolve(contentDir, "manifest.generated.json");
const reportPath = path.resolve(projectRoot, "content-report.md");

const allowEmpty = process.argv.includes("--allow-empty");

const errors: string[] = [];
const warnings: string[] = [];

function listJson(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .sort()
    .map(f => path.join(dir, f));
}

function readJson(file: string): unknown {
  const raw = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    errors.push(`${path.relative(projectRoot, file)}: JSON לא תקין — ${(err as Error).message}`);
    return null;
  }
}

/* ── Load and validate subjects ──────────────────────────────── */

const subjectFiles: SubjectFile[] = [];
const rawContents: string[] = [];

for (const file of listJson(subjectsDir)) {
  const rel = path.relative(projectRoot, file);
  rawContents.push(fs.readFileSync(file, "utf8"));

  const json = readJson(file);
  if (json === null) continue;

  const result = SubjectFileSchema.safeParse(json);
  if (!result.success) {
    for (const line of formatIssues(result.error)) errors.push(`${rel} → ${line}`);
    continue;
  }

  const expectedId = path.basename(file, ".json");
  if (result.data.subject.id !== expectedId) {
    errors.push(
      `${rel} → שם הקובץ ("${expectedId}") חייב להתאים ל-subject.id ("${result.data.subject.id}")`
    );
    continue;
  }

  subjectFiles.push(result.data as SubjectFile);
}

/* ── Cross-file uniqueness ───────────────────────────────────── */

const seenSubjectIds = new Set<string>();
const seenQuestionIds = new Map<string, string>();

for (const file of subjectFiles) {
  if (seenSubjectIds.has(file.subject.id)) {
    errors.push(`מקצוע כפול: "${file.subject.id}"`);
  }
  seenSubjectIds.add(file.subject.id);

  for (const q of file.questions) {
    const owner = seenQuestionIds.get(q.id);
    if (owner) {
      errors.push(`מזהה שאלה "${q.id}" מופיע גם ב-"${owner}" וגם ב-"${file.subject.id}"`);
    } else {
      seenQuestionIds.set(q.id, file.subject.id);
    }
  }
}

/* ── Load and validate blueprints ────────────────────────────── */

const blueprintsBySubject = new Map<string, ExamBlueprint>();

for (const file of listJson(blueprintsDir)) {
  const rel = path.relative(projectRoot, file);
  rawContents.push(fs.readFileSync(file, "utf8"));

  const json = readJson(file);
  if (json === null) continue;

  const result = ExamBlueprintSchema.safeParse(json);
  if (!result.success) {
    for (const line of formatIssues(result.error)) errors.push(`${rel} → ${line}`);
    continue;
  }

  const bp = result.data as ExamBlueprint;
  const subject = subjectFiles.find(s => s.subject.id === bp.subjectId);
  if (!subject) {
    errors.push(`${rel} → מפנה למקצוע לא מוכר: "${bp.subjectId}"`);
    continue;
  }

  // Unknown topics are an authoring error and fail the build. An
  // insufficient *count* is not — content is still being written, so
  // that becomes a readiness flag the UI uses to explain the block.
  const topicIds = new Set(subject.topics.map(t => t.id));
  for (const quota of bp.topicQuotas) {
    if (!topicIds.has(quota.topicId)) {
      errors.push(`${rel} → מכסה מפנה לנושא לא מוכר: "${quota.topicId}"`);
    }
  }

  blueprintsBySubject.set(bp.subjectId, bp);
}

/* ── Fail fast ───────────────────────────────────────────────── */

if (subjectFiles.length === 0 && !allowEmpty) {
  errors.push(
    `לא נמצאו קבצי תוכן ב-${path.relative(projectRoot, subjectsDir)}. ` +
      `הרץ עם --allow-empty רק לבנייה ראשונית מכוונת.`
  );
}

if (errors.length > 0) {
  console.error(`\n✗ אימות תוכן נכשל (${errors.length} שגיאות):\n`);
  for (const e of errors) console.error(`  • ${e}`);
  console.error("");
  process.exit(1);
}

/* ── Build manifest ──────────────────────────────────────────── */

const subjects: SubjectManifestEntry[] = subjectFiles
  .map(file => buildSubjectManifestEntry(file, blueprintsBySubject.get(file.subject.id) ?? null))
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "he"));

const totals = subjects.reduce(mergeCounts, emptyCounts());

const contentHash = createHash("sha256").update(rawContents.join("\n")).digest("hex").slice(0, 16);

const manifest: ContentManifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  contentHash,
  subjects,
  totals,
};

fs.mkdirSync(contentDir, { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

/* ── Coverage warnings ───────────────────────────────────────── */

for (const s of subjects) {
  if (s.byStatus.published === 0) {
    warnings.push(`"${s.title}" — אין שאלות מפורסמות; המקצוע לא יוצג ללומדים`);
    continue;
  }
  if (s.explanationCoverage < 1) {
    const missing = Math.round((1 - s.explanationCoverage) * s.byStatus.published);
    warnings.push(`"${s.title}" — ${missing} שאלות מפורסמות ללא הסבר מלא`);
  }
  if (s.examReadiness && !s.examReadiness.ready) {
    const list = s.examReadiness.blockers
      .map(b => `${b.title} (${b.available}/${b.required})`)
      .join(", ");
    warnings.push(`"${s.title}" — סימולציית בחינה חסומה: ${list}`);
  }
}

/* ── Human-readable report ───────────────────────────────────── */

const pct = (n: number) => `${Math.round(n * 100)}%`;

const reportLines: string[] = [
  "# דוח תוכן — INFINIX Simulator",
  "",
  "> נוצר אוטומטית על ידי `pnpm build:content`. אין לערוך ידנית.",
  "",
  `נוצר: ${manifest.generatedAt}  ·  גיבוב תוכן: \`${contentHash}\``,
  "",
  "## סיכום",
  "",
  "| | |",
  "|---|---|",
  `| סה"כ שאלות | ${totals.total} |`,
  `| מפורסמות | ${totals.byStatus.published} |`,
  `| בבדיקה | ${totals.byStatus.review} |`,
  `| טיוטה | ${totals.byStatus.draft} |`,
  `| בארכיון | ${totals.byStatus.archived} |`,
  `| כיסוי הסברים (מפורסמות) | ${pct(totals.explanationCoverage)} |`,
  `| כיסוי מקורות (מפורסמות) | ${pct(totals.legalRefCoverage)} |`,
  "",
  "## לפי מקצוע",
  "",
  "| מקצוע | סה\"כ | מפורסמות | בבדיקה | טיוטה | הסברים | מקורות | סימולציית בחינה |",
  "|---|---|---|---|---|---|---|---|",
];

for (const s of subjects) {
  const exam = !s.examReadiness
    ? "—"
    : s.examReadiness.ready
      ? "מוכנה"
      : `חסומה (${s.examReadiness.blockers.length} נושאים)`;
  reportLines.push(
    `| ${s.icon} ${s.title} | ${s.total} | ${s.byStatus.published} | ${s.byStatus.review} | ` +
      `${s.byStatus.draft} | ${pct(s.explanationCoverage)} | ${pct(s.legalRefCoverage)} | ${exam} |`
  );
}

for (const s of subjects) {
  reportLines.push("", `### ${s.icon} ${s.title}`, "");
  if (s.topics.length === 0) {
    reportLines.push("_אין נושאים מוגדרים._");
    continue;
  }
  reportLines.push("| נושא | סה\"כ | מפורסמות | הסברים | מקורות |", "|---|---|---|---|---|");
  for (const t of s.topics) {
    reportLines.push(
      `| ${t.title} | ${t.total} | ${t.byStatus.published} | ` +
        `${pct(t.explanationCoverage)} | ${pct(t.legalRefCoverage)} |`
    );
  }
}

if (warnings.length > 0) {
  reportLines.push("", "## פריטים לטיפול", "");
  for (const w of warnings) reportLines.push(`- ${w}`);
}

reportLines.push("");
fs.writeFileSync(reportPath, reportLines.join("\n"), "utf8");

/* ── Console summary ─────────────────────────────────────────── */

console.log(`\n✓ אימות תוכן עבר — ${subjects.length} מקצועות, ${totals.total} שאלות`);
console.log(
  `  מפורסמות: ${totals.byStatus.published}  ·  בבדיקה: ${totals.byStatus.review}  ·  ` +
    `טיוטה: ${totals.byStatus.draft}`
);
console.log(`  כיסוי הסברים: ${pct(totals.explanationCoverage)}`);

if (warnings.length > 0) {
  console.log(`\n⚠ ${warnings.length} אזהרות:`);
  for (const w of warnings) console.log(`  • ${w}`);
}

console.log(`\n  מניפסט: ${path.relative(projectRoot, manifestPath)}`);
console.log(`  דוח:    ${path.relative(projectRoot, reportPath)}\n`);
