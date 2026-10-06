import Parser from 'rss-parser';
import { INGEST_SETTINGS, type SourceConfig } from '../sources.config';
import { cleanDescription, cleanTitle } from '../normalize/text';
import type { AdapterContext, FetchResult, RawItem, SourceAdapter } from './types';

interface MediaNode {
  $?: { url?: string; medium?: string; type?: string; width?: string };
}

interface CustomItem {
  mediaContent?: MediaNode[];
  mediaThumbnail?: MediaNode[];
  description?: string;
}

const parser = new Parser<Record<string, never>, CustomItem>({
  customFields: {
    item: [
      ['media:content', 'mediaContent', { keepArray: true }],
      ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
      'description',
    ],
  },
});

type ParsedItem = Parser.Item & CustomItem;

function isImage(node: MediaNode): boolean {
  const { medium, type, url } = node.$ ?? {};
  if (medium) return medium === 'image';
  if (type) return type.startsWith('image/');
  return !!url && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url);
}

function pickImage(item: ParsedItem): string | null {
  const media = [...(item.mediaContent ?? []), ...(item.mediaThumbnail ?? [])].filter(isImage);
  // Prefer the widest rendition when widths are given.
  media.sort((a, b) => Number(b.$?.width ?? 0) - Number(a.$?.width ?? 0));
  const fromMedia = media[0]?.$?.url;
  if (fromMedia) return fromMedia;
  if (item.enclosure?.url && (item.enclosure.type ?? '').startsWith('image/')) return item.enclosure.url;
  const html = item.content ?? item.description ?? '';
  return /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
}

function toIso(item: ParsedItem): string | null {
  const raw = item.isoDate ?? item.pubDate;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function absoluteHttpUrl(value: string | undefined, base: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Parse a feed body into metadata-only items. Exported for tests. */
export async function parseFeed(body: string, feedUrl: string): Promise<RawItem[]> {
  const feed = await parser.parseString(body);
  const items: RawItem[] = [];
  for (const item of feed.items as ParsedItem[]) {
    const url = absoluteHttpUrl(item.link ?? item.guid, feedUrl);
    const title = item.title ? cleanTitle(item.title) : '';
    if (!url || !title) continue;
    // Prefer the feed's own summary; never fall back to content:encoded, which can be the full article.
    const snippet = item.description ?? item.summary ?? item.contentSnippet;
    const image = pickImage(item);
    items.push({
      title,
      url,
      description: cleanDescription(snippet, INGEST_SETTINGS.descriptionMaxChars),
      publishedAt: toIso(item),
      imageUrl: image ? absoluteHttpUrl(image, url) : null,
    });
  }
  return items;
}

export const rssAdapter: SourceAdapter = {
  type: 'rss',
  async fetch(source: SourceConfig, ctx: AdapterContext): Promise<FetchResult[]> {
    const results: FetchResult[] = [];
    for (const feedUrl of source.feedUrls) {
      const res = await ctx.http.getItems(feedUrl, (body) => parseFeed(body, feedUrl));
      const detail = res.error ? ` (${res.error})` : '';
      ctx.log(`  ${source.id.padEnd(12)} ${res.outcome.padEnd(12)} ${String(res.items.length).padStart(3)} items  ${feedUrl}${detail}`);
      if (res.retrievedAt) results.push({ items: res.items, retrievedAt: res.retrievedAt });
    }
    return results;
  },
};
