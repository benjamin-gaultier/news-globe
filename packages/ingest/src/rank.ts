import type { Article, StoryCluster } from '@news-globe/shared';

const HOUR_MS = 3_600_000;

const time = (a: Article) => Date.parse(a.publishedAt);

/** Highest authority wins; ties go to whoever published first. */
export function pickRepresentative(articles: Article[], authorityOf: (sourceId: string) => number): Article {
  const sorted = [...articles].sort(
    (a, b) =>
      authorityOf(b.source.id) - authorityOf(a.source.id) || time(a) - time(b) || a.id.localeCompare(b.id),
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
