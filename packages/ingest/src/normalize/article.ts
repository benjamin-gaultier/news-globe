import type { Article } from '@news-globe/shared';
import type { RawItem } from '../adapters/types';
import type { SourceConfig } from '../sources.config';
import { decodeEntities } from './text';
import { articleId, canonicalizeUrl, dateFromUrl } from './url';

/**
 * Turn a raw feed item into an Article. Items without a date take the date in
 * their URL if there is one (e.g. Sky TG24), else the time the feed was
 * retrieved; dates in the future are clamped to `now`. Titles and descriptions are
 * decoded again for feeds that escape them twice (Thanh Niên's "&aacute;"), which also fixes
 * items cached before the decoder knew those entities.
 */
export function toArticle(item: RawItem, source: SourceConfig, retrievedAt: string, now: number): Article {
  const canonicalUrl = canonicalizeUrl(item.url);
  const published = Math.min(Date.parse(item.publishedAt ?? dateFromUrl(item.url) ?? retrievedAt), now);
  return {
    id: articleId(canonicalUrl),
    url: item.url,
    canonicalUrl,
    title: decodeEntities(item.title),
    description: item.description && decodeEntities(item.description),
    source: { id: source.id, name: source.name },
    sourceCountry: source.country,
    language: source.language,
    publishedAt: new Date(published).toISOString(),
    imageUrl: item.imageUrl,
    countryCode: source.country,
    regionCode: source.region ?? null,
  };
}

/**
 * A title with U+FFFD replacement characters was decoded with the wrong charset
 * (e.g. cached before feeds were decoded by their declared charset); skip it
 * rather than show mojibake.
 */
export function isMisdecoded(title: string): boolean {
  return title.includes('�');
}

/**
 * A title that is an unrendered CMS template, e.g. the EBRA papers' (L'Alsace,
 * L'Est Républicain) "Vidéo. $content.TitleNoTags": identical across outlets,
 * so it would otherwise cluster into a top story.
 */
export function isUnrenderedTemplate(title: string): boolean {
  return /\$[A-Za-z_]+\.[A-Za-z_]+|\{\{[^}]*\}\}/.test(title);
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
