import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { SleepHours, StressLevel } from "@/types";
import { ReadinessCheck } from "./ReadinessCheck";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

function renderCheck(
  sleepHours: SleepHours | null,
  stressLevel: StressLevel | null,
  extra: { healthSleepMinutes?: number | null } = {}
) {
  const onSleepChange = vi.fn();
  const onStressChange = vi.fn();
  render(
    <ReadinessCheck
      sleepHours={sleepHours}
      stressLevel={stressLevel}
      onSleepChange={onSleepChange}
      onStressChange={onStressChange}
      {...extra}
    />
  );
  return { onSleepChange, onStressChange };
}

const SUGGESTION = /Consider skipping accessories/;

describe("ReadinessCheck", () => {
  it("asks about energy: low, normal, good", () => {
    const { onStressChange } = renderCheck(null, null);
    expect(screen.getByText("Energy")).toBeInTheDocument();
    expect(screen.queryByText(/stress/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Good" }));
    expect(onStressChange).toHaveBeenCalledWith("good");
  });

  it("suggests skipping accessories only for short sleep with low energy", () => {
    renderCheck("<5", "low");
    expect(screen.getByText(SUGGESTION)).toBeInTheDocument();
    cleanup();
    renderCheck("<5", "normal");
    expect(screen.queryByText(SUGGESTION)).toBeNull();
    cleanup();
    renderCheck("5-7", "low");
    expect(screen.queryByText(SUGGESTION)).toBeNull();
  });

  it("keeps the Apple Health sleep line", () => {
    renderCheck("5-7", null, { healthSleepMinutes: 383 });
    expect(screen.getByText(/last night, from Apple Health\. Tap to change\./)).toBeInTheDocument();
  });

  it("links to the readiness screen, which comes back here", () => {
    renderCheck(null, null);
    expect(screen.getByRole("link", { name: "See what this changes" })).toHaveAttribute(
      "href",
      "/readiness?from=ready"
    );
  });
});
