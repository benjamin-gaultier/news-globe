import { COUNTRIES, type CountryCode } from '@news-globe/shared';
import { useEffect, useMemo, useState } from 'react';

const KEY = 'news-globe:recent';
const MAX = 5;

/** A shortcut: its country, and when it was last opened (a counter: higher is more recent). */
type Recent = [code: CountryCode, opened: number];

function read(): Recent[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    // A code no longer in COUNTRIES (or junk) is dropped rather than shown as a dead chip.
    return stored
      .filter((e): e is Recent => Array.isArray(e) && typeof e[0] === 'string' && COUNTRIES[e[0]] !== undefined && typeof e[1] === 'number')
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/**
 * The five countries opened most recently in this browser: the top bar's shortcuts. A new one goes
 * first; one already listed keeps its place, so the chips don't move under a click; when a sixth
 * comes in, the one opened longest ago leaves.
 */
export function useRecentCountries(opened: CountryCode | null): CountryCode[] {
  const [recent, setRecent] = useState(read);
  useEffect(() => {
    if (!opened) return;
    setRecent((list) => {
      const now = Math.max(0, ...list.map(([, at]) => at)) + 1;
      if (list.some(([code]) => code === opened)) return list.map((e) => (e[0] === opened ? [opened, now] : e));
      const next: Recent[] = [[opened, now], ...list];
      if (next.length <= MAX) return next;
      const stalest = next.reduce((a, b) => (b[1] < a[1] ? b : a));
      return next.filter((e) => e !== stalest);
    });
  }, [opened]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(recent));
    } catch {
      // Storage blocked (a private window, a preview): the shortcuts last as long as the page.
    }
  }, [recent]);
  return useMemo(() => recent.map(([code]) => code), [recent]);
}
