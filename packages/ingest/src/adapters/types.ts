import type { SourceConfig } from '../sources.config';
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
  items: RawItem[];
  /** When the items were last actually retrieved from the network. */
  retrievedAt: string;
}

export interface AdapterContext {
  http: HttpCache;
  log: (msg: string) => void;
}

/**
 * A kind of news source (RSS, GDELT, …). Add a new type by implementing this
 * interface and registering it in `adapters/index.ts`.
 */
export interface SourceAdapter {
  readonly type: SourceConfig['type'];
  /** Fetch current items for one configured source. Should not throw for a single bad feed. */
  fetch(source: SourceConfig, ctx: AdapterContext): Promise<FetchResult[]>;
}
