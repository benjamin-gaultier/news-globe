import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Matches the CSS breakpoint where the side panel becomes a bottom sheet. */
export const MOBILE_QUERY = '(max-width: 767px)';

/** The user asked for less motion: no spinning globe, no pulsing rings. */
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
