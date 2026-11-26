import { describe, expect, it } from "vitest";
import { createGradeService, memoryQuota, openQuestionsOf, type Grader, type OpenQuestion } from "./grading";

const question: OpenQuestion = {
  id: "pb-1",
  arena: "מקצועית ב׳",
  stem: "לקוח בן 55",
  parts: [
    { label: "א", prompt: "מה הסיכון?", points: 5, modelAnswer: "ריכוזיות", rubric: [{ points: 2, criterion: "ריכוזיות" }, { points: 3, criterion: "נזילות" }] },
    { label: "ב", prompt: "איך לבנות?", points: 5, modelAnswer: "פיזור", rubric: [{ points: 5, criterion: "פיזור" }] },
  ],
};

const users = {
  student: { id: "s1", role: "trainee", arenas: ["מקצועית ב"] },
  other: { id: "s2", role: "trainee", arenas: ["כלכלה"] },
};

function service(grader: Grader | null, quota = memoryQuota()) {
  return createGradeService({
    currentUser: async auth => (auth === "student" ? users.student : auth === "other" ? users.other : null),
    findQuestion: async id => (id === question.id ? question : null),
    grader,
    quota,
  });
}

const overAwarding: Grader = async (q) =>
  q.parts.map(p => ({ label: p.label, score: 0, max: 0, feedback: "ok", criteria: p.rubric.map((r, index) => ({ index, awarded: 99, max: 0, note: "" })) }));

describe("grading service", () => {
  it("clamps the grader to each criterion's points, and grades only written parts", async () => {
    let seen: string[] = [];
    const g: Grader = async (q, a) => { seen = q.parts.map(p => p.label); return overAwarding(q, a); };
    const out = await service(g).handle({ method: "POST", authorization: "student", body: { questionId: "pb-1", answers: { א: "ריכוזיות גבוהה ונזילות" } } });
    expect(out.status).toBe(200);
    const body = out.body as { grades: Array<{ label: string; score: number }>; total: number; max: number };
    expect(seen).toEqual(["א"]);
    expect(body.grades).toEqual([expect.objectContaining({ label: "א", score: 5 }), expect.objectContaining({ label: "ב", score: 0 })]);
    expect(body.total).toBe(5);
    expect(body.max).toBe(10);
  });

  it("refuses outsiders, other arenas and unknown questions", async () => {
    const s = service(overAwarding);
    expect((await s.handle({ method: "POST", body: { questionId: "pb-1" } })).status).toBe(401);
    expect((await s.handle({ method: "POST", authorization: "other", body: { questionId: "pb-1", answers: { א: "x" } } })).status).toBe(403);
    expect((await s.handle({ method: "POST", authorization: "student", body: { questionId: "nope" } })).status).toBe(404);
  });

  it("says when grading is off, and stops at the daily quota", async () => {
    expect((await service(null).handle({ method: "POST", authorization: "student", body: { questionId: "pb-1", answers: { א: "x" } } })).status).toBe(503);
    const quota = { take: async () => false };
    expect((await service(overAwarding, quota).handle({ method: "POST", authorization: "student", body: { questionId: "pb-1", answers: { א: "x" } } })).status).toBe(429);
  });

  it("reads open questions from a bank and skips drafts", () => {
    const bank = {
      categories: {
        "מקצועית ב": {
          questions: [
            { id: "q1", type: "open", question: "stem", parts: [{ label: "א", prompt: "p", points: 4, modelAnswer: "m", rubric: [{ points: 4, criterion: "c" }] }] },
            { id: "q2", type: "open", status: "draft", parts: [{ label: "", prompt: "p", points: 4 }] },
            { id: "q3", question: "mcq", options: ["a", "b"] },
          ],
        },
      },
    };
    const found = openQuestionsOf(bank);
    expect([...found.keys()]).toEqual(["q1"]);
    expect(found.get("q1")).toMatchObject({ arena: "מקצועית ב", stem: "stem" });
  });
});
