// Contract: the next workout is resolved once (`resolveNextWorkout`), and every consumer
// given the same inputs gets a deeply equal plan: Today's rows (`useNextWorkout`'s
// call), the ledger and Today's forecast (`nextWorkoutFrom`), the coming workouts
// (`projectUpcomingWorkouts`), Configure with no change (`planWorkoutStart`) and the
// spelled-out `describeNextWorkout`. The accessories (A6) are the same for Today, the
// ledger and Configure; the coming workouts and the description plan the program alone.
// Made-up data only.
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { nextWorkoutFrom, readinessTodayFrom, strengthSetsFrom } from "@/lib/data/forecasts";
import { todayForecastFrom } from "@/hooks/useTodayForecast";
import { forecastSessionLength, sessionPaceCorrection } from "@/lib/forecast";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { describeNextWorkout } from "./buildPlan";
import { resolveNextWorkout } from "./nextWorkout";
import { dueTemplateId } from "./rotation";
import { planWorkoutStart } from "./startPlan";
import { planningCases } from "./testPlanningCases";
import { projectUpcomingWorkouts } from "./upcoming";

describe("resolveNextWorkout: one resolution for every consumer", () => {
  const cases = planningCases();

  it("gives every consumer the same plan for the same inputs, for every planning case", () => {
    for (const c of cases) {
      const { records, settings, location } = c;
      const completedWorkouts = records.workouts.filter((w) => w.completedAt != null);
      const strengthSets = strengthSetsFrom(records);
      const variantStates = records.variantStates ?? [];
      const now = records.readAt;
      const inputs = { completedWorkouts, liftStates: records.liftStates, variantStates, strengthSets, settings, location, now };

      const resolved = resolveNextWorkout(inputs);
      expect(resolved.templateId, c.name).toBe(dueTemplateId(completedWorkouts));
      expect(resolved.location, c.name).toBe(location);

      // The ledger, and with it Today's forecast tiles and readiness.
      const ledger = nextWorkoutFrom(records, location);
      expect(ledger, c.name).toEqual(resolved);

      // Configure with no change: the plan, the prescription and the set-plan edits.
      const configure = planWorkoutStart({
        template: WORKOUT_TEMPLATES[resolved.templateId],
        liftStates: records.liftStates,
        location,
        equipment: settings.equipment,
        includeWarmUps: settings.showWarmUps,
        selectedAccessories: [],
        variantStates,
        strengthSets,
        ...(settings.nextSetPlans ? { nextSetPlans: settings.nextSetPlans } : {}),
        // The Ready screen's source: the same day, and the pace of the same finished workouts.
        accessories: { settings, strengthSets, now, pace: sessionPaceCorrection(completedWorkouts, now, settings.trainingPhase) },
      });
      expect(configure.plan, c.name).toEqual(resolved.plan);
      expect(configure.prescribed, c.name).toEqual(resolved.prescribed);
      expect(configure.nextSetPlanEdits, c.name).toEqual(resolved.nextSetPlanEdits);
      expect(configure.accessoryEdits, c.name).toEqual(resolved.accessoryEdits);
      expect(resolved.accessoryEdits.length, c.name).toBeGreaterThan(0);
      // One session length: the budget the accessories were kept to measures the plan
      // as Today's length line does (the forecast, corrected by the lifter's pace).
      const shown = forecastSessionLength({ plan: resolved.plan, workouts: records.workouts, phase: settings.trainingPhase, now });
      expect(resolved.accessories?.budget?.plannedMinutes, c.name).toBe(Math.round(shown.seconds / 60));
      const program = resolved.plan.filter((e) => e.tier !== "accessory");

      // The spelled-out description.
      const described = describeNextWorkout({
        completedWorkouts,
        templates: WORKOUT_TEMPLATES,
        liftStates: records.liftStates,
        plan: {
          location,
          equipment: settings.equipment,
          includeWarmUps: settings.showWarmUps,
          selectedAccessories: [],
          variantStates,
          strengthSets,
          nextSetPlans: settings.nextSetPlans,
        },
        reentry: true,
      });
      expect(described.plan, c.name).toEqual(program);
      expect(described.liftStates, c.name).toEqual(resolved.liftStates);
      expect(described.variantStates, c.name).toEqual(resolved.variantStates);

      // The coming workouts start with it.
      const [first] = projectUpcomingWorkouts({
        completedWorkouts,
        templates: WORKOUT_TEMPLATES,
        liftStates: records.liftStates,
        location,
        equipment: settings.equipment,
        includeWarmUps: settings.showWarmUps,
        count: 1,
        settings,
        now: new Date(0),
        variantStates,
        strengthSets,
        reentry: true,
        nextSetPlans: settings.nextSetPlans,
      });
      expect(first.templateId, c.name).toBe(resolved.templateId);
      expect(first.plan, c.name).toEqual(program);
    }
  });

  it("keeps Coming up's accessories to the length its cards show, the same as Today's", () => {
    for (const c of cases.filter((x) => x.index % 4 === 3)) {
      const { records, settings, location } = c;
      const completedWorkouts = records.workouts.filter((w) => w.completedAt != null);
      const strengthSets = strengthSetsFrom(records);
      const now = records.readAt;
      const resolved = nextWorkoutFrom(records, location);
      const [first, second] = projectUpcomingWorkouts({
        completedWorkouts,
        templates: WORKOUT_TEMPLATES,
        liftStates: records.liftStates,
        location,
        equipment: settings.equipment,
        includeWarmUps: settings.showWarmUps,
        count: 2,
        settings,
        now: new Date(0),
        variantStates: records.variantStates ?? [],
        strengthSets,
        reentry: true,
        nextSetPlans: settings.nextSetPlans,
        accessoriesNow: now,
      });
      expect(first.accessories?.edits, c.name).toEqual(resolved.accessoryEdits);
      for (const card of [first, second]) {
        const shown = forecastSessionLength({ plan: card.plan, workouts: records.workouts, phase: settings.trainingPhase, now });
        expect(card.accessories?.budget?.plannedMinutes, c.name).toBe(Math.round(shown.seconds / 60));
      }
    }
  });

  it("works Today's forecast and readiness out from the plan it is given, the same as planning it again", () => {
    for (const c of cases.filter((x) => x.index % 6 === 5)) {
      const next = nextWorkoutFrom(c.records, c.location);
      expect(todayForecastFrom(c.records, c.location, next), c.name).toEqual(todayForecastFrom(c.records, c.location));
      const now = c.records.readAt;
      expect(readinessTodayFrom(c.records, { now, location: c.location, next }), c.name).toEqual(
        readinessTodayFrom(c.records, { now, location: c.location })
      );
    }
  });

  it("takes the saved default location, else the gym", () => {
    const c = cases[0];
    const base = {
      completedWorkouts: [],
      liftStates: c.records.liftStates,
      variantStates: [],
      strengthSets: [],
    };
    expect(resolveNextWorkout({ ...base, settings: { ...c.settings, defaultLocation: "home" } }).location).toBe("home");
    expect(resolveNextWorkout({ ...base, settings: { ...c.settings, defaultLocation: undefined } }).location).toBe("gym");
  });
});
