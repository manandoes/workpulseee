import { describe, expect, it } from "vitest";
import {
  closedReason,
  completeness,
  hasOptions,
  isAcceptingApplications,
  isAnswered,
  isDocument,
  readableTextOn,
} from "@/lib/recruitment";
import { answerSchemaFor } from "@/lib/validations/recruitment";

describe("isAcceptingApplications", () => {
  const now = new Date("2026-03-10T12:00:00Z");

  it("accepts a live form with no closing date", () => {
    expect(
      isAcceptingApplications({ status: "Live", closesAt: null }, now)
    ).toBe(true);
  });

  it("refuses a draft, so an unpublished form is never answerable", () => {
    expect(
      isAcceptingApplications({ status: "Draft", closesAt: null }, now)
    ).toBe(false);
  });

  it("refuses a closed form", () => {
    expect(
      isAcceptingApplications({ status: "Closed", closesAt: null }, now)
    ).toBe(false);
  });

  it("refuses a still-live form whose closing date has passed", () => {
    expect(
      isAcceptingApplications(
        { status: "Live", closesAt: new Date("2026-03-09T00:00:00Z") },
        now
      )
    ).toBe(false);
  });

  it("accepts a live form whose closing date is still ahead", () => {
    expect(
      isAcceptingApplications(
        { status: "Live", closesAt: new Date("2026-03-11T00:00:00Z") },
        now
      )
    ).toBe(true);
  });
});

describe("closedReason", () => {
  const now = new Date("2026-03-10T12:00:00Z");

  it("is null while the form is open, so the page shows the form", () => {
    expect(closedReason({ status: "Live", closesAt: null }, now)).toBeNull();
  });

  it("distinguishes a passed deadline from a manual close", () => {
    expect(
      closedReason(
        { status: "Live", closesAt: new Date("2026-03-01T00:00:00Z") },
        now
      )
    ).toMatch(/closed/i);
    expect(closedReason({ status: "Closed", closesAt: null }, now)).toMatch(
      /no longer accepting/i
    );
  });
});

describe("completeness", () => {
  it("counts only required questions", () => {
    const questions = [
      { id: "a", required: true },
      { id: "b", required: false },
      { id: "c", required: true },
    ];

    expect(completeness(questions, { a: "yes" })).toEqual({
      answered: 1,
      required: 2,
    });
  });

  it("does not count whitespace as an answer", () => {
    expect(completeness([{ id: "a", required: true }], { a: "   " })).toEqual({
      answered: 0,
      required: 1,
    });
  });

  it("counts a non-empty multi-choice list", () => {
    expect(completeness([{ id: "a", required: true }], { a: ["x"] })).toEqual({
      answered: 1,
      required: 1,
    });
    expect(completeness([{ id: "a", required: true }], { a: [] })).toEqual({
      answered: 0,
      required: 1,
    });
  });
});

describe("isAnswered", () => {
  it("rejects empty, whitespace, null and undefined", () => {
    expect(isAnswered("")).toBe(false);
    expect(isAnswered("  ")).toBe(false);
    expect(isAnswered(null)).toBe(false);
    expect(isAnswered(undefined)).toBe(false);
  });

  it("accepts real values", () => {
    expect(isAnswered("x")).toBe(true);
    expect(isAnswered(["x"])).toBe(true);
    expect(isAnswered(0)).toBe(true);
  });
});

describe("question type helpers", () => {
  it("knows which types carry an author-written choice list", () => {
    expect(hasOptions("SingleChoice")).toBe(true);
    expect(hasOptions("MultiChoice")).toBe(true);
    expect(hasOptions("Dropdown")).toBe(true);
    expect(hasOptions("ShortText")).toBe(false);
    expect(hasOptions("Document")).toBe(false);
  });

  it("treats only Document as a file question", () => {
    expect(isDocument("Document")).toBe(true);
    expect(isDocument("LongText")).toBe(false);
  });
});

describe("readableTextOn", () => {
  it("puts dark ink on a light brand colour", () => {
    expect(readableTextOn("#ffcc00")).toBe("#2E2317");
    expect(readableTextOn("#ffffff")).toBe("#2E2317");
  });

  it("puts white on a dark brand colour", () => {
    expect(readableTextOn("#1a1a1a")).toBe("#FFFFFF");
    expect(readableTextOn("#3b6e91")).toBe("#FFFFFF");
  });

  it("handles three-digit hex", () => {
    expect(readableTextOn("#fff")).toBe("#2E2317");
    expect(readableTextOn("#000")).toBe("#FFFFFF");
  });
});

describe("answerSchemaFor", () => {
  const question = {
    id: "q1",
    type: "ShortText" as const,
    label: "Why us",
    required: true,
    options: [],
  };

  it("requires an answer the stored question marked required", () => {
    const result = answerSchemaFor([question]).safeParse({ q1: "" });
    expect(result.success).toBe(false);
  });

  it("accepts an absent answer when the stored question is optional", () => {
    const result = answerSchemaFor([
      { ...question, required: false },
    ]).safeParse({});
    expect(result.success).toBe(true);
  });

  it("ignores a question the form does not have, so a forged field cannot be stored", () => {
    const result = answerSchemaFor([question]).safeParse({
      q1: "because",
      qX: "injected",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).not.toHaveProperty("qX");
  });

  it("refuses a choice that is not one of the stored options", () => {
    const choice = {
      id: "q2",
      type: "SingleChoice" as const,
      label: "Level",
      required: true,
      options: ["Junior", "Senior"],
    };

    expect(answerSchemaFor([choice]).safeParse({ q2: "Senior" }).success).toBe(
      true
    );
    expect(answerSchemaFor([choice]).safeParse({ q2: "CEO" }).success).toBe(
      false
    );
  });

  it.each([
    ["ShortText" as const, ""],
    ["ShortText" as const, null],
    ["LongText" as const, ""],
    ["LongText" as const, null],
  ])(
    "accepts an unanswered optional %s (%p), rather than failing the whole submission",
    (type, value) => {
      const optional = {
        id: "q9",
        type,
        label: "Where did you hear about this role?",
        required: false,
        options: [],
      };

      // `FormData.get()` returns null for a field that was never submitted and
      // "" for one left blank; both mean "skipped" on an optional question.
      expect(answerSchemaFor([optional]).safeParse({ q9: value }).success).toBe(
        true
      );
    }
  );

  it("still requires a required short answer", () => {
    const required = {
      id: "q10",
      type: "ShortText" as const,
      label: "Notice period",
      required: true,
      options: [],
    };

    expect(answerSchemaFor([required]).safeParse({ q10: "" }).success).toBe(
      false
    );
    expect(answerSchemaFor([required]).safeParse({ q10: null }).success).toBe(
      false
    );
  });

  it("lets an untouched optional email through as an empty string", () => {
    const email = {
      id: "q3",
      type: "Email" as const,
      label: "Portfolio contact",
      required: false,
      options: [],
    };

    expect(answerSchemaFor([email]).safeParse({ q3: "" }).success).toBe(true);
    expect(answerSchemaFor([email]).safeParse({ q3: "nope" }).success).toBe(
      false
    );
  });
});
