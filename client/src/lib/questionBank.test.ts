import { describe, expect, it } from "vitest";

import {
  buildArenaSummary,
  buildArenas,
  calculateScore,
  normalizeDifficulty,
  parseAnyQuestionBank,
  parseLegacyMergedExamSchema,
  parseQuestionBank,
  pickQuestions,
  shuffle,
  toQuizQuestions,
} from "./questionBank";
import type { QuestionBankData } from "@/types/app";

describe("normalizeDifficulty", () => {
  it("maps English labels", () => {
    expect(normalizeDifficulty("easy")).toBe("easy");
    expect(normalizeDifficulty("MEDIUM")).toBe("medium");
    expect(normalizeDifficulty("Hard")).toBe("hard");
  });

  it("maps Hebrew labels", () => {
    expect(normalizeDifficulty("קל")).toBe("easy");
    expect(normalizeDifficulty("בינוני")).toBe("medium");
    expect(normalizeDifficulty("קשה")).toBe("hard");
  });

  it("returns undefined for unknown or missing values", () => {
    expect(normalizeDifficulty(undefined)).toBeUndefined();
    expect(normalizeDifficulty("")).toBeUndefined();
    expect(normalizeDifficulty("impossible")).toBeUndefined();
  });
});

describe("parseQuestionBank", () => {
  it("accepts the native shape", () => {
    const input = { categories: { מכירות: { questions: [] } } };
    expect(parseQuestionBank(input)).toEqual(input);
  });

  it("rejects input without a categories object", () => {
    expect(parseQuestionBank(null)).toBeNull();
    expect(parseQuestionBank("nope")).toBeNull();
    expect(parseQuestionBank({})).toBeNull();
    expect(parseQuestionBank({ categories: "no" })).toBeNull();
  });
});

describe("parseLegacyMergedExamSchema", () => {
  const legacy = {
    subject: "אתיקה מקצועית",
    exams: [
      {
        id: "exam-a",
        questions: [
          {
            number: 1,
            stem: "מהי חובת הנאמנות?",
            options: { ב: "תשובה ב", א: "תשובה א", ד: "תשובה ד", ג: "תשובה ג" },
            correctAnswer: "ג",
          },
        ],
      },
    ],
  };

  it("orders lettered options by the Hebrew alphabet, not object key order", () => {
    const parsed = parseLegacyMergedExamSchema(legacy);
    const q = parsed!.categories!.אתיקה.questions![0];
    expect(q.options).toEqual(["תשובה א", "תשובה ב", "תשובה ג", "תשובה ד"]);
  });

  it("resolves correctAnswer against the reordered options", () => {
    const parsed = parseLegacyMergedExamSchema(legacy);
    const q = parsed!.categories!.אתיקה.questions![0];
    expect(q.correctIndex).toBe(2);
    expect(q.options![q.correctIndex!]).toBe("תשובה ג");
  });

  it("marks questions without an answer key as drafts", () => {
    const parsed = parseLegacyMergedExamSchema({
      exams: [
        {
          id: "e",
          questions: [{ number: 1, stem: "ללא מפתח", options: ["א", "ב"] }],
        },
      ],
    });
    expect(parsed!.categories!.אתיקה.questions![0].status).toBe("draft");
  });

  it("drops questions with fewer than two options or no stem", () => {
    const parsed = parseLegacyMergedExamSchema({
      exams: [
        {
          id: "e",
          questions: [
            { number: 1, stem: "", options: ["א", "ב"], correctAnswer: "0" },
            { number: 2, stem: "יש שאלה", options: ["רק אחת"], correctAnswer: "0" },
          ],
        },
      ],
    });
    expect(parsed!.categories!.אתיקה.questions).toHaveLength(0);
  });

  it("rejects payloads with no exams", () => {
    expect(parseLegacyMergedExamSchema({ exams: [] })).toBeNull();
    expect(parseLegacyMergedExamSchema({})).toBeNull();
  });
});

describe("parseAnyQuestionBank", () => {
  it("falls through to the legacy parser", () => {
    const parsed = parseAnyQuestionBank({
      exams: [{ id: "e", questions: [{ number: 1, stem: "ש", options: ["א", "ב"], correctAnswer: "0" }] }],
    });
    expect(parsed?.categories?.אתיקה).toBeDefined();
  });

  it("returns null when neither schema matches", () => {
    expect(parseAnyQuestionBank({ random: true })).toBeNull();
  });
});

