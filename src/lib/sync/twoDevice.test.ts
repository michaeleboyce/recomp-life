// Requirement E10: sync carries edits and deletes between devices, last write wins.
// Two fake-indexeddb databases talk to one in-memory server through the real client.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Dexie from "dexie";
import { startAdjustments } from "@/db/seed";
import { makeProfile, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { applyChange, rebuildDerived, tierPrescription } from "@/lib/rebuild";
import { fullSync, pullFromServer, pushUnsynced } from "@/lib/sync";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftAdjustment, WorkoutSession } from "@/types";
import { PROFILE_ID } from "./registry";
import { FakeSyncServer, TEST_PASSPHRASE, makeDeviceDb } from "./testFakes";

const derived = vi.hoisted(() => ({ applyRebuild: vi.fn() }));
vi.mock("@/lib/data/derived", () => ({ applyRebuild: derived.applyRebuild }));

let server: FakeSyncServer;
let A: Dexie;
let B: Dexie;
const opened: Dexie[] = [];
let run = 0;

async function device(label: string): Promise<Dexie> {
  const database = makeDeviceDb(`two-device-${++run}-${label}`);
  await database.open();
  opened.push(database);
  return database;
}

const nameOf = (database: Dexie) => (database === A ? "A" : database === B ? "B" : "other");
const sync = (database: Dexie) => server.as(nameOf(database), () => fullSync(database));
const push = (database: Dexie) => server.as(nameOf(database), () => pushUnsynced(database));
const pull = (database: Dexie) => server.as(nameOf(database), () => pullFromServer(database));

/** A local edit the way the data layer writes one: new stamp, dirty. */
async function edit(database: Dexie, table: string, id: string, changes: Record<string, unknown>, at: number) {
  await database.table(table).update(id, { ...changes, updatedAt: at, synced: false });
}

const runRow = (id: string, notes: string, updatedAt: number) => ({
  id,
  clientId: `c-${id}`,
  date: new Date("2026-11-10T07:00:00Z"),
  durationMinutes: 30,
  distanceMiles: 3,
  type: "outdoor",
  category: "easy",
  notes,
  perceivedEffort: 3,
  deletedAt: null,
  updatedAt,
  synced: false,
});

const byClientId = async (database: Dexie, table: string, clientId: string) =>
  database.table(table).where("clientId").equals(clientId).first();

beforeEach(async () => {
  derived.applyRebuild.mockReset().mockResolvedValue({});
  localStorage.setItem("recomp-sync-key", TEST_PASSPHRASE);
  server = new FakeSyncServer();
  vi.stubGlobal("fetch", server.fetch);
  A = await device("A");
  B = await device("B");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const database of opened.splice(0)) {
    database.close();
    await database.delete();
  }
});

