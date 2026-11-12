import { describe, it, expect } from 'vitest';
import {
  ACTIVITY_HARD_EFFORT,
  ACTIVITY_KINDS,
  ACTIVITY_KIND_LABELS,
  ACTIVITY_NOTE_WINDOW_HOURS,
  describeActivity,
  evaluateActivityImpact,
  summariseOtherSessions,
} from './activities';
import type { ActivityLog } from '@/types';

const now = new Date('2026-11-11T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

function makeActivity(overrides: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: 'a-1',
    clientId: 'a-1',
    date: hoursAgo(14),
    kind: 'yoga',
    durationMinutes: 45,
    style: 'power',
    distanceMiles: null,
    notes: '',
    perceivedEffort: 4,
    synced: false,
    ...overrides,
  };
}

describe('evaluateActivityImpact', () => {
  it('notes a hard yoga session in the window before any workout', () => {
    for (const hasLower of [true, false]) {
      const note = evaluateActivityImpact([makeActivity()], hasLower, now);
      expect(note?.evidenceId).toBe('activity-fatigue');
      expect(note?.message).toBe(
        "Hard yoga session 14h ago. See how your warm-ups feel before deciding on today's weights."
      );
    }
  });

  it('ignores sessions below the hard-effort threshold, whatever the style', () => {
    const easy = makeActivity({
      perceivedEffort: (ACTIVITY_HARD_EFFORT - 1) as ActivityLog['perceivedEffort'],
    });
    expect(evaluateActivityImpact([easy], true, now)).toBeNull();
  });

  it('counts a restorative session if it was rated hard: effort decides, not the label', () => {
    const note = evaluateActivityImpact([makeActivity({ style: 'restorative' })], false, now);
    expect(note).not.toBeNull();
  });

  it('ignores sessions outside the window and sessions dated in the future', () => {
    const old = makeActivity({ date: hoursAgo(ACTIVITY_NOTE_WINDOW_HOURS + 1) });
    const future = makeActivity({ date: hoursAgo(-2) });
    expect(evaluateActivityImpact([old, future], true, now)).toBeNull();
  });

  it('includes a session exactly at the edge of the window', () => {
    const edge = makeActivity({ date: hoursAgo(ACTIVITY_NOTE_WINDOW_HOURS) });
    expect(evaluateActivityImpact([edge], true, now)).not.toBeNull();
  });

  it('mentions leg-only kinds only before a lower-body T1 lift', () => {
    for (const kind of ['cycling', 'hiking', 'walking'] as const) {
      const session = makeActivity({ kind, style: null });
      expect(evaluateActivityImpact([session], false, now)).toBeNull();
      expect(evaluateActivityImpact([session], true, now)).not.toBeNull();
    }
  });

  it('describes the most recent qualifying session', () => {
    const ride = makeActivity({ id: 'ride', kind: 'cycling', style: null, date: hoursAgo(3) });
    const yoga = makeActivity({ id: 'yoga', date: hoursAgo(20) });
    expect(evaluateActivityImpact([yoga, ride], true, now)?.message).toMatch(/^Hard ride 3h ago\./);
    // Before an upper-body day the ride does not count, so the yoga is described.
    expect(evaluateActivityImpact([yoga, ride], false, now)?.message).toMatch(
      /^Hard yoga session 20h ago\./
    );
  });

  it('does not say "0h ago"', () => {
    const justNow = makeActivity({ date: hoursAgo(0.2) });
    expect(evaluateActivityImpact([justNow], true, now)?.message).toMatch(
      /^Hard yoga session less than an hour ago\./
    );
  });

  it('returns null with nothing logged', () => {
    expect(evaluateActivityImpact([], true, now)).toBeNull();
  });
});

describe('describeActivity', () => {
  it('names yoga by its style when one was recorded', () => {
    expect(describeActivity({ kind: 'yoga', style: 'power' })).toBe('Power yoga');
    expect(describeActivity({ kind: 'yoga', style: null })).toBe('Yoga');
  });

  it('uses the kind label for everything else', () => {
    for (const kind of ACTIVITY_KINDS.filter((k) => k !== 'yoga')) {
      expect(describeActivity({ kind, style: null })).toBe(ACTIVITY_KIND_LABELS[kind]);
    }
  });
});

describe('summariseOtherSessions', () => {
  it('is empty when nothing was logged', () => {
    expect(summariseOtherSessions([], [])).toBe('');
  });

  it('counts runs and each kind, singular and plural', () => {
    const activities = [
      makeActivity({ kind: 'yoga' }),
      makeActivity({ kind: 'yoga' }),
      makeActivity({ kind: 'cycling' }),
      makeActivity({ kind: 'hiking' }),
      makeActivity({ kind: 'hiking' }),
    ];
    expect(summariseOtherSessions([{ id: 'r1' }], activities)).toBe(
      '1 run · 2 yoga · 1 ride · 2 hikes'
    );
    expect(summariseOtherSessions([{ id: 'r1' }, { id: 'r2' }], [])).toBe('2 runs');
  });
});
