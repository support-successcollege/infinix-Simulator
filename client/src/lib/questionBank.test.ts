import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  buildArenaSummary,
  buildArenas,
  buildFacets,
  calculateScore,
  filterQuestions,
  mergeBanks,
  normalizeDifficulty,
  parseAnyQuestionBank,
  parseLegacyMergedExamSchema,
  parseQuestionBank,
  pickQuestions,
  shuffle,
  toQuizQuestions,
} from "./questionBank";
import type { Question, QuestionBankData, QuestionFilters } from "@/types/app";

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

describe("mergeBanks", () => {
  const cat = (product: string) => ({ product, questions: [] });

  it("adds add-on categories next to the main bank's", () => {
    const merged = mergeBanks({ categories: { כלכלה: cat("main") } }, { categories: { "ביטוח רכוש": cat("addon") } });
    expect(Object.keys(merged!.categories).sort()).toEqual(["ביטוח רכוש", "כלכלה"].sort());
  });

  it("lets the main bank win a name clash", () => {
    const merged = mergeBanks({ categories: { כלכלה: cat("main") } }, { categories: { כלכלה: cat("addon") } });
    expect(merged!.categories["כלכלה"].product).toBe("main");
  });

  it("serves the add-on alone when no main bank loaded", () => {
    const merged = mergeBanks(null, { categories: { "ביטוח רכוש": cat("addon") } });
    expect(Object.keys(merged!.categories)).toEqual(["ביטוח רכוש"]);
  });

  it("returns the main bank untouched when there is no add-on", () => {
    const main: QuestionBankData = { categories: { כלכלה: cat("main") } };
    expect(mergeBanks(main, null)).toBe(main);
    expect(mergeBanks(null, null)).toBeNull();
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

  it("carries the exam taxonomy onto the runtime question", () => {
    const [q] = toQuizQuestions(
      [
        {
          id: "a",
          question: "ש",
          options: ["1", "2"],
          correctIndex: 1,
          year: 2024,
          moed: "05/2024",
          topic: "mutual_funds",
          topicLabel: "קרנות נאמנות",
          qtype: "case",
          qtypeLabel: "קייס",
          subtags: ["דמי ניהול"],
          timesAsked: 3,
        },
      ],
      "זירה"
    );
    expect(q.year).toBe(2024);
    expect(q.moed).toBe("05/2024");
    expect(q.topic).toBe("mutual_funds");
    expect(q.topicLabel).toBe("קרנות נאמנות");
    expect(q.qtype).toBe("case");
    expect(q.qtypeLabel).toBe("קייס");
    expect(q.subtags).toEqual(["דמי ניהול"]);
    expect(q.timesAsked).toBe(3);
  });

  it("leaves taxonomy fields undefined on a bank that predates them", () => {
    const [q] = toQuizQuestions([{ id: "a", question: "ש", options: ["1", "2"] }], "זירה");
    expect(q.year).toBeUndefined();
    expect(q.topic).toBeUndefined();
    expect(q.qtype).toBeUndefined();
    expect(q.timesAsked).toBeUndefined();
  });
});

// ── Filtering ────────────────────────────────────────────────

function makeQuestion(over: Partial<Question> & { id: string }): Question {
  return {
    text: "שאלה",
    options: ["א", "ב"],
    correctIndex: 0,
    explanation: "",
    arena: "אתיקה",
    ...over,
  };
}

const FILTER_POOL: Question[] = [
  makeQuestion({ id: "a", year: 2024, topic: "kyc", qtype: "case", timesAsked: 3 }),
  makeQuestion({ id: "b", year: 2024, topic: "aml", qtype: "knowledge", timesAsked: 1 }),
  makeQuestion({ id: "c", year: 2023, topic: "kyc", qtype: "knowledge", timesAsked: 2 }),
  makeQuestion({ id: "d", year: 2022, topic: "aml", qtype: "case" }),
  // Predates the taxonomy: no year, no topic, no qtype.
  makeQuestion({ id: "e" }),
];

const withFilters = (patch: Partial<QuestionFilters>): QuestionFilters => ({
  ...EMPTY_FILTERS,
  ...patch,
});

describe("filterQuestions", () => {
  it("treats empty arrays as unconstrained, not as 'match nothing'", () => {
    expect(filterQuestions(FILTER_POOL, EMPTY_FILTERS)).toEqual(FILTER_POOL);
    expect(filterQuestions(FILTER_POOL, undefined)).toEqual(FILTER_POOL);
  });

  it("leaves the other axes unconstrained when one axis is set", () => {
    const result = filterQuestions(FILTER_POOL, withFilters({ topics: ["kyc"] }));
    // Both years and both question types survive — only topic narrowed.
    expect(result.map(q => q.id)).toEqual(["a", "c"]);
  });

  it("combines values inside one axis with OR", () => {
    const result = filterQuestions(FILTER_POOL, withFilters({ years: [2024, 2022] }));
    expect(result.map(q => q.id)).toEqual(["a", "b", "d"]);
  });

  it("combines two axes with AND", () => {
    const result = filterQuestions(
      FILTER_POOL,
      withFilters({ years: [2024, 2023], topics: ["kyc"] })
    );
    expect(result.map(q => q.id)).toEqual(["a", "c"]);

    const narrower = filterQuestions(
      FILTER_POOL,
      withFilters({ years: [2024], topics: ["kyc"], qtypes: ["knowledge"] })
    );
    expect(narrower).toEqual([]);
  });

  it("filters by question type", () => {
    const result = filterQuestions(FILTER_POOL, withFilters({ qtypes: ["case"] }));
    expect(result.map(q => q.id)).toEqual(["a", "d"]);
  });

  it("keeps only questions asked in more than one sitting when repeatedOnly is on", () => {
    const result = filterQuestions(FILTER_POOL, withFilters({ repeatedOnly: true }));
    expect(result.map(q => q.id)).toEqual(["a", "c"]);
  });

  it("combines repeatedOnly with the other axes", () => {
    const result = filterQuestions(
      FILTER_POOL,
      withFilters({ repeatedOnly: true, qtypes: ["knowledge"] })
    );
    expect(result.map(q => q.id)).toEqual(["c"]);
  });

  it("excludes questions missing the field an axis filters on", () => {
    expect(filterQuestions(FILTER_POOL, withFilters({ years: [2024] })).map(q => q.id)).not.toContain(
      "e"
    );
    expect(filterQuestions(FILTER_POOL, withFilters({ topics: ["kyc"] })).map(q => q.id)).not.toContain(
      "e"
    );
    expect(filterQuestions(FILTER_POOL, withFilters({ qtypes: ["case"] })).map(q => q.id)).not.toContain(
      "e"
    );
    // Unconstrained axes still let it through.
    expect(filterQuestions(FILTER_POOL, EMPTY_FILTERS).map(q => q.id)).toContain("e");
  });

  it("returns an empty list for an empty pool", () => {
    expect(filterQuestions([], withFilters({ years: [2024] }))).toEqual([]);
  });
});

describe("buildFacets", () => {
  const facets = buildFacets(FILTER_POOL);

  it("counts each value over the questions passed in", () => {
    expect(facets.years).toEqual([
      { value: "2024", label: "2024", count: 2 },
      { value: "2023", label: "2023", count: 1 },
      { value: "2022", label: "2022", count: 1 },
    ]);
    expect(facets.topics.find(f => f.value === "kyc")!.count).toBe(2);
    expect(facets.qtypes.find(f => f.value === "case")!.count).toBe(2);
  });

  it("orders years newest first", () => {
    expect(facets.years.map(f => f.value)).toEqual(["2024", "2023", "2022"]);
  });

  it("orders topics and question types by count, descending", () => {
    const byTopic = buildFacets([
      ...FILTER_POOL,
      makeQuestion({ id: "f", topic: "aml", qtype: "knowledge" }),
      makeQuestion({ id: "g", topic: "aml", qtype: "knowledge" }),
    ]);
    expect(byTopic.topics.map(f => f.value)).toEqual(["aml", "kyc"]);
    expect(byTopic.qtypes.map(f => f.value)).toEqual(["knowledge", "case"]);
  });

  it("uses the Hebrew label when the bank supplies one", () => {
    const labelled = buildFacets([
      makeQuestion({ id: "a", topic: "mutual_funds", topicLabel: "קרנות נאמנות", qtype: "case", qtypeLabel: "קייס" }),
    ]);
    expect(labelled.topics[0].label).toBe("קרנות נאמנות");
    expect(labelled.qtypes[0].label).toBe("קייס");
  });

  it("skips questions that carry no taxonomy at all", () => {
    const empty = buildFacets([makeQuestion({ id: "e" })]);
    expect(empty).toEqual({ years: [], topics: [], qtypes: [], repeated: 0 });
  });

  it("counts questions asked in more than one sitting", () => {
    expect(facets.repeated).toBe(2);
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
      "דגשים: מחיר וזמן."
    );
  });

  it("falls back to product and next step", () => {
    expect(buildArenaSummary({ product: "ביטוח חיים", nextStep: "פגישה" })).toBe(
      "ביטוח חיים, דגש על פגישה."
    );
  });

  it("has a default for empty metadata", () => {
    expect(buildArenaSummary(undefined)).toBe("תרגול שאלות מבחינות עבר.");
    expect(buildArenaSummary({})).toBe("תרגול שאלות מבחינות עבר.");
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
