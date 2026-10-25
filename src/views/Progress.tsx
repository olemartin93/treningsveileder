import { useMemo, useState } from 'react';
import type { AppData, HealthDay } from '../lib/types';
import { MUSCLE_LABEL } from '../lib/types';
import type { Analysis } from '../lib/coach';
import { exerciseHistory, workingSets } from '../lib/coach';
import { Card, CardTitle, Stat, Segmented } from '../components/ui';
import { LineChart, RangeBar } from '../components/charts';
import { addDays, dayKey } from '../lib/dates';

const shortDate = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });
const kg = (n: number): string => String(Math.round(n * 10) / 10).replace('.', ',');

export function Progress({ data, analysis }: { data: AppData; analysis: Analysis }) {
  const strength = useMemo(() => data.workouts.filter((w) => w.kind === 'styrke'), [data.workouts]);
  const exerciseNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of strength) for (const e of w.exercises) if (workingSets(e.sets).length) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
    return [...counts.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([n]) => n);
  }, [strength]);
  const [exercise, setExercise] = useState<string>('');
  const selected = exercise || exerciseNames[0] || '';
  const hist = useMemo(() => (selected ? exerciseHistory(strength, selected) : []), [strength, selected]);
  const best = hist.reduce((m, h) => Math.max(m, h.best), 0);
  const first = hist[0]?.best ?? 0;
  const maxSets = Math.max(...analysis.muscles.map((m) => Math.max(m.sets, m.target[1])), 1);

  return (
    <div className="space-y-4">
      <h1 className="pt-2 text-2xl font-bold">Fremgang</h1>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Økter totalt" value={strength.length} />
        <Stat label="Uker på rad" value={analysis.streakWeeks} />
        <Stat label="Snitt/uke" value={kg(analysis.avgPerWeek)} />
      </div>

      <Card>
        <CardTitle>Harde sett per muskel (7 dager)</CardTitle>
        {analysis.hasSetData ? (
          <>
            <div className="space-y-2">
              {analysis.muscles.map((m) => (
                <RangeBar key={m.muscle} label={MUSCLE_LABEL[m.muscle]} value={m.sets} range={m.target} max={maxSets} />
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-400">Grått felt = anbefalt område for målet ditt. Sekundære muskler teller som et halvt sett.</p>
          </>
        ) : (
          <p className="text-sm text-ink-400">Logg økter eller importer fra Lyfta for å se volum per muskel.</p>
        )}
      </Card>

      <Card>
        <CardTitle>Styrkeutvikling</CardTitle>
        {exerciseNames.length === 0 ? (
          <p className="text-sm text-ink-400">Trenger minst to økter med samme øvelse.</p>
        ) : (
          <>
            <select
              value={selected}
              onChange={(e) => setExercise(e.target.value)}
              className="mb-3 h-11 w-full rounded-xl bg-ink-800 px-3 outline-none"
              aria-label="Velg øvelse"
            >
              {exerciseNames.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <p className="mb-1 text-xs text-ink-400">Estimert 1RM (kg)</p>
            <LineChart
              ariaLabel={`Estimert 1RM for ${selected}`}
              points={hist.map((h) => ({ x: Date.parse(h.date), y: h.best, tooltip: `${shortDate.format(new Date(h.date))}: ${kg(h.best)} kg` }))}
              xLabels={hist.length ? [shortDate.format(new Date(hist[0]?.date ?? '')), shortDate.format(new Date(hist[hist.length - 1]?.date ?? ''))] : undefined}
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="Beste e1RM" value={`${kg(best)} kg`} />
              <Stat label="Endring" value={`${best - first >= 0 ? '+' : ''}${kg(best - first)} kg`} sub={`over ${hist.length} økter`} />
            </div>
          </>
        )}
      </Card>

      <HealthTrends health={data.health} />
    </div>
  );
}

type Metric = 'sleepHours' | 'restingHr' | 'hrv' | 'bodyMass' | 'steps';
const METRICS: Array<{ value: Metric; label: string; unit: string }> = [
  { value: 'sleepHours', label: 'Søvn', unit: 't' },
  { value: 'restingHr', label: 'Puls', unit: 'bpm' },
  { value: 'hrv', label: 'HRV', unit: 'ms' },
  { value: 'bodyMass', label: 'Vekt', unit: 'kg' },
  { value: 'steps', label: 'Skritt', unit: '' },
];

function HealthTrends({ health }: { health: Record<string, HealthDay> }) {
  const [metric, setMetric] = useState<Metric>('sleepHours');
  const days = 42;
  const now = new Date();
  const points: Array<{ x: number; y: number; tooltip: string }> = [];
  const meta = METRICS.find((m) => m.value === metric) ?? METRICS[0];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(now, -i);
    const v = health[dayKey(d)]?.[metric];
    if (v !== undefined) points.push({ x: d.getTime(), y: v, tooltip: `${shortDate.format(d)}: ${kg(v)} ${meta?.unit ?? ''}` });
  }
  if (Object.keys(health).length === 0) return null;
  return (
    <Card>
      <CardTitle>Helse siste 6 uker</CardTitle>
      <div className="mb-3">
        <Segmented value={metric} options={METRICS.map(({ value, label }) => ({ value, label }))} onChange={setMetric} />
      </div>
      <LineChart ariaLabel={`${meta?.label ?? ''} siste 6 uker`} points={points} xLabels={['6 uker siden', 'i dag']} />
    </Card>
  );
}
