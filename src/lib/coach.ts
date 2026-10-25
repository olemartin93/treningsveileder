import type { AppData, Experience, Goal, HealthDay, MuscleGroup, Settings, Workout, WorkoutSet } from './types';
import { MUSCLE_GROUPS, MUSCLE_LABEL } from './types';
import { EXERCISES, e1rm, findExercise, type ExerciseDef } from './exercises';
import { addDays, dayKey, daysBetween, startOfDay, startOfWeek } from './dates';

export type Level = 'bra' | 'info' | 'obs' | 'viktig';
export type Category = 'frekvens' | 'volum' | 'restitusjon' | 'progresjon' | 'balanse' | 'helse';

export interface Recommendation {
  id: string;
  level: Level;
  category: Category;
  title: string;
  detail: string;
}

export interface ReadinessFactor {
  label: string;
  value: string;
  effect: 'pluss' | 'nøytral' | 'minus';
}

export interface Readiness {
  score: number;
  label: string;
  hasHealthData: boolean;
  factors: ReadinessFactor[];
}

export interface WeekStat {
  start: Date;
  strength: number;
  cardioMin: number;
  tonnage: number;
}

export interface MuscleStat {
  muscle: MuscleGroup;
  sets: number;
  target: [number, number];
  /** Distinct training days in the last 14 days, divided by 2 */
  perWeek: number;
  hoursSince: number | null;
}

export interface PlannedExercise {
  name: string;
  sets: number;
  reps: number;
  weight: number | null;
  note: string;
}

export interface SessionPlan {
  title: string;
  reason: string;
  exercises: PlannedExercise[];
  light: boolean;
}

export interface Analysis {
  readiness: Readiness;
  weeks: WeekStat[];
  muscles: MuscleStat[];
  avgPerWeek: number;
  thisWeek: number;
  streakWeeks: number;
  daysSinceStrength: number | null;
  recommendations: Recommendation[];
  plan: SessionPlan;
  hasSetData: boolean;
  prs: Array<{ exercise: string; e1rm: number; date: string }>;
}

const HOUR = 3600000;

export function volumeTarget(goal: Goal, exp: Experience): [number, number] {
  if (goal === 'helse') return [4, 10];
  if (goal === 'styrke') return exp === 'nybegynner' ? [4, 10] : [6, 12];
  return exp === 'nybegynner' ? [6, 12] : exp === 'erfaren' ? [12, 22] : [10, 20];
}

export const workingSets = (sets: WorkoutSet[]): WorkoutSet[] =>
  sets.filter((s) => s.done && !s.warmup && s.reps > 0);

const isStrength = (w: Workout): boolean => w.kind === 'styrke';

