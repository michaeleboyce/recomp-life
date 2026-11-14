import { describe, expect, it } from "vitest";
import { apiUrl, nativeAppCorsHeaders, NATIVE_APP_ORIGIN } from "./apiBase";

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

describe("nativeAppCorsHeaders", () => {
  const headers = Object.fromEntries(nativeAppCorsHeaders().map((h) => [h.key, h.value]));

  it("allows the app's own origin and never a wildcard", () => {
    expect(NATIVE_APP_ORIGIN).toBe("capacitor://localhost");
    expect(headers["Access-Control-Allow-Origin"]).toBe("capacitor://localhost");
    expect(Object.values(headers)).not.toContain("*");
  });

  it("lets the passphrase header and a JSON body through", () => {
    expect(headers["Access-Control-Allow-Headers"]).toBe("Authorization, Content-Type");
    expect(headers["Access-Control-Allow-Methods"]).toContain("POST");
    expect(headers["Access-Control-Allow-Methods"]).toContain("OPTIONS");
  });
});
