import type { MuscleGroup } from './types';

export interface ExerciseDef {
  name: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  compound: boolean;
  /** Smallest sensible weight jump in kg */
  increment: number;
  /** Rep range used for progression suggestions */
  reps: [number, number];
  /** Uses a barbell (enables the plate calculator) */
  barbell?: boolean;
}

export const EXERCISES: ExerciseDef[] = [
  { name: 'Knebøy', primary: ['quadriceps', 'sete'], secondary: ['hamstrings', 'mage'], compound: true, increment: 2.5, reps: [5, 8], barbell: true },
  { name: 'Frontbøy', primary: ['quadriceps'], secondary: ['sete', 'mage'], compound: true, increment: 2.5, reps: [5, 8], barbell: true },
  { name: 'Beinpress', primary: ['quadriceps', 'sete'], secondary: ['hamstrings'], compound: true, increment: 5, reps: [8, 12] },
  { name: 'Utfall', primary: ['quadriceps', 'sete'], secondary: ['hamstrings'], compound: true, increment: 2, reps: [8, 12] },
  { name: 'Bulgarsk utfall', primary: ['quadriceps', 'sete'], secondary: ['hamstrings'], compound: true, increment: 2, reps: [8, 12] },
  { name: 'Beinspark', primary: ['quadriceps'], secondary: [], compound: false, increment: 2.5, reps: [10, 15] },
  { name: 'Markløft', primary: ['hamstrings', 'sete', 'rygg'], secondary: ['quadriceps', 'mage'], compound: true, increment: 2.5, reps: [3, 6], barbell: true },
  { name: 'Rumensk markløft', primary: ['hamstrings', 'sete'], secondary: ['rygg'], compound: true, increment: 2.5, reps: [6, 10], barbell: true },
  { name: 'Lårcurl', primary: ['hamstrings'], secondary: [], compound: false, increment: 2.5, reps: [10, 15] },
  { name: 'Hip thrust', primary: ['sete'], secondary: ['hamstrings'], compound: true, increment: 5, reps: [8, 12], barbell: true },
  { name: 'Tåhev', primary: ['legger'], secondary: [], compound: false, increment: 5, reps: [10, 15] },
  { name: 'Benkpress', primary: ['bryst'], secondary: ['triceps', 'skuldre'], compound: true, increment: 2.5, reps: [5, 8], barbell: true },
  { name: 'Skråbenk med manualer', primary: ['bryst'], secondary: ['skuldre', 'triceps'], compound: true, increment: 2, reps: [8, 12] },
  { name: 'Manualpress', primary: ['bryst'], secondary: ['triceps', 'skuldre'], compound: true, increment: 2, reps: [8, 12] },
  { name: 'Dips', primary: ['bryst', 'triceps'], secondary: ['skuldre'], compound: true, increment: 2.5, reps: [6, 12] },
  { name: 'Flyes', primary: ['bryst'], secondary: [], compound: false, increment: 2, reps: [10, 15] },
  { name: 'Pushups', primary: ['bryst'], secondary: ['triceps', 'skuldre'], compound: true, increment: 0, reps: [10, 25] },
  { name: 'Militærpress', primary: ['skuldre'], secondary: ['triceps'], compound: true, increment: 2.5, reps: [5, 8], barbell: true },
  { name: 'Skulderpress med manualer', primary: ['skuldre'], secondary: ['triceps'], compound: true, increment: 2, reps: [8, 12] },
  { name: 'Sidehev', primary: ['skuldre'], secondary: [], compound: false, increment: 1, reps: [12, 20] },
  { name: 'Face pulls', primary: ['skuldre'], secondary: ['rygg'], compound: false, increment: 2.5, reps: [12, 20] },
  { name: 'Pullups', primary: ['rygg'], secondary: ['biceps'], compound: true, increment: 2.5, reps: [5, 10] },
  { name: 'Nedtrekk', primary: ['rygg'], secondary: ['biceps'], compound: true, increment: 2.5, reps: [8, 12] },
  { name: 'Stangroing', primary: ['rygg'], secondary: ['biceps', 'skuldre'], compound: true, increment: 2.5, reps: [6, 10], barbell: true },
  { name: 'Manualroing', primary: ['rygg'], secondary: ['biceps'], compound: true, increment: 2, reps: [8, 12] },
  { name: 'Sittende roing', primary: ['rygg'], secondary: ['biceps'], compound: true, increment: 2.5, reps: [8, 12] },
  { name: 'Bicepscurl', primary: ['biceps'], secondary: [], compound: false, increment: 1, reps: [8, 15] },
  { name: 'Hammercurl', primary: ['biceps'], secondary: [], compound: false, increment: 1, reps: [8, 15] },
  { name: 'Triceps pushdown', primary: ['triceps'], secondary: [], compound: false, increment: 2.5, reps: [10, 15] },
  { name: 'Fransk press', primary: ['triceps'], secondary: [], compound: false, increment: 1, reps: [8, 12] },
  { name: 'Planke', primary: ['mage'], secondary: [], compound: false, increment: 0, reps: [30, 60] },
  { name: 'Hengende beinhev', primary: ['mage'], secondary: [], compound: false, increment: 0, reps: [8, 15] },
  { name: 'Cable crunch', primary: ['mage'], secondary: [], compound: false, increment: 2.5, reps: [10, 15] },
];

