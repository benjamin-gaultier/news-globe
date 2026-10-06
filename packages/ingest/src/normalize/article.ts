import type { Article } from '@news-globe/shared';
import type { RawItem } from '../adapters/types';
import type { SourceConfig } from '../sources.config';
import { articleId, canonicalizeUrl, dateFromUrl } from './url';

/**
 * Turn a raw feed item into an Article. Items without a date take the date in
 * their URL if there is one (e.g. Sky TG24), else the time the feed was
 * retrieved; dates in the future are clamped to `now`.
 */
export function toArticle(item: RawItem, source: SourceConfig, retrievedAt: string, now: number): Article {
  const canonicalUrl = canonicalizeUrl(item.url);
  const published = Math.min(Date.parse(item.publishedAt ?? dateFromUrl(item.url) ?? retrievedAt), now);
  return {
    id: articleId(canonicalUrl),
    url: item.url,
    canonicalUrl,
    title: item.title,
    description: item.description,
    source: { id: source.id, name: source.name },
    sourceCountry: source.country,
    language: source.language,
    publishedAt: new Date(published).toISOString(),
    imageUrl: item.imageUrl,
    countryCode: source.country,
    regionCode: null,
  };
}

/** Exact dedupe on canonical URL; the first occurrence wins. */
export function dedupeByCanonicalUrl(articles: Article[]): Article[] {
  const seen = new Set<string>();
  return articles.filter((a) => {
    if (seen.has(a.canonicalUrl)) return false;
    seen.add(a.canonicalUrl);
    return true;
  });
}
