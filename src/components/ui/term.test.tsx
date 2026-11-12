import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { GLOSSARY } from "@/lib/glossary";
import { Term, TermIcon } from "./term";

afterEach(cleanup);

describe("Term", () => {
  it("is a button named for the term that opens its sheet", () => {
    render(<p>Last set is <Term id="amrap">AMRAP</Term></p>);
    fireEvent.click(screen.getByRole("button", { name: "What does AMRAP mean?" }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByRole("heading", { name: "AMRAP" })).toBeInTheDocument();
    expect(within(sheet).getByText(GLOSSARY.amrap.short)).toBeInTheDocument();
    expect(within(sheet).getByText(GLOSSARY.amrap.long)).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "The research" })).toHaveAttribute(
      "href",
      "/research#amrap-effort"
    );
    expect(within(sheet).getByRole("link", { name: "All terms" })).toHaveAttribute(
      "href",
      "/more/glossary#amrap"
    );
  });

  it("switches to another term through See also", () => {
    render(<Term id="amrap">AMRAP</Term>);
    fireEvent.click(screen.getByRole("button", { name: "What does AMRAP mean?" }));
    const sheet = screen.getByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: GLOSSARY.rpe.term }));
    expect(within(sheet).getByRole("heading", { name: "RPE" })).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: "All terms" })).toHaveAttribute(
      "href",
      "/more/glossary#rpe"
    );
  });

  it("does not trigger a surrounding click handler", () => {
    const onRow = vi.fn();
    render(
      <div onClick={onRow}>
        <Term id="t1">T1</Term>
      </div>
    );
    fireEvent.click(screen.getByRole("button", { name: "What does T1 mean?" }));
    expect(onRow).not.toHaveBeenCalled();
  });

  it("can hide its links for use mid-workout", () => {
    render(<Term id="rpe" hideLinks>RPE</Term>);
    fireEvent.click(screen.getByRole("button", { name: "What does RPE mean?" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("omits the research link for a term without a rule", () => {
    render(<TermIcon id="sets-reps" label="5x3" />);
    fireEvent.click(screen.getByRole("button", { name: "What does 5x3 mean?" }));
    expect(screen.queryByRole("link", { name: "The research" })).toBeNull();
  });
});
