import type { Page } from '@playwright/test';
import {
  COUNTRIES,
  REGIONS,
  SCHEMA_VERSION,
  type CountryFile,
  type IndexEntry,
  type IndexFile,
  type TodayFile,
  type TodayStory,
  type WorldStory,
} from '@news-globe/shared';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
/** The latest run: index lines, country files and trends all describe it. */
const RUN_AT = ago(10);

export interface Scenario {
  /** Countries with headlines, and the outlets on each one's top story. */
  countries: Record<string, number>;
  /** Regions with headlines. */
  regions?: string[];
  /** Countries whose #1 story is new this hour (served as trends). */
  pulses?: string[];
  /** Stories carried by several countries' top headlines: each one's countries, whose top stories it joins. */
  world?: string[][];
}

export const topTitle = (code: string) => `Top story in ${COUNTRIES[code]?.name ?? REGIONS[code]?.name ?? code}`;

function entry(code: string, topOutlets: number): IndexEntry {
  const name = COUNTRIES[code]?.name ?? REGIONS[code]!.name;
  return { code, name, updatedAt: RUN_AT, clusterCount: 1, topTitle: topTitle(code), topOutlets };
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
    updatedAt: RUN_AT,
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

/** Each country's top story, most outlets first. No `coverage`, so the briefing ranks these by outlets, as for older files. */
function today(scenario: Scenario): TodayFile {
  const top = Object.entries(scenario.countries)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([code, outlets]): TodayStory => ({
        unit: code,
        clusterId: code,
        title: topTitle(code),
        url: `https://news.example/${code}`,
        source: 'Outlet',
        language: 'en',
        imageUrl: null,
        outlets,
        rank: 1,
        firstSeen: ago(30),
        state: scenario.pulses?.includes(code) ? 'new' : null,
      }),
    );
  return { schemaVersion: SCHEMA_VERSION, runAt: RUN_AT, top, rising: [], lasting: [], countries: top.length, stories: top.length };
}

function worldStory(scenario: Scenario, codes: string[], i: number): WorldStory {
  const countries = codes.map((code) => ({
    code,
    clusterId: code,
    title: topTitle(code),
    url: `https://news.example/${code}`,
    outletCount24h: scenario.countries[code] ?? 1,
    language: 'en',
  }));
  return { id: `w${i}`, names: [], countries, latestPublishedAt: ago(30) };
}

/** Serve /data/* for `scenario` instead of the dev server's files. */
export async function serveData(page: Page, scenario: Scenario): Promise<void> {
  const regions = scenario.regions ?? [];
  const index: IndexFile = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: RUN_AT,
    countries: Object.entries(scenario.countries).map(([code, outlets]) => entry(code, outlets)),
    regions: regions.map((code) => entry(code, 1)),
    world: (scenario.world ?? []).map((codes, i) => worldStory(scenario, codes, i)),
  };
  await page.route('**/data/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/data\//, '');
    if (path === 'index.json') return route.fulfill({ json: index });
    if (path === 'today.json') return route.fulfill({ json: today(scenario) });
    if (path === 'trends.json' && scenario.pulses) {
      const units = Object.fromEntries(
        scenario.pulses.map((code) => [code, { [code]: { ranks: [null, 1], firstSeen: ago(10), state: 'new' } }]),
      );
      return route.fulfill({ json: { schemaVersion: SCHEMA_VERSION, runAt: RUN_AT, runs: [ago(70), RUN_AT], units, change: {} } });
    }
    const m = /^(?:countries|regions)\/([A-Z0-9-]+)\.json$/.exec(path);
    const known = m && (scenario.countries[m[1]!] !== undefined || regions.includes(m[1]!));
    return known ? route.fulfill({ json: file(m[1]!) }) : route.fulfill({ status: 404, body: 'Not found' });
  });
}
