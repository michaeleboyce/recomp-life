import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReadinessScore, SleepHours, StressLevel } from "@/types";
import { ReadinessCheck } from "./ReadinessCheck";
import { answersFrom } from "./ReadinessSheet";

const hooks = vi.hoisted(() => ({ useReadinessToday: vi.fn() }));
vi.mock("@/hooks", () => hooks);

const SCORE: ReadinessScore = {
  score: 61,
  usual: 72,
  suggestSkippingAccessories: true,
  contributions: [
    { id: "sleep", label: "Sleep: under 5 hours", detail: "Your answer", points: -8, ruleId: "readiness" },
  ],
};

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

  it("shows readiness from the answers just given in a sheet, without leaving the screen", async () => {
    hooks.useReadinessToday.mockReturnValue(SCORE);
    render(
      <ReadinessCheck
        sleepHours="<5"
        stressLevel="low"
        onSleepChange={vi.fn()}
        onStressChange={vi.fn()}
        location="home"
      />
    );
    expect(screen.queryByRole("link", { name: "See what this changes" })).toBeNull();
    expect(hooks.useReadinessToday).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "See what this changes" }));
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveTextContent("What your answers change");
    expect(screen.getByRole("img", { name: "Readiness 61 out of 100" })).toBeInTheDocument();
    expect(hooks.useReadinessToday).toHaveBeenLastCalledWith({
      location: "home",
      answers: { sleepHours: "<5", stressLevel: "low" },
    });
  });

  it("asks for both answers in the sheet until they are given", async () => {
    hooks.useReadinessToday.mockReturnValue(null);
    renderCheck("7+", null);
    fireEvent.click(screen.getByRole("button", { name: "See what this changes" }));
    expect(await screen.findByText(/Answer both questions/)).toBeInTheDocument();
    expect(hooks.useReadinessToday).toHaveBeenLastCalledWith({ location: "gym", answers: null });
  });
});

describe("answersFrom", () => {
  it("is null until both answers are given", () => {
    expect(answersFrom(null, "low")).toBeNull();
    expect(answersFrom("5-7", null)).toBeNull();
  });

  it("keeps Apple Health's minutes only while the sleep answer is still theirs", () => {
    expect(answersFrom("5-7", "good", 383)).toEqual({
      sleepHours: "5-7",
      stressLevel: "good",
      sleepMinutes: 383,
      sleepSource: "apple_health",
    });
    expect(answersFrom("7+", "good", 383)).toEqual({ sleepHours: "7+", stressLevel: "good" });
  });
});
