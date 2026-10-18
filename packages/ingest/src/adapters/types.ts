import type { Category, SourceConfig } from '../sources.config';
import type { HttpCache } from '../http';

/**
 * One item as extracted from a source, before normalization. Only metadata:
 * adapters must never keep full article text (descriptions are already
 * stripped and truncated here, so nothing longer ever reaches the cache).
 */
export interface RawItem {
  title: string;
  url: string;
  description: string | null;
  /** ISO 8601, or null if the source gave no usable date. */
  publishedAt: string | null;
  imageUrl: string | null;
}

export interface FetchResult {
  /** The category of the feed the items came from: it decides the file they go to. */
  category: Category;
  items: RawItem[];
  /** When the items were last actually retrieved from the network. */
  retrievedAt: string;
}

export interface AdapterContext {
  http: HttpCache;
  /** Categories whose feeds to fetch (the run's; see FETCHED_CATEGORIES). */
  categories: readonly Category[];
  log: (msg: string) => void;
}

/**
 * A kind of news source (only RSS so far). Add a new type by implementing this
 * interface and registering it in `adapters/index.ts`.
 */
export interface SourceAdapter {
  readonly type: SourceConfig['type'];
  /** Fetch current items from one configured source's feeds in `ctx.categories`. Should not throw for a single bad feed. */
  fetch(source: SourceConfig, ctx: AdapterContext): Promise<FetchResult[]>;
}
