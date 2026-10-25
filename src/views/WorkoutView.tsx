import { useEffect, useMemo, useRef, useState } from 'react';
import type { AppData, ExerciseEntry, Workout, WorkoutSet } from '../lib/types';
import type { Analysis } from '../lib/coach';
import { suggestNext, warmupSets } from '../lib/coach';
import { EXERCISES, findExercise, platesPerSide } from '../lib/exercises';
import { saveWorkout, setActiveWorkout, uid } from '../lib/store';
import { formatDate } from '../lib/dates';
import { Button, Card, CardTitle, Sheet, cx } from '../components/ui';
import { CheckIcon, PlusIcon, TimerIcon, TrashIcon } from '../components/icons';

const kg = (n: number): string => String(Math.round(n * 100) / 100).replace('.', ',');

export function newWorkoutFromPlan(analysis: Analysis): Workout {
  return {
    id: uid(),
    date: new Date().toISOString(),
    title: analysis.plan.light ? `${analysis.plan.title} (lett dag)` : analysis.plan.title,
    notes: analysis.plan.light ? 'Lett dag: ca. 10 % lavere vekter og ett sett mindre.' : undefined,
    kind: 'styrke',
    source: 'manuell',
    exercises: analysis.plan.exercises.map((e) => ({
      name: e.name,
      sets: Array.from({ length: e.sets }, () => ({ reps: e.reps, weight: e.weight ?? 0, done: false })),
    })),
  };
}

export function WorkoutView({ data, analysis, onToast }: { data: AppData; analysis: Analysis; onToast: (m: string) => void }) {
  const w = data.activeWorkout;
  if (!w) return <StartScreen analysis={analysis} />;
  return <ActiveWorkout key={w.id} workout={w} data={data} onToast={onToast} />;
}

function StartScreen({ analysis }: { analysis: Analysis }) {
  const { plan } = analysis;
  return (
    <div className="space-y-4">
      <h1 className="pt-2 text-2xl font-bold">Ny økt</h1>
      <Card>
        <CardTitle>Anbefalt: {plan.title}</CardTitle>
        <p className="mb-3 text-sm text-ink-300">{plan.reason}</p>
        <ul className="mb-4 divide-y divide-ink-800 text-sm">
          {plan.exercises.map((e) => (
            <li key={e.name} className="py-2">
              <div className="flex justify-between gap-2">
                <span className="font-medium">{e.name}</span>
                <span className="text-ink-300 tabular-nums">
                  {e.sets}×{e.reps}
                  {e.weight ? ` @ ${kg(e.weight)} kg` : ''}
                </span>
              </div>
              {e.note ? <p className="text-xs text-ink-400">{e.note}</p> : null}
            </li>
          ))}
        </ul>
        <Button className="w-full" onClick={() => setActiveWorkout(newWorkoutFromPlan(analysis))}>
          Start anbefalt økt
        </Button>
      </Card>
      <Button
        variant="secondary"
        className="w-full"
        onClick={() =>
          setActiveWorkout({ id: uid(), date: new Date().toISOString(), title: 'Egen økt', kind: 'styrke', source: 'manuell', exercises: [] })
        }
      >
        Start tom økt
      </Button>
    </div>
  );
}

function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = async (): Promise<void> => {
      try {
        if ('wakeLock' in navigator && document.visibilityState === 'visible') lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not supported or denied */
      }
    };
    void acquire();
    const onVis = (): void => void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release();
    };
  }, []);
}

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

let audioCtx: AudioContext | null = null;
function beepAt(secondsFromNow: number): () => void {
  try {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
    const ctx = audioCtx;
    const oscs: OscillatorNode[] = [];
    [0, 0.25, 0.5].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      const at = ctx.currentTime + secondsFromNow + offset;
      osc.start(at);
      osc.stop(at + 0.15);
      oscs.push(osc);
    });
    return () => oscs.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    });
  } catch {
    return () => undefined;
  }
}

