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

const customFields = {
  item: [
    ['media:content', 'mediaContent', { keepArray: true }],
    ['media:thumbnail', 'mediaThumbnail', { keepArray: true }],
    'description',
  ] as Parser.CustomFieldItem<CustomItem>[],
};
const parser = new Parser<Record<string, never>, CustomItem>({ customFields });
// Last resort for malformed feeds (attributes without values, stray markup):
// sax's loose mode, which uppercases names, so they are lowercased back (and
// pubDate, the one camel-case tag rss-parser reads, restored).
const lower = (name: string) => name.toLowerCase();
const looseParser = new Parser<Record<string, never>, CustomItem>({
  customFields,
  xml2js: {
    strict: false,
    tagNameProcessors: [(name: string) => (lower(name) === 'pubdate' ? 'pubDate' : lower(name))],
    attrNameProcessors: [lower],
  },
});

/**
 * Cheap repairs for the most common breakage: anything before the first tag
 * (BOM, whitespace, PHP notices) and bare `&` that isn't an entity.
 */
function repairXml(body: string): string {
  const start = body.indexOf('<');
  return (start > 0 ? body.slice(start) : body).replace(/&(?!(?:[a-zA-Z][\w.-]*|#\d+|#x[\da-fA-F]+);)/g, '&amp;');
}

const PARSE_TIMEOUT_MS = 10_000;

/**
 * xml2js can drop its callback on some inputs, leaving the promise pending
 * forever; with nothing else scheduled, Node then exits mid-run (code 13)
 * without saving anything. The timer keeps the process alive and turns that
 * into an ordinary feed error.
 */
function withTimeout<T>(promise: Promise<T>, ms = PARSE_TIMEOUT_MS): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`feed parse did not finish within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
/** Strict parse, then repaired, then loose. Throws the strict error if all fail. */
async function parseFeedXml(body: string) {
  try {
    return await withTimeout(parser.parseString(body));
  } catch (strictError) {
    const repaired = repairXml(body);
    try {
      return await withTimeout(parser.parseString(repaired));
    } catch {
      try {
        return await withTimeout(looseParser.parseString(repaired));
      } catch {
        throw strictError;
      }
    }
  }
}

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

/** Text of the first `<tag>` in `xml`, CDATA unwrapped. */
function tagText(xml: string, tag: string): string | undefined {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`).exec(xml);
  return m?.[1]?.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

/**
 * Google News sitemap (`<urlset>` with `<news:news>` entries), which some
 * outlets publish instead of RSS (Kuwait Times, Arab Times). Entries have a
 * title and publication date but no summary.
 */
export function parseNewsSitemap(body: string, feedUrl: string): RawItem[] {
  const items: RawItem[] = [];
  for (const [, entry = ''] of body.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const url = absoluteHttpUrl(tagText(entry, 'loc'), feedUrl);
    const title = cleanTitle(tagText(entry, 'news:title') ?? '');
    if (!url || !title) continue;
    const t = Date.parse(tagText(entry, 'news:publication_date') ?? '');
    const image = tagText(entry, 'image:loc');
    items.push({
      title,
      url,
      description: null,
      publishedAt: Number.isNaN(t) ? null : new Date(t).toISOString(),
      imageUrl: image ? absoluteHttpUrl(image, url) : null,
    });
  }
  return items;
}

/** Parse a feed body (RSS, Atom or a news sitemap) into metadata-only items. Exported for tests. */
export async function parseFeed(body: string, feedUrl: string): Promise<RawItem[]> {
  if (/<urlset[^>]*sitemap-news/.test(body.slice(0, 2000))) return parseNewsSitemap(body, feedUrl);
  const feed = await parseFeedXml(body);
  const items: RawItem[] = [];
  for (const item of feed.items as ParsedItem[]) {
    const url = absoluteHttpUrl(item.link ?? item.guid, feedUrl);
    // Loose parses can turn unescaped HTML into child elements: only take strings.
    const title = typeof item.title === 'string' ? cleanTitle(item.title) : '';
    if (!url || !title) continue;
    // Prefer the feed's own summary; never fall back to content:encoded, which can be the full article.
    const snippet = [item.description, item.summary, item.contentSnippet].find((v) => typeof v === 'string');
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
