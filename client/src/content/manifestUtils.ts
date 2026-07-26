/* ============================================================
   Manifest computation

   Shared by the build script (Node) and the manager's overlay
   preview (browser), so the numbers a manager sees while drafting
   are computed exactly the same way as the numbers the build
   reports. No Node-only APIs here.
   ============================================================ */

import { coverageOf } from "./completeness";
import type {
  CoverageCounts,
  Difficulty,
  ExamBlueprint,
  ExamReadiness,
  Question,
  SubjectFile,
  SubjectManifestEntry,
  TopicManifestEntry,
} from "./types";

export function emptyCounts(): CoverageCounts {
  return {
    total: 0,
    byStatus: { draft: 0, review: 0, published: 0, archived: 0 },
    byDifficulty: { easy: 0, medium: 0, hard: 0 },
    explanationCoverage: 1,
    legalRefCoverage: 1,
  };
}

/**
 * Coverage is measured over *published* questions only. Drafts are
 * expected to be incomplete; counting them would make the number
 * describe backlog size rather than the quality of what learners see.
 */
export function countQuestions(questions: Question[]): CoverageCounts {
  const counts = emptyCounts();
  counts.total = questions.length;

  for (const q of questions) {
    counts.byStatus[q.status] += 1;
    counts.byDifficulty[q.difficulty as Difficulty] += 1;
  }

  const published = questions.filter(q => q.status === "published");
  const coverage = coverageOf(published);
  counts.explanationCoverage = coverage.explanation;
  counts.legalRefCoverage = coverage.legalRef;
  return counts;
}

/** Fold entries into a total, weighting coverage by published question count. */
export function mergeCounts(acc: CoverageCounts, entry: CoverageCounts): CoverageCounts {
  const accPublished = acc.byStatus.published;
  const entryPublished = entry.byStatus.published;
  const totalPublished = accPublished + entryPublished;

  const weighted = (a: number, b: number) =>
    totalPublished === 0 ? 1 : (a * accPublished + b * entryPublished) / totalPublished;

  return {
    total: acc.total + entry.total,
    byStatus: {
      draft: acc.byStatus.draft + entry.byStatus.draft,
      review: acc.byStatus.review + entry.byStatus.review,
      published: totalPublished,
      archived: acc.byStatus.archived + entry.byStatus.archived,
    },
    byDifficulty: {
      easy: acc.byDifficulty.easy + entry.byDifficulty.easy,
      medium: acc.byDifficulty.medium + entry.byDifficulty.medium,
      hard: acc.byDifficulty.hard + entry.byDifficulty.hard,
    },
    explanationCoverage: weighted(acc.explanationCoverage, entry.explanationCoverage),
    legalRefCoverage: weighted(acc.legalRefCoverage, entry.legalRefCoverage),
  };
}

/**
 * A blueprint is only usable if every topic quota can be filled from
 * published questions. Reporting the specific shortfall lets the UI say
 * "exam opens when topic X has 12 published questions (has 7)" instead
 * of silently assembling an exam from a thin pool.
 */
export function evaluateExamReadiness(
  file: SubjectFile,
  blueprint: ExamBlueprint | null
): ExamReadiness | null {
  if (!blueprint) return null;

  const publishedByTopic = new Map<string, number>();
  for (const q of file.questions) {
    if (q.status !== "published") continue;
    publishedByTopic.set(q.topicId, (publishedByTopic.get(q.topicId) ?? 0) + 1);
  }
  const titleOf = new Map(file.topics.map(t => [t.id, t.title]));

  const blockers = blueprint.topicQuotas
    .map(quota => ({
      topicId: quota.topicId,
      title: titleOf.get(quota.topicId) ?? quota.topicId,
      required: quota.count,
      available: publishedByTopic.get(quota.topicId) ?? 0,
    }))
    .filter(b => b.available < b.required);

  return { blueprintId: blueprint.id, ready: blockers.length === 0, blockers };
}

export function buildSubjectManifestEntry(
  file: SubjectFile,
  blueprint: ExamBlueprint | null
): SubjectManifestEntry {
  const byTopic = new Map<string, Question[]>();
  for (const t of file.topics) byTopic.set(t.id, []);
  for (const q of file.questions) {
    const bucket = byTopic.get(q.topicId);
    if (bucket) bucket.push(q);
  }

  const topics: TopicManifestEntry[] = file.topics
    .slice()
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "he"))
    .map(t => ({
      topicId: t.id,
      title: t.title,
      ...countQuestions(byTopic.get(t.id) ?? []),
    }));

  return {
    subjectId: file.subject.id,
    title: file.subject.title,
    icon: file.subject.icon,
    description: file.subject.description,
    order: file.subject.order,
    topics,
    examReadiness: evaluateExamReadiness(file, blueprint),
    ...countQuestions(file.questions),
  };
}
