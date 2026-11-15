// Changes to the app's own rules, from the evidence changelog.
import { describe, expect, it } from "vitest";
import { getChangelog, getRule, isRuleId } from "@/lib/evidence";
import type { EvidenceChange } from "@/types";
import { ruleChangeEntries } from "./ruleChanges";

const entriesOf = (changelog: ReadonlyArray<EvidenceChange>) =>
  ruleChangeEntries(changelog).map((ranked) => ranked.entry);

const REST: EvidenceChange = {
  date: "2026-11-11",
  ruleId: "rest-light",
  change: "Rest after T3 and accessory sets was raised from 60 to 90 seconds.",
  sources: ["singer2024"],
};

describe("ruleChangeEntries", () => {
  it("one entry per changelog row, citing the rule that changed", () => {
    const entries = entriesOf([REST]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      source: "ruleChange",
      title: `Rule updated: ${getRule("rest-light").title}`,
      detail: "Rest after T3 and accessory sets was raised from 60 to 90 seconds. Research: Singer 2024.",
      ruleId: "rest-light",
      href: "/research?rule=rest-light#rest-light",
    });
    expect(entries[0].undo).toBeUndefined();
    expect(entries[0].change).toBeUndefined();
  });

  it("dates the entry at midday UTC of the changelog day, so it shows as that day", () => {
    expect(entriesOf([REST])[0].at).toEqual(new Date("2026-11-11T12:00:00Z"));
  });

  it("a change with no source just gives the sentence", () => {
    const entries = entriesOf([{ ...REST, sources: [] }]);
    expect(entries[0].detail).toBe("Rest after T3 and accessory sets was raised from 60 to 90 seconds.");
  });

  it("lists several sources", () => {
    const entries = entriesOf([{ ...REST, sources: ["singer2024", "grgic2018"] }]);
    expect(entries[0].detail).toMatch(/ Research: Singer 2024 and Grgic 2018\.$/);
  });

  it("the id is the same on every call and does not depend on the row's position", () => {
    const other: EvidenceChange = { ...REST, change: "Something else about the same rule that day." };
    const [a, b] = entriesOf([REST, other]);
    const [b2, a2] = entriesOf([other, REST]);
    expect(a.id).toMatch(/^ruleChange:2026-11-11:rest-light:[0-9a-z]+$/);
    expect(a.id).not.toBe(b.id);
    expect(a2.id).toBe(a.id);
    expect(b2.id).toBe(b.id);
  });

  it("skips a row with a date it cannot read and drops a rule id that is not a rule", () => {
    expect(entriesOf([{ ...REST, date: "last week" }])).toEqual([]);
    const unknown = entriesOf([{ ...REST, ruleId: "no-such-rule" }]);
    expect(unknown[0].title).toBe("Rule updated");
    expect(unknown[0].ruleId).toBeUndefined();
    expect(unknown[0].href).toBeUndefined();
  });

  it("covers the app's real changelog: unique ids, real rules, a link each", () => {
    const changelog = getChangelog();
    const entries = entriesOf(changelog);
    expect(entries).toHaveLength(changelog.length);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(entries.length);
    for (const entry of entries) {
      expect(isRuleId(entry.ruleId!), entry.title).toBe(true);
      expect(entry.href).toBe(`/research?rule=${entry.ruleId}#${entry.ruleId}`);
      expect(Number.isFinite(entry.at.getTime())).toBe(true);
      expect(entry.detail.length).toBeGreaterThan(0);
    }
  });
});
