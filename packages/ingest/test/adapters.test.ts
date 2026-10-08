import { describe, expect, it, vi } from 'vitest';
import { adapterFor, type RawItem } from '../src/adapters';
import type { CachedFetchResult, HttpCache } from '../src/http';
import type { SourceConfig } from '../src/sources.config';

const source = (type: SourceConfig['type'], feedUrls: string[]): SourceConfig => ({
  id: 'outlet',
  name: 'Outlet',
  type,
  country: 'FR',
  language: 'fr',
  feedUrls,
  authority: 1,
});

const items: RawItem[] = [{ title: 'T', url: 'https://outlet.example/1', description: null, publishedAt: null, imageUrl: null }];

/** An HttpCache stand-in answering each feed URL with a canned result. */
function fakeHttp(results: Record<string, CachedFetchResult>) {
  return { getItems: vi.fn(async (url: string) => results[url]!) } as unknown as HttpCache & { getItems: ReturnType<typeof vi.fn> };
}

describe('rss adapter', () => {
  it('fetches every feed of an outlet and skips those never retrieved', async () => {
    const http = fakeHttp({
      'https://a/rss': { outcome: 'fetched', items, retrievedAt: '2026-10-08T10:00:00.000Z' },
      'https://b/rss': { outcome: 'error', items: [], error: 'HTTP 500' },
      'https://c/rss': { outcome: 'throttled', items, retrievedAt: '2026-10-08T09:45:00.000Z' },
    });
    const log = vi.fn();
    const outlet = source('rss', ['https://a/rss', 'https://b/rss', 'https://c/rss']);

    const results = await adapterFor(outlet).fetch(outlet, { http, log });

    expect(http.getItems.mock.calls.map(([url]) => url)).toEqual(['https://a/rss', 'https://b/rss', 'https://c/rss']);
    expect(results).toEqual([
      { items, retrievedAt: '2026-10-08T10:00:00.000Z' },
      { items, retrievedAt: '2026-10-08T09:45:00.000Z' },
    ]);
    expect(log).toHaveBeenCalledTimes(3);
    expect(log.mock.calls[1]![0]).toMatch(/outlet\s+error\s+0 items {2}https:\/\/b\/rss \(HTTP 500\)$/);
  });
});

describe('gdelt adapter', () => {
  it('is a stub that fetches nothing', async () => {
    const http = fakeHttp({});
    const log = vi.fn();
    const outlet = source('gdelt', []);
    expect(await adapterFor(outlet).fetch(outlet, { http, log })).toEqual([]);
    expect(http.getItems).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('not implemented'));
  });
});
