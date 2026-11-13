import { describe, expect, it } from "vitest";
import { apiUrl } from "./apiBase";

describe("apiUrl", () => {
  it("leaves the path alone when no base is set", () => {
    expect(apiUrl("/api/sync/push", undefined)).toBe("/api/sync/push");
    expect(apiUrl("/api/sync/push", "")).toBe("/api/sync/push");
    expect(apiUrl("/api/sync/push", "  ")).toBe("/api/sync/push");
  });

  it("joins the base and the path with one slash", () => {
    expect(apiUrl("/api/sync/push", "https://example.com")).toBe("https://example.com/api/sync/push");
    expect(apiUrl("/api/sync/push", "https://example.com/")).toBe("https://example.com/api/sync/push");
    expect(apiUrl("api/sync/push", "https://example.com//")).toBe("https://example.com/api/sync/push");
  });
});
