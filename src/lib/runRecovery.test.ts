import { describe, it, expect } from 'vitest';
import { evaluateRunImpact, workoutHasLowerBody } from './runRecovery';
import type { RunLog, TrainingPhase } from '@/types';

function makeRun(overrides: Partial<RunLog> = {}): RunLog {
  return {
    id: 'run-1',
    clientId: 'run-1',
    date: new Date(),
    durationMinutes: 30,
    distanceMiles: 3,
    type: 'outdoor',
    category: 'easy',
    notes: '',
    perceivedEffort: 3,
    synced: false,
    ...overrides,
  };
}

const defaultPhase: TrainingPhase = { mode: 'maintaining' };
const cuttingPhase: TrainingPhase = { mode: 'cutting', dailyDeficit: 500 };

function hoursAgo(hours: number, from: Date = new Date()): Date {
  return new Date(from.getTime() - hours * 60 * 60 * 1000);
}

describe('evaluateRunImpact', () => {
  it('returns advisory for run <24h before lower body day at effort >=3', () => {
    const now = new Date();
    const run = makeRun({
      date: hoursAgo(18, now),
      category: 'tempo',
      perceivedEffort: 3,
    });

    const result = evaluateRunImpact([run], true, now, defaultPhase);
    expect(result.level).toBe('advisory');
    expect(result.suggestedAction).toBe('extra_warmups');
  });

  it('returns no advisory for run >24h ago', () => {
    const now = new Date();
    const run = makeRun({
      date: hoursAgo(25, now),
      perceivedEffort: 4,
    });

    const result = evaluateRunImpact([run], true, now, defaultPhase);
    expect(result.level).toBe('none');
  });

  it('treats intervals run at effort 2 as high-interference (lower threshold)', () => {
    const now = new Date();
    const run = makeRun({
      date: hoursAgo(18, now),
      category: 'intervals',
      perceivedEffort: 2,
    });

    const result = evaluateRunImpact([run], true, now, defaultPhase);
    expect(result.level).toBe('advisory');
    expect(result.message).toContain('intervals');
  });

  it('returns no advisory for easy run at effort 3 (threshold is 4 for easy)', () => {
    const now = new Date();
    const run = makeRun({
      date: hoursAgo(18, now),
      category: 'easy',
      perceivedEffort: 3,
    });

    const result = evaluateRunImpact([run], true, now, defaultPhase);
    expect(result.level).toBe('none');
  });

  it('includes glycogen depletion note for long run >=45min while cutting', () => {
    const now = new Date();
    const run = makeRun({
      date: hoursAgo(6, now),
      category: 'long',
      durationMinutes: 50,
      perceivedEffort: 4,
    });

    const result = evaluateRunImpact([run], true, now, cuttingPhase);
    expect(result.level).toBe('strong_rest');
    expect(result.message).toContain('glycogen');
  });

  it('returns strong_rest advisory for run <12h ago with effort >=4', () => {
    const now = new Date();
    const run = makeRun({
      date: hoursAgo(8, now),
      perceivedEffort: 4,
    });

    const result = evaluateRunImpact([run], true, now, defaultPhase);
    expect(result.level).toBe('strong_rest');
    expect(result.suggestedAction).toBe('rest');
  });

  it('returns no advisory for run <24h before UPPER body day', () => {
    const now = new Date();
    const run = makeRun({
      date: hoursAgo(6, now),
      perceivedEffort: 5,
    });

    const result = evaluateRunImpact([run], false, now, defaultPhase);
    expect(result.level).toBe('none');
  });

  it('returns no advisory when there are no runs', () => {
    const now = new Date();
    const result = evaluateRunImpact([], true, now, defaultPhase);
    expect(result.level).toBe('none');
  });
});

describe('workoutHasLowerBody', () => {
  it('returns true for A1 (squat T1)', () => {
    expect(workoutHasLowerBody('A1')).toBe(true);
  });

  it('returns true for B2 (deadlift T1)', () => {
    expect(workoutHasLowerBody('B2')).toBe(true);
  });

  it('returns false for A2 (bench T1)', () => {
    expect(workoutHasLowerBody('A2')).toBe(false);
  });

  it('returns false for B1 (OHP T1)', () => {
    expect(workoutHasLowerBody('B1')).toBe(false);
  });

  it('returns false for unknown template', () => {
    expect(workoutHasLowerBody('UNKNOWN')).toBe(false);
  });
});
