import { describe, expect, it } from "vitest";
import type { Question, QuizSession } from "@/types/app";
import { buildExam, daysUntil, examFormat, examPool, openMistakes, readiness, recentYears, topicBreakdown } from "./exam";

const q = (id: string, year?: number, topic?: string): Question => ({
  id,
  text: id,
  options: ["a", "b"],
  correctIndex: 0,
  explanation: "",
  arena: "כלכלה",
  year,
  topicLabel: topic,
});

const session = (over: Partial<QuizSession>): QuizSession => ({
  id: Math.random().toString(36),
  arenaName: "כלכלה",
  mode: "exam",
  questions: [],
  answers: [],
  startTime: "2026-11-20T10:00:00Z",
  endTime: "2026-11-20T11:00:00Z",
  score: 80,
  isDemo: false,
  ...over,
});

describe("exam format", () => {
  it("knows the regulators' formats, with or without the geresh", () => {
    expect(examFormat("מקצועית א׳")).toMatchObject({ questions: 25, minutes: 150, pass: 60 });
    expect(examFormat("כלכלה")).toMatchObject({ questions: 20, minutes: 150 });
    expect(examFormat("ביטוח רכוש")).toMatchObject({ questions: 50, minutes: 90, passAssumed: true });
  });
});

describe("year scope", () => {
  const pool = [2019, 2020, 2021, 2022, 2023, 2024, 2025].flatMap(y => [q(`a${y}`, y), q(`b${y}`, y)]).concat(q("none"));
  it("takes the five most recent years present", () => {
    expect(recentYears(pool)).toEqual([2025, 2024, 2023, 2022, 2021]);
    expect(examPool(pool, "last5")).toHaveLength(10);
    expect(examPool(pool, "all")).toHaveLength(15);
  });
  it("draws the real number of questions, never repeating one", () => {
    const exam = buildExam(pool, { questions: 8, minutes: 1, pass: 60 }, "last5");
    expect(exam).toHaveLength(8);
    expect(new Set(exam.map(x => x.id)).size).toBe(8);
    expect(exam.every(x => (x.year ?? 0) >= 2021)).toBe(true);
  });
});

describe("readiness", () => {
  const now = Date.parse("2026-11-26T12:00:00Z");
  it("counts full exams in the last 7 days at pass + 15 or above", () => {
    const sessions = [
      ...Array.from({ length: 6 }, () => session({ score: 80 })),
      session({ score: 70 }),
      session({ score: 95, endTime: "2026-11-10T10:00:00Z", startTime: "2026-11-10T09:00:00Z" }),
      session({ score: 99, mode: "quick" }),
      session({ score: 99, arenaName: "חשבונאות" }),
    ];
    const r = readiness(sessions, "כלכלה", now);
    expect(r).toMatchObject({ recentExams: 7, qualifying: 6, percent: 60, ready: false, readyScore: 75 });
  });
  it("is ready at ten", () => {
    const r = readiness(Array.from({ length: 11 }, () => session({ score: 76 })), "כלכלה", now);
    expect(r).toMatchObject({ percent: 100, ready: true });
  });
});

describe("open mistakes", () => {
  it("keeps a question until it is answered right twice in a row", () => {
    const a = (id: string, isCorrect: boolean) => ({ questionId: id, selectedIndex: 0, isCorrect, timeSpent: 1 });
    const sessions = [
      session({ startTime: "2026-11-01T00:00:00Z", answers: [a("x", false), a("y", false), a("z", true)] }),
      session({ startTime: "2026-11-02T00:00:00Z", answers: [a("x", true), a("y", true)] }),
      session({ startTime: "2026-11-03T00:00:00Z", answers: [a("y", true)] }),
    ];
    expect([...openMistakes(sessions, "כלכלה")]).toEqual(["x"]);
  });
});

describe("topic breakdown and countdown", () => {
  it("puts the weakest topic first", () => {
    const qs = [q("1", 2024, "ריבית"), q("2", 2024, "ריבית"), q("3", 2024, "מדדים")];
    const answers = [
      { questionId: "1", selectedIndex: 0, isCorrect: true, timeSpent: 1 },
      { questionId: "2", selectedIndex: 1, isCorrect: false, timeSpent: 1 },
      { questionId: "3", selectedIndex: 1, isCorrect: false, timeSpent: 1 },
    ];
    expect(topicBreakdown(qs, answers).map(t => [t.topic, t.percent])).toEqual([["מדדים", 0], ["ריבית", 50]]);
  });
  it("counts whole days to the exam", () => {
    expect(daysUntil("2026-12-07", new Date(2026, 10, 26, 18))).toBe(11);
    expect(daysUntil("2026-11-01", new Date(2026, 10, 26))).toBeNull();
  });
});
