import type { EvidenceRule } from "@/types";
import type { SourceId } from "../sources";

export const PAIN_RULES = {
  "training-with-pain": {
    area: "pain",
    status: "active",
    title: "Should I train with pain?",
    summary: "Mild pain is usually something to work around, not a reason to stop",
    appBehavior:
      "Logged pain (not soreness) is shown before a workout against the exercises it could affect. Severity 4 or 5 opens a safety screen. Once a pain entry is more than 7 days old, Today asks whether it is still there, with one tap to keep it or mark it resolved. The app never changes your weights for pain on its own.",
    rationale:
      "In people with ongoing musculoskeletal pain, exercise that allowed some discomfort did slightly better in the short term than strictly pain-free exercise, with no difference later. Adjusting training is generally a better response than stopping altogether.",
    caveat:
      "That research is about long-standing pain in supervised programs, not new injuries from lifting. Sharp, worsening or severe pain, numbness or weakness means stop and see a clinician. This is not medical advice.",
    strength: "limited",
    sources: ["smith2017"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/painModifications.ts#shouldShowRedFlag"],
    surfaces: ["src/components/Today/AttentionList.tsx"],
  },
  "pain-load-changes": {
    area: "pain",
    status: "planned",
    title: "How would pain change my weights?",
    summary: "Pain would lower the load rather than cancel the session",
    appBehavior:
      "Rule in code: for exercises that load the painful area, severity 2 suggests 10% less weight, severity 3 suggests 20% less, severity 4 skips the T1 lift and halves the rest, and severity 5 skips them all. Soreness changes nothing. Not connected.",
    rationale:
      "Reducing load keeps you training while respecting symptoms. The specific percentages are a coaching convention.",
    caveat:
      "The supporting research is about long-standing pain in supervised programs. This is not medical advice.",
    strength: "limited",
    sources: ["smith2017"],
    reviewedOn: "2026-11",
    implementedIn: ["src/lib/painModifications.ts#generateModifications"],
    surfaces: [],
    activationNotes: "Ready to connect. Every suggestion must stay optional.",
  },
} as const satisfies Record<string, EvidenceRule<SourceId>>;