describe("pickQuestions", () => {
  const pool = [1, 2, 3, 4, 5];

  it("returns the requested count when the pool is large enough", () => {
    expect(pickQuestions(pool, 3)).toHaveLength(3);
  });

  it("never repeats an item when the pool is smaller than the request", () => {
    const picked = pickQuestions(pool, 20);
    expect(picked).toHaveLength(5);
    expect(new Set(picked).size).toBe(5);
  });

  it("returns an empty array for an empty pool or non-positive count", () => {
    expect(pickQuestions([], 5)).toEqual([]);
    expect(pickQuestions(pool, 0)).toEqual([]);
    expect(pickQuestions(pool, -1)).toEqual([]);
  });

  it("only draws items that were in the pool", () => {
    pickQuestions(pool, 5).forEach(v => expect(pool).toContain(v));
  });
});

describe("shuffle", () => {
  it("preserves the original array", () => {
    const original = [1, 2, 3];
    shuffle(original);
    expect(original).toEqual([1, 2, 3]);
  });

  it("keeps every element", () => {
    expect(shuffle([1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
  });
});

describe("toQuizQuestions", () => {
  it("skips archived and draft entries", () => {
    const result = toQuizQuestions(
      [
        { id: "a", question: "פעילה", options: ["1", "2"], correctIndex: 0, status: "active" },
        { id: "b", question: "בארכיון", options: ["1", "2"], correctIndex: 0, status: "archived" },
        { id: "c", question: "טיוטה", options: ["1", "2"], correctIndex: 0, status: "draft" },
      ],
      "זירה"
    );
    expect(result.map(q => q.id)).toEqual(["a"]);
  });

  it("skips entries with fewer than two options", () => {
    const result = toQuizQuestions([{ id: "a", question: "ש", options: ["רק אחת"] }], "זירה");
    expect(result).toHaveLength(0);
  });

  it("clamps an out-of-range correctIndex to 0", () => {
    const result = toQuizQuestions(
      [{ id: "a", question: "ש", options: ["1", "2"], correctIndex: 9 }],
      "זירה"
    );
    expect(result[0].correctIndex).toBe(0);
  });

  it("handles undefined input", () => {
    expect(toQuizQuestions(undefined, "זירה")).toEqual([]);
  });
});

describe("buildArenas", () => {
  const bank: QuestionBankData = {
    categories: {
      ביטוח: {
        icon: "🛡️",
        questions: [
          { id: "1", question: "ש", options: ["א", "ב"], correctIndex: 0, status: "active" },
          { id: "2", question: "ש", options: ["א", "ב"], correctIndex: 0, status: "archived" },
        ],
      },
      אתיקה: { questions: [] },
    },
  };

  it("counts only questions a trainee can actually be served", () => {
    const arenas = buildArenas(bank);
    expect(arenas.find(a => a.name === "ביטוח")!.questionCount).toBe(1);
  });

  it("sorts arena names in Hebrew collation order", () => {
    expect(buildArenas(bank).map(a => a.name)).toEqual(["אתיקה", "ביטוח"]);
  });

  it("returns an empty list for a null bank", () => {
    expect(buildArenas(null)).toEqual([]);
  });
});

describe("buildArenaSummary", () => {
  it("prefers pain points, using at most the first two", () => {
    expect(buildArenaSummary({ painPoints: ["מחיר", "זמן", "אמון"] })).toBe(
      "תרגול התנגדויות סביב מחיר וזמן."
    );
  });

  it("falls back to product and next step", () => {
    expect(buildArenaSummary({ product: "ביטוח חיים", nextStep: "פגישה" })).toBe(
      "מכירת ביטוח חיים עם דגש על פגישה."
    );
  });

  it("has a default for empty metadata", () => {
    expect(buildArenaSummary(undefined)).toBe("אימון סימולציה מותאם זירה.");
    expect(buildArenaSummary({})).toBe("אימון סימולציה מותאם זירה.");
  });
});

describe("calculateScore", () => {
  it("computes a rounded percentage", () => {
    expect(calculateScore(5, 10)).toBe(50);
    expect(calculateScore(1, 3)).toBe(33);
    expect(calculateScore(2, 3)).toBe(67);
  });

  it("returns 0 rather than NaN for an empty quiz", () => {
    expect(calculateScore(0, 0)).toBe(0);
    expect(calculateScore(3, -1)).toBe(0);
  });

  it("caps at the natural bounds", () => {
    expect(calculateScore(0, 10)).toBe(0);
    expect(calculateScore(10, 10)).toBe(100);
  });
});
