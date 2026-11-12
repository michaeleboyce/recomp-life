import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PageShell, PageHeader } from "./page-shell";

describe("PageShell", () => {
  it("renders children inside the standard wrapper", () => {
    render(
      <PageShell className="space-y-4">
        <p>content</p>
      </PageShell>
    );
    const shell = screen.getByText("content").parentElement!;
    expect(shell).toHaveClass("mx-auto", "max-w-lg", "px-5", "pt-5", "pb-28", "space-y-4");
  });
});

describe("PageHeader", () => {
  it("renders the title as an h1", () => {
    render(<PageHeader title="History" />);
    const h1 = screen.getByRole("heading", { level: 1, name: "History" });
    expect(h1).toHaveClass("text-xl", "font-bold");
  });

  it("renders no back link without backHref", () => {
    render(<PageHeader title="History" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an accessible back link", () => {
    render(<PageHeader title="Log Weight" backHref="/" />);
    const link = screen.getByRole("link", { name: "Back" });
    expect(link).toHaveAttribute("href", "/");
    expect(link.querySelector("svg")).toBeInTheDocument();
  });

  it("renders the action slot", () => {
    render(<PageHeader title="Settings" action={<button>Save</button>} />);
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("passes className through", () => {
    render(<PageHeader title="X" className="mb-6" />);
    expect(screen.getByRole("banner")).toHaveClass("mb-6");
  });
});
