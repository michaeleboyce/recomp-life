/**
 * Turns an exercise name from another app into a comparison key, so that
 * "Bench Press (Dumbbell)", "dumbbell  bench-press" and "DB Bench Press" all
 * meet the same entry in the mapping table. Pure.
 *
 * The key ignores case, punctuation, apostrophes (straight or curly), unusual
 * spaces, word order, plurals, a few filler words and common abbreviations.
 * It is a normalisation, not a fuzzy match: two names share a key only when
 * they use the same words.
 */

/** Abbreviations and spellings rewritten to one word (or two). */
const EXPANSIONS: Record<string, string[]> = {
  db: ["dumbbell"],
  dbs: ["dumbbell"],
  dumbell: ["dumbbell"],
  bb: ["barbell"],
  kb: ["kettlebell"],
  rdl: ["romanian", "deadlift"],
  ohp: ["overhead", "press"],
  oh: ["overhead"],
  bw: ["bodyweight"],
  flye: ["fly"],
  flyes: ["fly"],
  flies: ["fly"],
  flys: ["fly"],
  calves: ["calf"],
  pushup: ["push", "up"],
  pushups: ["push", "up"],
  situp: ["sit", "up"],
  situps: ["sit", "up"],
  pullup: ["pull", "up"],
  pullups: ["pull", "up"],
  chinup: ["chin", "up"],
  chinups: ["chin", "up"],
  ups: ["up"],
};

/** Two-word spellings joined into the one-word form before splitting into words. */
const JOINS: [RegExp, string][] = [
  [/\bpull downs?\b/g, "pulldown"],
  [/\bpull overs?\b/g, "pullover"],
  [/\bpush downs?\b/g, "pushdown"],
  [/\bskull crushers?\b/g, "skullcrusher"],
  [/\bkick backs?\b/g, "kickback"],
];

const FILLER = new Set(["a", "an", "the", "with", "on", "of", "and"]);

/** Plural to singular for the words exercise names use ("curls", "crunches", "presses"). */
function singular(word: string): string {
  if (word.length <= 3) return word;
  if (/(ss|us|is)$/.test(word)) return word;
  if (/(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

/** The name's words after normalisation, in their original order. */
export function nameTokens(name: string): string[] {
  let text = name.normalize("NFKC").toLowerCase();
  // Apostrophes disappear ("farmer's" -> "farmers"); every other symbol is a space.
  text = text.replace(/['‘’ʼ`´]/g, "");
  text = text.replace(/[​-‍⁠﻿]/g, " ");
  text = text.replace(/[^a-z0-9]+/g, " ").trim();
  for (const [pattern, joined] of JOINS) text = text.replace(pattern, joined);
  const words: string[] = [];
  for (const raw of text.split(" ")) {
    if (!raw || FILLER.has(raw)) continue;
    const one = singular(raw);
    words.push(...(EXPANSIONS[raw] ?? EXPANSIONS[one] ?? [one]));
  }
  return words;
}

/** The comparison key: normalised words, sorted, joined by single spaces. "" for a blank name. */
export function nameKey(name: string): string {
  return [...nameTokens(name)].sort().join(" ");
}
