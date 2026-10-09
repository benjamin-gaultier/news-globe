import type { ArchiveDay } from '@news-globe/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchArchive } from '../lib/data';
import { entriesAt, runTimes, shiftDate, todayUtc } from '../lib/history';
import { runForAt, runToAt } from '../lib/route';
import { useAsync } from './useAsync';

export type HistoryStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * History mode: the UTC day shown and the run picked on its timeline (null
 * date is live). A day opens on the run a link or Back/Forward asked for
 * (`at`), else its latest, and stays on it as later runs arrive.
 */
export function useHistoryMode(initialAt: string | null, today: string, indexTick: number) {
  const [date, setDate] = useState<string | null>(initialAt?.slice(0, 10) ?? null);
  const [run, setRun] = useState<string | null>(null);
  // The `at` asked for, until its day has loaded and the run is picked.
  const [wantedAt, setWantedAt] = useState<string | null>(initialAt);

  // Today's file grows every run, so it is re-read with the index.
  const archive = useAsync(date ? (signal) => fetchArchive(date, signal) : null, [date, date === today ? indexTick : 0]);
  // Right after the day changes, the loader still holds the previous day for one render: ignore it.
  const day: ArchiveDay | undefined = archive.status === 'ready' && archive.data?.date === date ? archive.data : undefined;
  const runs = useMemo(() => (day ? runTimes(day) : []), [day]);
  useEffect(() => {
    if (!runs.length || (run && runs.includes(run))) return;
    setRun(wantedAt ? runForAt(runs, wantedAt) : runs.at(-1)!);
    setWantedAt(null);
  }, [runs, run, wantedAt]);
  const entries = useMemo(() => (day && run && day.runs[run] ? entriesAt(day, run) : null), [day, run]);

  // The URL's `at` names the day until a run is picked, then the run.
  const runOfDay = date && run?.startsWith(date) ? run : null;
  const at = date ? (runOfDay ? runToAt(runOfDay) : (wantedAt ?? date)) : null;
  const status: HistoryStatus =
    archive.status === 'error' ? 'error' : archive.status === 'ready' ? (archive.data ? 'ready' : 'empty') : 'loading';

  /** History at a link's or Back/Forward's `at`, or live for null. */
  const goTo = useCallback((next: string | null) => {
    setWantedAt(next);
    setDate(next?.slice(0, 10) ?? null);
    setRun(null);
  }, []);
  const open = useCallback(() => goTo(todayUtc()), [goTo]);
  const close = useCallback(() => goTo(null), [goTo]);
  const shiftDay = useCallback((days: number) => {
    setWantedAt(null);
    setRun(null);
    setDate((d) => (d ? shiftDate(d, days) : d));
  }, []);

  return { date, run, runOfDay, at, day, runs, entries, status, open, close, shiftDay, pickRun: setRun, goTo };
}
