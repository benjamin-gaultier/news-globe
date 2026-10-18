import { describe, expect, it, vi } from 'vitest';
import { adapterFor, type RawItem } from '../src/adapters';
import type { CachedFetchResult, HttpCache } from '../src/http';
import type { SourceConfig } from '../src/sources.config';

const source = (type: SourceConfig['type'], feeds: SourceConfig['feeds']): SourceConfig => ({
  id: 'outlet',
  name: 'Outlet',
  type,
  country: 'FR',
  language: 'fr',
  feeds,
  authority: 1,
});

const items: RawItem[] = [{ title: 'T', url: 'https://outlet.example/1', description: null, publishedAt: null, imageUrl: null }];

/** An HttpCache stand-in answering each feed URL with a canned result. */
function fakeHttp(results: Record<string, CachedFetchResult>) {
  return { getItems: vi.fn(async (url: string) => results[url]!) } as unknown as HttpCache & { getItems: ReturnType<typeof vi.fn> };
}

describe('rss adapter', () => {
  it('fetches an outlet’s feeds in the given categories, tagged with theirs, and skips those never retrieved', async () => {
    const http = fakeHttp({
      'https://a/rss': { outcome: 'fetched', items, retrievedAt: '2026-10-08T10:00:00.000Z' },
      'https://b/rss': { outcome: 'error', items: [], error: 'HTTP 500' },
      'https://c/rss': { outcome: 'throttled', items, retrievedAt: '2026-10-08T09:45:00.000Z' },
      'https://sport/rss': { outcome: 'fetched', items, retrievedAt: '2026-10-08T10:00:00.000Z' },
    });
    const log = vi.fn();
    // Listed out of category order: requests still go top first. Business isn't asked for.
    const outlet = source('rss', {
      sport: ['https://sport/rss'],
      business: ['https://business/rss'],
      top: ['https://a/rss', 'https://b/rss', 'https://c/rss'],
    });

    const results = await adapterFor(outlet).fetch(outlet, { http, categories: ['top', 'sport'], log });

    expect(http.getItems.mock.calls.map(([url]) => url)).toEqual(['https://a/rss', 'https://b/rss', 'https://c/rss', 'https://sport/rss']);
    expect(results).toEqual([
      { category: 'top', items, retrievedAt: '2026-10-08T10:00:00.000Z' },
      { category: 'top', items, retrievedAt: '2026-10-08T09:45:00.000Z' },
      { category: 'sport', items, retrievedAt: '2026-10-08T10:00:00.000Z' },
    ]);
    expect(log).toHaveBeenCalledTimes(4);
    expect(log.mock.calls[1]![0]).toMatch(/outlet\s+error\s+0 items {2}https:\/\/b\/rss \(HTTP 500\)$/);
  });
});
