// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { contentSecurityPolicy, DENIED_FEATURES, securityHeaders } from "./securityHeaders";
import { syncApiHeaders } from "./apiBase";

/** directive name -> its sources */
function parse(policy: string): Record<string, string[]> {
  return Object.fromEntries(
    policy.split(";").map((part) => {
      const [name, ...values] = part.trim().split(/\s+/);
      return [name, values];
    })
  );
}

describe("contentSecurityPolicy", () => {
  const csp = parse(contentSecurityPolicy());

  it("allows only this site by default and for fonts and connections", () => {
    expect(csp["default-src"]).toEqual(["'self'"]);
    expect(csp["font-src"]).toEqual(["'self'"]);
    expect(csp["connect-src"]).toEqual(["'self'"]);
    expect(csp["manifest-src"]).toEqual(["'self'"]);
  });

  it("scripts: this site, Next.js's inline data, WebAssembly for the Draco decoder; never eval in production", () => {
    expect(csp["script-src"]).toEqual(["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"]);
    expect(csp["script-src"]).not.toContain("'unsafe-eval'");
    expect(Object.values(csp).flat()).not.toContain("*");
  });

  it("images, styles and workers", () => {
    expect(csp["img-src"]).toEqual(["'self'", "data:", "blob:"]);
    expect(csp["style-src"]).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp["worker-src"]).toEqual(["'self'", "blob:"]);
  });

  it("no plugins, no framing, no foreign base or form targets", () => {
    expect(csp["object-src"]).toEqual(["'none'"]);
    expect(csp["frame-ancestors"]).toEqual(["'none'"]);
    expect(csp["base-uri"]).toEqual(["'self'"]);
    expect(csp["form-action"]).toEqual(["'self'"]);
  });

  it("the dev server also gets eval, which React's dev tooling needs", () => {
    expect(parse(contentSecurityPolicy({ dev: true }))["script-src"]).toContain("'unsafe-eval'");
  });

  it("an API on another origin is added to connect-src, as an origin only", () => {
    expect(parse(contentSecurityPolicy({ apiBase: "https://api.example.com/base/" }))["connect-src"]).toEqual([
      "'self'",
      "https://api.example.com",
    ]);
    expect(parse(contentSecurityPolicy({ apiBase: "" }))["connect-src"]).toEqual(["'self'"]);
    expect(parse(contentSecurityPolicy({ apiBase: "not a url" }))["connect-src"]).toEqual(["'self'"]);
  });
});

describe("securityHeaders", () => {
  const headers = Object.fromEntries(securityHeaders().map((h) => [h.key, h.value]));

  it("sends the policy, the referrer policy and nosniff", () => {
    expect(headers["Content-Security-Policy"]).toBe(contentSecurityPolicy());
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("denies the browser features the app does not use, and only those", () => {
    const policy = headers["Permissions-Policy"];
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(policy).toContain(`${feature}=()`);
    }
    expect(policy.split(", ")).toHaveLength(DENIED_FEATURES.length);
    // The workout screen keeps the screen awake; the evidence pages copy links.
    expect(policy).not.toMatch(/screen-wake-lock|clipboard|autoplay/);
  });
});

describe("next.config.ts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function load() {
    vi.resetModules();
    return (await import("../../next.config")).default;
  }

  it("the web build sends the security headers on every path, and the sync headers under /api/sync", async () => {
    const config = (await load())(PHASE_PRODUCTION_BUILD);
    const rules = await config.headers!();
    expect(rules).toEqual([
      { source: "/:path*", headers: securityHeaders() },
      { source: "/api/sync/:path*", headers: syncApiHeaders() },
    ]);
  });

  it("the dev server's policy allows eval", async () => {
    const config = (await load())(PHASE_DEVELOPMENT_SERVER);
    const [pages] = await config.headers!();
    const csp = pages.headers.find((h) => h.key === "Content-Security-Policy")!.value;
    expect(parse(csp)["script-src"]).toContain("'unsafe-eval'");
  });

  it("the iPhone app's static export has no headers", async () => {
    vi.stubEnv("BUILD_TARGET", "native");
    const config = (await load())(PHASE_PRODUCTION_BUILD);
    expect(config.output).toBe("export");
    expect(config.headers).toBeUndefined();
  });
});
