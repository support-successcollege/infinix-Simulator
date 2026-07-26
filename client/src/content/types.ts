/* ============================================================
   Content domain types — subject → topic → question

   This replaces the "arena / category / questionBank" model, which
   was a sales-demo artifact. A licensing candidate studies מקצועות
   (subjects) made of נושאים (topics), not "sales arenas".

   These types are the single source of truth for content shape.
   `schema.ts` mirrors them as zod schemas and is what actually
   validates authored files at build time.
   ============================================================ */

export type Difficulty = "easy" | "medium" | "hard";

/**
 * Content lifecycle. Only `published` questions are ever served to a
 * learner — this is the structural guarantee that a question with no
 * explanation cannot reach a practice session.
 */
export type QuestionStatus = "draft" | "review" | "published" | "archived";

/** A citation into the source material, e.g. חוק חוזה הביטוח · סעיף 6(א). */
export interface LegalRef {
  law: string;
  section?: string;
  url?: string;
}

export interface QuestionSource {
  /** e.g. "אביב 2023" — which exam sitting this came from. */
  examPeriod?: string;
  /** Question number on the original paper. */
  originalNumber?: number;
  /** Provenance marker, e.g. "ETHIC_MERGED". */
  importedFrom?: string;
}

export interface Question {
  /** Stable forever — mastery tracking is keyed off this. Never regenerate. */
  id: string;
  stem: string;
  /** 2–6 options. Display order is canonical. */
  options: string[];
  correctIndex: number;
  /** Why the correct answer is correct. Empty only when status !== "published". */
  explanation: string;
  /** Exam technique, distinct from the explanation. May be empty. */
  coachNote: string;
  legalRefs: LegalRef[];
  subjectId: string;
  topicId: string;
  difficulty: Difficulty;
  tags: string[];
  status: QuestionStatus;
  source: QuestionSource;
  /** ISO date. */
  updatedAt: string;
}

export interface Topic {
  id: string;
  subjectId: string;
  title: string;
  description: string;
  order: number;
}

export interface Subject {
  id: string;
  title: string;
  icon: string;
  description: string;
  order: number;
}

/** One authored file under `content/subjects/`. */
export interface SubjectFile {
  schemaVersion: 1;
  subject: Subject;
  topics: Topic[];
  questions: Question[];
}

/* ── Exam blueprints ─────────────────────────────────────────── */

export interface TopicQuota {
  topicId: string;
  count: number;
}

/**
 * The shape of a mock exam. These are *data*, not constants in TS, because
 * the regulator changes them — hardcoding a pass threshold would make the
 * app confidently wrong. `notes` carries the provenance disclaimer.
 */
export interface ExamBlueprint {
  id: string;
  subjectId: string;
  title: string;
  questionCount: number;
  /** For the WHOLE exam, not per question. */
  durationMinutes: number;
  passScorePct: number;
  topicQuotas: TopicQuota[];
  allowBackNavigation: boolean;
  allowFlagForReview: boolean;
  notes: string;
}

/* ── Generated manifest ──────────────────────────────────────── */

export interface CoverageCounts {
  total: number;
  byStatus: Record<QuestionStatus, number>;
  byDifficulty: Record<Difficulty, number>;
  /** Fraction 0–1 of *published* questions carrying a non-trivial explanation. */
  explanationCoverage: number;
  /** Fraction 0–1 of *published* questions carrying at least one legal ref. */
  legalRefCoverage: number;
}

export interface TopicManifestEntry extends CoverageCounts {
  topicId: string;
  title: string;
}

export interface SubjectManifestEntry extends CoverageCounts {
  subjectId: string;
  title: string;
  icon: string;
  description: string;
  order: number;
  topics: TopicManifestEntry[];
  /** Null when the subject has no blueprint, or a readiness verdict when it does. */
  examReadiness: ExamReadiness | null;
}

export interface ExamReadiness {
  blueprintId: string;
  ready: boolean;
  /** Populated when `ready` is false — which topics are short, and by how much. */
  blockers: Array<{ topicId: string; title: string; required: number; available: number }>;
}

export interface ContentManifest {
  schemaVersion: 1;
  generatedAt: string;
  /** Hash of all subject file contents — changes when any content changes. */
  contentHash: string;
  subjects: SubjectManifestEntry[];
  totals: CoverageCounts;
}

/** Light-weight subject descriptor, enough to render the picker without loading questions. */
export interface SubjectSummary {
  id: string;
  title: string;
  icon: string;
  description: string;
  order: number;
  publishedCount: number;
  topicCount: number;
  byDifficulty: Record<Difficulty, number>;
  examReadiness: ExamReadiness | null;
}
