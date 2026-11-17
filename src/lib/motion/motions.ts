import type { Motion } from "./archetypes";
import {
  backExtension, benchDip, bentRow, cableRow, calfRaise, curl, facePull, hinge, hipThrust, kickback,
  legMachine, legPress, machineFly, overhead, pendulumSquat, pulldown, pushUp, raise, rollout, row, situp,
  split, squat, supine, triceps,
} from "./archetypes";
import type { MotionInfo } from "./sample";

export interface MotionSpec {
  info: Omit<MotionInfo, "exerciseId">;
  /**
   * true: the rep starts with the lowering phase (squat, bench), so the first half is the slow one.
   * false: the rep starts with the lift (deadlift, curl), so the return half is the slow one.
   */
  eccentricFirst: boolean;
  motion: Motion;
}

/** Same movement run the other way: starts at the original end pose. */
const reversed = (m: Motion): Motion => ({ ...m, frame: (s) => m.frame(1 - s) });

const arnold: MotionSpec = {
  info: {
    repSeconds: 3.6,
    view: "threeQuarter",
    trace: "handL",
    caption: "Start with the dumbbells in front of the chest, rotate the elbows out as you press overhead, reverse on the way down.",
  },
  eccentricFirst: false,
  motion: overhead({ mode: "arnold" }),
};

