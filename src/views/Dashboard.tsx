import type { Analysis, Recommendation } from '../lib/coach';
import type { AppData } from '../lib/types';
import { Button, Card, CardTitle, LevelBadge, cx } from '../components/ui';
import { BarChart, Ring } from '../components/charts';
import { weekNumber, relativeDays } from '../lib/dates';
import { useState } from 'react';

const CATEGORY_LABEL: Record<Recommendation['category'], string> = {
  frekvens: 'Frekvens',
  volum: 'Volum',
  restitusjon: 'Restitusjon',
  progresjon: 'Progresjon',
  balanse: 'Balanse',
  helse: 'Helse',
};

export function Dashboard({ data, analysis, onStartPlan, onGo }: { data: AppData; analysis: Analysis; onStartPlan: () => void; onGo: (route: string) => void }) {
  const { readiness, plan } = analysis;
  const [showAll, setShowAll] = useState(false);
  const recs = showAll ? analysis.recommendations : analysis.recommendations.slice(0, 4);
  const hour = new Date().getHours();
  const greeting = hour < 10 ? 'God morgen' : hour < 18 ? 'Hei' : 'God kveld';
  const lastWorkout = data.workouts.find((w) => w.kind === 'styrke');

  const scoreColor = readiness.score >= 70 ? 'text-good' : readiness.score >= 45 ? 'text-warn' : 'text-bad';

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <p className="text-sm text-ink-400">
          {greeting}
          {data.settings.name ? `, ${data.settings.name}` : ''} 👋
        </p>
        <h1 className="text-2xl font-bold">Treningsveileder</h1>
      </header>

      {data.activeWorkout ? (
        <button
          type="button"
          onClick={() => onGo('okt')}
          className="flex w-full items-center justify-between rounded-2xl bg-gradient-to-br from-accent-500 to-accent-600 p-4 text-left font-semibold"
        >
          <span>Økt pågår – {data.activeWorkout.title ?? 'Styrke'}</span>
          <span aria-hidden>→</span>
        </button>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <Card className="flex flex-col items-center gap-2 text-center">
          <Ring value={analysis.thisWeek} max={data.settings.daysPerWeek}>
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {analysis.thisWeek}/{data.settings.daysPerWeek}
              </div>
              <div className="text-[10px] text-ink-400 uppercase">økter</div>
            </div>
          </Ring>
          <div className="text-xs text-ink-400">Uke {weekNumber(new Date())}</div>
        </Card>
        <Card className="flex flex-col justify-between">
          <div>
            <div className="text-[11px] font-semibold text-ink-400 uppercase">Dagsform</div>
            <div className={cx('text-4xl font-bold tabular-nums', scoreColor)}>{readiness.score}</div>
            <div className="text-xs leading-snug text-ink-300">{readiness.label}</div>
          </div>
          {!readiness.hasHealthData ? (
            <button type="button" onClick={() => onGo('data')} className="mt-2 text-left text-xs font-medium text-accent-400">
              + Legg til helsedata
            </button>
          ) : null}
        </Card>
      </div>

      {readiness.factors.length > 0 ? (
        <Card>
          <CardTitle>Hva påvirker dagsformen</CardTitle>
          <ul className="space-y-1.5 text-sm">
            {readiness.factors.map((f) => (
              <li key={f.label} className="flex items-center justify-between">
                <span className="text-ink-300">{f.label}</span>
                <span className="flex items-center gap-2 tabular-nums">
                  {f.value}
                  <span
                    className={cx('w-4 text-center font-bold', f.effect === 'pluss' ? 'text-good' : f.effect === 'minus' ? 'text-bad' : 'text-ink-400')}
                    aria-label={f.effect}
                  >
                    {f.effect === 'pluss' ? '↑' : f.effect === 'minus' ? '↓' : '·'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardTitle>Anbefalinger</CardTitle>
        <ul className="space-y-3">
          {recs.map((r) => (
            <li key={r.id} className="rounded-xl bg-ink-800 p-3">
              <div className="mb-1 flex items-center gap-2">
                <LevelBadge level={r.level} />
                <span className="text-[11px] text-ink-400 uppercase">{CATEGORY_LABEL[r.category]}</span>
              </div>
              <h3 className="font-semibold">{r.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-300">{r.detail}</p>
            </li>
          ))}
          {recs.length === 0 ? <li className="text-sm text-ink-400">Alt ser bra ut – fortsett som nå!</li> : null}
        </ul>
        {analysis.recommendations.length > 4 ? (
          <Button variant="ghost" className="mt-2 w-full" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Vis færre' : `Vis alle (${analysis.recommendations.length})`}
          </Button>
        ) : null}
      </Card>

      {!data.activeWorkout ? (
        <Card>
          <CardTitle>Neste økt: {plan.title}</CardTitle>
          <p className="mb-3 text-sm text-ink-300">{plan.reason}</p>
          <ul className="mb-4 space-y-1 text-sm">
            {plan.exercises.map((e) => (
              <li key={e.name} className="flex justify-between gap-2">
                <span>{e.name}</span>
                <span className="text-ink-400 tabular-nums">
                  {e.sets}×{e.reps}
                  {e.weight ? ` · ${String(e.weight).replace('.', ',')} kg` : ''}
                </span>
              </li>
            ))}
          </ul>
          <Button className="w-full" onClick={onStartPlan}>
            Start økta
          </Button>
        </Card>
      ) : null}

      <Card>
        <CardTitle action={<span className="text-xs text-ink-400">{analysis.streakWeeks} uker på rad</span>}>Styrkeøkter per uke</CardTitle>
        <BarChart
          ariaLabel="Styrkeøkter per uke siste 12 uker"
          target={data.settings.daysPerWeek}
          data={analysis.weeks.map((w) => ({
            label: String(weekNumber(w.start)),
            value: w.strength,
            tooltip: `Uke ${weekNumber(w.start)}: ${w.strength} økt${w.strength === 1 ? '' : 'er'}`,
          }))}
        />
        <p className="mt-2 text-xs text-ink-400">
          Snitt {String(Math.round(analysis.avgPerWeek * 10) / 10).replace('.', ',')} per uke siste 4 uker
          {lastWorkout ? ` · sist ${relativeDays(lastWorkout.date)}` : ''}
        </p>
      </Card>
    </div>
  );
}
