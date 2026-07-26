/* ============================================================
   BundledContentSource — content ships inside the bundle

   Why bundled rather than fetched: the previous loader tried three
   URLs in sequence (`/api/question-bank`, then two BASE_URL guesses)
   and, when all failed, silently fell back to ten hardcoded demo
   questions. On GitHub Pages the first URL always 404s. A build that
   produced no content still "succeeded".

   With `import.meta.glob`, missing or malformed content is a build
   error. Vite also splits each subject into its own chunk, so a
   learner downloads only the subject they chose.
   ============================================================ */

import manifestJson from "./manifest.generated.json";
import {
  ContentNotFoundError,
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

const subjectLoaders = import.meta.glob<SubjectFile>("./subjects/*.json", {
  import: "default",
});

const blueprintLoaders = import.meta.glob<ExamBlueprint>("./blueprints/*.json", {
  import: "default",
});

const manifest = manifestJson as unknown as ContentManifest;

function basename(path: string): string {
  const file = path.split("/").pop() ?? "";
  return file.replace(/\.json$/, "");
}

/** `./subjects/ethics.json` → `ethics` */
const subjectsByBasename = new Map(
  Object.entries(subjectLoaders).map(([path, load]) => [basename(path), load])
);

/** `./blueprints/ethics.exam.json` → `ethics` */
const blueprintsBySubject = new Map(
  Object.entries(blueprintLoaders).map(([path, load]) => [
    basename(path).replace(/\.exam$/, ""),
    load,
  ])
);

export class BundledContentSource implements ContentSource {
  readonly capabilities: ContentCapabilities = {
    canWrite: false,
    isLive: false,
    label: "מאגר מובנה",
  };

  private subjectCache = new Map<string, Promise<SubjectFile>>();
  private blueprintCache = new Map<string, Promise<ExamBlueprint | null>>();

  async getManifest(): Promise<ContentManifest> {
    return manifest;
  }

  async listSubjects(): Promise<SubjectSummary[]> {
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

  loadSubject(subjectId: string): Promise<SubjectFile> {
    const cached = this.subjectCache.get(subjectId);
    if (cached) return cached;

    const loader = subjectsByBasename.get(subjectId);
    if (!loader) return Promise.reject(new ContentNotFoundError(`מקצוע "${subjectId}"`));

    const promise = loader().catch((err: unknown) => {
      this.subjectCache.delete(subjectId);
      throw err;
    });
    this.subjectCache.set(subjectId, promise);
    return promise;
  }

  async getQuestions(query: QuestionQuery): Promise<Question[]> {
    const file = await this.loadSubject(query.subjectId);
    return filterQuestions(file.questions, query);
  }

  getBlueprint(subjectId: string): Promise<ExamBlueprint | null> {
    const cached = this.blueprintCache.get(subjectId);
    if (cached) return cached;

    const loader = blueprintsBySubject.get(subjectId);
    const promise = loader ? loader().then(bp => bp ?? null) : Promise.resolve(null);
    this.blueprintCache.set(subjectId, promise);
    return promise;
  }
}
