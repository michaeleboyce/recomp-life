import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getRule } from "@/lib/evidence";
import { MODELS } from "@/lib/glass/modelMap";
import { Toaster } from "@/components/ui/toast";

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
}));

import { ResearchLibrary } from "./ResearchLibrary";

beforeEach(() => {
  search = "";
  window.location.hash = "";
});
afterEach(cleanup);

describe("research library", () => {
  it("lists the rules with the grade filter and 'how to read this'", () => {
    render(<ResearchLibrary />);
    expect(screen.getByText("How to read this")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Filter by evidence strength" })).toBeInTheDocument();
    expect(screen.getByText(getRule("rest-heavy").title)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Program rule" }));
    expect(screen.queryByText(getRule("rest-heavy").title)).toBeNull();
    expect(screen.getByText(getRule("t3-progression").title)).toBeInTheDocument();
  });

  it("lists only a model's rules for ?model=", () => {
    search = "model=rest";
    render(<ResearchLibrary />);
    expect(screen.getByText(getRule("rest-heavy").title)).toBeInTheDocument();
    expect(screen.queryByText(getRule("t3-progression").title)).toBeNull();
    expect(screen.getByText(MODELS.find((m) => m.id === "rest")!.label)).toBeInTheDocument();
  });
});

describe("one rule", () => {
  it("opens from ?rule= with every part of the page", () => {
    search = "rule=rest-heavy";
    render(<ResearchLibrary />);
    const rule = getRule("rest-heavy");
    expect(screen.getByRole("heading", { level: 1, name: rule.title })).toBeInTheDocument();
    expect(screen.getByText("Moderate evidence")).toBeInTheDocument();
    expect(screen.getByText("What the app does")).toBeInTheDocument();
    expect(screen.getByText(rule.appBehavior)).toBeInTheDocument();
    expect(screen.getByText("Why")).toBeInTheDocument();
    expect(screen.getByText("Where it could be wrong")).toBeInTheDocument();
    expect(screen.getByText("Sources")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Read the paper/ }).length).toBeGreaterThan(0);
    expect(screen.getByText("Related")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Why 30 seconds extra while cutting/ })).toHaveAttribute(
      "href",
      "/research?rule=rest-cut-bonus"
    );
  });

  it("opens from the older #id anchor", async () => {
    window.location.hash = "#rest-light";
    render(<ResearchLibrary />);
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { level: 1, name: getRule("rest-light").title })
      ).toBeInTheDocument()
    );
  });

  it("copies the link from Share", async () => {
    search = "rule=rest-heavy";
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <>
        <ResearchLibrary />
        <Toaster />
      </>
    );
    fireEvent.click(screen.getByRole("button", { name: /Share/ }));
    await waitFor(() => expect(screen.getByText("Link copied.")).toBeInTheDocument());
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/research?rule=rest-heavy`);
  });

  it("falls back to the list for an unknown rule", () => {
    search = "rule=nope";
    render(<ResearchLibrary />);
    expect(screen.getByText("How to read this")).toBeInTheDocument();
  });
});