/**
 * Keyword rules for exercises that are not in the library (e.g. English names from Lyfta).
 * The first matching rule wins, so more specific patterns come first.
 */
const RULES: Array<[RegExp, Omit<ExerciseDef, 'name'>]> = [
  [/romanian|rdl|rumensk|stiff/, { primary: ['hamstrings', 'sete'], secondary: ['rygg'], compound: true, increment: 2.5, reps: [6, 10] }],
  [/deadlift|markl/, { primary: ['hamstrings', 'sete', 'rygg'], secondary: ['quadriceps'], compound: true, increment: 2.5, reps: [3, 6] }],
  [/hip thrust|glute bridge|sete|glute|kickback|abduct/, { primary: ['sete'], secondary: ['hamstrings'], compound: false, increment: 2.5, reps: [8, 15] }],
  [/leg curl|hamstring curl|lårcurl|nordic/, { primary: ['hamstrings'], secondary: [], compound: false, increment: 2.5, reps: [10, 15] }],
  [/leg extension|beinspark/, { primary: ['quadriceps'], secondary: [], compound: false, increment: 2.5, reps: [10, 15] }],
  [/squat|knebøy|leg press|beinpress|lunge|utfall|split|step.?up|hack/, { primary: ['quadriceps', 'sete'], secondary: ['hamstrings'], compound: true, increment: 2.5, reps: [6, 12] }],
  [/calf|tåhev|legg/, { primary: ['legger'], secondary: [], compound: false, increment: 2.5, reps: [10, 15] }],
  [/bench|benk|chest press|push.?up|pushup|armhev/, { primary: ['bryst'], secondary: ['triceps', 'skuldre'], compound: true, increment: 2.5, reps: [6, 10] }],
  [/fly|flye|pec deck|crossover|chest|bryst/, { primary: ['bryst'], secondary: [], compound: false, increment: 2, reps: [10, 15] }],
  [/dip/, { primary: ['bryst', 'triceps'], secondary: ['skuldre'], compound: true, increment: 2.5, reps: [6, 12] }],
  [/lateral|side.?hev|sidehev|rear delt|reverse fly|face.?pull|upright/, { primary: ['skuldre'], secondary: [], compound: false, increment: 1, reps: [12, 20] }],
  [/overhead|shoulder|military|militær|skulder|arnold|ohp|press$/, { primary: ['skuldre'], secondary: ['triceps'], compound: true, increment: 2.5, reps: [6, 10] }],
  [/pull.?up|chin.?up|pulldown|nedtrekk|pullup|chin/, { primary: ['rygg'], secondary: ['biceps'], compound: true, increment: 2.5, reps: [6, 12] }],
  [/row|roing|shrug|pullover|back|rygg|hyperext/, { primary: ['rygg'], secondary: ['biceps'], compound: true, increment: 2.5, reps: [8, 12] }],
  [/tricep|pushdown|skull|french|fransk|kickback|close.?grip/, { primary: ['triceps'], secondary: [], compound: false, increment: 1, reps: [8, 15] }],
  [/curl|bicep/, { primary: ['biceps'], secondary: [], compound: false, increment: 1, reps: [8, 15] }],
  [/plank|planke|crunch|sit.?up|ab |abs|core|leg raise|beinhev|russian|wheel|mage|oblique|pallof|woodchop/, { primary: ['mage'], secondary: [], compound: false, increment: 0, reps: [10, 20] }],
];

const cache = new Map<string, ExerciseDef | null>();

export function findExercise(name: string): ExerciseDef | null {
  const key = name.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  let def: ExerciseDef | null = EXERCISES.find((e) => e.name.toLowerCase() === key) ?? null;
  if (!def) {
    const rule = RULES.find(([re]) => re.test(key));
    def = rule ? { name, ...rule[1], barbell: /barbell|stang|\bbb\b/.test(key) } : null;
  }
  cache.set(key, def);
  return def;
}

/** Estimated one-rep max (Epley). */
export function e1rm(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + Math.min(reps, 15) / 30);
}

/** Plates per side for a target barbell weight, largest first. */
export function platesPerSide(target: number, bar: number): { plates: number[]; remainder: number } {
  const available = [25, 20, 15, 10, 5, 2.5, 1.25];
  let side = Math.max(0, (target - bar) / 2);
  const plates: number[] = [];
  for (const p of available) {
    while (side >= p - 1e-9) {
      plates.push(p);
      side -= p;
    }
  }
  return { plates, remainder: Math.round(side * 2 * 100) / 100 };
}
