import type { HealthDay } from './types';

export interface HealthWorkout {
  start: string;
  durationMin: number;
  activity: string;
  energyKcal?: number;
}

export type HealthWorkerMessage =
  | { type: 'progress'; bytes: number; total: number }
  | { type: 'done'; days: HealthDay[]; workouts: HealthWorkout[] }
  | { type: 'error'; message: string };

export interface HealthWorkerRequest {
  file: File;
  /** Only keep data newer than this many days */
  sinceDays: number;
}
