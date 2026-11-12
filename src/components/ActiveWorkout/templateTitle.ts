const FOCUS: Record<string, string> = {
  A1: "Squat day",
  B1: "OHP day",
  A2: "Bench day",
  B2: "Deadlift day",
};

/** "A1 · Squat day"; just the id for a template without a known focus. */
export function templateTitle(templateId: string): string {
  const focus = FOCUS[templateId];
  return focus ? `${templateId} · ${focus}` : templateId;
}
