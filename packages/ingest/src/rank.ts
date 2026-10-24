import type { Article, StoryCluster } from '@news-globe/shared';

const HOUR_MS = 3_600_000;

const time = (a: Article) => Date.parse(a.publishedAt);

/** Highest authority wins; ties go to whoever published first. */
export function pickRepresentative(articles: Article[], authorityOf: (sourceId: string) => number): Article {
  const sorted = [...articles].sort(
    (a, b) => authorityOf(b.source.id) - authorityOf(a.source.id) || time(a) - time(b) || a.id.localeCompare(b.id),
  );
  return sorted[0]!;
}

export function buildCluster(
  articles: Article[],
  authorityOf: (sourceId: string) => number,
  now: number,
  windowHours: number,
): StoryCluster {
  if (articles.length === 0) throw new Error('buildCluster: empty cluster');
  const representative = pickRepresentative(articles, authorityOf);

  // One article per other outlet: its most recent take on the story.
  const byOutlet = new Map<string, Article>();
  for (const a of articles) {
    if (a.source.id === representative.source.id) continue;
    const prev = byOutlet.get(a.source.id);
    if (!prev || time(a) > time(prev)) byOutlet.set(a.source.id, a);
  }
  const related = [...byOutlet.values()].sort((a, b) => time(b) - time(a));

  const windowStart = now - windowHours * HOUR_MS;
  const recentOutlets = new Set(articles.filter((a) => time(a) >= windowStart).map((a) => a.source.id));
  const latest = Math.max(...articles.map(time));

  return {
    id: representative.id,
    representative,
    related,
    outletCount24h: recentOutlets.size,
    outletCount: new Set(articles.map((a) => a.source.id)).size,
    latestPublishedAt: new Date(latest).toISOString(),
  };
}

/**
 * Most distinct outlets in the window first, then most recent. Single-outlet
 * stories are capped at `maxSoloPerOutlet` per outlet, so one prolific feed
 * can't fill the list with its latest posts; the overflow fills any slots left.
 */
export function rankClusters(clusters: StoryCluster[], limit: number, maxSoloPerOutlet = Infinity): StoryCluster[] {
  const sorted = [...clusters].sort(
    (a, b) =>
      b.outletCount24h - a.outletCount24h ||
      Date.parse(b.latestPublishedAt) - Date.parse(a.latestPublishedAt) ||
      b.outletCount - a.outletCount ||
      a.id.localeCompare(b.id),
  );
  const picked: StoryCluster[] = [];
  const overflow: StoryCluster[] = [];
  const solo = new Map<string, number>();
  for (const c of sorted) {
    if (picked.length >= limit) break;
    if (c.outletCount24h <= 1) {
      const outlet = c.representative.source.id;
      const n = solo.get(outlet) ?? 0;
      if (n >= maxSoloPerOutlet) {
        overflow.push(c);
        continue;
      }
      solo.set(outlet, n + 1);
    }
    picked.push(c);
  }
  return [...picked, ...overflow].slice(0, limit);
}

/**
 * Pseudo-outlets added to every country's pool in `coverage`. A country with few
 * feeds gives little evidence that its press agrees on a story, so its share is
 * pulled down: 2 of 2 outlets scores 0.5 and 8 of 8 scores 0.88, not both 1.
 */
export const COVERAGE_PRIOR = 1;

/** Three decimals of coverage are plenty to rank by, and keep the files small. */
export const round3 = (x: number) => Math.round(x * 1000) / 1000;

/**
 * How much of a country's press covers a story, 0–1: the share of its *other*
 * outlets (beyond the first) that carry it, with COVERAGE_PRIOR added to the pool.
 * Stories from different countries are compared by this rather than by outlets,
 * which would favour the countries with the most feeds: with 8 feeds a story can
 * reach 8 outlets, with 2 never more than 2. A story from one outlet scores 0
 * whatever the pool, since nothing corroborates it.
 *
 * `pool` is the country's outlets with top-headline feeds (see `outletPools`);
 * a count above it (the config changed under a published file) widens it.
 */
export function coverage(outlets: number, pool: number): number {
  const size = Math.max(pool, outlets);
  if (outlets <= 1 || size <= 1) return 0;
  return (outlets - 1) / (size - 1 + COVERAGE_PRIOR);
}
