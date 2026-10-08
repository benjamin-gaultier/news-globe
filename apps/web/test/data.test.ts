import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARCHIVE_SCHEMA_VERSION, SCHEMA_VERSION } from '@news-globe/shared';
import { DATA_BASE_URL, fetchArchive, fetchCountry, fetchIndex, fetchRegion } from '../src/lib/data';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const requested = () => fetchMock.mock.calls.map(([url]) => url);

describe('data', () => {
  it('defaults to the same-origin /data/ path', () => {
    expect(DATA_BASE_URL).toBe('/data');
  });

  it('loads the index, revalidating and passing the abort signal through', async () => {
    const index = { schemaVersion: SCHEMA_VERSION, updatedAt: 'now', countries: [] };
    fetchMock.mockResolvedValueOnce(json(index));
    const signal = new AbortController().signal;

    expect(await fetchIndex(signal)).toEqual(index);
    expect(fetchMock).toHaveBeenCalledWith('/data/index.json', { signal, cache: 'no-cache' });
  });

  it('loads country and region files by code, URL-encoded', async () => {
    fetchMock.mockImplementation(async () => json({ schemaVersion: SCHEMA_VERSION }));
    await fetchCountry('FR');
    await fetchRegion('FR-BRE');
    await fetchCountry('../x');
    expect(requested()).toEqual(['/data/countries/FR.json', '/data/regions/FR-BRE.json', '/data/countries/..%2Fx.json']);
  });

  it('fails on an HTTP error', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 503 }));
    await expect(fetchCountry('FR')).rejects.toThrow("Couldn't load countries/FR.json (HTTP 503)");
  });

  it('refuses a file written for another schema version', async () => {
    fetchMock.mockResolvedValueOnce(json({ schemaVersion: SCHEMA_VERSION + 1 }));
    await expect(fetchIndex()).rejects.toThrow(`Unsupported data version ${SCHEMA_VERSION + 1} (expected ${SCHEMA_VERSION})`);
  });

  describe('fetchArchive', () => {
    it('loads one day of history', async () => {
      const day = { schemaVersion: ARCHIVE_SCHEMA_VERSION, date: '2026-10-07' };
      fetchMock.mockResolvedValueOnce(json(day));
      expect(await fetchArchive('2026-10-07')).toEqual(day);
      expect(requested()).toEqual(['/data/archive/2026-10-07.json']);
    });

    it('returns null for a day that was never archived', async () => {
      fetchMock.mockResolvedValueOnce(new Response('Not found', { status: 404 }));
      expect(await fetchArchive('2020-01-01')).toBeNull();
    });

    it('fails on other HTTP errors and on another schema version', async () => {
      fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
      await expect(fetchArchive('2026-10-07')).rejects.toThrow("Couldn't load the history for 2026-10-07 (HTTP 500)");
      fetchMock.mockResolvedValueOnce(json({ schemaVersion: ARCHIVE_SCHEMA_VERSION + 1 }));
      await expect(fetchArchive('2026-10-07')).rejects.toThrow('Unsupported history version');
    });
  });
});
