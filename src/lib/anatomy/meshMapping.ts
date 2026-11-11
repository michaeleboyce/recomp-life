import type { MuscleId } from "../../types/index.ts";

/**
 * Maps the anatomical names in the 3D model (Z-Anatomy naming) to the app's
 * muscles. Used by scripts/build-anatomy-model.ts to tag each mesh; the
 * viewer then reads the tag.
 *
 * `name` is the muscle's common name in the model's metadata and `detail`
 * the specific part ("Clavicular Part Of Deltoid Muscle").
 *
 * Relative import with extension on purpose: the build script runs this file
 * directly under Node.
 */

const BY_NAME: Record<string, MuscleId> = {
  "Pectoralis Major": "chest",
  "Pectoralis Minor": "chest",

  Infraspinatus: "rotator_cuff",
  Supraspinatus: "rotator_cuff",
  "Teres Minor": "rotator_cuff",
  Subscapularis: "rotator_cuff",

  Biceps: "biceps",
  "Short Head Of Biceps Brachii": "biceps",
  Brachialis: "biceps",
  Coracobrachialis: "biceps",

  Triceps: "triceps",
  Anconeus: "triceps",

  Brachioradialis: "forearms",
  "Extensor Carpi Radialis Brevis": "forearms",
  "Extensor Carpi Radialis Longus": "forearms",
  "Humeral Head Of Extensor Carpi Ulnaris": "forearms",
  "Ulnar Head Of Extensor Carpi Ulnaris": "forearms",
  "Flexor Carpi Radialis": "forearms",
  "Humeral Head Of Flexor Carpi Ulnaris": "forearms",
  "Ulnar Head Of Flexor Carpi Ulnaris": "forearms",
  "Palmaris Longus": "forearms",
  "Superficial Head Of Pronator Teres": "forearms",
  "Deep Head Of Pronator Teres": "forearms",
  "Pronator Quadratus": "forearms",
  Supinator: "forearms",
  "Flexor Digitorum Superficialis": "forearms",
  "Humero-Ulnar Head Of Flexor Digitorum Superficialis": "forearms",
  "Flexor Digitorum Profundus": "forearms",
  "Flexor Pollicis Longus": "forearms",
  "Extensor Digitorum": "forearms",
  "Extensor Digiti Minimi": "forearms",
  "Extensor Indicis": "forearms",
  "Extensor Pollicis Brevis": "forearms",
  "Extensor Pollicis Longus": "forearms",
  "Abductor Pollicis Longus": "forearms",

  "Levator Scapulae": "upper_traps",
  "Rhomboid Major": "mid_back",
  "Rhomboid Minor": "mid_back",

  "Latissimus Dorsi": "lats",
  "Teres Major": "lats",

  "Multifidus Lumborum": "lower_back",
  "Multifidus Thoracis": "lower_back",
  "Quadratus Lumborum": "lower_back",

  "Rectus Abdominis": "abs",
  Pyramidalis: "abs",
  "Abdominal External Oblique": "obliques",
  "Abdominal Internal Oblique": "obliques",

  "Gluteus Maximus": "glutes",
  "Gluteus Medius": "glutes",
  "Gluteus Minimus": "glutes",

  "Quadriceps Femoris": "quads",

  "Biceps Femoris": "hamstrings",
  "Short Head Of Biceps Femoris": "hamstrings",
  Semitendinosus: "hamstrings",
  Semimembranosus: "hamstrings",

  "Adductor Brevis": "adductors",
  "Adductor Longus": "adductors",
  "Adductor Magnus": "adductors",
  Gracilis: "adductors",
  Pectineus: "adductors",

  Gastrocnemius: "calves",
  Soleus: "calves",
  Plantaris: "calves",
};

/** Muscles whose parts map to different app muscles, decided by `detail`. */
function byDetail(name: string, detail: string): MuscleId | null | undefined {
  const d = detail.toLowerCase();
  switch (name) {
    case "Deltoid":
      if (d.includes("clavicular")) return "front_delts";
      if (d.includes("acromial")) return "side_delts";
      if (d.includes("spinal")) return "rear_delts";
      return "side_delts";
    case "Trapezius":
      return d.includes("descending") ? "upper_traps" : "mid_back";
    // Spinal erectors: the neck and head portions are not trained by lifting.
    case "Iliocostalis":
    case "Longissimus":
    case "Spinalis":
      return d.includes("lumborum") || d.includes("thoracis") ? "lower_back" : null;
    default:
      return undefined;
  }
}

/**
 * The app muscle a model mesh belongs to, or null for muscles the app does
 * not track (face, neck, hands, feet, deep stabilisers).
 */
export function classifyMuscleMesh(name: string, detail: string): MuscleId | null {
  const split = byDetail(name, detail);
  if (split !== undefined) return split;
  return BY_NAME[name] ?? null;
}

/** Every model muscle name this file knows about (for tests). */
export const KNOWN_MODEL_MUSCLES: readonly string[] = [
  ...Object.keys(BY_NAME),
  "Deltoid",
  "Trapezius",
  "Iliocostalis",
  "Longissimus",
  "Spinalis",
];
