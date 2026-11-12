import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TERM_IDS } from "@/lib/glossary";
import GlossaryPage from "./page";

afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe("glossary page", () => {
  it("lists every term under its theme", () => {
    render(<GlossaryPage />);
    expect(screen.getByRole("heading", { name: "Glossary" })).toBeInTheDocument();
    for (const theme of ["Program", "Effort", "Progress", "Body"]) {
      expect(screen.getByRole("region", { name: theme })).toBeInTheDocument();
    }
    expect(document.querySelectorAll("li[id]")).toHaveLength(TERM_IDS.length);
  });

  it("filters on term and aka", () => {
    render(<GlossaryPage />);
    const search = screen.getByRole("searchbox", { name: "Search terms" });
    fireEvent.change(search, { target: { value: "one-rep max" } });
    expect(document.getElementById("e1rm")).not.toBeNull();
    expect(document.getElementById("deload")).toBeNull();
    expect(screen.queryByRole("region", { name: "Body" })).toBeNull();

    fireEvent.change(search, { target: { value: "qqq" } });
    expect(screen.getByText("No matching terms")).toBeInTheDocument();
  });

  it("highlights the term named in the hash", () => {
    window.location.hash = "#amrap";
    render(<GlossaryPage />);
    expect(document.getElementById("amrap")).toHaveAttribute("data-highlighted", "true");
    expect(document.getElementById("rpe")).not.toHaveAttribute("data-highlighted");

    act(() => {
      window.location.hash = "#rpe";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(document.getElementById("rpe")).toHaveAttribute("data-highlighted", "true");
  });
});
