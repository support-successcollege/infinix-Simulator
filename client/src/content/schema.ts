/* ============================================================
   Content validation schemas

   One schema, imported by both `scripts/content/build-content.ts`
   (which fails the build) and the manager's client-side export
   (which validates before download). Content is validated once, at
   authoring time — the runtime then trusts it.

   This replaces the two runtime parsers (`parseQuestionBank` and
   `parseLegacyMergedExamSchema`) whose `parseA(x) || parseB(x)`
   fallback meant the content model was "whatever the last uploaded
   file happened to contain".
   ============================================================ */

import { z } from "zod";
import { MIN_EXPLANATION_CHARS } from "./completeness";

const trimmed = (min: number, label: string) =>
  z
    .string()
    .transform(s => s.trim())
    .refine(s => s.length >= min, { message: `${label}: חובה (לפחות ${min} תווים)` });

const idPattern = /^[a-z0-9][a-z0-9.\-_]*$/;

const IdSchema = z
  .string()
  .refine(s => idPattern.test(s), {
    message: "מזהה חייב להיות אותיות לטיניות קטנות, ספרות, נקודה, מקף או קו תחתון",
  });

export const DifficultySchema = z.enum(["easy", "medium", "hard"]);
export const QuestionStatusSchema = z.enum(["draft", "review", "published", "archived"]);

export const LegalRefSchema = z.object({
  law: trimmed(2, "שם החוק"),
  section: z.string().trim().optional(),
  url: z
    .string()
    .trim()
    .refine(s => s === "" || /^https?:\/\//.test(s), { message: "כתובת URL לא תקינה" })
    .optional(),
});

export const QuestionSourceSchema = z.object({
  examPeriod: z.string().trim().optional(),
  originalNumber: z.number().int().positive().optional(),
  importedFrom: z.string().trim().optional(),
});

export const QuestionSchema = z
  .object({
    id: IdSchema,
    stem: trimmed(5, "נוסח השאלה"),
    options: z.array(z.string().transform(s => s.trim())).min(2).max(6),
    correctIndex: z.number().int().nonnegative(),
    explanation: z.string().default(""),
    coachNote: z.string().default(""),
    legalRefs: z.array(LegalRefSchema).default([]),
    subjectId: IdSchema,
    topicId: IdSchema,
    difficulty: DifficultySchema,
    tags: z.array(z.string().trim()).default([]),
    status: QuestionStatusSchema,
    source: QuestionSourceSchema.default({}),
    updatedAt: z.string(),
  })
  .superRefine((q, ctx) => {
    if (q.correctIndex >= q.options.length) {
      ctx.addIssue({
        code: "custom",
        path: ["correctIndex"],
        message: `correctIndex=${q.correctIndex} מחוץ לטווח (יש ${q.options.length} אפשרויות)`,
      });
    }
    q.options.forEach((opt, i) => {
      if (opt.length === 0) {
        ctx.addIssue({ code: "custom", path: ["options", i], message: "אפשרות ריקה" });
      }
    });
    const seen = new Map<string, number>();
    q.options.forEach((opt, i) => {
      const key = normalizeText(opt);
      if (!key) return;
      const first = seen.get(key);
      if (first !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["options", i],
          message: `אפשרות זהה לאפשרות ${first + 1}`,
        });
      } else {
        seen.set(key, i);
      }
    });
    // The rule that keeps unfinished content away from learners.
    if (
      q.status === "published" &&
      q.explanation.trim().length < MIN_EXPLANATION_CHARS &&
      q.legalRefs.length === 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: `שאלה בסטטוס "published" חייבת הסבר (${MIN_EXPLANATION_CHARS}+ תווים) או לפחות הפניה אחת לחוק`,
      });
    }
  });

export const TopicSchema = z.object({
  id: IdSchema,
  subjectId: IdSchema,
  title: trimmed(2, "שם הנושא"),
  description: z.string().default(""),
  order: z.number().int().nonnegative(),
});

export const SubjectSchema = z.object({
  id: IdSchema,
  title: trimmed(2, "שם המקצוע"),
  icon: z.string().default("📘"),
  description: z.string().default(""),
  order: z.number().int().nonnegative(),
});

export const SubjectFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    subject: SubjectSchema,
    topics: z.array(TopicSchema),
    questions: z.array(QuestionSchema),
  })
  .superRefine((file, ctx) => {
    const subjectId = file.subject.id;

    const topicIds = new Set<string>();
    file.topics.forEach((t, i) => {
      if (topicIds.has(t.id)) {
        ctx.addIssue({ code: "custom", path: ["topics", i, "id"], message: `נושא כפול: ${t.id}` });
      }
      topicIds.add(t.id);
      if (t.subjectId !== subjectId) {
        ctx.addIssue({
          code: "custom",
          path: ["topics", i, "subjectId"],
          message: `נושא משויך למקצוע "${t.subjectId}" אך נמצא בקובץ של "${subjectId}"`,
        });
      }
    });

    const questionIds = new Set<string>();
    const stems = new Map<string, string>();
    file.questions.forEach((q, i) => {
      if (questionIds.has(q.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", i, "id"],
          message: `מזהה שאלה כפול: ${q.id}`,
        });
      }
      questionIds.add(q.id);

      if (q.subjectId !== subjectId) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", i, "subjectId"],
          message: `שאלה משויכת למקצוע "${q.subjectId}" אך נמצאת בקובץ של "${subjectId}"`,
        });
      }
      if (!topicIds.has(q.topicId)) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", i, "topicId"],
          message: `נושא לא מוכר: "${q.topicId}"`,
        });
      }

      const key = normalizeText(q.stem);
      const firstId = stems.get(key);
      if (firstId) {
        ctx.addIssue({
          code: "custom",
          path: ["questions", i, "stem"],
          message: `נוסח זהה לשאלה ${firstId}`,
        });
      } else {
        stems.set(key, q.id);
      }
    });
  });

export const TopicQuotaSchema = z.object({
  topicId: IdSchema,
  count: z.number().int().positive(),
});

export const ExamBlueprintSchema = z
  .object({
    id: IdSchema,
    subjectId: IdSchema,
    title: trimmed(2, "שם הבחינה"),
    questionCount: z.number().int().positive(),
    durationMinutes: z.number().int().positive(),
    passScorePct: z.number().min(1).max(100),
    topicQuotas: z.array(TopicQuotaSchema).min(1),
    allowBackNavigation: z.boolean().default(true),
    allowFlagForReview: z.boolean().default(true),
    notes: z.string().default(""),
  })
  .superRefine((bp, ctx) => {
    const sum = bp.topicQuotas.reduce((n, q) => n + q.count, 0);
    if (sum !== bp.questionCount) {
      ctx.addIssue({
        code: "custom",
        path: ["topicQuotas"],
        message: `סכום המכסות (${sum}) אינו שווה ל-questionCount (${bp.questionCount})`,
      });
    }
  });

/** Whitespace-normalized text, used for duplicate detection. */
export function normalizeText(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export type ParsedSubjectFile = z.infer<typeof SubjectFileSchema>;
export type ParsedExamBlueprint = z.infer<typeof ExamBlueprintSchema>;

/** Flatten a ZodError into `path: message` lines for human-readable build output. */
export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map(issue => {
    const path = issue.path.length ? issue.path.join(".") : "(שורש)";
    return `${path}: ${issue.message}`;
  });
}
