import type { SourceConfig } from '../sources.config';
import { gdeltAdapter } from './gdelt';
import { rssAdapter } from './rss';
import type { SourceAdapter } from './types';

const ADAPTERS: Record<SourceConfig['type'], SourceAdapter> = {
  rss: rssAdapter,
  gdelt: gdeltAdapter,
};

export function adapterFor(source: SourceConfig): SourceAdapter {
  return ADAPTERS[source.type];
}

export type { RawItem, SourceAdapter, FetchResult, AdapterContext } from './types';
