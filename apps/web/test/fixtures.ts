import { SCHEMA_VERSION, type Article, type CountryFile, type StoryCluster } from '@news-globe/shared';

export const NOW = Date.parse('2026-10-08T12:00:00Z');
export const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

let n = 0;

export function article(extra: Partial<Article> = {}): Article {
  n += 1;
  return {
    id: `a${n}`,
    url: `https://outlet.example/${n}`,
    canonicalUrl: `https://outlet.example/${n}`,
    title: `Headline ${n}`,
    description: null,
    source: { id: 'lemonde', name: 'Le Monde' },
    sourceCountry: 'FR',
    language: 'fr',
    publishedAt: minutesAgo(5),
    imageUrl: null,
    countryCode: 'FR',
    regionCode: null,
    ...extra,
  };
}

export function cluster(representative: Article, related: Article[] = [], extra: Partial<StoryCluster> = {}): StoryCluster {
  return {
    id: representative.id,
    representative,
    related,
    outletCount24h: 1 + related.length,
    outletCount: 1 + related.length,
    latestPublishedAt: representative.publishedAt,
    ...extra,
  };
}

export function countryFile(clusters: StoryCluster[], extra: Partial<CountryFile> = {}): CountryFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    countryCode: 'FR',
    countryName: 'France',
    updatedAt: minutesAgo(10),
    clusters,
    ...extra,
  };
}