export function analyze(data: AppData, now = new Date()): Analysis {
  const { settings } = data;
  const workouts = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date));
  const strength = workouts.filter(isStrength);
  const recs: Recommendation[] = [];

  // ---- Weekly stats (last 12 weeks, oldest first) ----
  const thisMonday = startOfWeek(now);
  const weeks: WeekStat[] = [];
  for (let i = 11; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i);
    const end = addDays(start, 7);
    const inWeek = workouts.filter((w) => {
      const t = new Date(w.date);
      return t >= start && t < end;
    });
    weeks.push({
      start,
      strength: countSessions(inWeek.filter(isStrength)),
      cardioMin: inWeek.filter((w) => w.kind === 'kondisjon').reduce((s, w) => s + (w.durationMin ?? 0), 0),
      tonnage: inWeek.reduce((s, w) => s + tonnage(w), 0),
    });
  }
  const thisWeek = weeks[weeks.length - 1]?.strength ?? 0;
  const last4 = weeks.slice(-5, -1);
  const avgPerWeek = last4.reduce((s, w) => s + w.strength, 0) / Math.max(1, last4.length);
  const lastStrength = strength[0];
  const daysSinceStrength = lastStrength ? daysBetween(startOfDay(new Date(lastStrength.date)), startOfDay(now)) : null;

  let streakWeeks = 0;
  const minWeekly = Math.max(1, settings.daysPerWeek - 1);
  for (let i = weeks.length - 2; i >= 0; i--) {
    if ((weeks[i]?.strength ?? 0) >= minWeekly) streakWeeks++;
    else break;
  }
  if (thisWeek >= minWeekly) streakWeeks++;

  // ---- Muscle volume ----
  const hasSetData = strength.some((w) => w.exercises.length > 0 && daysBetween(new Date(w.date), now) <= 28);
  const target = volumeTarget(settings.goal, settings.experience);
  const muscles = muscleStats(strength, now, target);

  // ---- Readiness ----
  const readiness = computeReadiness(data.health, strength, now);

  // ---- Recommendations ----
  frequencyRecs(recs, settings, avgPerWeek, thisWeek, daysSinceStrength, now, workouts.length, readiness);
  if (hasSetData) {
    volumeRecs(recs, muscles, settings);
    balanceRecs(recs, strength, now);
  } else if (strength.length > 0) {
    recs.push({
      id: 'no-sets',
      level: 'info',
      category: 'volum',
      title: 'Importer øktene dine fra Lyfta',
      detail:
        'Jeg ser når du trener, men ikke hvilke øvelser, sett og vekter. Importer en CSV-eksport fra Lyfta (eller logg økter her) for analyse av volum, balanse og progresjon.',
    });
  }
  const plateaus = progressionRecs(recs, strength, now);
  const prs = recentPrs(strength, now);
  for (const pr of prs.slice(0, 2)) {
    recs.push({
      id: `pr-${pr.exercise}`,
      level: 'bra',
      category: 'progresjon',
      title: `Ny rekord i ${pr.exercise}!`,
      detail: `Estimert 1RM er nå ${Math.round(pr.e1rm)} kg. Bra jobba – fortsett med samme plan.`,
    });
  }
  loadRecs(recs, weeks, streakWeeks, plateaus, readiness);
  healthRecs(recs, data.health, settings, weeks, now);

  const order: Record<Level, number> = { viktig: 0, obs: 1, info: 2, bra: 3 };
  recs.sort((a, b) => order[a.level] - order[b.level]);

  return {
    readiness,
    weeks,
    muscles,
    avgPerWeek,
    thisWeek,
    streakWeeks,
    daysSinceStrength,
    recommendations: recs,
    plan: planNextSession(data, muscles, readiness, now),
    hasSetData,
    prs,
  };
}

/** Counts sessions, merging entries on the same day (e.g. Lyfta + Apple Health of one session). */
function countSessions(ws: Workout[]): number {
  return new Set(ws.map((w) => dayKey(new Date(w.date)))).size;
}

export function tonnage(w: Workout): number {
  return w.exercises.reduce((s, e) => s + workingSets(e.sets).reduce((t, x) => t + x.weight * x.reps, 0), 0);
}

function muscleStats(strength: Workout[], now: Date, target: [number, number]): MuscleStat[] {
  const sets = new Map<MuscleGroup, number>();
  const days = new Map<MuscleGroup, Set<string>>();
  const last = new Map<MuscleGroup, number>();
  const weekAgo = now.getTime() - 7 * 24 * HOUR;
  const twoWeeksAgo = now.getTime() - 14 * 24 * HOUR;

  for (const w of strength) {
    const t = new Date(w.date).getTime();
    for (const ex of w.exercises) {
      const def = findExercise(ex.name);
      if (!def) continue;
      const n = workingSets(ex.sets).length;
      if (n === 0) continue;
      for (const m of def.primary) {
        if (!last.has(m)) last.set(m, t);
        if (t >= twoWeeksAgo) {
          if (!days.has(m)) days.set(m, new Set());
          days.get(m)?.add(dayKey(new Date(w.date)));
        }
        if (t >= weekAgo) sets.set(m, (sets.get(m) ?? 0) + n);
      }
      if (t >= weekAgo) for (const m of def.secondary) sets.set(m, (sets.get(m) ?? 0) + n * 0.5);
    }
  }
  return MUSCLE_GROUPS.map((m) => {
    const small = m === 'legger' || m === 'mage' || m === 'biceps' || m === 'triceps';
    const lastT = last.get(m);
    return {
      muscle: m,
      sets: Math.round((sets.get(m) ?? 0) * 10) / 10,
      target: small ? [Math.round(target[0] / 2), Math.round(target[1] * 0.7)] : target,
      perWeek: (days.get(m)?.size ?? 0) / 2,
      hoursSince: lastT === undefined ? null : (now.getTime() - lastT) / HOUR,
    };
  });
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
}

