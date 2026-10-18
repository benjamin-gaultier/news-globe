import type { CountryCode } from '@news-globe/shared';
import { useEffect, useState } from 'react';

const KEY = 'news-globe:recent';
const MAX = 5;

function read(): CountryCode[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((c): c is CountryCode => typeof c === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/**
 * The last few countries opened in this browser, newest first: the top bar's shortcuts.
 * Opening one already listed keeps its place, so the chips don't move under a click.
 */
export function useRecentCountries(opened: CountryCode | null): CountryCode[] {
  const [recent, setRecent] = useState(read);
  useEffect(() => {
    if (opened) setRecent((list) => (list.includes(opened) ? list : [opened, ...list].slice(0, MAX)));
  }, [opened]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(recent));
    } catch {
      // Storage blocked (a private window, a preview): the shortcuts last as long as the page.
    }
  }, [recent]);
  return recent;
}
