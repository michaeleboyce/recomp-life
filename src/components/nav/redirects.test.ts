// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string): never => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));

import ProgramPage from "@/app/program/page";
import HistoryPage from "@/app/history/page";
import ToolsPage from "@/app/tools/page";

const CASES = [
  { old: "/program", Page: ProgramPage, target: "/progress" },
  { old: "/history", Page: HistoryPage, target: "/log" },
  { old: "/tools", Page: ToolsPage, target: "/more" },
];

describe.each(CASES)("$old redirect", ({ Page, target }) => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it(`redirects to ${target}`, async () => {
    await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith(target);
  });

  it("preserves the query string", async () => {
    await expect(
      Page({ searchParams: Promise.resolve({ tab: "x", id: ["1", "2"], skip: undefined }) })
    ).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith(`${target}?tab=x&id=1&id=2`);
  });
});