describe("two devices, one server", () => {
  it("an edit on A reaches B, and B rebuilds after a workout changed", async () => {
    await A.table("runs").add(runRow("r1", "easy", 100));
    await A.table("workouts").add(makeWorkout({ id: "w1", clientId: "c-w1", updatedAt: 100 }));
    await sync(A);
    await sync(B);
    expect((await byClientId(B, "runs", "c-r1")).notes).toBe("easy");
    derived.applyRebuild.mockClear();

    await edit(A, "runs", "r1", { notes: "felt great" }, 200);
    await edit(A, "workouts", "w1", { templateId: "B1" }, 200);
    await sync(A);
    const result = await pull(B);

    expect(result.overwritten).toBe(2);
    expect(await byClientId(B, "runs", "c-r1")).toMatchObject({ notes: "felt great", updatedAt: 200, synced: true });
    expect((await byClientId(B, "workouts", "c-w1")).templateId).toBe("B1");
    expect(derived.applyRebuild).toHaveBeenCalledTimes(1);
  });

  it("a run soft-deleted on A is soft-deleted on B", async () => {
    await A.table("runs").add(runRow("r1", "easy", 100));
    await sync(A);
    await sync(B);

    await edit(A, "runs", "r1", { deletedAt: 300 }, 300);
    await sync(A);
    await pull(B);

    const onB = await byClientId(B, "runs", "c-r1");
    expect(onB.deletedAt).toBe(300);
    expect(await B.table("runs").filter((r) => r.deletedAt == null).count()).toBe(0);
  });

  it.each([
    ["A first", ["A", "B"]],
    ["B first", ["B", "A"]],
  ])("offline edits to the same row resolve to the later stamp (%s)", async (_label, order) => {
    await A.table("runs").add(runRow("r1", "original", 100));
    await sync(A);
    await sync(B);

    await edit(A, "runs", "r1", { notes: "A's edit" }, 200);
    await edit(B, "runs", "r1", { notes: "B's edit" }, 250);
    const devices = order.map((label) => (label === "A" ? A : B));
    await sync(devices[0]);
    await sync(devices[1]);
    await sync(devices[0]);

    for (const database of [A, B]) {
      expect(await byClientId(database, "runs", "c-r1"), nameOf(database)).toMatchObject({
        notes: "B's edit",
        updatedAt: 250,
      });
    }
    expect(server.rows("runs")).toHaveLength(1);
    expect(server.rows("runs")[0]).toMatchObject({ notes: "B's edit", updatedAt: 250 });
  });

  it("an edit made on A while its push is in flight stays dirty and goes out next push", async () => {
    await A.table("runs").add(runRow("r1", "first", 100));
    server.onPush = async (speaker, request) => {
      if (speaker === "A" && request.table === "runs") {
        server.onPush = undefined;
        await edit(A, "runs", "r1", { notes: "second" }, 101);
      }
    };

    await push(A);

    expect(server.rows("runs")[0].notes).toBe("first");
    expect(await A.table("runs").get("r1")).toMatchObject({ notes: "second", synced: false });

    const again = await push(A);

    expect(again).toMatchObject({ pushed: 1, applied: 1 });
    expect(server.rows("runs")[0]).toMatchObject({ notes: "second", updatedAt: 101 });
    expect((await A.table("runs").get("r1")).synced).toBe(true);
    await pull(B);
    expect((await byClientId(B, "runs", "c-r1")).notes).toBe("second");
  });

  it("a brand-new device pulls everything, the profile included, and holds one profile", async () => {
    await A.table("userProfile").add({ ...makeProfile(), id: "seeded-a", clientId: "seeded-a", name: "A", updatedAt: 100, synced: false });
    await B.table("userProfile").add({ ...makeProfile(), id: "seeded-b", clientId: "seeded-b", name: "B", updatedAt: 200, synced: false });
    await A.table("runs").add(runRow("r1", "easy", 100));
    await A.table("runs").add({ ...runRow("r2", "deleted", 100), deletedAt: 150, updatedAt: 150 });
    await B.table("workouts").add(makeWorkout({ id: "w1", clientId: "c-w1", updatedAt: 100 }));
    await sync(A);
    await sync(B);
    await sync(A);

    expect(server.rows("userProfile")).toHaveLength(1);

    const C = await device("C");
    const result = await server.as("C", () => fullSync(C));

    expect(result.errors).toEqual([]);
    expect(await C.table("runs").count()).toBe(2);
    expect((await C.table("runs").get("r2")).deletedAt).toBe(150);
    expect(await C.table("workouts").count()).toBe(1);
    const profiles = await C.table("userProfile").toArray();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id: PROFILE_ID, clientId: PROFILE_ID, name: "B" });
    expect(profiles[0].createdAt).toBeInstanceOf(Date);
    for (const database of [A, B]) {
      const own = await database.table("userProfile").toArray();
      expect(own, nameOf(database)).toHaveLength(1);
      expect(own[0].name).toBe("B");
    }
    expect(server.requests.some((r) => r.device === "C" && r.path === "/api/sync/pull")).toBe(true);
  });
});

