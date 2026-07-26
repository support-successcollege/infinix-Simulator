/* ============================================================
   ContentSource — the seam

   Everything above this interface (screens, quiz engine, manager
   panel) is unaware of where content physically lives. Today it is
   bundled JSON versioned in git. Moving to a hosted database later
   means adding one implementation and changing one line in the
   provider — no screen changes.
   ============================================================ */

import type {
  ContentManifest,
  Difficulty,
  ExamBlueprint,
  Question,
  QuestionStatus,
  SubjectFile,
  SubjectSummary,
} from "./types";

export interface QuestionQuery {
  subjectId: string;
  topicIds?: string[];
  ids?: string[];
  difficulty?: Difficulty[];
  /** Defaults to `["published"]` — unfinished content never reaches a learner. */
  statuses?: QuestionStatus[];
}

export interface ContentCapabilities {
  /** Whether this source accepts writes. Bundled content does not. */
  canWrite: boolean;
  /** Whether edits made here are visible to other users. */
  isLive: boolean;
  /** Shown in the UI so the user always knows which content they are seeing. */
  label: string;
}

export interface ContentSource {
  readonly capabilities: ContentCapabilities;
  listSubjects(): Promise<SubjectSummary[]>;
  loadSubject(subjectId: string): Promise<SubjectFile>;
  getQuestions(query: QuestionQuery): Promise<Question[]>;
  getBlueprint(subjectId: string): Promise<ExamBlueprint | null>;
  getManifest(): Promise<ContentManifest>;
}

export class ContentNotFoundError extends Error {
  constructor(what: string) {
    super(`התוכן המבוקש לא נמצא: ${what}`);
    this.name = "ContentNotFoundError";
  }
}

/** Shared filtering, so every ContentSource applies the same rules. */
export function filterQuestions(questions: Question[], query: QuestionQuery): Question[] {
  const statuses = new Set<QuestionStatus>(query.statuses ?? ["published"]);
  const topics = query.topicIds?.length ? new Set(query.topicIds) : null;
  const ids = query.ids?.length ? new Set(query.ids) : null;
  const difficulties = query.difficulty?.length ? new Set(query.difficulty) : null;

  return questions.filter(q => {
    if (!statuses.has(q.status)) return false;
    if (topics && !topics.has(q.topicId)) return false;
    if (ids && !ids.has(q.id)) return false;
    if (difficulties && !difficulties.has(q.difficulty)) return false;
    return true;
  });
}
