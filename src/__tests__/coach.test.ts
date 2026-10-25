import { describe, expect, it } from 'vitest';
import { analyze, suggestNext, warmupSets } from '../lib/coach';
import { platesPerSide, findExercise } from '../lib/exercises';
import { DEFAULT_SETTINGS } from '../lib/store';
import type { AppData, Workout } from '../lib/types';

const NOW = new Date(2026, 9, 25, 9, 0); // Sunday

function w(daysAgo: number, exercises: Array<[string, number, number[]]>, extra: Partial<Workout> = {}): Workout {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(17);
  return {
    id: `w${daysAgo}-${exercises.map((e) => e[0]).join()}`,
    date: d.toISOString(),
    kind: 'styrke',
    source: 'manuell',
    exercises: exercises.map(([name, weight, reps]) => ({ name, sets: reps.map((r) => ({ weight, reps: r, done: true })) })),
    ...extra,
  };
}

const base = (workouts: Workout[], health: AppData['health'] = {}): AppData => ({
  version: 1,
  workouts,
  health,
  settings: { ...DEFAULT_SETTINGS, daysPerWeek: 3 },
  activeWorkout: null,
});

describe('suggestNext (double progression)', () => {
  it('adds weight when all sets hit the top of the range', () => {
    const s = suggestNext([w(3, [['Benkpress', 80, [8, 8, 8]]])], 'Benkpress', 'muskelvekst');
    expect(s.weight).toBe(82.5);
    expect(s.reps).toBe(5);
  });
  it('adds a rep when inside the range', () => {
    const s = suggestNext([w(3, [['Benkpress', 80, [7, 6, 6]]])], 'Benkpress', 'muskelvekst');
    expect(s).toMatchObject({ weight: 80, reps: 7 });
  });
  it('backs off after two sessions below the range', () => {
    const s = suggestNext([w(3, [['Benkpress', 80, [4, 3, 3]]]), w(6, [['Benkpress', 80, [4, 4, 3]]])], 'Benkpress', 'muskelvekst');
    expect(s.weight).toBe(72.5);
  });
});

describe('analyze', () => {
  it('flags low frequency and a long break', () => {
    const a = analyze(base([w(20, [['Knebøy', 100, [5, 5, 5]]]), w(27, [['Knebøy', 100, [5, 5, 5]]])]), NOW);
    const ids = a.recommendations.map((r) => r.id);
    expect(ids).toContain('freq-low');
    expect(ids).toContain('comeback');
  });

  it('flags push/pull imbalance and low sleep', () => {
    const ws = [1, 3, 5, 8, 10, 12].map((d) => w(d, [['Benkpress', 80, [8, 8, 8, 8]], ['Militærpress', 50, [8, 8, 8]]]));
    const health: AppData['health'] = {};
    for (let i = 0; i < 5; i++) {
      const d = new Date(NOW);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      health[key] = { date: key, sleepHours: 5.8 };
    }
    const a = analyze(base(ws, health), NOW);
    const ids = a.recommendations.map((r) => r.id);
    expect(ids).toContain('push-pull');
    expect(ids).toContain('sleep');
    expect(a.readiness.score).toBeLessThan(75);
  });

  it('suggests the template whose muscles rested longest', () => {
    const ws = [w(1, [['Benkpress', 80, [8, 8, 8]], ['Stangroing', 70, [8, 8, 8]]], { title: 'Overkropp' })];
    const data = base(ws);
    data.settings.daysPerWeek = 4;
    expect(analyze(data, NOW).plan.title).toBe('Underkropp');
  });

  it('counts a Lyfta session and its Apple Health copy as one session', () => {
    const lyfta = w(1, [['Bench Press', 80, [8]]], { source: 'lyfta' });
    const health = { ...w(1, []), id: 'ah', source: 'apple-health' as const };
    expect(analyze(base([lyfta, health]), NOW).weeks.at(-1)?.strength).toBe(1);
  });
});

describe('helpers', () => {
  it('maps English Lyfta names to muscles', () => {
    expect(findExercise('Romanian Deadlift (Barbell)')?.primary).toContain('hamstrings');
    expect(findExercise('Lat Pulldown')?.primary).toEqual(['rygg']);
    expect(findExercise('Incline Dumbbell Bench Press')?.primary).toEqual(['bryst']);
    expect(findExercise('Seated Leg Curl')?.primary).toEqual(['hamstrings']);
  });
  it('computes plates per side', () => {
    expect(platesPerSide(102.5, 20).plates).toEqual([25, 15, 1.25]);
  });
  it('builds a warm-up ramp', () => {
    expect(warmupSets(100, 20).map((s) => s.weight)).toEqual([20, 40, 60, 80]);
  });
});