// The data layer (`applyRebuild`, `commitLogChange`) only works on the app's singleton
// database, so it cannot run against two device databases in one test; it is mocked
// above. These scenarios run the REAL rebuild engine over each device's own log rows
// instead: what `applyRebuild` would compute on that device.
describe("two devices, one server: each device rebuilds the same derived data", () => {
  const settings = makeProfile().settings;

  /** The engine's result over the log rows this device holds. */
  async function rebuildOn(database: Dexie) {
    const result = rebuildDerived({
      workouts: (await database.table("workouts").toArray()) as WorkoutSession[],
      adjustments: (await database.table("liftAdjustments").toArray()) as LiftAdjustment[],
      settings,
    });
    return { liftStates: result.liftStates, e1rms: result.e1rms };
  }

  /** What the next session prescribes for a lift's T1, from rebuilt lift states. */
  function nextT1(rebuilt: Awaited<ReturnType<typeof rebuildOn>>, exerciseId: string) {
    const slot = Object.values(WORKOUT_TEMPLATES)
      .flatMap((template) => template.exercises)
      .find((ex) => ex.exerciseId === exerciseId && ex.tier === "T1")!;
    return tierPrescription(slot, rebuilt.liftStates.find((s) => s.exerciseId === exerciseId));
  }

  /** A finished A1 session: five squat sets at 190, the AMRAP for `amrapReps`. */
  function squatDay(id: string, day: string, amrapReps: number): WorkoutSession {
    const at = (minute: number) => new Date(`${day}T09:${String(minute).padStart(2, "0")}:00Z`);
    return makeWorkout({
      id,
      clientId: `c-${id}`,
      templateId: "A1",
      includeWarmUps: false,
      startedAt: at(0),
      completedAt: at(30),
      totalDurationSeconds: 1800,
      prescribed: [
        { exerciseId: "squat", tier: "T1", weight: 190, sets: 5, reps: 3, stage: "5x3" },
        { exerciseId: "bench", tier: "T2", weight: 100, sets: 3, reps: 10, stage: "3x10" },
        { exerciseId: "lat_pulldown", tier: "T3", weight: 90, sets: 3, reps: 15 },
      ],
      completionContext: {
        phaseMode: settings.trainingPhase.mode,
        gymBarbellIncrementLbs: settings.equipment.gymBarbellIncrementLbs,
        dumbbellIncrementLbs: settings.equipment.dumbbellIncrementLbs,
      },
      sets: [1, 2, 3, 4, 5].map((n) =>
        makeSet({
          id: `${id}-s${n}`,
          clientId: `${id}-s${n}`,
          setNumber: n,
          isAMRAP: n === 5,
          actualReps: n === 5 ? amrapReps : 3,
          completedAt: at(n * 4),
        })
      ),
      updatedAt: 100,
      deletedAt: null,
    });
  }

  /** Applies a log change on a device the way `commitLogChange` writes it. */
  async function change(database: Dexie, at: number, logChange: Parameters<typeof applyChange>[1]) {
    const workouts = (await database.table("workouts").toArray()) as WorkoutSession[];
    const next = applyChange({ workouts, adjustments: [] }, logChange, at);
    const before = new Map(workouts.map((w) => [w.id, w]));
    await database.table("workouts").bulkPut(next.workouts.filter((w) => before.get(w.id) !== w));
  }

  async function seedAndShare() {
    await A.table("liftAdjustments").bulkAdd(startAdjustments());
    await A.table("workouts").add(squatDay("w1", "2026-11-09", 5));
    await sync(A);
    await sync(B);
  }

  it("B rebuilds the same lift states and e1RM rows as A from the pulled log", async () => {
    await seedAndShare();

    const onA = await rebuildOn(A);
    const onB = await rebuildOn(B);
    expect(onB.liftStates).toEqual(onA.liftStates);
    expect(onB.e1rms).toEqual(onA.e1rms);
    // The session passed: 190 x 5 on the AMRAP moves squat up.
    expect(nextT1(onA, "squat")).toEqual({ weight: 200, stage: "5x3", sets: 5, reps: 3 });
    expect(onA.e1rms.map((row) => [row.exerciseId, row.estimated1RM])).toEqual([["squat", 222]]);
  });

  it("after A edits the latest AMRAP set, B's next prescription equals A's", async () => {
    await seedAndShare();
    const before = await rebuildOn(B);

    // A corrects the AMRAP from 5 reps to 1: the session is now a miss.
    await change(A, 200, { kind: "editSet", workoutId: "w1", setId: "w1-s5", patch: { actualReps: 1 } });
    await sync(A);
    derived.applyRebuild.mockClear();
    const result = await pull(B);
    expect(result.overwritten).toBe(1);
    // The client asks for a rebuild exactly when a workout changed.
    expect(derived.applyRebuild).toHaveBeenCalledTimes(1);

    const onA = await rebuildOn(A);
    const onB = await rebuildOn(B);
    expect(onB.liftStates).toEqual(onA.liftStates);
    expect(onB.e1rms).toEqual(onA.e1rms);
    expect(nextT1(onB, "squat")).toEqual(nextT1(onA, "squat"));
    expect(nextT1(onB, "squat")).toEqual({ weight: 190, stage: "6x2", sets: 6, reps: 2 });
    expect(nextT1(onB, "squat")).not.toEqual(nextT1(before, "squat"));
    // One rep is not an estimate: the e1RM row is gone on both.
    expect(onB.e1rms).toEqual([]);
  });

  it("a workout deleted on A, and an adjustment made on B, rebuild the same on both", async () => {
    await seedAndShare();

    await change(A, 300, { kind: "deleteWorkout", workoutId: "w1" });
    const adjustment: LiftAdjustment = {
      id: "adj-b",
      clientId: "adj-b",
      exerciseId: "bench",
      at: new Date("2026-11-11T08:00:00Z"),
      source: "manual",
      set: { t2Weight: 110, t2Stage: "3x8" },
      updatedAt: 310,
      deletedAt: null,
      synced: false,
    };
    await B.table("liftAdjustments").add(adjustment);
    await sync(A);
    await sync(B);
    await sync(A);

    const onA = await rebuildOn(A);
    const onB = await rebuildOn(B);
    expect(onB.liftStates).toEqual(onA.liftStates);
    expect(onB.e1rms).toEqual(onA.e1rms);
    // The deleted session no longer counts; the adjustment does.
    expect(nextT1(onA, "squat")).toEqual({ weight: 190, stage: "5x3", sets: 5, reps: 3 });
    expect(onA.liftStates.find((s) => s.exerciseId === "bench")).toMatchObject({
      t2Weight: 110,
      t2Stage: "3x8",
    });
    expect(onA.e1rms).toEqual([]);
  });
});