function ActiveWorkout({ workout, data, onToast }: { workout: Workout; data: AppData; onToast: (m: string) => void }) {
  useWakeLock();
  const now = useNow(1000);
  const [rest, setRest] = useState<{ endsAt: number; total: number } | null>(null);
  const cancelBeep = useRef<() => void>(() => undefined);
  const [picker, setPicker] = useState(false);
  const [plates, setPlates] = useState<number | null>(null);
  const [finishing, setFinishing] = useState(false);
  const strength = useMemo(() => data.workouts.filter((x) => x.kind === 'styrke'), [data.workouts]);

  const update = (fn: (w: Workout) => Workout): void => setActiveWorkout(fn(workout));
  const updateExercise = (i: number, fn: (e: ExerciseEntry) => ExerciseEntry): void =>
    update((w) => ({ ...w, exercises: w.exercises.map((e, j) => (j === i ? fn(e) : e)) }));

  const startRest = (seconds: number): void => {
    cancelBeep.current();
    cancelBeep.current = beepAt(seconds);
    setRest({ endsAt: Date.now() + seconds * 1000, total: seconds });
  };
  const stopRest = (): void => {
    cancelBeep.current();
    setRest(null);
  };

  useEffect(() => {
    if (rest && now >= rest.endsAt) {
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
      setRest(null);
    }
  }, [now, rest]);

  const elapsedMin = Math.floor((now - Date.parse(workout.date)) / 60000);
  const doneSets = workout.exercises.reduce((s, e) => s + e.sets.filter((x) => x.done && !x.warmup).length, 0);
  const totalSets = workout.exercises.reduce((s, e) => s + e.sets.filter((x) => !x.warmup).length, 0);

  const addExercise = (name: string): void => {
    const sugg = suggestNext(strength, name, data.settings.goal);
    const n = 3;
    update((w) => ({
      ...w,
      exercises: [...w.exercises, { name, sets: Array.from({ length: n }, () => ({ reps: sugg.reps, weight: sugg.weight ?? 0, done: false })) }],
    }));
    setPicker(false);
  };

  return (
    <div className="space-y-4 pb-24">
      <header className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 bg-ink-950/90 px-4 pt-[calc(0.5rem+env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="min-w-0">
          <input
            value={workout.title ?? ''}
            onChange={(e) => update((w) => ({ ...w, title: e.target.value }))}
            className="w-full truncate bg-transparent text-xl font-bold outline-none"
            aria-label="Navn på økt"
          />
          <p className="text-xs text-ink-400 tabular-nums">
            {elapsedMin} min · {doneSets}/{totalSets} sett
          </p>
        </div>
        <Button onClick={() => setFinishing(true)} className="shrink-0">
          Fullfør
        </Button>
      </header>

      {workout.exercises.map((ex, i) => (
        <ExerciseCard
          key={`${ex.name}-${i}`}
          entry={ex}
          data={data}
          strength={strength}
          onChange={(fn) => updateExercise(i, fn)}
          onRemove={() => update((w) => ({ ...w, exercises: w.exercises.filter((_, j) => j !== i) }))}
          onSetDone={(isCompound) => startRest(isCompound ? data.settings.restSeconds : Math.max(60, data.settings.restSeconds - 30))}
          onPlates={(weight) => setPlates(weight)}
        />
      ))}

      <Button variant="secondary" className="w-full" onClick={() => setPicker(true)}>
        <PlusIcon className="size-4" /> Legg til øvelse
      </Button>

      {rest ? <RestBar rest={rest} now={now} onAdjust={(d) => setRest({ ...rest, endsAt: rest.endsAt + d * 1000, total: rest.total + d })} onStop={stopRest} /> : null}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={addExercise} data={data} />
      <PlateSheet weight={plates} bar={data.settings.barWeight} onClose={() => setPlates(null)} />
      <FinishSheet
        open={finishing}
        onClose={() => setFinishing(false)}
        workout={workout}
        onSave={(feeling, notes) => {
          const cleaned: Workout = {
            ...workout,
            feeling,
            notes: notes || undefined,
            durationMin: Math.max(1, Math.round((Date.now() - Date.parse(workout.date)) / 60000)),
            exercises: workout.exercises
              .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
              .filter((e) => e.sets.length > 0),
          };
          if (cleaned.exercises.length > 0) {
            saveWorkout(cleaned);
            onToast('Økta er lagret 💪');
          } else onToast('Økta ble forkastet (ingen fullførte sett)');
          stopRest();
          setActiveWorkout(null);
        }}
        onDiscard={() => {
          stopRest();
          setActiveWorkout(null);
          onToast('Økta ble forkastet');
        }}
      />
    </div>
  );
}

function ExerciseCard({
  entry,
  data,
  strength,
  onChange,
  onRemove,
  onSetDone,
  onPlates,
}: {
  entry: ExerciseEntry;
  data: AppData;
  strength: Workout[];
  onChange: (fn: (e: ExerciseEntry) => ExerciseEntry) => void;
  onRemove: () => void;
  onSetDone: (compound: boolean) => void;
  onPlates: (weight: number) => void;
}) {
  const def = findExercise(entry.name);
  const sugg = useMemo(() => suggestNext(strength, entry.name, data.settings.goal), [strength, entry.name, data.settings.goal]);
  const working = entry.sets.filter((s) => !s.warmup);
  const topWeight = Math.max(0, ...working.map((s) => s.weight));
  const hasWarmup = entry.sets.some((s) => s.warmup);
  const warmups = def?.compound && !hasWarmup ? warmupSets(topWeight, data.settings.barWeight) : [];

  const setField = (i: number, patch: Partial<WorkoutSet>): void =>
    onChange((e) => ({ ...e, sets: e.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold">{entry.name}</h3>
          {sugg.last && sugg.lastDate ? (
            <p className="text-xs text-ink-400">
              Sist ({formatDate(sugg.lastDate)}): {sugg.last.map((s) => `${kg(s.weight)}×${s.reps}`).join(', ')}
            </p>
          ) : null}
          {sugg.note ? <p className="mt-0.5 text-xs text-accent-400">{sugg.note}</p> : null}
        </div>
        <div className="flex shrink-0 gap-1">
          {def?.barbell && topWeight > 0 ? (
            <button type="button" onClick={() => onPlates(topWeight)} className="rounded-lg bg-ink-800 px-2 py-1 text-xs text-ink-300">
              Skiver
            </button>
          ) : null}
          <button type="button" onClick={onRemove} className="rounded-lg bg-ink-800 p-1.5 text-ink-400" aria-label={`Fjern ${entry.name}`}>
            <TrashIcon className="size-4" />
          </button>
        </div>
      </div>

      {warmups.length > 0 ? (
        <button
          type="button"
          className="mb-2 w-full rounded-lg bg-ink-800 px-3 py-2 text-left text-xs text-ink-300"
          onClick={() => onChange((e) => ({ ...e, sets: [...warmups.map((w) => ({ ...w, warmup: true, done: false })), ...e.sets] }))}
        >
          + Oppvarming: {warmups.map((w) => `${kg(w.weight)}×${w.reps}`).join(' → ')}
        </button>
      ) : null}

      <div className="grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 text-[11px] font-semibold text-ink-400 uppercase">
        <span>Sett</span>
        <span>Kg</span>
        <span>Reps</span>
        <span />
      </div>
      <ul className="mt-1 space-y-1.5">
        {entry.sets.map((s, i) => {
          const setNo = entry.sets.slice(0, i + 1).filter((x) => !x.warmup).length;
          return (
            <li key={i} className={cx('grid grid-cols-[2rem_1fr_1fr_2.75rem] items-center gap-2 rounded-lg', s.done && 'opacity-70')}>
              <span className={cx('text-center text-sm font-semibold', s.warmup ? 'text-warn' : 'text-ink-300')}>{s.warmup ? 'O' : setNo}</span>
              <NumberInput value={s.weight} onChange={(v) => setField(i, { weight: v })} label={`Vekt sett ${i + 1}`} />
              <NumberInput value={s.reps} onChange={(v) => setField(i, { reps: Math.round(v) })} label={`Reps sett ${i + 1}`} integer />
              <button
                type="button"
                aria-label={s.done ? 'Angre sett' : 'Fullfør sett'}
                onClick={() => {
                  setField(i, { done: !s.done });
                  if (!s.done && !s.warmup) onSetDone(def?.compound ?? true);
                }}
                className={cx('grid h-10 place-items-center rounded-lg transition', s.done ? 'bg-good text-ink-950' : 'bg-ink-700 text-ink-400')}
              >
                <CheckIcon className="size-5" />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex gap-2">
        <Button
          variant="ghost"
          className="min-h-9 flex-1 text-xs"
          onClick={() =>
            onChange((e) => {
              const last = e.sets[e.sets.length - 1];
              return { ...e, sets: [...e.sets, { reps: last?.reps ?? sugg.reps, weight: last?.weight ?? 0, done: false }] };
            })
          }
        >
          + Sett
        </Button>
        {entry.sets.length > 1 ? (
          <Button variant="ghost" className="min-h-9 flex-1 text-xs" onClick={() => onChange((e) => ({ ...e, sets: e.sets.slice(0, -1) }))}>
            − Sett
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

function NumberInput({ value, onChange, label, integer }: { value: number; onChange: (v: number) => void; label: string; integer?: boolean }) {
  const [text, setText] = useState(value ? kg(value) : '');
  useEffect(() => {
    const parsed = parseFloat(text.replace(',', '.')) || 0;
    if (parsed !== value) setText(value ? kg(value) : '');
    // Only resync when the stored value changes from outside this input.
  }, [value]);
  return (
    <input
      aria-label={label}
      inputMode={integer ? 'numeric' : 'decimal'}
      value={text}
      placeholder="0"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const t = e.target.value.replace(/[^\d.,]/g, '');
        setText(t);
        const v = parseFloat(t.replace(',', '.'));
        onChange(Number.isFinite(v) ? v : 0);
      }}
      className="h-10 w-full rounded-lg bg-ink-800 px-3 text-center text-base font-semibold tabular-nums outline-none focus:ring-2 focus:ring-accent-500"
    />
  );
}

function RestBar({ rest, now, onAdjust, onStop }: { rest: { endsAt: number; total: number }; now: number; onAdjust: (d: number) => void; onStop: () => void }) {
  const left = Math.max(0, Math.ceil((rest.endsAt - now) / 1000));
  const frac = 1 - left / Math.max(1, rest.total);
  return (
    <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto max-w-lg overflow-hidden rounded-2xl bg-ink-700 shadow-2xl ring-1 ring-white/10">
      <div className="h-1 bg-accent-500 transition-[width] duration-1000 ease-linear" style={{ width: `${frac * 100}%` }} />
      <div className="flex items-center gap-3 px-4 py-2.5">
        <TimerIcon className="size-5 text-accent-400" />
        <span className="flex-1 text-lg font-bold tabular-nums">
          {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
        </span>
        <button type="button" className="rounded-lg bg-ink-600 px-3 py-1.5 text-sm" onClick={() => onAdjust(-15)}>
          −15
        </button>
        <button type="button" className="rounded-lg bg-ink-600 px-3 py-1.5 text-sm" onClick={() => onAdjust(15)}>
          +15
        </button>
        <button type="button" className="rounded-lg bg-ink-600 px-3 py-1.5 text-sm" onClick={onStop}>
          Hopp over
        </button>
      </div>
    </div>
  );
}

function ExercisePicker({ open, onClose, onPick, data }: { open: boolean; onClose: () => void; onPick: (name: string) => void; data: AppData }) {
  const [q, setQ] = useState('');
  const names = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of data.workouts) for (const e of w.exercises) counts.set(e.name, (counts.get(e.name) ?? 0) + 1);
    const library = EXERCISES.map((e) => e.name);
    const all = [...new Set([...[...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n), ...library])];
    return all;
  }, [data.workouts]);
  const filtered = names.filter((n) => n.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Sheet open={open} onClose={onClose} title="Legg til øvelse">
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Søk eller skriv ny øvelse…"
        className="mb-3 h-11 w-full rounded-xl bg-ink-800 px-4 outline-none focus:ring-2 focus:ring-accent-500"
      />
      <ul className="divide-y divide-ink-800">
        {q.trim() && !names.some((n) => n.toLowerCase() === q.trim().toLowerCase()) ? (
          <li>
            <button type="button" className="w-full py-3 text-left text-accent-400" onClick={() => onPick(q.trim())}>
              + Ny øvelse «{q.trim()}»
            </button>
          </li>
        ) : null}
        {filtered.slice(0, 60).map((n) => {
          const def = findExercise(n);
          return (
            <li key={n}>
              <button type="button" className="flex w-full items-center justify-between py-3 text-left" onClick={() => onPick(n)}>
                <span>{n}</span>
                <span className="text-xs text-ink-400">{def?.primary.join(', ') ?? ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function PlateSheet({ weight, bar, onClose }: { weight: number | null; bar: number; onClose: () => void }) {
  if (weight === null) return null;
  const { plates, remainder } = platesPerSide(weight, bar);
  const colors: Record<number, string> = { 25: 'bg-red-500', 20: 'bg-blue-500', 15: 'bg-yellow-400', 10: 'bg-green-500', 5: 'bg-ink-50', 2.5: 'bg-ink-400', 1.25: 'bg-ink-600' };
  return (
    <Sheet open onClose={onClose} title={`Skiver for ${kg(weight)} kg`}>
      <p className="mb-4 text-sm text-ink-300">Stang {bar} kg. Per side:</p>
      <div className="mb-4 flex h-28 items-center justify-center gap-1 rounded-xl bg-ink-800 px-3">
        <div className="h-2 w-10 rounded bg-ink-400" />
        {plates.map((p, i) => (
          <div
            key={i}
            className={cx('flex w-6 items-center justify-center rounded text-[10px] font-bold text-ink-950', colors[p] ?? 'bg-ink-400')}
            style={{ height: `${30 + p * 2.6}%` }}
          >
            <span className="-rotate-90">{kg(p)}</span>
          </div>
        ))}
        <div className="h-2 w-6 rounded bg-ink-400" />
      </div>
      <p className="text-center text-lg font-semibold">{plates.length ? plates.map(kg).join(' + ') : 'Bare stanga'}</p>
      {remainder > 0 ? <p className="mt-1 text-center text-sm text-warn">{kg(remainder)} kg kan ikke lages med vanlige skiver</p> : null}
    </Sheet>
  );
}

function FinishSheet({
  open,
  onClose,
  workout,
  onSave,
  onDiscard,
}: {
  open: boolean;
  onClose: () => void;
  workout: Workout;
  onSave: (feeling: number, notes: string) => void;
  onDiscard: () => void;
}) {
  const [feeling, setFeeling] = useState(3);
  const [notes, setNotes] = useState(workout.notes ?? '');
  const faces = ['😫', '😕', '😐', '🙂', '🔥'];
  return (
    <Sheet open={open} onClose={onClose} title="Fullfør økt">
      <p className="mb-2 text-sm text-ink-300">Hvordan føltes økta?</p>
      <div className="mb-4 flex justify-between">
        {faces.map((f, i) => (
          <button
            type="button"
            key={f}
            onClick={() => setFeeling(i + 1)}
            className={cx('grid size-12 place-items-center rounded-xl text-2xl', feeling === i + 1 ? 'bg-accent-500/30 ring-2 ring-accent-500' : 'bg-ink-800')}
            aria-label={`Følelse ${i + 1} av 5`}
          >
            {f}
          </button>
        ))}
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notater (valgfritt)"
        rows={3}
        className="mb-4 w-full rounded-xl bg-ink-800 p-3 outline-none focus:ring-2 focus:ring-accent-500"
      />
      <Button className="mb-2 w-full" onClick={() => onSave(feeling, notes)}>
        Lagre økt
      </Button>
      <Button variant="danger" className="w-full" onClick={() => confirm('Forkaste økta?') && onDiscard()}>
        Forkast
      </Button>
    </Sheet>
  );
}
