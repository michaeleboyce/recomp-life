#!/usr/bin/env node
// Fetches public-domain (Unlicense) reference photos + instructions from
// yuhonas/free-exercise-db for the app's exercises. Re-runnable / idempotent.
// Usage: node scripts/fetch-exercise-media.mjs
import { mkdir, writeFile, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REPO = "yuhonas/free-exercise-db";
// Pinned dataset commit; bump deliberately and re-review every image pair.
const SHA = "f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5";

/** appExerciseId -> dataset id, or null when no faithful match exists. */
export const SOURCES = {
  squat: "Barbell_Squat",
  bench: "Barbell_Bench_Press_-_Medium_Grip",
  deadlift: "Barbell_Deadlift",
  ohp: "Barbell_Shoulder_Press",
  lat_pulldown: "Wide-Grip_Lat_Pulldown",
  db_row: "One-Arm_Dumbbell_Row",
  // Kettlebell held at the chest by the horns: same hold/movement as a DB goblet squat.
  goblet_squat: "Goblet_Squat",
  // Rear foot on bench, dumbbells at sides.
  bulgarian_split_squat: "Split_Squat_with_Dumbbells",
  db_bench: "Dumbbell_Bench_Press",
  db_rdl: "Stiff-Legged_Dumbbell_Deadlift",
  db_shoulder_press: "Dumbbell_Shoulder_Press",
  db_lunge: "Dumbbell_Lunges",
  db_floor_press: "Dumbbell_Floor_Press",
  // null = no faithful match (reviewed by eye). Only a kettlebell, same-side hold variant exists.
  single_leg_db_rdl: null,
  db_arnold_press: "Arnold_Dumbbell_Press",
  face_pulls: "Face_Pull",
  lateral_raises: "Side_Lateral_Raise",
  bicep_curls: "Dumbbell_Bicep_Curl",
  tricep_pushdowns: "Triceps_Pushdown",
  oh_tricep_ext: "Standing_Dumbbell_Triceps_Extension",
  incline_db_fly: "Incline_Dumbbell_Flyes",
  leg_curls: "Lying_Leg_Curls",
  leg_extensions: "Leg_Extensions",
  calf_raises: "Standing_Dumbbell_Calf_Raise",
  ab_rollout: "Ab_Roller",
  back_extensions: "Hyperextensions_Back_Extensions",
  // null = only a barbell hip thrust exists; the app exercise is dumbbell.
  hip_thrust: null,
  hammer_curls: "Hammer_Curls",
  front_raises: "Front_Dumbbell_Raise",
  reverse_fly: "Reverse_Flyes",
  arnold_press: "Arnold_Dumbbell_Press",
  db_skull_crushers: "Lying_Dumbbell_Tricep_Extension",
  db_pullover: "Bent-Arm_Dumbbell_Pullover",
  seated_db_shoulder_press: "Seated_Dumbbell_Press",
  seated_lateral_raises: "Seated_Side_Lateral_Raise",
  incline_db_press: "Incline_Dumbbell_Press",
  // No pendulum squat or glute drive machine in the dataset (a hack squat
  // and a barbell hip thrust are different equipment).
  pendulum_squat: null,
  glute_drive: null,
};

const UA = { "User-Agent": "exercise-media-fetch" };

async function exists(p) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

async function getJson(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

async function main() {
  const sha = SHA;
  const raw = `https://raw.githubusercontent.com/${REPO}/${sha}`;
  const index = await getJson(`${raw}/dist/exercises.json`);
  const byId = new Map(index.map((e) => [e.id, e]));

  const out = {};
  for (const [appId, srcId] of Object.entries(SOURCES)) {
    if (!srcId) continue;
    const e = byId.get(srcId);
    if (!e || e.images.length < 2) throw new Error(`${appId}: bad source ${srcId}`);
    const dir = path.join(ROOT, "public/exercise-media", appId);
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < 2; i++) {
      const file = path.join(dir, `${i}.jpg`);
      if (await exists(file)) continue;
      const r = await fetch(`${raw}/exercises/${e.images[i]}`, { headers: UA });
      if (!r.ok) throw new Error(`${e.images[i]} -> ${r.status}`);
      await writeFile(file, Buffer.from(await r.arrayBuffer()));
    }
    out[appId] = {
      sourceId: e.id,
      sourceName: e.name,
      frames: [`/exercise-media/${appId}/0.jpg`, `/exercise-media/${appId}/1.jpg`],
      instructions: e.instructions.map((s) => s.trim()).filter(Boolean),
    };
  }

  await writeFile(
    path.join(ROOT, "src/lib/exerciseMedia.generated.json"),
    JSON.stringify(out, null, 2) + "\n",
  );

  let date = new Date().toISOString().slice(0, 10);
  const noticePath = path.join(ROOT, "public/exercise-media/NOTICE.md");
  try {
    const prev = await readFile(noticePath, "utf8");
    if (prev.includes(`Commit: ${sha}`)) date = prev.match(/Date fetched: (\S+)/)?.[1] ?? date;
  } catch {
    // first run
  }
  await mkdir(path.dirname(noticePath), { recursive: true });
  await writeFile(
    noticePath,
    `# Exercise media attribution

Photos and instructions in this directory come from the free-exercise-db dataset.

- Source: https://github.com/${REPO}
- Commit: ${sha}
- Licence: The Unlicense (public domain) - https://unlicense.org
- Date fetched: ${date}

Re-generate with \`node scripts/fetch-exercise-media.mjs\`.
`,
  );
  console.log(`pinned ${sha}; ${Object.keys(out).length} exercises`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
