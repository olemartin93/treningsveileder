import { useRef, useState, type ReactNode } from 'react';
import type { AppData, Experience, Goal, HealthDay } from '../lib/types';
import { addWorkouts, exportBackup, importBackup, mergeHealth, resetAll, updateSettings } from '../lib/store';
import { importWorkoutCsv } from '../lib/csvImport';
import { importHealthFile } from '../lib/importHealth';
import { parseShortcutParams } from '../lib/shortcutImport';
import { dayKey } from '../lib/dates';
import { Button, Card, CardTitle, Segmented, cx } from '../components/ui';
import { HeartIcon, DumbbellIcon } from '../components/icons';

export function DataView({ data, onToast }: { data: AppData; onToast: (m: string) => void }) {
  return (
    <div className="space-y-4">
      <h1 className="pt-2 text-2xl font-bold">Data og innstillinger</h1>
      <CheckIn data={data} onToast={onToast} />
      <AppleHealth onToast={onToast} />
      <Lyfta onToast={onToast} />
      <SettingsCard data={data} />
      <Backup onToast={onToast} />
      <InstallHint />
    </div>
  );
}

function FilePick({ accept, onFile, children, variant = 'secondary' }: { accept: string; onFile: (f: File) => void; children: ReactNode; variant?: 'primary' | 'secondary' }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <Button variant={variant} className="w-full" onClick={() => ref.current?.click()}>
        {children}
      </Button>
    </>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-ink-300 marker:text-ink-400">{children}</ol>;
}

