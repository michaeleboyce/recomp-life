import { describe, expect, it } from "vitest";
import {
  MAX_ENTRIES,
  STATE_KEY,
  entryAt,
  previousUrl,
  pushUrl,
  readStamp,
  replaceUrl,
  startStack,
  traverseTo,
} from "./navHistory";
import { screenName } from "./screenNames";

describe("the in-app history list", () => {
  it("has no previous screen on the first one", () => {
    expect(previousUrl(startStack("/"))).toBeNull();
    expect(previousUrl(null)).toBeNull();
  });

  it("push adds an entry after the current one and drops forward entries", () => {
    let stack = pushUrl(pushUrl(startStack("/"), "/progress"), "/progress/forecasts");
    expect(previousUrl(stack)).toBe("/progress");
    stack = traverseTo(stack, 1, "/progress");
    expect(previousUrl(stack)).toBe("/");
    stack = pushUrl(stack, "/log");
    expect(stack.entries).toEqual(["/", "/progress", "/log"]);
    expect(stack.index).toBe(2);
  });

  it("replace changes the current entry only", () => {
    const stack = replaceUrl(pushUrl(startStack("/"), "/progress"), "/progress?tab=body");
    expect(stack.entries).toEqual(["/", "/progress?tab=body"]);
    expect(previousUrl(stack)).toBe("/");
  });

  it("replace with the same address keeps the same list", () => {
    const stack = pushUrl(startStack("/"), "/progress");
    expect(replaceUrl(stack, "/progress")).toBe(stack);
  });

  it("keeps only the last entries", () => {
    let stack = startStack("/0");
    for (let i = 1; i <= MAX_ENTRIES + 5; i++) stack = pushUrl(stack, `/${i}`);
    expect(stack.entries).toHaveLength(MAX_ENTRIES);
    expect(stack.index).toBe(MAX_ENTRIES + 5);
    expect(previousUrl(stack)).toBe(`/${MAX_ENTRIES + 4}`);
    // Back past the kept entries: the screen before is not known.
    const old = traverseTo(stack, 2, "/2");
    expect(entryAt(old, 2)).toBe("/2");
    expect(previousUrl(old)).toBeNull();
  });

  it("reads only integer stamps", () => {
    expect(readStamp({ [STATE_KEY]: 3, __NA: true })).toBe(3);
    expect(readStamp({ [STATE_KEY]: "3" })).toBeNull();
    expect(readStamp(null)).toBeNull();
  });
});

describe("screenName", () => {
  it("names the screens a back arrow returns to", () => {
    expect(screenName("/")).toBe("Today");
    expect(screenName("/?why=squat:T1")).toBe("Today");
    expect(screenName("/progress?tab=body")).toBe("Progress");
    expect(screenName("/progress/forecasts")).toBe("Forecasts");
    expect(screenName("/progress/lift/squat?from=today")).toBe("Barbell Squat");
    expect(screenName("/progress/lift/squat/projection")).toBe("Projection");
    expect(screenName("/exercises/goblet_squat")).toBeTruthy();
    expect(screenName("/research#readiness-score")).toBe("Research");
  });

  it("has no name for an unknown screen or exercise", () => {
    expect(screenName("/nowhere")).toBeNull();
    expect(screenName("/progress/lift/__proto__")).toBe("Lift");
  });
});
