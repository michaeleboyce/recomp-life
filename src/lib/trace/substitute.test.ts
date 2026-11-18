import { describe, expect, it } from "vitest";
import { repsLeftText } from "./substitute";

describe("repsLeftText", () => {
  it("names the reps left for an answer the estimate credits", () => {
    expect(repsLeftText("1-2")).toBe(" with 1-2 reps left");
    expect(repsLeftText("3+")).toBe(" with 3+ reps left");
  });

  it('says nothing for "0" or no answer', () => {
    expect(repsLeftText("0")).toBe("");
    expect(repsLeftText(null)).toBe("");
    expect(repsLeftText(undefined)).toBe("");
  });
});
