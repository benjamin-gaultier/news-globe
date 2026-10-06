import type { Article } from '@news-globe/shared';

let n = 0;

/** Build a test Article with sensible defaults. */
export function article(sourceId: string, title: string, publishedAt: string, extra: Partial<Article> = {}): Article {
  n += 1;
  const url = `https://${sourceId}.example/${n}`;
  return {
    id: `id${n}`,
    url,
    canonicalUrl: url,
    title,
    description: null,
    source: { id: sourceId, name: sourceId },
    sourceCountry: 'FR',
    language: 'fr',
    publishedAt,
    imageUrl: null,
    countryCode: 'FR',
    regionCode: null,
    ...extra,
  };
}
