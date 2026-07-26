/* ============================================================
   OverlayContentSource — the manager's local draft layer

   The button previously labelled "ייבוא קטגוריה ושמירה קבועה"
   ("import category and save permanently") wrote to the manager's own
   localStorage. Nothing was permanent and nobody else ever saw it.

   This decorator keeps that capability — previewing edits before
   publishing is genuinely useful — but names it truthfully. While an
   overlay is active, `capabilities.label` says so and the UI shows a
   persistent banner. Publishing means exporting the file and
   committing it; git is what makes content reach other users.
   ============================================================ */

import {
  filterQuestions,
  type ContentCapabilities,
  type ContentSource,
  type QuestionQuery,
} from "./ContentSource";
import type {
  ContentManifest,
  ExamBlueprint,
  Question,
  SubjectFile,
  SubjectSummary,
} from "./types";
import { buildSubjectManifestEntry, emptyCounts, mergeCounts } from "./manifestUtils";

export interface OverlayStore {
  /** Subject files that override or add to the base source, keyed by subject id. */
  subjects: Record<string, SubjectFile>;
}

export const EMPTY_OVERLAY: OverlayStore = { subjects: {} };

export function isOverlayActive(overlay: OverlayStore): boolean {
  return Object.keys(overlay.subjects).length > 0;
}

export class OverlayContentSource implements ContentSource {
  constructor(
    private readonly base: ContentSource,
    private readonly overlay: OverlayStore
  ) {}

  get capabilities(): ContentCapabilities {
    if (!isOverlayActive(this.overlay)) return this.base.capabilities;
    return {
      canWrite: true,
      isLive: false,
      label: "תצוגה מקדימה מקומית — לא פורסם",
    };
  }

  async getManifest(): Promise<ContentManifest> {
    const base = await this.base.getManifest();
    if (!isOverlayActive(this.overlay)) return base;

    const overridden = new Map(
      Object.values(this.overlay.subjects).map(file => [
        file.subject.id,
        buildSubjectManifestEntry(file, null),
      ])
    );

    const subjects = base.subjects.map(entry => overridden.get(entry.subjectId) ?? entry);
    for (const [id, entry] of overridden) {
      if (!base.subjects.some(s => s.subjectId === id)) subjects.push(entry);
    }
    subjects.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "he"));

    return {
      ...base,
      subjects,
      totals: subjects.reduce(mergeCounts, emptyCounts()),
    };
  }

  async listSubjects(): Promise<SubjectSummary[]> {
    const manifest = await this.getManifest();
    return manifest.subjects
      .map(
        (s): SubjectSummary => ({
          id: s.subjectId,
          title: s.title,
          icon: s.icon,
          description: s.description,
          order: s.order,
          publishedCount: s.byStatus.published,
          topicCount: s.topics.length,
          byDifficulty: s.byDifficulty,
          examReadiness: s.examReadiness,
        })
      )
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "he"));
  }

  async loadSubject(subjectId: string): Promise<SubjectFile> {
    const override = this.overlay.subjects[subjectId];
    if (override) return override;
    return this.base.loadSubject(subjectId);
  }

  async getQuestions(query: QuestionQuery): Promise<Question[]> {
    const file = await this.loadSubject(query.subjectId);
    return filterQuestions(file.questions, query);
  }

  getBlueprint(subjectId: string): Promise<ExamBlueprint | null> {
    return this.base.getBlueprint(subjectId);
  }
}
