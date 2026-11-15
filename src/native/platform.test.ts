import { afterEach, describe, expect, it } from "vitest";
import { isNativeApp } from "./platform";

const globals = globalThis as { Capacitor?: unknown };

afterEach(() => {
  delete globals.Capacitor;
});

describe("isNativeApp", () => {
  it("is false in a browser, where there is no Capacitor object", () => {
    expect(isNativeApp()).toBe(false);
  });

  it("is false when Capacitor's web build is loaded", () => {
    globals.Capacitor = { isNativePlatform: () => false };
    expect(isNativeApp()).toBe(false);
  });

  it("is true inside the native shell", () => {
    globals.Capacitor = { isNativePlatform: () => true };
    expect(isNativeApp()).toBe(true);
  });
});
