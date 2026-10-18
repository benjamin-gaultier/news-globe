import { useEffect, useRef } from 'react';
import { formatRoute, parseRoute, type Route } from '../lib/route';

/**
 * Keeps the URL hash in step with `route`, so the view can be shared and Back
 * closes it, and calls `onPop` with the route of an entry reached by Back or
 * Forward.
 *
 * The same view and day (a link written differently, or another run picked on
 * the timeline) replaces the entry, so Back skips slider moves.
 */
export function useHashRoute(route: Route, onPop: (route: Route) => void): void {
  const hash = formatRoute(route);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the hash covers every part of the route.
  useEffect(() => {
    if (location.hash === hash) return;
    const url = hash || location.pathname + location.search;
    if (sameView(parseRoute(location.hash), route)) history.replaceState(null, '', url);
    else history.pushState(null, '', url);
  }, [hash]);

  const popped = useRef(onPop);
  popped.current = onPop;
  useEffect(() => {
    const onPopState = () => popped.current(parseRoute(location.hash));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
}

function sameView(a: Route, b: Route): boolean {
  return (
    a.country === b.country &&
    a.region === b.region &&
    a.world === b.world &&
    a.story === b.story &&
    (a.category ?? 'top') === (b.category ?? 'top') &&
    !!a.today === !!b.today &&
    (a.at?.slice(0, 10) ?? null) === (b.at?.slice(0, 10) ?? null)
  );
}