function Details({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="group mb-3 rounded-xl bg-ink-800 px-3 py-2">
      <summary className="cursor-pointer list-none text-sm font-medium text-ink-50">
        <span className="mr-1 inline-block transition group-open:rotate-90">›</span> {summary}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

/** Quick daily check-in: manual entry or paste from the iOS Shortcut. */
function CheckIn({ data, onToast }: { data: AppData; onToast: (m: string) => void }) {
  const today = dayKey(new Date());
  const existing = data.health[today];
  const [form, setForm] = useState({
    sleep: existing?.sleepHours?.toString().replace('.', ',') ?? '',
    rhr: existing?.restingHr?.toString() ?? '',
    hrv: existing?.hrv?.toString() ?? '',
    weight: existing?.bodyMass?.toString().replace('.', ',') ?? '',
  });
  const n = (s: string): number | undefined => {
    const v = parseFloat(s.replace(',', '.'));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };

  const save = (): void => {
    const d: HealthDay = { date: today };
    const sleep = n(form.sleep);
    const rhr = n(form.rhr);
    const hrv = n(form.hrv);
    const weight = n(form.weight);
    if (sleep !== undefined) d.sleepHours = sleep;
    if (rhr !== undefined) d.restingHr = Math.round(rhr);
    if (hrv !== undefined) d.hrv = Math.round(hrv);
    if (weight !== undefined) d.bodyMass = weight;
    mergeHealth([d]);
    onToast('Dagsform lagret');
  };

  const paste = async (): Promise<void> => {
    try {
      const text = await navigator.clipboard.readText();
      const query = text.includes('?') ? text.slice(text.indexOf('?') + 1) : text.replace(/^treningsveileder:/, '');
      const day = parseShortcutParams(new URLSearchParams(query.trim()));
      if (!day) throw new Error('Fant ingen helsedata i utklippstavlen');
      mergeHealth([day]);
      setForm({
        sleep: day.sleepHours?.toString().replace('.', ',') ?? form.sleep,
        rhr: day.restingHr?.toString() ?? form.rhr,
        hrv: day.hrv?.toString() ?? form.hrv,
        weight: day.bodyMass?.toString().replace('.', ',') ?? form.weight,
      });
      onToast('Helsedata hentet fra snarveien ✅');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Kunne ikke lese utklippstavlen');
    }
  };

  const field = (key: keyof typeof form, label: string, unit: string) => (
    <label className="block">
      <span className="text-[11px] font-medium text-ink-400 uppercase">{label}</span>
      <div className="mt-1 flex items-center rounded-xl bg-ink-800 pr-3 focus-within:ring-2 focus-within:ring-accent-500">
        <input
          inputMode="decimal"
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="h-11 w-full min-w-0 bg-transparent px-3 text-base outline-none"
          placeholder="–"
        />
        <span className="text-xs text-ink-400">{unit}</span>
      </div>
    </label>
  );

  return (
    <Card>
      <CardTitle>Dagens form</CardTitle>
      <Button className="mb-3 w-full" onClick={() => void paste()}>
        <HeartIcon className="size-4" /> Lim inn fra Helse-snarvei
      </Button>
      <div className="grid grid-cols-2 gap-2">
        {field('sleep', 'Søvn', 't')}
        {field('rhr', 'Hvilepuls', 'bpm')}
        {field('hrv', 'HRV', 'ms')}
        {field('weight', 'Kroppsvekt', 'kg')}
      </div>
      <Button variant="secondary" className="mt-3 w-full" onClick={save}>
        Lagre manuelt
      </Button>
    </Card>
  );
}

function AppleHealth({ onToast }: { onToast: (m: string) => void }) {
  const [progress, setProgress] = useState<number | null>(null);
  const appUrl = `${location.origin}${location.pathname}`;
  const template = `${appUrl}#/importer?hvilepuls=[Hvilepuls]&hrv=[HRV]&sovnmin=[Søvn]&skritt=[Skritt]&vekt=[Vekt]`;

  const onFile = async (f: File): Promise<void> => {
    setProgress(0);
    try {
      const r = await importHealthFile(f, setProgress);
      onToast(`Importerte ${r.days} dager med helsedata og ${r.workouts} nye treningsøkter`);
    } catch (err) {
      onToast(`Import feilet: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardTitle action={<HeartIcon className="size-5 text-bad" />}>Apple Helse</CardTitle>
      <p className="mb-3 text-sm text-ink-300">
        Apple lar ikke web-apper lese Helse direkte, så data hentes på to måter: en snarvei for daglige verdier (søvn, puls, HRV, skritt, vekt) og full eksport for historikk og treningsøkter.
      </p>

      <Details summary="1. Daglig: lag en iOS-snarvei (5 min)">
        <Steps>
          <li>Åpne <b>Snarveier</b> → <b>+</b> → gi den navnet «Treningsveileder».</li>
          <li>
            Legg til <b>Finn helseeksempler</b> for hver verdi: <i>Hvilepuls</i>, <i>Pulsvariabilitet</i> og <i>Vekt</i> (sorter nyeste først, grense 1), <i>Søvnanalyse</i> og <i>Skritt</i> (startdato i siste 1 dag).
          </li>
          <li>For søvn og skritt: legg til <b>Beregn statistikk → Sum</b> (søvn: bruk <i>Varighet</i>).</li>
          <li>
            Legg til <b>Tekst</b> med verdiene satt inn som variabler:
            <code className="mt-1 block rounded-lg bg-ink-950 p-2 text-[11px] break-all text-ink-300">
              hvilepuls=[Hvilepuls]&hrv=[HRV]&sovnmin=[Søvn]&skritt=[Skritt]&vekt=[Vekt]
            </code>
          </li>
          <li>Avslutt med <b>Kopier til utklipp</b>.</li>
          <li>Kjør snarveien om morgenen, åpne appen og trykk <b>«Lim inn fra Helse-snarvei»</b> over.</li>
        </Steps>
        <p className="text-xs text-ink-400">
          Tips: legg snarveien som en automasjon (f.eks. når vekkerklokka stoppes). Bruker du appen i Safari i stedet for fra Hjem-skjermen, kan snarveien åpne denne lenken direkte med <b>Åpne URL-er</b>:
          <code className="mt-1 block rounded-lg bg-ink-950 p-2 text-[11px] break-all">{template}</code>
        </p>
      </Details>

      <Details summary="2. Historikk: importer full Helse-eksport">
        <Steps>
          <li>Åpne <b>Helse</b> → profilbildet ditt → <b>Eksporter alle helsedata</b>.</li>
          <li>Velg <b>Arkiver i Filer</b>.</li>
          <li>Trykk knappen under og velg <i>eksport.zip</i>.</li>
        </Steps>
        <p className="text-xs text-ink-400">Siste 13 måneder leses inn: søvn, hvilepuls, HRV, skritt, vekt og alle treningsøkter (også de Lyfta har lagret i Helse). Alt behandles lokalt på telefonen.</p>
      </Details>

      {progress !== null ? (
        <div className="rounded-xl bg-ink-800 p-3">
          <div className="mb-2 text-sm">Leser eksport… {Math.round(progress * 100)} %</div>
          <div className="h-2 overflow-hidden rounded-full bg-ink-700">
            <div className="h-full bg-accent-500 transition-all" style={{ width: `${progress * 100}%` }} />
          </div>
        </div>
      ) : (
        <FilePick accept=".zip,.xml,application/zip,text/xml" onFile={(f) => void onFile(f)}>
          Velg Helse-eksport (zip/xml)
        </FilePick>
      )}
    </Card>
  );
}

function Lyfta({ onToast }: { onToast: (m: string) => void }) {
  const onFile = async (f: File): Promise<void> => {
    try {
      const res = importWorkoutCsv(await f.text());
      const added = addWorkouts(res.workouts);
      onToast(`Importerte ${added} nye økter (${res.sets} sett) fra ${f.name}${res.workouts.length - added > 0 ? ` – ${res.workouts.length - added} fantes fra før` : ''}`);
    } catch (err) {
      onToast(`Import feilet: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  return (
    <Card>
      <CardTitle action={<DumbbellIcon className="size-5 text-accent-400" />}>Lyfta</CardTitle>
      <p className="mb-3 text-sm text-ink-300">
        Lyfta har ikke et åpent API, men du kan eksportere treningsloggen som CSV. Da får veilederen alle øvelser, sett, reps og vekter.
      </p>
      <Steps>
        <li>I Lyfta: åpne <b>innstillingene</b> og velg eksport av treningsdata som <b>CSV</b>.</li>
        <li>Lagre filen i <b>Filer</b>.</li>
        <li>Trykk knappen under og velg filen. Importer på nytt når du vil – duplikater hoppes over.</li>
      </Steps>
      <p className="mb-3 text-xs text-ink-400">
        Lyfta synker også øktene til Apple Helse, så treningsfrekvensen fanges opp via Helse-eksporten selv uten CSV. CSV-filer fra Strong og Hevy fungerer også.
      </p>
      <FilePick accept=".csv,text/csv,text/plain" onFile={(f) => void onFile(f)} variant="primary">
        Importer Lyfta-CSV
      </FilePick>
    </Card>
  );
}

function SettingsCard({ data }: { data: AppData }) {
  const s = data.settings;
  return (
    <Card>
      <CardTitle>Mål og innstillinger</CardTitle>
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-ink-300">Navn</span>
          <input
            value={s.name}
            onChange={(e) => updateSettings({ name: e.target.value })}
            className="h-11 w-full rounded-xl bg-ink-800 px-3 outline-none focus:ring-2 focus:ring-accent-500"
            placeholder="Valgfritt"
          />
        </label>
        <div>
          <span className="mb-1 block text-sm text-ink-300">Hovedmål</span>
          <Segmented<Goal>
            value={s.goal}
            onChange={(goal) => updateSettings({ goal })}
            options={[
              { value: 'muskelvekst', label: 'Muskelvekst' },
              { value: 'styrke', label: 'Styrke' },
              { value: 'helse', label: 'Helse' },
            ]}
          />
        </div>
        <div>
          <span className="mb-1 block text-sm text-ink-300">Erfaring</span>
          <Segmented<Experience>
            value={s.experience}
            onChange={(experience) => updateSettings({ experience })}
            options={[
              { value: 'nybegynner', label: '< 1 år' },
              { value: 'viderekommen', label: '1–3 år' },
              { value: 'erfaren', label: '3+ år' },
            ]}
          />
        </div>
        <div>
          <span className="mb-1 block text-sm text-ink-300">Styrkeøkter per uke</span>
          <div className="flex gap-1.5">
            {[2, 3, 4, 5, 6].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => updateSettings({ daysPerWeek: d })}
                className={cx('h-11 flex-1 rounded-xl text-sm font-semibold', s.daysPerWeek === d ? 'bg-accent-500 text-white' : 'bg-ink-800 text-ink-300')}
              >
                {d}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-400">
            {s.daysPerWeek <= 3 ? 'Helkroppsøkter' : s.daysPerWeek === 4 ? 'Overkropp/underkropp' : 'Press/trekk/bein'} blir foreslått.
          </p>
        </div>
        <div>
          <span className="mb-1 block text-sm text-ink-300">Pause mellom tunge sett: {s.restSeconds} sek</span>
          <input
            type="range"
            min={60}
            max={300}
            step={15}
            value={s.restSeconds}
            onChange={(e) => updateSettings({ restSeconds: Number(e.target.value) })}
            className="w-full accent-[var(--color-accent-500)]"
          />
        </div>
        <div>
          <span className="mb-1 block text-sm text-ink-300">Vekt på stang</span>
          <Segmented<number>
            value={s.barWeight}
            onChange={(barWeight) => updateSettings({ barWeight })}
            options={[
              { value: 15, label: '15 kg' },
              { value: 20, label: '20 kg' },
            ]}
          />
        </div>
      </div>
    </Card>
  );
}

function Backup({ onToast }: { onToast: (m: string) => void }) {
  const download = (): void => {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `treningsveileder-${dayKey(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  return (
    <Card>
      <CardTitle>Sikkerhetskopi</CardTitle>
      <p className="mb-3 text-sm text-ink-300">All data lagres kun på denne enheten. Ta en sikkerhetskopi av og til.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={download}>
          Last ned
        </Button>
        <FilePick
          accept=".json,application/json"
          onFile={(f) =>
            void f.text().then((t) => {
              try {
                importBackup(t);
                onToast('Sikkerhetskopi gjenopprettet');
              } catch (err) {
                onToast(err instanceof Error ? err.message : 'Ugyldig fil');
              }
            })
          }
        >
          Gjenopprett
        </FilePick>
      </div>
      <Button
        variant="danger"
        className="mt-2 w-full"
        onClick={() => {
          if (confirm('Slette ALL data? Dette kan ikke angres.')) {
            resetAll();
            onToast('Alt er slettet');
          }
        }}
      >
        Slett all data
      </Button>
    </Card>
  );
}

function InstallHint() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return null;
  return (
    <Card>
      <CardTitle>Installer appen</CardTitle>
      <p className="text-sm text-ink-300">
        På iPhone: trykk <b>Del</b> <span aria-hidden>⎋</span> i Safari og velg <b>Legg til på Hjem-skjerm</b>. Da får du ikonet, fullskjerm og offline-støtte.
      </p>
    </Card>
  );
}
