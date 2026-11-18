import { describe, expect, it } from "vitest";
import { getAllRules } from "@/lib/evidence";
import { T1_AMRAP_TARGET_REPS_IN_RESERVE } from "@/lib/amrap";
import { REPS_IN_RESERVE_OPTIONS, RIR_ESTIMATE } from "@/lib/effort";
import { RESET_FACTOR, T2_AUTOREG_DROP } from "@/lib/progression";
import { REST_SECONDS } from "@/lib/restTimes";
import {
  GLOSSARY,
  GLOSSARY_THEMES,
  TERM_IDS,
  isTermId,
  searchGlossary,
  type TermId,
} from "./glossary";

const REQUIRED: TermId[] = [
  "gzclp", "t1", "t2", "t3", "amrap", "amrap-plus", "sets-reps", "stage", "fail-reset",
  "rir", "e1rm", "pr", "working-weight", "warm-up", "deload", "freeze",
  "accessory", "substitute", "rest-timer", "training-phase", "rate-of-loss",
  "weekly-sets", "hard-set", "rotation", "gym-debt", "projection", "pr-chance",
];

describe("glossary registry", () => {
  it("has every required term", () => {
    for (const id of REQUIRED) expect(GLOSSARY[id], id).toBeDefined();
  });

  it("keeps every short definition under 140 characters and one sentence", () => {
    for (const id of TERM_IDS) {
      const { short } = GLOSSARY[id];
      expect(short.length, id).toBeLessThan(140);
      expect(short.trim().endsWith("."), id).toBe(true);
    }
  });

  it("writes every long definition as two to four sentences", () => {
    for (const id of TERM_IDS) {
      const sentences = GLOSSARY[id].long.split(/(?<=[.!?])\s+(?=[A-Z0-9"])/);
      expect(sentences.length, id).toBeGreaterThanOrEqual(2);
      expect(sentences.length, id).toBeLessThanOrEqual(4);
    }
  });

  it("resolves every seeAlso to another term", () => {
    for (const id of TERM_IDS) {
      for (const other of GLOSSARY[id].seeAlso ?? []) {
        expect(isTermId(other), `${id} -> ${other}`).toBe(true);
        expect(other).not.toBe(id);
      }
    }
  });

  it("resolves every ruleId to a real evidence rule", () => {
    const ruleIds = new Set<string>(getAllRules().map((r) => r.id));
    for (const id of TERM_IDS) {
      const ruleId = GLOSSARY[id].ruleId;
      if (ruleId) expect(ruleIds.has(ruleId), `${id} -> ${ruleId}`).toBe(true);
    }
  });

  it("puts every term in exactly one theme", () => {
    const placed = Object.values(GLOSSARY_THEMES).flat();
    expect([...placed].sort()).toEqual([...TERM_IDS].sort());
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("builds numbers from the code's constants", () => {
    expect(GLOSSARY["fail-reset"].long).toContain(`${Math.round(RESET_FACTOR * 100)}%`);
    expect(GLOSSARY["rest-timer"].long).toContain(`${REST_SECONDS.T1 / 60} minutes`);
    expect(GLOSSARY.t3.long).toContain("25");
  });

  it("defines reps in reserve with the app's three answers and their credit", () => {
    const { term, short, long, ruleId } = GLOSSARY.rir;
    expect(term).toBe("Reps in reserve");
    expect(ruleId).toBe("effort-logging");
    for (const answer of REPS_IN_RESERVE_OPTIONS) expect(short).toContain(answer);
    expect(long).toContain(`${RIR_ESTIMATE["1-2"]} for 1-2`);
    expect(long).toContain(`${RIR_ESTIMATE["3+"]} for 3+`);
  });

  it("states the T2 lighter-weight suggestion from its constants", () => {
    const { long } = GLOSSARY.autoregulation;
    expect(long).toContain(`${Math.round(T2_AUTOREG_DROP.max * 1000) / 10}%`);
    expect(long).toContain(`${T2_AUTOREG_DROP.stepLbs} lb step down`);
    expect(long).toContain("While cutting, 1-2 reps left");
    expect(GLOSSARY.amrap.long).toContain(`${T1_AMRAP_TARGET_REPS_IN_RESERVE} reps left`);
  });

  it("never says RPE or RIR", () => {
    for (const id of TERM_IDS) {
      const { term, aka = [], short, long } = GLOSSARY[id];
      for (const text of [term, ...aka, short, long]) expect(text, id).not.toMatch(/\bRPE\b|\bRIR\b/i);
    }
  });
});

describe("searchGlossary", () => {
  it("matches term and aka, case-insensitively", () => {
    expect(searchGlossary("amrap")).toContain("amrap");
    expect(searchGlossary("one-rep max")).toContain("e1rm");
    expect(searchGlossary("reps left")).toContain("rir");
    expect(searchGlossary("")).toEqual(TERM_IDS);
    expect(searchGlossary("zzzz")).toEqual([]);
  });
});