function sd(xs: number[]): number {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export function computeReadiness(health: Record<string, HealthDay>, strength: Workout[], now: Date): Readiness {
  const factors: ReadinessFactor[] = [];
  let score = 75;
  const today = dayKey(now);
  const yesterday = dayKey(addDays(now, -1));
  const latest = health[today] ?? health[yesterday];

  const baselineDays: HealthDay[] = [];
  for (let i = 2; i <= 30; i++) {
    const d = health[dayKey(addDays(now, -i))];
    if (d) baselineDays.push(d);
  }
  const rhrBase = baselineDays.map((d) => d.restingHr).filter((x): x is number => x !== undefined);
  const hrvBase = baselineDays.map((d) => d.hrv).filter((x): x is number => x !== undefined);

  if (latest?.sleepHours !== undefined) {
    const h = latest.sleepHours;
    const effect = h < 6 ? -20 : h < 7 ? -10 : h >= 7.5 ? 8 : 0;
    score += effect;
    factors.push({ label: 'Søvn i natt', value: `${h.toFixed(1).replace('.', ',')} t`, effect: sign(effect) });
  }
  if (latest?.restingHr !== undefined && rhrBase.length >= 5) {
    const delta = latest.restingHr - mean(rhrBase);
    const effect = delta > 5 ? -15 : delta > 3 ? -8 : delta < -2 ? 5 : 0;
    score += effect;
    factors.push({
      label: 'Hvilepuls',
      value: `${latest.restingHr} (${delta >= 0 ? '+' : ''}${Math.round(delta)} mot snitt)`,
      effect: sign(effect),
    });
  }
  if (latest?.hrv !== undefined && hrvBase.length >= 5) {
    const z = (latest.hrv - mean(hrvBase)) / Math.max(3, sd(hrvBase));
    const effect = z < -1.5 ? -20 : z < -0.75 ? -10 : z > 0.5 ? 8 : 0;
    score += effect;
    factors.push({ label: 'HRV', value: `${latest.hrv} ms (snitt ${Math.round(mean(hrvBase))})`, effect: sign(effect) });
  }

  // Training load: consecutive strength days up to today
  const trainedDays = new Set(strength.map((w) => dayKey(new Date(w.date))));
  let consecutive = 0;
  for (let i = 1; i <= 7; i++) {
    if (trainedDays.has(dayKey(addDays(now, -i)))) consecutive++;
    else break;
  }
  if (trainedDays.has(today)) {
    score -= 10;
    factors.push({ label: 'Trent i dag', value: 'Ja', effect: 'minus' });
  } else if (consecutive >= 3) {
    score -= 12;
    factors.push({ label: 'Treningsdager på rad', value: String(consecutive), effect: 'minus' });
  } else if (consecutive === 0 && strength.length > 0) {
    score += 5;
    factors.push({ label: 'Hviledag i går', value: 'Ja', effect: 'pluss' });
  }

  score = Math.max(5, Math.min(100, Math.round(score)));
  const label = score >= 80 ? 'Klar for en tung økt' : score >= 60 ? 'Klar for normal trening' : score >= 40 ? 'Ta det litt roligere' : 'Prioriter hvile';
  return { score, label, hasHealthData: latest !== undefined, factors };
}

const sign = (n: number): ReadinessFactor['effect'] => (n > 0 ? 'pluss' : n < 0 ? 'minus' : 'nøytral');

function frequencyRecs(
  recs: Recommendation[],
  s: Settings,
  avg: number,
  thisWeek: number,
  daysSince: number | null,
  now: Date,
  total: number,
  readiness: Readiness,
): void {
  if (total === 0) {
    recs.push({
      id: 'start',
      level: 'info',
      category: 'frekvens',
      title: 'Kom i gang',
      detail: 'Importer historikken din fra Lyfta og Apple Health under «Data», eller start en økt med forslaget under.',
    });
    return;
  }
  if (daysSince !== null && daysSince >= 8) {
    recs.push({
      id: 'comeback',
      level: 'viktig',
      category: 'frekvens',
      title: `${daysSince} dager siden forrige styrkeøkt`,
      detail: 'Start forsiktig: bruk 10–20 % lavere vekter og ett sett mindre per øvelse den første uka, så er du raskt tilbake.',
    });
  }
  const diff = s.daysPerWeek - avg;
  if (diff >= 0.75) {
    const realistic = Math.max(2, Math.round(avg + 1));
    recs.push({
      id: 'freq-low',
      level: diff >= 1.5 ? 'viktig' : 'obs',
      category: 'frekvens',
      title: `Snitt ${fmt(avg)} økter/uke – målet er ${s.daysPerWeek}`,
      detail:
        realistic < s.daysPerWeek
          ? `Sikt på ${realistic} faste dager neste uke før du øker videre. Book øktene i kalenderen som avtaler – faste tider gir best kontinuitet.`
          : 'Legg øktene på faste dager i kalenderen. Kortere økter (30–40 min) er bedre enn å hoppe over.',
    });
  } else if (avg > s.daysPerWeek + 1 && readiness.score < 60) {
    recs.push({
      id: 'freq-high',
      level: 'obs',
      category: 'restitusjon',
      title: 'Høy frekvens og lav restitusjon',
      detail: `Du trener ${fmt(avg)} ganger i uka, mer enn planen på ${s.daysPerWeek}, og kroppen viser tegn til slitasje. Legg inn en ekstra hviledag.`,
    });
  } else if (avg >= s.daysPerWeek - 0.25) {
    recs.push({
      id: 'freq-ok',
      level: 'bra',
      category: 'frekvens',
      title: 'Treningsfrekvensen er på plass',
      detail: `${fmt(avg)} økter i uka siste fire uker. Kontinuitet er den viktigste faktoren for resultater – fortsett sånn.`,
    });
  }
  const dayOfWeek = (now.getDay() + 6) % 7; // 0 = monday
  const remainingDays = 7 - dayOfWeek;
  const needed = s.daysPerWeek - thisWeek;
  if (needed > 0 && needed >= remainingDays - 1 && dayOfWeek >= 3) {
    recs.push({
      id: 'week-left',
      level: 'obs',
      category: 'frekvens',
      title: `${needed} økt${needed > 1 ? 'er' : ''} igjen denne uka`,
      detail:
        needed > remainingDays
          ? 'Det rekker du ikke uten dager på rad. Ta det du rekker, og prioriter helkroppsøkter.'
          : 'Planlegg dem nå så du når ukemålet. Helkroppsøkter gjør at du kan trene to dager på rad uten problem.',
    });
  }
}

function volumeRecs(recs: Recommendation[], muscles: MuscleStat[], s: Settings): void {
  const big: MuscleGroup[] = ['bryst', 'rygg', 'skuldre', 'quadriceps', 'hamstrings', 'sete'];
  const low = muscles.filter((m) => big.includes(m.muscle) && m.sets < m.target[0]);
  const high = muscles.filter((m) => m.sets > m.target[1] * 1.15);
  if (low.length > 0) {
    recs.push({
      id: 'vol-low',
      level: low.length >= 3 ? 'obs' : 'info',
      category: 'volum',
      title: `For lite volum: ${low.map((m) => MUSCLE_LABEL[m.muscle].toLowerCase()).join(', ')}`,
      detail: `Siste 7 dager: ${low.map((m) => `${MUSCLE_LABEL[m.muscle]} ${fmt(m.sets)} sett`).join(', ')}. For målet ditt anbefales ${low[0]?.target[0]}–${low[0]?.target[1]} harde sett per muskel i uka.`,
    });
  }
  if (high.length > 0) {
    recs.push({
      id: 'vol-high',
      level: 'info',
      category: 'volum',
      title: `Mye volum: ${high.map((m) => MUSCLE_LABEL[m.muscle].toLowerCase()).join(', ')}`,
      detail: 'Over anbefalt område. Mer er ikke alltid bedre – flytt noen sett til muskler som henger etter, eller kutt litt hvis du føler deg sliten.',
    });
  }
  if (s.goal !== 'helse') {
    const once = muscles.filter((m) => big.includes(m.muscle) && m.perWeek > 0 && m.perWeek < 1.5);
    if (once.length >= 2) {
      recs.push({
        id: 'freq-muscle',
        level: 'info',
        category: 'frekvens',
        title: 'Tren hver muskel minst 2 ganger i uka',
        detail: `${once.map((m) => MUSCLE_LABEL[m.muscle]).join(', ')} trenes bare ca. én gang i uka. Å fordele det samme volumet på to økter gir bedre muskelvekst.`,
      });
    }
  }
}

function setsFor(strength: Workout[], now: Date, days: number, pred: (d: ExerciseDef) => boolean): number {
  const since = now.getTime() - days * 24 * HOUR;
  let n = 0;
  for (const w of strength) {
    if (new Date(w.date).getTime() < since) break;
    for (const ex of w.exercises) {
      const def = findExercise(ex.name);
      if (def && pred(def)) n += workingSets(ex.sets).length;
    }
  }
  return n;
}

function balanceRecs(recs: Recommendation[], strength: Workout[], now: Date): void {
  const push = setsFor(strength, now, 28, (d) => d.primary.includes('bryst') || (d.primary.includes('skuldre') && d.compound));
  const pull = setsFor(strength, now, 28, (d) => d.primary.includes('rygg'));
  if (push >= 8 && pull < push * 0.8) {
    recs.push({
      id: 'push-pull',
      level: 'obs',
      category: 'balanse',
      title: 'Mer trekk enn press, takk',
      detail: `Siste 4 uker: ${push} sett press mot ${pull} sett trekk. Legg til roing, nedtrekk eller face pulls – godt for skulderhelse og holdning. Sikt på minst like mange trekk- som pressett.`,
    });
  }
  const quads = setsFor(strength, now, 28, (d) => d.primary.includes('quadriceps'));
  const hinge = setsFor(strength, now, 28, (d) => d.primary.includes('hamstrings'));
  if (quads >= 8 && hinge < quads * 0.5) {
    recs.push({
      id: 'quad-ham',
      level: 'info',
      category: 'balanse',
      title: 'Baksiden av låret henger etter',
      detail: `${quads} sett for forsiden mot ${hinge} for baksiden siste 4 uker. Legg inn rumensk markløft eller lårcurl – det reduserer også skaderisiko i kneet.`,
    });
  }
}

interface SessionBest {
  date: string;
  best: number;
}

export function exerciseHistory(strength: Workout[], name: string): SessionBest[] {
  const out: SessionBest[] = [];
  for (const w of strength) {
    const ex = w.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
    if (!ex) continue;
    const best = Math.max(0, ...workingSets(ex.sets).map((s) => e1rm(s.weight, s.reps)));
    if (best > 0) out.push({ date: w.date, best });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

function progressionRecs(recs: Recommendation[], strength: Workout[], now: Date): string[] {
  const since = now.getTime() - 84 * 24 * HOUR;
  const recent = strength.filter((w) => new Date(w.date).getTime() >= since);
  const names = new Set(recent.flatMap((w) => w.exercises.map((e) => e.name)));
  const plateaus: string[] = [];
  for (const name of names) {
    const def = findExercise(name);
    if (!def?.compound) continue;
    const hist = exerciseHistory(recent, name);
    if (hist.length < 6) continue;
    const lastThree = Math.max(...hist.slice(-3).map((h) => h.best));
    const before = Math.max(...hist.slice(0, -3).map((h) => h.best));
    if (lastThree <= before * 1.005) plateaus.push(name);
  }
  if (plateaus.length > 0) {
    recs.push({
      id: 'plateau',
      level: 'obs',
      category: 'progresjon',
      title: `Platå i ${plateaus.slice(0, 3).join(', ')}`,
      detail:
        'Ingen fremgang de siste tre øktene. Prøv å bytte repetisjonsområde (f.eks. fra 5 til 8–10 reps) i 4 uker, bruk en variant av øvelsen, eller ta en lettere uke. Sjekk også søvn og kosthold.',
    });
  }
  return plateaus;
}

function recentPrs(strength: Workout[], now: Date): Analysis['prs'] {
  const since = now.getTime() - 14 * 24 * HOUR;
  const names = new Set(strength.flatMap((w) => w.exercises.map((e) => e.name)));
  const prs: Analysis['prs'] = [];
  for (const name of names) {
    const hist = exerciseHistory(strength, name);
    if (hist.length < 3) continue;
    const latest = hist[hist.length - 1];
    if (!latest || new Date(latest.date).getTime() < since) continue;
    const prev = Math.max(...hist.slice(0, -1).map((h) => h.best));
    if (latest.best > prev * 1.005) prs.push({ exercise: name, e1rm: latest.best, date: latest.date });
  }
  return prs.sort((a, b) => b.e1rm - a.e1rm);
}

function loadRecs(
  recs: Recommendation[],
  weeks: WeekStat[],
  streak: number,
  plateaus: string[],
  readiness: Readiness,
): void {
  const current = weeks[weeks.length - 1];
  const prev = weeks.slice(-5, -1).filter((w) => w.tonnage > 0);
  if (current && prev.length >= 3) {
    const avg = mean(prev.map((w) => w.tonnage));
    if (current.tonnage > avg * 1.35 && current.tonnage > 5000) {
      recs.push({
        id: 'spike',
        level: 'obs',
        category: 'restitusjon',
        title: 'Stor økning i treningsmengde',
        detail: `Denne uka har du løftet ${Math.round(current.tonnage / 1000)} tonn, mot snitt ${Math.round(avg / 1000)} tonn. Øk gradvis (maks ~10–20 % i uka) for å unngå overbelastning.`,
      });
    }
  }
  const lowRecovery = readiness.hasHealthData && readiness.score < 50;
  if (streak >= 6 && (plateaus.length >= 2 || lowRecovery || streak >= 10)) {
    recs.push({
      id: 'deload',
      level: streak >= 10 || lowRecovery ? 'viktig' : 'obs',
      category: 'restitusjon',
      title: 'Tid for en lettere uke (deload)',
      detail: `Du har trent jevnt i ${streak} uker${plateaus.length >= 2 ? ' og fremgangen har stoppet opp' : ''}${lowRecovery ? ' og restitusjonen er svekket' : ''}. Kjør én uke med halvparten av settene og ca. 10 % lavere vekter – du kommer tilbake sterkere.`,
    });
  } else if (readiness.score < 40 && readiness.hasHealthData) {
    recs.push({
      id: 'rest-today',
      level: 'viktig',
      category: 'restitusjon',
      title: 'Kroppen trenger hvile i dag',
      detail: 'Dårlig søvn, høy hvilepuls eller lav HRV. Velg en gåtur eller lett mobilitet i dag, og tren hardt i morgen i stedet.',
    });
  }
}

function healthRecs(recs: Recommendation[], health: Record<string, HealthDay>, s: Settings, weeks: WeekStat[], now: Date): void {
  const last7: HealthDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = health[dayKey(addDays(now, -i))];
    if (d) last7.push(d);
  }
  const sleep = last7.map((d) => d.sleepHours).filter((x): x is number => x !== undefined);
  if (sleep.length >= 3 && mean(sleep) < 7) {
    recs.push({
      id: 'sleep',
      level: mean(sleep) < 6.3 ? 'viktig' : 'obs',
      category: 'helse',
      title: `Snitt ${fmt(mean(sleep))} timer søvn siste uke`,
      detail: 'Under 7 timer gir dårligere styrkeutvikling og restitusjon. Prøv fast leggetid og ingen skjerm siste halvtimen – det er gratis gains.',
    });
  }
  const steps = last7.map((d) => d.steps).filter((x): x is number => x !== undefined);
  if (steps.length >= 3 && mean(steps) < 7000) {
    recs.push({
      id: 'steps',
      level: 'info',
      category: 'helse',
      title: `${Math.round(mean(steps)).toLocaleString('nb-NO')} skritt per dag`,
      detail: 'Daglig gange gir bedre restitusjon og helse. Sikt mot 8 000 skritt – en 20 minutters gåtur etter middag gjør mye.',
    });
  }
  const cardio = mean(weeks.slice(-5, -1).map((w) => w.cardioMin));
  const hasCardioData = weeks.some((w) => w.cardioMin > 0);
  if (hasCardioData && cardio < 75) {
    recs.push({
      id: 'cardio',
      level: s.goal === 'helse' ? 'obs' : 'info',
      category: 'helse',
      title: `${Math.round(cardio)} min kondisjon per uke`,
      detail: 'Helsemyndighetene anbefaler minst 150 min moderat eller 75 min hard kondisjon i uka. To korte intervalløkter i uka holder for de fleste.',
    });
  }
  // Body weight trend over ~4 weeks
  const weights: Array<[number, number]> = [];
  for (let i = 0; i < 35; i++) {
    const d = health[dayKey(addDays(now, -i))];
    if (d?.bodyMass !== undefined) weights.push([i, d.bodyMass]);
  }
  if (weights.length >= 4) {
    const recent = mean(weights.filter(([i]) => i < 7).map(([, w]) => w));
    const old = mean(weights.filter(([i]) => i >= 21).map(([, w]) => w));
    if (Number.isFinite(recent) && Number.isFinite(old) && old > 0 && weights.some(([i]) => i < 7) && weights.some(([i]) => i >= 21)) {
      const perWeek = (recent - old) / 4;
      if (s.goal === 'muskelvekst' && perWeek < -0.2) {
        recs.push({
          id: 'weight-loss',
          level: 'obs',
          category: 'helse',
          title: 'Vekten går ned',
          detail: `Ca. ${fmt(Math.abs(perWeek))} kg ned per uke. For muskelvekst bør du ligge i et lite kalorioverskudd – spis litt mer og få i deg 1,6–2 g protein per kg kroppsvekt.`,
        });
      } else if (s.goal === 'muskelvekst' && perWeek > recent * 0.005) {
        recs.push({
          id: 'weight-gain',
          level: 'info',
          category: 'helse',
          title: 'Vekten øker raskt',
          detail: `Ca. ${fmt(perWeek)} kg opp per uke. 0,25–0,5 % av kroppsvekten per uke er nok for muskelvekst uten mye fett.`,
        });
      }
    }
  }
}

const fmt = (n: number): string => (Math.round(n * 10) / 10).toString().replace('.', ',');

// ---------------- Session planning ----------------

const TEMPLATES: Record<string, { title: string; slots: string[] }> = {
  helkropp: { title: 'Helkropp', slots: ['Knebøy', 'Benkpress', 'Stangroing', 'Rumensk markløft', 'Skulderpress med manualer', 'Planke'] },
  helkroppB: { title: 'Helkropp B', slots: ['Markløft', 'Skråbenk med manualer', 'Nedtrekk', 'Bulgarsk utfall', 'Sidehev', 'Bicepscurl'] },
  overkropp: { title: 'Overkropp', slots: ['Benkpress', 'Stangroing', 'Skulderpress med manualer', 'Nedtrekk', 'Sidehev', 'Bicepscurl', 'Triceps pushdown'] },
  underkropp: { title: 'Underkropp', slots: ['Knebøy', 'Rumensk markløft', 'Beinpress', 'Lårcurl', 'Tåhev', 'Hengende beinhev'] },
  push: { title: 'Press (bryst, skuldre, triceps)', slots: ['Benkpress', 'Militærpress', 'Skråbenk med manualer', 'Sidehev', 'Triceps pushdown'] },
  pull: { title: 'Trekk (rygg, biceps)', slots: ['Pullups', 'Stangroing', 'Sittende roing', 'Face pulls', 'Bicepscurl'] },
  bein: { title: 'Bein', slots: ['Knebøy', 'Rumensk markløft', 'Bulgarsk utfall', 'Lårcurl', 'Tåhev'] },
};

function templatesFor(days: number): string[] {
  if (days <= 3) return ['helkropp', 'helkroppB'];
  if (days === 4) return ['overkropp', 'underkropp'];
  return ['push', 'pull', 'bein'];
}

function planNextSession(data: AppData, muscles: MuscleStat[], readiness: Readiness, now: Date): SessionPlan {
  const { settings } = data;
  const strength = data.workouts.filter(isStrength);
  const hoursSince = new Map(muscles.map((m) => [m.muscle, m.hoursSince ?? 999]));

  // Pick the template whose main muscles have rested longest.
  const candidates = templatesFor(settings.daysPerWeek).map((key) => {
    const t = TEMPLATES[key];
    if (!t) throw new Error(`Mangler mal ${key}`);
    const prim = t.slots.flatMap((s) => findExercise(s)?.primary ?? []);
    const score = mean(prim.map((m) => Math.min(hoursSince.get(m) ?? 999, 168)));
    return { key, t, score };
  });
  candidates.sort((a, b) => b.score - a.score);
  const chosen = candidates[0];
  if (!chosen) throw new Error('Ingen maler');

  const light = readiness.score < 50;
  const favourites = favouriteExercises(strength, now);
  const used = new Set<string>();
  const exercises: PlannedExercise[] = [];
  for (const slot of chosen.t.slots) {
    const def = findExercise(slot);
    if (!def) continue;
    // Prefer the user's own most-used exercise for the same muscle and type.
    const fav = favourites.find(
      (f) => !used.has(f.name) && f.def.primary[0] === def.primary[0] && f.def.compound === def.compound,
    );
    const name = fav?.name ?? slot;
    if (used.has(name)) continue;
    used.add(name);
    const sugg = suggestNext(strength, name, settings.goal);
    let sets = def.compound ? (settings.goal === 'styrke' ? 4 : 3) : settings.goal === 'helse' ? 2 : 3;
    if (light) sets = Math.max(2, sets - 1);
    exercises.push({ name, sets, reps: sugg.reps, weight: light && sugg.weight ? roundTo(sugg.weight * 0.9, 2.5) : sugg.weight, note: sugg.note });
  }

  const rested = chosen.score >= 168 ? 'ikke trent på over en uke' : `uthvilt i ca. ${Math.round(chosen.score)} timer`;
  return {
    title: chosen.t.title,
    reason: `${light ? 'Lett økt – restitusjonen er lav i dag. ' : ''}Musklene i denne økta er ${rested}.`,
    exercises,
    light,
  };
}

function favouriteExercises(strength: Workout[], now: Date): Array<{ name: string; def: ExerciseDef; count: number }> {
  const since = now.getTime() - 56 * 24 * HOUR;
  const counts = new Map<string, number>();
  for (const w of strength) {
    if (new Date(w.date).getTime() < since) break;
    for (const e of w.exercises) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .map(([name, count]) => ({ name, def: findExercise(name), count }))
    .filter((x): x is { name: string; def: ExerciseDef; count: number } => x.def !== null)
    .sort((a, b) => b.count - a.count);
}

export interface Suggestion {
  weight: number | null;
  reps: number;
  note: string;
  last: WorkoutSet[] | null;
  lastDate: string | null;
}

export function repRange(def: ExerciseDef, goal: Goal): [number, number] {
  if (goal === 'styrke' && def.compound && def.increment > 0) return [3, 6];
  if (goal === 'helse') return [Math.max(8, def.reps[0]), Math.max(12, def.reps[1])];
  return def.reps;
}

/** Double progression: fill the rep range, then add weight. */
export function suggestNext(strength: Workout[], name: string, goal: Goal): Suggestion {
  const def = findExercise(name) ?? EXERCISES[0];
  if (!def) return { weight: null, reps: 8, note: '', last: null, lastDate: null };
  const [lo, hi] = repRange(def, goal);
  const sorted = [...strength].sort((a, b) => b.date.localeCompare(a.date));
  const sessions = sorted
    .map((w) => ({ w, ex: w.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase()) }))
    .filter((x) => x.ex && workingSets(x.ex.sets).length > 0);
  const lastSession = sessions[0];
  if (!lastSession?.ex) {
    return { weight: null, reps: lo, note: `Første gang: finn en vekt du klarer ${hi} ganger med god teknikk.`, last: null, lastDate: null };
  }
  const sets = workingSets(lastSession.ex.sets);
  const top = Math.max(...sets.map((s) => s.weight));
  const atTop = sets.filter((s) => s.weight === top);
  const minReps = Math.min(...atTop.map((s) => s.reps));

  if (def.increment === 0 || top === 0) {
    return { weight: top || null, reps: Math.min(minReps + 1, hi + 5), note: 'Prøv én repetisjon mer enn sist.', last: sets, lastDate: lastSession.w.date };
  }
  if (minReps >= hi) {
    const next = roundTo(top + def.increment, def.increment >= 2.5 ? 2.5 : def.increment);
    return { weight: next, reps: lo, note: `Du klarte ${hi}+ reps på alle sett – øk til ${fmt(next)} kg.`, last: sets, lastDate: lastSession.w.date };
  }
  // Two sessions in a row below the range at the same weight -> back off.
  const prev = sessions[1]?.ex ? workingSets(sessions[1].ex.sets) : [];
  const prevTop = prev.length ? Math.max(...prev.map((s) => s.weight)) : 0;
  if (minReps < lo && prevTop === top && prev.some((s) => s.weight === top && s.reps < lo)) {
    const next = roundTo(top * 0.9, 2.5);
    return { weight: next, reps: hi, note: 'To økter under målet – gå ned 10 % og bygg opp igjen.', last: sets, lastDate: lastSession.w.date };
  }
  return { weight: top, reps: Math.min(hi, minReps + 1), note: `Samme vekt, sikt på ${Math.min(hi, minReps + 1)} reps på alle sett.`, last: sets, lastDate: lastSession.w.date };
}

export function roundTo(n: number, step: number): number {
  if (step <= 0) return Math.round(n * 10) / 10;
  return Math.round(n / step) * step;
}

/** Warm-up ramp for heavy compound lifts. */
export function warmupSets(target: number, bar: number): Array<{ weight: number; reps: number }> {
  if (target < bar + 20) return [];
  const steps: Array<[number, number]> = [
    [0.4, 8],
    [0.6, 5],
    [0.8, 3],
  ];
  return [{ weight: bar, reps: 10 }, ...steps.map(([p, r]) => ({ weight: Math.max(bar, roundTo(target * p, 2.5)), reps: r }))].filter(
    (s, i, arr) => i === 0 || s.weight !== arr[i - 1]?.weight,
  );
}
