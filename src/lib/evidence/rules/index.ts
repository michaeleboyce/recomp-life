/**
 * All coaching rules, merged from one file per area.
 *
 * To add or change a rule, edit the file for its area. To add an area, create
 * a file here, add it to RULE_GROUPS and add the area to `EvidenceArea` in
 * src/types/index.ts. See docs/research/ADDING_RESEARCH.md.
 */

import { PROGRESSION_RULES } from "./progression";
import { EFFORT_RULES } from "./effort";
import { REST_RULES } from "./rest";
import { RECOVERY_RULES } from "./recovery";
import { RUNNING_RULES } from "./running";
import { VOLUME_RULES } from "./volume";
import { NUTRITION_RULES } from "./nutrition";
import { PAIN_RULES } from "./pain";
import { EQUIPMENT_RULES } from "./equipment";

/** Rule groups in display order. Used to detect duplicate ids across files. */
export const RULE_GROUPS = [
  PROGRESSION_RULES,
  EFFORT_RULES,
  REST_RULES,
  RECOVERY_RULES,
  RUNNING_RULES,
  VOLUME_RULES,
  NUTRITION_RULES,
  PAIN_RULES,
  EQUIPMENT_RULES,
] as const;

export const EVIDENCE_RULES = {
  ...PROGRESSION_RULES,
  ...EFFORT_RULES,
  ...REST_RULES,
  ...RECOVERY_RULES,
  ...RUNNING_RULES,
  ...VOLUME_RULES,
  ...NUTRITION_RULES,
  ...PAIN_RULES,
  ...EQUIPMENT_RULES,
};

export type RuleId = keyof typeof EVIDENCE_RULES;
