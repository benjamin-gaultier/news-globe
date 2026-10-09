import { COUNTRIES, type CountryCode, type IndexEntry, type TrendsFile } from '@news-globe/shared';

/**
 * How big a place's top story is, as one of five steps: the number of outlets
 * that covered it in the last 24 h, with 5 or more in the top step.
 */
export const HEAT_STEPS = ['≤1', '2', '3', '4', '5+'] as const;

/**
 * Countries on the globe, from the usual blue to near-white. Most countries' top story has
 * one outlet (about 3 in 4 on a real run), so the first step stays close to the old flat blue
 * and only the busier ones light up.
 */
export const COUNTRY_HEAT = ['#2f86d6', '#52b2ff', '#8ccdff', '#bfe4ff', '#eef8ff'] as const;

/** Regions of the open country, in the selection's amber. */
export const REGION_HEAT = ['#d98f2e', '#ffb547', '#ffcb7d', '#ffdfad', '#fff3de'] as const;

/** Step (0–4) for an outlet count. A missing count (an older index) gets the first step, so the globe is evenly blue. */
export function heatStep(outlets: number | undefined): number {
  if (outlets === undefined) return 0;
  return Math.min(Math.max(Math.floor(outlets), 1), 5) - 1;
}

/** The globe's other shading: how many of a place's top 5 stories are new or rising this hour. */
export const CHANGE_STEPS = ['0', '1', '2', '3', '4+'] as const;

/** Step (0–4) for a change count. */
export const changeStep = (count: number) => Math.min(Math.max(Math.floor(count), 0), 4);

/** A country whose #1 story is new or rising this hour: drawn as a pulsing ring on the globe. */
export interface Pulse {
  code: CountryCode;
  lat: number;
  lng: number;
  state: 'new' | 'rising';
  /** Outlets on that story in the last 24 h. */
  outlets: number;
}

/** A new #1 covered by fewer outlets than this is too small to pulse. */
export const PULSE_MIN_OUTLETS = 2;
/** At most this many pulses, the best-covered first, so the globe doesn't flicker all over. */
export const PULSE_MAX = 10;

/** Countries whose top story is new or rising in the latest run, best-covered first. */
export function pulsesFrom(trends: TrendsFile, entries: ReadonlyMap<string, IndexEntry>): Pulse[] {
  const out: Pulse[] = [];
  for (const [code, clusters] of Object.entries(trends.units)) {
    const meta = COUNTRIES[code];
    if (!meta) continue; // regions don't pulse
    const top = Object.values(clusters).find((t) => t.ranks.at(-1) === 1);
    const outlets = entries.get(code)?.topOutlets ?? 0;
    if (!top?.state || outlets < PULSE_MIN_OUTLETS) continue;
    out.push({ code: meta.code, lat: meta.lat, lng: meta.lng, state: top.state, outlets });
  }
  return out.sort((a, b) => b.outlets - a.outlets || a.code.localeCompare(b.code)).slice(0, PULSE_MAX);
}
