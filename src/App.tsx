import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppData, mergeHealth, requestPersistence, setActiveWorkout } from './lib/store';
import { analyze } from './lib/coach';
import { parseShortcutParams } from './lib/shortcutImport';
import { Dashboard } from './views/Dashboard';
import { WorkoutView, newWorkoutFromPlan } from './views/WorkoutView';
import { History } from './views/History';
import { Progress } from './views/Progress';
import { DataView } from './views/DataView';
import { Toast, cx } from './components/ui';
import { ChartIcon, DumbbellIcon, HomeIcon, LinkIcon, ListIcon } from './components/icons';

type Route = 'oversikt' | 'okt' | 'historikk' | 'fremgang' | 'data';

const TABS: Array<{ route: Route; label: string; Icon: typeof HomeIcon }> = [
  { route: 'oversikt', label: 'Oversikt', Icon: HomeIcon },
  { route: 'okt', label: 'Økt', Icon: DumbbellIcon },
  { route: 'historikk', label: 'Historikk', Icon: ListIcon },
  { route: 'fremgang', label: 'Fremgang', Icon: ChartIcon },
  { route: 'data', label: 'Data', Icon: LinkIcon },
];

function readRoute(): { route: Route | 'importer'; params: URLSearchParams } {
  const hash = location.hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = hash.split('?');
  const params = new URLSearchParams(query);
  if (path === 'importer') return { route: 'importer', params };
  const route = TABS.some((t) => t.route === path) ? (path as Route) : 'oversikt';
  return { route, params };
}

export function App() {
  const data = useAppData();
  const [route, setRoute] = useState<Route>(() => {
    const r = readRoute().route;
    return r === 'importer' ? 'oversikt' : r;
  });
  const [toast, setToast] = useState<string | null>(null);
  // Re-analyse when data changes, and at least every 10 minutes so "today" stays current.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 600000);
    return () => clearInterval(t);
  }, []);
  const analysis = useMemo(() => analyze(data), [data, tick]);

  const go = useCallback((r: string) => {
    location.hash = `#/${r}`;
  }, []);

  useEffect(() => {
    void requestPersistence();
    const onHash = (): void => {
      const { route: r, params } = readRoute();
      if (r === 'importer') {
        // Health values sent from the iOS Shortcut via "Open URL".
        const day = parseShortcutParams(params);
        if (day) {
          mergeHealth([day]);
          setToast('Helsedata fra snarveien er lagret ✅');
        } else setToast('Fant ingen gyldige helseverdier i lenken');
        history.replaceState(null, '', '#/oversikt');
        setRoute('oversikt');
        return;
      }
      setRoute(r);
      window.scrollTo(0, 0);
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  return (
    <div className="mx-auto min-h-dvh max-w-lg px-4 pt-[env(safe-area-inset-top)] pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
      <main className="pt-2">
        {route === 'oversikt' && (
          <Dashboard
            data={data}
            analysis={analysis}
            onGo={go}
            onStartPlan={() => {
              setActiveWorkout(newWorkoutFromPlan(analysis));
              go('okt');
            }}
          />
        )}
        {route === 'okt' && <WorkoutView data={data} analysis={analysis} onToast={setToast} />}
        {route === 'historikk' && <History workouts={data.workouts} />}
        {route === 'fremgang' && <Progress data={data} analysis={analysis} />}
        {route === 'data' && <DataView data={data} onToast={setToast} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/5 bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <ul className="mx-auto flex max-w-lg">
          {TABS.map(({ route: r, label, Icon }) => (
            <li key={r} className="flex-1">
              <a
                href={`#/${r}`}
                className={cx('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', route === r ? 'text-accent-400' : 'text-ink-400')}
                aria-current={route === r ? 'page' : undefined}
              >
                <span className="relative">
                  <Icon className="size-6" />
                  {r === 'okt' && data.activeWorkout ? <span className="absolute -top-0.5 -right-1 size-2.5 rounded-full bg-accent-500 ring-2 ring-ink-900" /> : null}
                </span>
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
