import { useState } from 'react';
import type { Workout } from '../lib/types';
import { deleteWorkout } from '../lib/store';
import { workingSets, tonnage } from '../lib/coach';
import { formatDate, formatTime, startOfWeek, weekNumber } from '../lib/dates';
import { Card, cx } from '../components/ui';
import { TrashIcon } from '../components/icons';

const SOURCE_LABEL: Record<Workout['source'], string> = { manuell: 'Logget her', lyfta: 'Lyfta', 'apple-health': 'Apple Helse' };
const FACES = ['😫', '😕', '😐', '🙂', '🔥'];

export function History({ workouts }: { workouts: Workout[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<'alle' | 'styrke' | 'kondisjon'>('alle');
  const list = workouts.filter((w) => filter === 'alle' || w.kind === filter).slice(0, 300);

  const groups = new Map<string, Workout[]>();
  for (const w of list) {
    const ws = startOfWeek(new Date(w.date));
    const key = `${ws.getFullYear()}-${weekNumber(ws)}`;
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }

  return (
    <div className="space-y-4">
      <h1 className="pt-2 text-2xl font-bold">Historikk</h1>
      <div className="flex gap-2">
        {(['alle', 'styrke', 'kondisjon'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cx('rounded-full px-3 py-1.5 text-sm capitalize', filter === f ? 'bg-ink-50 text-ink-950' : 'bg-ink-800 text-ink-300')}
          >
            {f}
          </button>
        ))}
      </div>
      {list.length === 0 ? <Card><p className="text-sm text-ink-400">Ingen økter ennå. Logg en økt eller importer fra Lyfta/Apple Helse.</p></Card> : null}
      {[...groups.entries()].map(([key, ws]) => (
        <div key={key}>
          <h2 className="mb-2 text-xs font-semibold text-ink-400 uppercase">Uke {key.split('-')[1]} · {ws.length} økt{ws.length === 1 ? '' : 'er'}</h2>
          <ul className="space-y-2">
            {ws.map((w) => {
              const isOpen = open === w.id;
              const sets = w.exercises.reduce((s, e) => s + workingSets(e.sets).length, 0);
              const t = tonnage(w);
              return (
                <li key={w.id}>
                  <Card className="p-0">
                    <button type="button" className="w-full p-4 text-left" onClick={() => setOpen(isOpen ? null : w.id)}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-semibold">{w.title ?? (w.kind === 'styrke' ? 'Styrkeøkt' : 'Økt')}</div>
                          <div className="text-xs text-ink-400">
                            {formatDate(w.date)} kl. {formatTime(w.date)}
                            {w.durationMin ? ` · ${w.durationMin} min` : ''}
                            {w.feeling ? ` · ${FACES[w.feeling - 1] ?? ''}` : ''}
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-ink-800 px-2 py-0.5 text-[11px] text-ink-300">{SOURCE_LABEL[w.source]}</span>
                      </div>
                      {w.exercises.length > 0 ? (
                        <p className="mt-2 text-sm text-ink-300">
                          {w.exercises.length} øvelser · {sets} sett{t > 0 ? ` · ${Math.round(t).toLocaleString('nb-NO')} kg totalt` : ''}
                        </p>
                      ) : null}
                    </button>
                    {isOpen ? (
                      <div className="border-t border-ink-800 px-4 pt-3 pb-4">
                        {w.exercises.map((e, i) => (
                          <div key={i} className="mb-2 text-sm">
                            <div className="font-medium">{e.name}</div>
                            <div className="text-ink-400 tabular-nums">
                              {e.sets.map((s) => `${s.warmup ? '(o) ' : ''}${String(s.weight).replace('.', ',')}×${s.reps}`).join('  ·  ')}
                            </div>
                          </div>
                        ))}
                        {w.notes ? <p className="mb-2 text-sm text-ink-300 italic">«{w.notes}»</p> : null}
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-sm text-bad"
                          onClick={() => confirm('Slette økta?') && deleteWorkout(w.id)}
                        >
                          <TrashIcon className="size-4" /> Slett
                        </button>
                      </div>
                    ) : null}
                  </Card>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