/** One entry per key of EXERCISES. */
export const MOTIONS: Record<string, MotionSpec> = {
  squat: {
    info: { repSeconds: 4, view: "side", trace: "barCenter", caption: "Sit back and down until the hips reach knee level, then drive up with the bar over mid-foot." },
    eccentricFirst: true,
    motion: squat({ load: "back", bottomY: 0.5, pitchTop: 5, pitchBottom: 42 }),
  },
  goblet_squat: {
    info: { repSeconds: 4, view: "threeQuarter", caption: "Hold the dumbbell at the chest, squat between the knees with an upright torso, stand back up." },
    eccentricFirst: true,
    motion: squat({ load: "goblet", bottomY: 0.47, pitchTop: 2, pitchBottom: 26 }),
  },
  bench: {
    info: { repSeconds: 3.6, view: "side", trace: "barCenter", caption: "Lower the bar to the lower chest with forearms vertical, pause, press back over the shoulders." },
    eccentricFirst: true,
    motion: supine({ surface: "bench", mode: "press", implement: "barbell" }),
  },
  db_bench: {
    info: { repSeconds: 3.6, view: "threeQuarter", trace: "handL", caption: "Lower the dumbbells beside the chest, then press up and slightly together." },
    eccentricFirst: true,
    motion: supine({ surface: "bench", mode: "press", implement: "dumbbells" }),
  },
  db_floor_press: {
    info: { repSeconds: 3.4, view: "threeQuarter", trace: "handL", caption: "Lying on the floor, lower until the upper arms touch down, pause, press back up." },
    eccentricFirst: true,
    motion: supine({ surface: "floor", mode: "press", implement: "dumbbells" }),
  },
  incline_db_fly: {
    info: { repSeconds: 4, view: "front", trace: "handL", caption: "On an incline bench, open the arms wide in an arc with a soft elbow bend, then squeeze back together." },
    eccentricFirst: true,
    motion: supine({ surface: "incline", mode: "fly", implement: "dumbbells" }),
  },
  db_skull_crushers: {
    info: { repSeconds: 3.6, view: "side", trace: "handL", caption: "Upper arms stay still; bend the elbows to lower the dumbbells beside the head, then extend." },
    eccentricFirst: true,
    motion: supine({ surface: "bench", mode: "skull", implement: "dumbbells" }),
  },
  db_pullover: {
    info: { repSeconds: 4.2, view: "side", trace: "handL", caption: "Lying on the bench, lower one dumbbell in an arc behind the head with soft elbows, then pull it back over the chest." },
    eccentricFirst: true,
    motion: supine({ surface: "bench", mode: "pullover", implement: "dumbbells" }),
  },
  incline_db_press: {
    info: { repSeconds: 3.6, view: "threeQuarter", trace: "handL", caption: "On an incline bench, press the dumbbells from beside the upper chest to straight arms over the shoulders, lower under control." },
    eccentricFirst: false,
    motion: reversed(supine({ surface: "incline", mode: "press", implement: "dumbbells" })),
  },
  seated_db_shoulder_press: {
    info: { repSeconds: 3.4, view: "front", trace: "handL", caption: "Seated against the backrest, press the dumbbells from shoulder height to overhead, then lower with forearms vertical." },
    eccentricFirst: false,
    motion: overhead({ mode: "dumbbell", seated: true }),
  },
  seated_lateral_raises: {
    info: { repSeconds: 3.2, view: "front", trace: "handL", caption: "Seated upright, raise the dumbbells out to the sides to shoulder height with a soft elbow, lower slowly." },
    eccentricFirst: false,
    motion: raise({ direction: "lateral", seated: true }),
  },
  deadlift: {
    info: { repSeconds: 4, view: "side", trace: "barCenter", caption: "Push the floor away and stand tall with the bar close to the legs, then hinge back down under control." },
    eccentricFirst: false,
    motion: hinge({ implement: "barbell", y: [0.225, 0.83], pitch: [62, 0], z: [0.03, 0.09], fwd: [0.08, -0.1], gripX: 0.25, stanceX: 0.13, pitchEase: 2.2 }),
  },
  db_rdl: {
    info: { repSeconds: 4.2, view: "side", trace: "handL", caption: "Push the hips back with soft knees until the dumbbells pass the knees, then drive the hips forward." },
    eccentricFirst: true,
    motion: hinge({ implement: "dumbbells", y: [0.83, 0.42], pitch: [3, 66], z: [0.09, 0.07], fwd: [-0.1, 0.03], gripX: 0.2, stanceX: 0.13 }),
  },
  single_leg_db_rdl: {
    info: { repSeconds: 4.6, view: "side", trace: "handL", caption: "Balance on one leg, hinge forward as the free leg rises behind in line with the torso, return to standing." },
    eccentricFirst: true,
    motion: hinge({ implement: "dumbbells", y: [0.83, 0.32], pitch: [3, 78], z: [0.09, 0.14], fwd: [-0.1, 0.05], gripX: 0.2, stanceX: 0.1, singleLeg: true }),
  },
  ohp: {
    info: { repSeconds: 3.6, view: "side", trace: "barCenter", caption: "Press the bar from the shoulders past the face to lockout over mid-foot, lower under control." },
    eccentricFirst: false,
    motion: overhead({ mode: "barbell" }),
  },
  db_shoulder_press: {
    info: { repSeconds: 3.4, view: "front", trace: "handL", caption: "Press the dumbbells from ear height to overhead, bringing them slightly together, then lower." },
    eccentricFirst: false,
    motion: overhead({ mode: "dumbbell" }),
  },
  db_arnold_press: arnold,
  arnold_press: arnold,
  lat_pulldown: {
    info: { repSeconds: 3.8, view: "front", trace: "barCenter", caption: "Pull the bar to the upper chest, driving the elbows down and back, then let the arms extend fully." },
    eccentricFirst: false,
    motion: pulldown(),
  },
  db_row: {
    info: { repSeconds: 3.2, view: "side", trace: "handR", caption: "One hand and knee on the bench, pull the dumbbell to the hip with the elbow close, lower to a full stretch." },
    eccentricFirst: false,
    motion: row(),
  },
  bulgarian_split_squat: {
    info: { repSeconds: 4, view: "side", caption: "Rear foot on the bench, drop straight down until the front thigh is level, drive up through the front foot." },
    eccentricFirst: true,
    motion: split({ rear: "box" }),
  },
  db_lunge: {
    info: { repSeconds: 4.4, view: "side", caption: "Step back into a lunge until both knees are bent to about 90 degrees, then push through the front foot to stand." },
    eccentricFirst: true,
    motion: split({ rear: "step" }),
  },
  face_pulls: {
    info: { repSeconds: 3.2, view: "threeQuarter", trace: "handL", caption: "Pull the rope toward the face, elbows high and wide, then reach forward again." },
    eccentricFirst: false,
    motion: facePull(),
  },
  lateral_raises: {
    info: { repSeconds: 3.2, view: "front", trace: "handL", caption: "Raise the dumbbells out to the sides to shoulder height with a soft elbow, lower slowly." },
    eccentricFirst: false,
    motion: raise({ direction: "lateral" }),
  },
  front_raises: {
    info: { repSeconds: 3.2, view: "side", trace: "handL", caption: "Raise the dumbbells straight in front to shoulder height, lower slowly." },
    eccentricFirst: false,
    motion: raise({ direction: "front" }),
  },
  reverse_fly: {
    info: { repSeconds: 3.2, view: "threeQuarter", trace: "handL", caption: "Hinged forward with a flat back, open the arms out to the sides, squeezing the shoulder blades, then lower." },
    eccentricFirst: false,
    motion: raise({ direction: "reverse" }),
  },
  bicep_curls: {
    info: { repSeconds: 3, view: "side", trace: "handL", caption: "Elbows stay at the sides; curl the dumbbells to the shoulders, lower slowly." },
    eccentricFirst: false,
    motion: curl({ grip: "supinated" }),
  },
  hammer_curls: {
    info: { repSeconds: 3, view: "threeQuarter", trace: "handL", caption: "Palms facing each other, curl the dumbbells to the shoulders with the elbows pinned, lower slowly." },
    eccentricFirst: false,
    motion: curl({ grip: "hammer" }),
  },
  tricep_pushdowns: {
    info: { repSeconds: 3, view: "side", trace: "handL", caption: "Elbows pinned at the sides; press the bar down until the arms are straight, return to chest height." },
    eccentricFirst: false,
    motion: triceps({ mode: "pushdown" }),
  },
  oh_tricep_ext: {
    info: { repSeconds: 3.4, view: "side", trace: "handL", caption: "Elbows point up; extend the dumbbell from behind the head to overhead, then lower it behind the head again." },
    eccentricFirst: false,
    motion: triceps({ mode: "overhead" }),
  },
  leg_curls: {
    info: { repSeconds: 3.2, view: "side", caption: "Lying face down, curl the heels toward the glutes against the pad, lower slowly." },
    eccentricFirst: false,
    motion: legMachine({ mode: "curl" }),
  },
  leg_extensions: {
    info: { repSeconds: 3.2, view: "side", caption: "Seated, straighten the knees until the legs are level, pause, lower slowly." },
    eccentricFirst: false,
    motion: legMachine({ mode: "extension" }),
  },
  calf_raises: {
    info: { repSeconds: 2.6, view: "side", caption: "Rise onto the balls of the feet as high as possible, pause, lower the heels slowly." },
    eccentricFirst: false,
    motion: calfRaise(),
  },
  ab_rollout: {
    info: { repSeconds: 4.6, view: "side", trace: "handL", caption: "From the knees, roll the wheel forward until the body is nearly straight, then pull back with the abs." },
    eccentricFirst: true,
    motion: rollout(),
  },
  back_extensions: {
    info: { repSeconds: 3.6, view: "side", caption: "Hips on the pad, fold forward at the hips, then raise the torso until the body is in a straight line." },
    eccentricFirst: true,
    motion: backExtension(),
  },
  hip_thrust: {
    info: { repSeconds: 3.2, view: "side", caption: "Upper back on the bench, drive the hips up until the torso is level with the knees, pause, lower." },
    eccentricFirst: false,
    motion: hipThrust(),
  },
  glute_drive: {
    info: { repSeconds: 3.4, view: "side", caption: "Back against the pivoting pad, drive the hips up under the belt until thighs and torso are in line, pause, lower." },
    eccentricFirst: false,
    motion: hipThrust({ machine: true }),
  },
  pendulum_squat: {
    info: { repSeconds: 4.2, view: "side", trace: "handL", caption: "Back on the pad, sink deep as the pad swings down and back and the knees travel forward, then drive up." },
    eccentricFirst: true,
    motion: pendulumSquat(),
  },

  // ─── Added for imported history ────────────────────────────────────────────
  db_fly: {
    info: { repSeconds: 4, view: "front", trace: "handL", caption: "On a flat bench, open the arms wide in an arc with a soft elbow bend, then squeeze back together over the chest." },
    eccentricFirst: true,
    motion: supine({ surface: "bench", mode: "fly", implement: "dumbbells" }),
  },
  db_bent_over_row: {
    info: { repSeconds: 3.2, view: "side", trace: "handL", caption: "Hinged forward with a flat back, pull both dumbbells to the hips with the elbows close, lower to a full stretch." },
    eccentricFirst: false,
    motion: bentRow({ support: "none" }),
  },
  incline_db_row: {
    info: { repSeconds: 3.2, view: "side", trace: "handL", caption: "Chest on an incline bench, pull both dumbbells up beside the ribs, squeeze the shoulder blades, lower slowly." },
    eccentricFirst: false,
    motion: bentRow({ support: "incline" }),
  },
  cable_row: {
    info: { repSeconds: 3.4, view: "side", trace: "handL", caption: "Seated with the feet on the plate, pull the handle to the waist while sitting tall, then reach forward again." },
    eccentricFirst: false,
    motion: cableRow(),
  },
  db_squat: {
    info: { repSeconds: 4, view: "threeQuarter", caption: "A dumbbell in each hand at the sides, squat until the hips reach knee level, then stand back up." },
    eccentricFirst: true,
    motion: squat({ load: "dumbbells", bottomY: 0.5, pitchTop: 3, pitchBottom: 30 }),
  },
  leg_press: {
    info: { repSeconds: 4, view: "side", caption: "Back flat on the pad, lower the sled until the knees come toward the chest, then press it back up without locking out." },
    eccentricFirst: true,
    motion: legPress(),
  },
  lunge: {
    info: { repSeconds: 4.2, view: "side", caption: "Hands on the hips, step back into a lunge until both knees bend to about 90 degrees, push through the front foot to stand." },
    eccentricFirst: true,
    motion: split({ rear: "step", bodyweight: true }),
  },
  barbell_curl: {
    info: { repSeconds: 3, view: "side", trace: "barCenter", caption: "Elbows stay at the sides; curl the bar to the shoulders, lower slowly." },
    eccentricFirst: false,
    motion: curl({ grip: "supinated", implement: "barbell" }),
  },
  push_up: {
    info: { repSeconds: 3, view: "side", caption: "Body in a straight line from head to heels, lower the chest toward the floor, then push back up." },
    eccentricFirst: true,
    motion: pushUp(),
  },
  bench_dip: {
    info: { repSeconds: 3.2, view: "side", caption: "Hands on the bench edge behind, bend the elbows to lower the hips, then press back up until the arms are straight." },
    eccentricFirst: true,
    motion: benchDip(),
  },
  sit_up: {
    info: { repSeconds: 3.4, view: "side", caption: "Lying with the knees bent, curl the torso all the way up toward the knees, then lower back down under control." },
    eccentricFirst: false,
    motion: situp({ mode: "situp" }),
  },
  crunch: {
    info: { repSeconds: 2.8, view: "side", caption: "Lying with the knees bent, curl the shoulders off the floor by tightening the abs, then lower slowly." },
    eccentricFirst: false,
    motion: situp({ mode: "crunch" }),
  },

  // ─── Accessory library additions ───────────────────────────────────────────
  hack_squat: {
    info: { repSeconds: 4.2, view: "side", trace: "handL", caption: "Shoulders under the pads and back on the sled, sink until the thighs pass parallel, then drive up through the whole foot." },
    eccentricFirst: true,
    motion: pendulumSquat(),
  },
  glute_kickback_machine: {
    info: { repSeconds: 3, view: "side", caption: "Chest on the pad, drive one leg back against the pad until the hip is fully extended, squeeze, return under control." },
    eccentricFirst: false,
    motion: kickback(),
  },
  barbell_incline_bench: {
    info: { repSeconds: 3.6, view: "side", trace: "barCenter", caption: "On an incline bench, lower the bar to the upper chest with forearms vertical, then press back over the shoulders." },
    eccentricFirst: true,
    motion: supine({ surface: "incline", mode: "press", implement: "barbell" }),
  },
  barbell_rdl: {
    info: { repSeconds: 4.2, view: "side", trace: "barCenter", caption: "Push the hips back with soft knees, sliding the bar down the thighs to below the knees, then drive the hips forward." },
    eccentricFirst: true,
    motion: hinge({ implement: "barbell", y: [0.83, 0.42], pitch: [3, 66], z: [0.09, 0.07], fwd: [-0.1, 0.03], gripX: 0.25, stanceX: 0.13 }),
  },
  machine_chest_fly: {
    info: { repSeconds: 3.6, view: "front", trace: "handL", caption: "Seated with the back on the pad, bring the handles together in front of the chest in a wide arc, then open slowly." },
    eccentricFirst: false,
    motion: machineFly(),
  },
  machine_row: {
    info: { repSeconds: 3.4, view: "side", trace: "handL", caption: "Seated, pull the handles toward the waist, squeezing the shoulder blades together, then reach forward again." },
    eccentricFirst: false,
    motion: cableRow(),
  },
  incline_db_curl: {
    info: { repSeconds: 3.2, view: "side", trace: "handL", caption: "Lying back on an incline bench with the arms hanging, curl the dumbbells to the shoulders without moving the elbows, lower slowly." },
    eccentricFirst: false,
    motion: curl({ grip: "supinated", incline: true }),
  },
  incline_hammer_curl: {
    info: { repSeconds: 3.2, view: "side", trace: "handL", caption: "Lying back on an incline bench, palms facing each other, curl the dumbbells up with the elbows still, lower slowly." },
    eccentricFirst: false,
    motion: curl({ grip: "hammer", incline: true }),
  },
};
