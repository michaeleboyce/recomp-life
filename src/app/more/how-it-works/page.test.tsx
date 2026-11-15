import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { STRENGTH_LABELS, STRENGTH_ORDER } from "@/lib/evidence";
import { MODELS, modelStats, registryTotals } from "@/lib/glass/modelMap";
import HowItWorksPage from "./page";

afterEach(cleanup);

describe("How the app decides", () => {
  it("shows the three bands", () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole("heading", { name: "What it reads" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How it reasons" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What you see" })).toBeInTheDocument();
  });

  it("lists every model with its rule count from the registry and a link to its rules", () => {
    render(<HowItWorksPage />);
    for (const model of MODELS) {
      const link = screen.getByRole("link", { name: new RegExp(`^${model.label}`) });
      expect(link).toHaveAttribute("href", `/research?model=${model.id}`);
      const { active, planned } = modelStats(model);
      expect(link).toHaveTextContent(active === 0 ? `${planned} written` : `${active} rule`);
      expect(within(link).getByRole("img")).toHaveAccessibleName(/./);
    }
  });

  it("shows a legend with the count of rules per grade, as words", () => {
    render(<HowItWorksPage />);
    const totals = registryTotals();
    for (const s of STRENGTH_ORDER.filter((g) => totals.byGrade[g] > 0)) {
      expect(screen.getByText(`${STRENGTH_LABELS[s]} · ${totals.byGrade[s]}`)).toBeInTheDocument();
    }
    expect(screen.getByText(new RegExp(`${totals.active} written rules`))).toBeInTheDocument();
  });

  it("links to what the user sees", () => {
    render(<HowItWorksPage />);
    expect(screen.getByRole("link", { name: /^Forecasts\s*what to expect/ })).toHaveAttribute(
      "href",
      "/progress/forecasts"
    );
    expect(screen.getByRole("link", { name: /^Log\s*of changes/ })).toHaveAttribute(
      "href",
      "/more/adjustments"
    );
    expect(screen.getByRole("link", { name: /^Record\s*how often/ })).toHaveAttribute(
      "href",
      "/progress/forecasts/record"
    );
  });
});
