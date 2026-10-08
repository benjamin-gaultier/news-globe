import type { Page } from '@playwright/test';
import { COUNTRIES, REGIONS, SCHEMA_VERSION, type CountryFile, type IndexEntry, type IndexFile } from '@news-globe/shared';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export interface Scenario {
  /** Countries with headlines, and the outlets on each one's top story. */
  countries: Record<string, number>;
  /** Regions with headlines. */
  regions?: string[];
}

export const topTitle = (code: string) => `Top story in ${COUNTRIES[code]?.name ?? REGIONS[code]?.name ?? code}`;

function entry(code: string, topOutlets: number): IndexEntry {
  const name = COUNTRIES[code]?.name ?? REGIONS[code]!.name;
  return { code, name, updatedAt: ago(10), clusterCount: 1, topTitle: topTitle(code), topOutlets };
}

function file(code: string): CountryFile {
  const region = REGIONS[code];
  const country = region?.country ?? code;
  const url = `https://news.example/${code}`;
  return {
    schemaVersion: SCHEMA_VERSION,
    countryCode: country,
    countryName: COUNTRIES[country]!.name,
    ...(region && { regionCode: code, regionName: region.name }),
    updatedAt: ago(10),
    clusters: [
      {
        id: code,
        representative: {
          id: code,
          url,
          canonicalUrl: url,
          title: topTitle(code),
          description: null,
          source: { id: 'outlet', name: 'Outlet' },
          sourceCountry: country,
          language: 'en',
          publishedAt: ago(30),
          imageUrl: null,
          countryCode: country,
          regionCode: region ? code : null,
        },
        related: [],
        outletCount24h: 1,
        outletCount: 1,
        latestPublishedAt: ago(30),
      },
    ],
  };
}

/** Serve /data/* for `scenario` instead of the dev server's files. */
export async function serveData(page: Page, scenario: Scenario): Promise<void> {
  const regions = scenario.regions ?? [];
  const index: IndexFile = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: ago(10),
    countries: Object.entries(scenario.countries).map(([code, outlets]) => entry(code, outlets)),
    regions: regions.map((code) => entry(code, 1)),
    world: [],
  };
  await page.route('**/data/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/data\//, '');
    if (path === 'index.json') return route.fulfill({ json: index });
    const m = /^(?:countries|regions)\/([A-Z0-9-]+)\.json$/.exec(path);
    const known = m && (scenario.countries[m[1]!] !== undefined || regions.includes(m[1]!));
    return known ? route.fulfill({ json: file(m[1]!) }) : route.fulfill({ status: 404, body: 'Not found' });
  });
}
