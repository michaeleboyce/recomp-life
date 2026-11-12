import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { SectionHeader } from "./section-header";

afterEach(cleanup);

describe("SectionHeader", () => {
  it("renders the title as an h2 by default", () => {
    render(<SectionHeader title="Needs attention" />);
    const h = screen.getByRole("heading", { level: 2, name: "Needs attention" });
    expect(h).toHaveClass("uppercase", "text-xs", "text-muted-foreground");
  });

  it("accepts another heading level", () => {
    render(<SectionHeader title="Lifts" as="h3" />);
    expect(screen.getByRole("heading", { level: 3 })).toBeInTheDocument();
  });

  it("renders the action slot and passes className through", () => {
    const { container } = render(
      <SectionHeader title="Lifts" action={<a href="/x">See all</a>} className="mb-2" />
    );
    expect(screen.getByRole("link", { name: "See all" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("mb-2");
  });
});
