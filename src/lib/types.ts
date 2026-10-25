export type MuscleGroup =
  | 'bryst'
  | 'rygg'
  | 'skuldre'
  | 'biceps'
  | 'triceps'
  | 'quadriceps'
  | 'hamstrings'
  | 'sete'
  | 'legger'
  | 'mage';

export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'bryst',
  'rygg',
  'skuldre',
  'biceps',
  'triceps',
  'quadriceps',
  'hamstrings',
  'sete',
  'legger',
  'mage',
] as const;

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  bryst: 'Bryst',
  rygg: 'Rygg',
  skuldre: 'Skuldre',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quadriceps: 'Lår (forside)',
  hamstrings: 'Lår (bakside)',
  sete: 'Sete',
  legger: 'Legger',
  mage: 'Mage/kjerne',
};

export interface WorkoutSet {
  reps: number;
  weight: number;
  rpe?: number;
  warmup?: boolean;
  done: boolean;
}

export interface ExerciseEntry {
  name: string;
  sets: WorkoutSet[];
}

export type WorkoutSource = 'manuell' | 'lyfta' | 'apple-health';
export type WorkoutKind = 'styrke' | 'kondisjon' | 'annet';

export interface Workout {
  id: string;
  /** ISO timestamp of the start */
  date: string;
  durationMin?: number;
  title?: string;
  kind: WorkoutKind;
  exercises: ExerciseEntry[];
  source: WorkoutSource;
  notes?: string;
  /** How the session felt, 1 (tung) – 5 (super) */
  feeling?: number;
}

export interface HealthDay {
  /** YYYY-MM-DD */
  date: string;
  restingHr?: number;
  hrv?: number;
  sleepHours?: number;
  steps?: number;
  bodyMass?: number;
}

export type Goal = 'styrke' | 'muskelvekst' | 'helse';
export type Experience = 'nybegynner' | 'viderekommen' | 'erfaren';

export interface Settings {
  goal: Goal;
  experience: Experience;
  daysPerWeek: number;
  restSeconds: number;
  barWeight: number;
  /** Optional name shown on the dashboard */
  name: string;
}

export interface AppData {
  version: 1;
  workouts: Workout[];
  health: Record<string, HealthDay>;
  settings: Settings;
  activeWorkout: Workout | null;
}
