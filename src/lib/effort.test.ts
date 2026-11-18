import { describe, expect, it } from "vitest";
import {
  REPS_IN_RESERVE_OPTIONS,
  RIR_ESTIMATE,
  averageRepsInReserve,
  isRepsInReserve,
  repsInReserveCredit,
  repsInReserveLabel,
} from "./effort";

describe("reps in reserve", () => {
  it("offers three answers, hardest first", () => {
    expect(REPS_IN_RESERVE_OPTIONS).toEqual(["0", "1-2", "3+"]);
  });

  it("counts 0, the midpoint of 1-2, and the floor of 3+", () => {
    expect(RIR_ESTIMATE).toEqual({ "0": 0, "1-2": 1.5, "3+": 3 });
  });

  it("recognises only the three stored answers", () => {
    expect(isRepsInReserve("1-2")).toBe(true);
    expect(isRepsInReserve("2")).toBe(false);
    expect(isRepsInReserve(9)).toBe(false);
    expect(isRepsInReserve(null)).toBe(false);
  });

  it("credits nothing when no answer was logged", () => {
    expect(repsInReserveCredit(undefined)).toBe(0);
    expect(repsInReserveCredit(null)).toBe(0);
    expect(repsInReserveCredit("0")).toBe(0);
    expect(repsInReserveCredit("1-2")).toBe(1.5);
    expect(repsInReserveCredit("3+")).toBe(3);
  });

  it("labels an answer", () => {
    expect(repsInReserveLabel("3+")).toBe("3+ left");
  });

  it("averages only the sets that have an answer", () => {
    expect(averageRepsInReserve([])).toBeNull();
    expect(averageRepsInReserve([null, undefined])).toBeNull();
    expect(averageRepsInReserve(["0", "3+", null])).toBe(1.5);
    expect(averageRepsInReserve(["1-2", "1-2", "0"])).toBe(1);
  });
});
