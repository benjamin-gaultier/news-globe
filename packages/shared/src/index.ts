/**
 * Data contract between the ingest worker and the web app.
 *
 * The worker writes these shapes as static JSON (`data/index.json`,
 * `data/countries/{CC}.json`, `data/regions/{CC}-{R}.json`, and section files
 * such as `data/countries/{CC}.sport.json`); the web app only
 * ever reads them. Bump
 * `SCHEMA_VERSION` on any breaking change.
 */

export const SCHEMA_VERSION = 1;

/** ISO 3166-1 alpha-2 country code, upper case (e.g. "FR"). */
export type CountryCode = string;

/** ISO 3166-2 subdivision code, upper case (e.g. "FR-BRE"). */
export type RegionCode = string;

/**
 * What a country's or region's file covers. `top` is its main headlines; the
 * others are sections (sport, business), each clustered and ranked on its own
 * from the outlets' section feeds.
 */
export const CATEGORIES = ['top', 'sport', 'business'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * A unit's file name in `countries/` or `regions/`, without `.json`: `FR` for
 * its top headlines, `FR.sport` for a section. Top files keep the name they
 * always had, and a dot never occurs in a code, so a section file can't be
 * mistaken for another unit's.
 */
export const fileStem = (code: CountryCode | RegionCode, category: Category = 'top') => (category === 'top' ? code : `${code}.${category}`);

export interface SourceRef {
  /** Stable id from sources.config.ts, e.g. "lemonde". */
  id: string;
  /** Display name, e.g. "Le Monde". */
  name: string;
}

/** One headline from one outlet. Metadata only — never full article text. */
export interface Article {
  /** Short hash of `canonicalUrl`. */
  id: string;
  /** URL as published in the feed. Always link out to this. */
  url: string;
  /** Tracking params stripped, fragment dropped, host lower-cased. */
  canonicalUrl: string;
  title: string;
  /** Feed-provided snippet, HTML stripped, truncated to ~300 chars. */
  description: string | null;
  source: SourceRef;
  /** Country the outlet is based in. */
  sourceCountry: CountryCode;
  /** BCP 47 language tag, e.g. "fr". */
  language: string;
  /** ISO 8601. */
  publishedAt: string;
  imageUrl: string | null;
  /** Country the story is filed under. */
  countryCode: CountryCode;
  /** Sub-national region (ISO 3166-2) of a regional outlet's story; null for national outlets. */
  regionCode: RegionCode | null;
}

/** A group of articles from different outlets about the same story. */
export interface StoryCluster {
  /** Equal to the representative article's id. */
  id: string;
  /** Article shown as the headline: highest-authority outlet, ties → earliest. */
  representative: Article;
  /** One article per *other* outlet covering the story (most recent first). */
  related: Article[];
  /** Distinct outlets with an article in the cluster published in the last 24h. */
  outletCount24h: number;
  /** Distinct outlets in the cluster overall. */
  outletCount: number;
  /** ISO 8601 of the most recent article in the cluster. */
  latestPublishedAt: string;
  /** The same story in other countries' top stories. Optional: national files only, and older files have none. */
  alsoIn?: { code: CountryCode; clusterId: string }[];
}

export interface CountryFile {
  schemaVersion: number;
  countryCode: CountryCode;
  countryName: string;
  /** Set on regional files (`regions/{code}.json`), which share this shape. */
  regionCode?: RegionCode;
  regionName?: string;
  /** Set on section files (`countries/{CC}.sport.json`), which share it too; absent on top files. */
  category?: Exclude<Category, 'top'>;
  /** ISO 8601 time this file was generated. */
  updatedAt: string;
  /** Ranked, best first. */
  clusters: StoryCluster[];
}

export interface IndexEntry {
  /** Country code, or region code in `IndexFile.regions`. */
  code: CountryCode | RegionCode;
  name: string;
  updatedAt: string;
  clusterCount: number;
  /** Headline of the top-ranked story. Optional: older index files have none. */
  topTitle?: string;
  /** Distinct outlets covering the top story in the last 24 h (its `outletCount24h`). */
  topOutlets?: number;
  /**
   * Categories it has a file in, in CATEGORIES order (`['top', 'sport']`: `FR.json` and
   * `FR.sport.json`). The entry itself describes the `top` file. Absent when that is its only
   * file, and in older index files.
   */
  categories?: Category[];
}

export interface IndexFile {
  schemaVersion: number;
  updatedAt: string;
  /** Countries with a top file; their section files are listed in each entry's `categories`. */
  countries: IndexEntry[];
  /** Regions with a top file. Optional: older index files have none. */
  regions?: IndexEntry[];
  /** Stories in several countries' top stories, most countries first. Optional: older index files have none. */
  world?: WorldStory[];
}

/** One story found in several countries' top stories (see packages/ingest/src/world.ts). */
export interface WorldStory {
  /** Stable for the story's lifetime only as long as its clusters keep their ids. */
  id: string;
  /** Names the countries' headlines share (folded, e.g. "francis halzen"). */
  names: string[];
  /** One entry per country, best covered first. */
  countries: {
    code: CountryCode;
    clusterId: string;
    title: string;
    url: string;
    outletCount24h: number;
    /** BCP 47 language of `title`. Optional: older index files have none. */
    language?: string;
    /** Share of the country's press on it (0–1, see `coverage` in packages/ingest/src/rank.ts). Optional: older index files have none. */
    coverage?: number;
  }[];
  /** ISO 8601 of the most recent article across the countries. */
  latestPublishedAt: string;
}

/** `status.json`: feed health after each run, read by the hourly health check (.github/workflows/health.yml). */
export interface StatusFile {
  schemaVersion: number;
  /** ISO 8601 time of the run. */
  updatedAt: string;
  feeds: {
    total: number;
    /** Feeds whose last request failed (HTTP error, timeout, unparsable body), longest failing first. */
    failing: FailingFeed[];
  };
  /**
   * Files none of whose feeds currently works: their headlines are frozen. Each is named by its
   * `fileStem`: `FR` is France's top file, `DE.sport` Germany's sport file.
   */
  darkUnits: { code: string; since: string | null }[];
}

export interface FailingFeed {
  source: string;
  /** The file the feed serves, by its `fileStem`: `FR`, `FR-BRE`, `DE.sport`. */
  unit: string;
  url: string;
  /** HTTP status or error message of the last attempt. */
  lastStatus: number | string | null;
  /** Last successful fetch; null if it never worked. */
  lastOkAt: string | null;
}

/**
 * History: one file per UTC day (`archive/YYYY-MM-DD`), built up by every
 * ingest run that day, served at /data/archive/YYYY-MM-DD.json. Finished days'
 * ETags include it, so changing the format reaches browsers that already hold a day
 * (to rewrite a day's content without a format change, bump ARCHIVE_ETAG_REV in
 * apps/web/worker/index.ts).
 */
export const ARCHIVE_SCHEMA_VERSION = 1;

/** One story as it stood across the day's runs, in one country or region. */
export interface ArchiveStory {
  /** Country or region code the story ranked in. */
  unit: CountryCode | RegionCode;
  /** Headline and link of its representative article, as last seen. */
  title: string;
  url: string;
  /** Outlets that covered it during the day. */
  sources: string[];
  /** Article ids seen in it during the day; a later run's cluster sharing one is the same story. */
  articleIds: string[];
  /** ISO 8601 times of the first and last run that ranked it. */
  firstSeen: string;
  lastSeen: string;
  /** Best rank it reached (1 = top story). */
  bestRank: number;
  /** Highest `outletCount24h` it reached. */
  peakOutlets: number;
}

export interface ArchiveDay {
  schemaVersion: number;
  /** UTC date, `YYYY-MM-DD`. */
  date: string;
  stories: ArchiveStory[];
  /** Run time (ISO 8601) → unit code → indexes into `stories`, best ranked first. */
  runs: Record<string, Record<string, number[]>>;
}

/**
 * `trends.json`: how the latest run's stories moved through today's runs.
 * Built hourly from the history archive (packages/ingest/src/derived.ts).
 */
export interface TrendsFile {
  schemaVersion: number;
  /** The run it describes; apply it only to files with this `updatedAt`. */
  runAt: string;
  /** Today's run times the rank histories cover, oldest first (at most the last 12). */
  runs: string[];
  /** Unit code → cluster id (of this run) → its trend. */
  units: Record<string, Record<string, ClusterTrend>>;
  /** Unit code → how many of its top 5 stories are new or rising this run. */
  change: Record<string, number>;
}

export interface ClusterTrend {
  /** Rank (1 = top) at each of `runs`, null where the story wasn't ranked. */
  ranks: (number | null)[];
  /** ISO 8601 of today's first run that ranked it. */
  firstSeen: string;
  /** "new": first ranked this run. "rising": up 3 or more places since the previous run. */
  state: 'new' | 'rising' | null;
}

/**
 * `search.json`: every ranked headline of the latest run, for client-side
 * search. Kept small (no links): a result opens its country or region panel,
 * which has the story with its link.
 */
export interface SearchFile {
  schemaVersion: number;
  runAt: string;
  /** [country or region code, headline, outlets in 24 h], best ranked first within each unit. */
  items: [string, string, number][];
}

/** A story as the world briefing lists it: enough to show it and open its page. */
export interface TodayStory {
  /** Country (or region) it ranks in, and its cluster id there, for its story page. */
  unit: string;
  clusterId: string;
  title: string;
  url: string;
  /** The headline's outlet. */
  source: string;
  language: string;
  imageUrl: string | null;
  /** Outlets covering it in the last 24 h (`outletCount24h`). */
  outlets: number;
  /**
   * Share of its country's press on it, 0–1 (see `coverage` in packages/ingest/src/rank.ts): what
   * stories from different countries are ranked by. Optional: older files have none.
   */
  coverage?: number;
  /** Its rank in its unit at this run (1 = top story). */
  rank: number;
  /** ISO 8601 of today's first run that ranked it. */
  firstSeen: string;
  state: 'new' | 'rising' | null;
}

/**
 * What each country beyond the first adds to a cross-border story's score in the world briefing:
 * about one corroborating outlet in a typical country's press (4 outlets: 1 / 3.5 ≈ 0.29; see
 * `coverage` in packages/ingest/src/rank.ts). Being in another country's headlines is evidence too, and
 * without it a story carried by one outlet in each of five countries would score 0.
 */
export const CROSS_BORDER_COVERAGE = 0.25;

/**
 * A world briefing line's score, from the coverage of the story in each of its countries:
 * those added up, plus CROSS_BORDER_COVERAGE for each country beyond the first.
 */
export const lineCoverage = (coverages: readonly number[]) =>
  coverages.reduce((n, c) => n + c, 0) + Math.max(0, coverages.length - 1) * CROSS_BORDER_COVERAGE;

/**
 * `today.json`: the national stories of the world briefing, derived hourly with `trends` and `search`
 * (packages/ingest/src/derived.ts) from the latest run and the day's archive.
 */
export interface TodayFile {
  schemaVersion: number;
  runAt: string;
  /** National stories, the largest share of their country's press first, at most two per country. */
  top: TodayStory[];
  /** National stories new or rising since the previous run, the largest share of their country's press first. */
  rising: TodayStory[];
  /** National top-3 stories ranked since earliest today. */
  lasting: TodayStory[];
  /** Countries and ranked national stories in the run. */
  countries: number;
  stories: number;
}

/**
 * `translations.json`: English for the headlines most people see (the world
 * briefing, each country's top story), machine-translated by the hourly
 * workflow (packages/ingest/src/translate.ts). Absent until it is configured.
 */
export interface TranslationsFile {
  schemaVersion: number;
  runAt: string;
  /** Original headline → English. Headlines already in English are not listed. */
  items: Record<string, string>;
}

export interface CountryMeta {
  code: CountryCode;
  name: string;
  /** Where the globe camera points when the country is selected. */
  lat: number;
  lng: number;
  /** Camera altitude in globe radii; larger countries need more. */
  altitude: number;
}

/** Countries the MVP covers. Both the worker and the globe read this. */
// biome-ignore format: one country per line reads as a table
export const COUNTRIES: Record<CountryCode, CountryMeta> = {
  FR: { code: 'FR', name: 'France', lat: 46.6, lng: 2.4, altitude: 1.4 },
  US: { code: 'US', name: 'United States', lat: 39.5, lng: -98.4, altitude: 1.9 },
  GB: { code: 'GB', name: 'United Kingdom', lat: 54.0, lng: -2.5, altitude: 1.3 },
  DE: { code: 'DE', name: 'Germany', lat: 51.2, lng: 10.4, altitude: 1.3 },
  ES: { code: 'ES', name: 'Spain', lat: 40.2, lng: -3.7, altitude: 1.3 },
  IT: { code: 'IT', name: 'Italy', lat: 42.5, lng: 12.6, altitude: 1.3 },
  CA: { code: 'CA', name: 'Canada', lat: 52, lng: -96, altitude: 2.0 },
  BR: { code: 'BR', name: 'Brazil', lat: -12, lng: -52, altitude: 2.0 },
  TR: { code: 'TR', name: 'Turkey', lat: 39, lng: 35, altitude: 1.4 },
  AU: { code: 'AU', name: 'Australia', lat: -26, lng: 134, altitude: 2.0 },
  IN: { code: 'IN', name: 'India', lat: 22, lng: 79, altitude: 1.9 },
  MX: { code: 'MX', name: 'Mexico', lat: 23.6, lng: -102.5, altitude: 1.7 },
  JP: { code: 'JP', name: 'Japan', lat: 36.5, lng: 138, altitude: 1.5 },
  IE: { code: 'IE', name: 'Ireland', lat: 53.4, lng: -8, altitude: 1.0 },
  ZA: { code: 'ZA', name: 'South Africa', lat: -29, lng: 25, altitude: 1.5 },
  NZ: { code: 'NZ', name: 'New Zealand', lat: -41, lng: 173, altitude: 1.3 },
  AR: { code: 'AR', name: 'Argentina', lat: -36, lng: -64, altitude: 2.0 },
  PT: { code: 'PT', name: 'Portugal', lat: 39.6, lng: -8.2, altitude: 1.1 },
  AT: { code: 'AT', name: 'Austria', lat: 47.6, lng: 14.1, altitude: 1.0 },
  CH: { code: 'CH', name: 'Switzerland', lat: 46.8, lng: 8.2, altitude: 0.9 },
  CO: { code: 'CO', name: 'Colombia', lat: 4.5, lng: -74, altitude: 1.6 },
  CL: { code: 'CL', name: 'Chile', lat: -35, lng: -71, altitude: 2.0 },
  NG: { code: 'NG', name: 'Nigeria', lat: 9.1, lng: 8.7, altitude: 1.5 },
  KE: { code: 'KE', name: 'Kenya', lat: 0.2, lng: 37.9, altitude: 1.3 },
  PE: { code: 'PE', name: 'Peru', lat: -9.2, lng: -75, altitude: 1.6 },
  UY: { code: 'UY', name: 'Uruguay', lat: -32.8, lng: -56, altitude: 1.0 },
  PH: { code: 'PH', name: 'Philippines', lat: 12.5, lng: 122, altitude: 1.5 },
  SG: { code: 'SG', name: 'Singapore', lat: 1.35, lng: 103.8, altitude: 0.6 },
  PK: { code: 'PK', name: 'Pakistan', lat: 30, lng: 69.5, altitude: 1.5 },
  GH: { code: 'GH', name: 'Ghana', lat: 7.9, lng: -1.0, altitude: 1.1 },
  NL: { code: 'NL', name: 'Netherlands', lat: 52.2, lng: 5.3, altitude: 0.9 },
  BE: { code: 'BE', name: 'Belgium', lat: 50.6, lng: 4.6, altitude: 0.8 },
  SE: { code: 'SE', name: 'Sweden', lat: 62, lng: 15.5, altitude: 1.6 },
  NO: { code: 'NO', name: 'Norway', lat: 64.5, lng: 12, altitude: 1.7 },
  DK: { code: 'DK', name: 'Denmark', lat: 56, lng: 10, altitude: 0.9 },
  PL: { code: 'PL', name: 'Poland', lat: 52, lng: 19.4, altitude: 1.2 },
  MY: { code: 'MY', name: 'Malaysia', lat: 3.5, lng: 106, altitude: 1.6 },
  UA: { code: 'UA', name: 'Ukraine', lat: 48.4, lng: 31.2, altitude: 1.6 },
  CZ: { code: 'CZ', name: 'Czechia', lat: 49.8, lng: 15.5, altitude: 0.9 },
  RO: { code: 'RO', name: 'Romania', lat: 45.9, lng: 25, altitude: 1.1 },
  ZW: { code: 'ZW', name: 'Zimbabwe', lat: -19, lng: 29.8, altitude: 1.1 },
  UG: { code: 'UG', name: 'Uganda', lat: 1.4, lng: 32.3, altitude: 1.0 },
  JM: { code: 'JM', name: 'Jamaica', lat: 18.1, lng: -77.3, altitude: 0.6 },
  GR: { code: 'GR', name: 'Greece', lat: 39, lng: 22.5, altitude: 1.3 },
  HU: { code: 'HU', name: 'Hungary', lat: 47.2, lng: 19.4, altitude: 1.0 },
  FI: { code: 'FI', name: 'Finland', lat: 63, lng: 26, altitude: 1.7 },
  BG: { code: 'BG', name: 'Bulgaria', lat: 42.7, lng: 25.3, altitude: 1.0 },
  HR: { code: 'HR', name: 'Croatia', lat: 44.8, lng: 16, altitude: 1.0 },
  RS: { code: 'RS', name: 'Serbia', lat: 44, lng: 20.8, altitude: 1.0 },
  SK: { code: 'SK', name: 'Slovakia', lat: 48.7, lng: 19.6, altitude: 0.9 },
  EE: { code: 'EE', name: 'Estonia', lat: 58.7, lng: 25, altitude: 0.8 },
  LV: { code: 'LV', name: 'Latvia', lat: 56.9, lng: 24.6, altitude: 0.8 },
  LT: { code: 'LT', name: 'Lithuania', lat: 55.3, lng: 23.9, altitude: 0.8 },
  MA: { code: 'MA', name: 'Morocco', lat: 31.8, lng: -7.1, altitude: 1.4 },
  DZ: { code: 'DZ', name: 'Algeria', lat: 28, lng: 2.6, altitude: 1.8 },
  TN: { code: 'TN', name: 'Tunisia', lat: 34, lng: 9.5, altitude: 1.0 },
  EG: { code: 'EG', name: 'Egypt', lat: 26.8, lng: 30.8, altitude: 1.6 },
  SA: { code: 'SA', name: 'Saudi Arabia', lat: 24, lng: 45, altitude: 1.9 },
  LB: { code: 'LB', name: 'Lebanon', lat: 33.9, lng: 35.9, altitude: 0.6 },
  VE: { code: 'VE', name: 'Venezuela', lat: 7, lng: -66, altitude: 1.5 },
  GT: { code: 'GT', name: 'Guatemala', lat: 15.6, lng: -90.3, altitude: 0.8 },
  DO: { code: 'DO', name: 'Dominican Republic', lat: 18.8, lng: -70.3, altitude: 0.7 },
  EC: { code: 'EC', name: 'Ecuador', lat: -1.5, lng: -78.3, altitude: 1.0 },
  CR: { code: 'CR', name: 'Costa Rica', lat: 9.8, lng: -84, altitude: 0.7 },
  SN: { code: 'SN', name: 'Senegal', lat: 14.5, lng: -14.5, altitude: 0.9 },
  CI: { code: 'CI', name: "Côte d'Ivoire", lat: 7.5, lng: -5.5, altitude: 1.0 },
  BF: { code: 'BF', name: 'Burkina Faso', lat: 12.3, lng: -1.6, altitude: 1.0 },
  ML: { code: 'ML', name: 'Mali', lat: 17.5, lng: -4, altitude: 1.5 },
  BJ: { code: 'BJ', name: 'Benin', lat: 9.3, lng: 2.3, altitude: 0.8 },
  MG: { code: 'MG', name: 'Madagascar', lat: -19, lng: 46.7, altitude: 1.3 },
  ZM: { code: 'ZM', name: 'Zambia', lat: -13.5, lng: 27.8, altitude: 1.3 },
  MW: { code: 'MW', name: 'Malawi', lat: -13.3, lng: 34, altitude: 0.9 },
  LK: { code: 'LK', name: 'Sri Lanka', lat: 7.8, lng: 80.7, altitude: 0.7 },
  SI: { code: 'SI', name: 'Slovenia', lat: 46.1, lng: 14.8, altitude: 0.7 },
  BA: { code: 'BA', name: 'Bosnia and Herzegovina', lat: 44.2, lng: 17.8, altitude: 0.8 },
  IS: { code: 'IS', name: 'Iceland', lat: 64.9, lng: -18.6, altitude: 1.0 },
  CY: { code: 'CY', name: 'Cyprus', lat: 35, lng: 33.2, altitude: 0.5 },
  LU: { code: 'LU', name: 'Luxembourg', lat: 49.8, lng: 6.1, altitude: 0.4 },
  MD: { code: 'MD', name: 'Moldova', lat: 47.2, lng: 28.5, altitude: 0.7 },
  RU: { code: 'RU', name: 'Russia', lat: 56, lng: 50, altitude: 2.2 },
  KZ: { code: 'KZ', name: 'Kazakhstan', lat: 48, lng: 67, altitude: 1.8 },
  XK: { code: 'XK', name: 'Kosovo', lat: 42.6, lng: 20.9, altitude: 0.4 },
  MK: { code: 'MK', name: 'North Macedonia', lat: 41.6, lng: 21.7, altitude: 0.5 },
  ID: { code: 'ID', name: 'Indonesia', lat: -2.5, lng: 118, altitude: 2.0 },
  VN: { code: 'VN', name: 'Vietnam', lat: 16, lng: 107.5, altitude: 1.3 },
  TW: { code: 'TW', name: 'Taiwan', lat: 23.7, lng: 121, altitude: 0.6 },
  HK: { code: 'HK', name: 'Hong Kong', lat: 22.35, lng: 114.15, altitude: 0.3 },
  AM: { code: 'AM', name: 'Armenia', lat: 40.2, lng: 45, altitude: 0.5 },
  AZ: { code: 'AZ', name: 'Azerbaijan', lat: 40.3, lng: 47.7, altitude: 0.6 },
  UZ: { code: 'UZ', name: 'Uzbekistan', lat: 41.4, lng: 64.5, altitude: 1.2 },
  IR: { code: 'IR', name: 'Iran', lat: 32.5, lng: 54, altitude: 1.6 },
  NP: { code: 'NP', name: 'Nepal', lat: 28.3, lng: 84, altitude: 0.8 },
  SY: { code: 'SY', name: 'Syria', lat: 35, lng: 38.5, altitude: 0.8 },
  SD: { code: 'SD', name: 'Sudan', lat: 15.5, lng: 30, altitude: 1.5 },
  CU: { code: 'CU', name: 'Cuba', lat: 21.6, lng: -79.5, altitude: 0.8 },
  PR: { code: 'PR', name: 'Puerto Rico', lat: 18.2, lng: -66.5, altitude: 0.4 },
  IL: { code: 'IL', name: 'Israel', lat: 31.4, lng: 35, altitude: 0.5 },
  TJ: { code: 'TJ', name: 'Tajikistan', lat: 38.8, lng: 71, altitude: 0.8 },
  AF: { code: 'AF', name: 'Afghanistan', lat: 34, lng: 66, altitude: 1.2 },
  KR: { code: 'KR', name: 'South Korea', lat: 36.3, lng: 127.8, altitude: 0.7 },
  TH: { code: 'TH', name: 'Thailand', lat: 15, lng: 101, altitude: 1.1 },
  BD: { code: 'BD', name: 'Bangladesh', lat: 23.8, lng: 90.3, altitude: 0.7 },
  GN: { code: 'GN', name: 'Guinea', lat: 10.4, lng: -11, altitude: 0.8 },
  GA: { code: 'GA', name: 'Gabon', lat: -0.6, lng: 11.6, altitude: 0.8 },
  TD: { code: 'TD', name: 'Chad', lat: 15, lng: 18.7, altitude: 1.4 },
  MR: { code: 'MR', name: 'Mauritania', lat: 20.3, lng: -10.3, altitude: 1.3 },
  GM: { code: 'GM', name: 'The Gambia', lat: 13.45, lng: -15.4, altitude: 0.4 },
  LR: { code: 'LR', name: 'Liberia', lat: 6.45, lng: -9.4, altitude: 0.6 },
  SO: { code: 'SO', name: 'Somalia', lat: 5.5, lng: 46, altitude: 1.3 },
  GY: { code: 'GY', name: 'Guyana', lat: 4.9, lng: -58.9, altitude: 0.8 },
  SR: { code: 'SR', name: 'Suriname', lat: 4, lng: -56, altitude: 0.6 },
  YE: { code: 'YE', name: 'Yemen', lat: 15.5, lng: 47.5, altitude: 1.1 },
  CN: { code: 'CN', name: 'China', lat: 35, lng: 104, altitude: 2.0 },
  BY: { code: 'BY', name: 'Belarus', lat: 53.7, lng: 28, altitude: 0.9 },
  GE: { code: 'GE', name: 'Georgia', lat: 42.2, lng: 43.4, altitude: 0.6 },
  ME: { code: 'ME', name: 'Montenegro', lat: 42.8, lng: 19.3, altitude: 0.4 },
  AL: { code: 'AL', name: 'Albania', lat: 41.1, lng: 20.1, altitude: 0.5 },
  PS: { code: 'PS', name: 'Palestine', lat: 31.9, lng: 35.1, altitude: 0.4 },
  LY: { code: 'LY', name: 'Libya', lat: 27, lng: 17, altitude: 1.5 },
  IQ: { code: 'IQ', name: 'Iraq', lat: 33, lng: 43.7, altitude: 1.0 },
  MM: { code: 'MM', name: 'Myanmar', lat: 21, lng: 96, altitude: 1.2 },
  KG: { code: 'KG', name: 'Kyrgyzstan', lat: 41.4, lng: 74.6, altitude: 0.8 },
  NA: { code: 'NA', name: 'Namibia', lat: -22.5, lng: 17.5, altitude: 1.2 },
  HN: { code: 'HN', name: 'Honduras', lat: 14.8, lng: -86.6, altitude: 0.7 },
  BO: { code: 'BO', name: 'Bolivia', lat: -16.7, lng: -64.7, altitude: 1.3 },
  SV: { code: 'SV', name: 'El Salvador', lat: 13.7, lng: -88.9, altitude: 0.4 },
  CD: { code: 'CD', name: 'DR Congo', lat: -2.9, lng: 23.6, altitude: 1.6 },
  CM: { code: 'CM', name: 'Cameroon', lat: 6, lng: 12.5, altitude: 1.0 },
  TZ: { code: 'TZ', name: 'Tanzania', lat: -6.3, lng: 34.8, altitude: 1.2 },
  RW: { code: 'RW', name: 'Rwanda', lat: -2, lng: 29.9, altitude: 0.4 },
  HT: { code: 'HT', name: 'Haiti', lat: 19, lng: -72.7, altitude: 0.5 },
  PY: { code: 'PY', name: 'Paraguay', lat: -23.4, lng: -58.4, altitude: 0.8 },
  PA: { code: 'PA', name: 'Panama', lat: 8.5, lng: -80.1, altitude: 0.5 },
  KH: { code: 'KH', name: 'Cambodia', lat: 12.6, lng: 104.9, altitude: 0.6 },
  MZ: { code: 'MZ', name: 'Mozambique', lat: -18.3, lng: 35.5, altitude: 1.3 },
  BS: { code: 'BS', name: 'Bahamas', lat: 24.7, lng: -77.8, altitude: 0.6 },
  BZ: { code: 'BZ', name: 'Belize', lat: 17.2, lng: -88.7, altitude: 0.4 },
  TG: { code: 'TG', name: 'Togo', lat: 8.6, lng: 1.0, altitude: 0.5 },
  SS: { code: 'SS', name: 'South Sudan', lat: 7.3, lng: 30.3, altitude: 1.0 },
  CF: { code: 'CF', name: 'Central African Republic', lat: 6.6, lng: 20.9, altitude: 1.0 },
  ET: { code: 'ET', name: 'Ethiopia', lat: 9.1, lng: 40.5, altitude: 1.2 },
  AE: { code: 'AE', name: 'United Arab Emirates', lat: 24.2, lng: 54.4, altitude: 0.6 },
  JO: { code: 'JO', name: 'Jordan', lat: 31.2, lng: 36.5, altitude: 0.6 },
  NI: { code: 'NI', name: 'Nicaragua', lat: 12.9, lng: -85.2, altitude: 0.7 },
  SL: { code: 'SL', name: 'Sierra Leone', lat: 8.5, lng: -11.8, altitude: 0.5 },
  MN: { code: 'MN', name: 'Mongolia', lat: 46.9, lng: 103.8, altitude: 1.3 },
  NC: { code: 'NC', name: 'New Caledonia', lat: -21.3, lng: 165.5, altitude: 0.6 },
  TL: { code: 'TL', name: 'Timor-Leste', lat: -8.8, lng: 125.9, altitude: 0.5 },
  FJ: { code: 'FJ', name: 'Fiji', lat: -17.8, lng: 178.1, altitude: 0.6 },
  SB: { code: 'SB', name: 'Solomon Islands', lat: -9.4, lng: 160.0, altitude: 0.8 },
  DJ: { code: 'DJ', name: 'Djibouti', lat: 11.8, lng: 42.6, altitude: 0.4 },
  CG: { code: 'CG', name: 'Congo', lat: -0.7, lng: 15.2, altitude: 0.8 },
  BI: { code: 'BI', name: 'Burundi', lat: -3.4, lng: 29.9, altitude: 0.4 },
  LS: { code: 'LS', name: 'Lesotho', lat: -29.6, lng: 28.2, altitude: 0.4 },
  QA: { code: 'QA', name: 'Qatar', lat: 25.3, lng: 51.2, altitude: 0.4 },
  KW: { code: 'KW', name: 'Kuwait', lat: 29.3, lng: 47.6, altitude: 0.4 },
  OM: { code: 'OM', name: 'Oman', lat: 21, lng: 57, altitude: 0.8 },
  TT: { code: 'TT', name: 'Trinidad and Tobago', lat: 10.5, lng: -61.3, altitude: 0.4 },
  AO: { code: 'AO', name: 'Angola', lat: -12.3, lng: 17.5, altitude: 1.2 },
  BW: { code: 'BW', name: 'Botswana', lat: -22.3, lng: 24.7, altitude: 1 },
  PG: { code: 'PG', name: 'Papua New Guinea', lat: -6.5, lng: 145.5, altitude: 1 },
  SZ: { code: 'SZ', name: 'Eswatini', lat: -26.5, lng: 31.5, altitude: 0.4 },
  LA: { code: 'LA', name: 'Laos', lat: 18.5, lng: 103, altitude: 0.8 },
  BT: { code: 'BT', name: 'Bhutan', lat: 27.4, lng: 90.4, altitude: 0.5 },
  TM: { code: 'TM', name: 'Turkmenistan', lat: 39, lng: 59.5, altitude: 1 },
  NE: { code: 'NE', name: 'Niger', lat: 17.5, lng: 9, altitude: 1.3 },
  GW: { code: 'GW', name: 'Guinea-Bissau', lat: 12, lng: -15, altitude: 0.4 },
  GQ: { code: 'GQ', name: 'Equatorial Guinea', lat: 1.6, lng: 10.4, altitude: 0.4 },
  ER: { code: 'ER', name: 'Eritrea', lat: 15.2, lng: 39.2, altitude: 0.6 },
  VU: { code: 'VU', name: 'Vanuatu', lat: -16.2, lng: 167.7, altitude: 0.6 },
  GL: { code: 'GL', name: 'Greenland', lat: 72, lng: -40, altitude: 1.6 },
  KP: { code: 'KP', name: 'North Korea', lat: 40.2, lng: 127.3, altitude: 0.8 },
  MT: { code: 'MT', name: 'Malta', lat: 35.9, lng: 14.4, altitude: 0.3 },
  MU: { code: 'MU', name: 'Mauritius', lat: -20.2, lng: 57.5, altitude: 0.3 },
  MV: { code: 'MV', name: 'Maldives', lat: 3.2, lng: 73.2, altitude: 0.6 },
};

export interface RegionMeta {
  code: RegionCode;
  /** Country the region belongs to. */
  country: CountryCode;
  name: string;
  /** Where the globe camera points when the region is selected. */
  lat: number;
  lng: number;
  /** Camera altitude in globe radii. */
  altitude: number;
  /**
   * The region's name as its outlets write it, when that differs from `name`
   * ("Sachsen-Anhalt", "Bretagne"). Its words are ignored when clustering the
   * region's headlines: nearly every story mentions them.
   */
  localNames?: string[];
}

/**
 * Regions with regional headlines. A region's outlets (sources with `region`)
 * feed its own file instead of the national one. Outlines come from
 * apps/web/src/assets/regions-{cc}.json.
 */
// biome-ignore format: one region per line reads as a table
export const REGIONS: Record<RegionCode, RegionMeta> = {
  'FR-ARA': { code: 'FR-ARA', country: 'FR', name: 'Auvergne-Rhône-Alpes', lat: 45.4, lng: 4.6, altitude: 0.55, localNames: ['Auvergne-Rhône-Alpes'] },
  'FR-BFC': { code: 'FR-BFC', country: 'FR', name: 'Bourgogne-Franche-Comté', lat: 47.2, lng: 4.8, altitude: 0.5, localNames: ['Bourgogne-Franche-Comté'] },
  'FR-BRE': { code: 'FR-BRE', country: 'FR', name: 'Brittany', lat: 48.2, lng: -2.9, altitude: 0.45, localNames: ['Bretagne'] },
  'FR-CVL': { code: 'FR-CVL', country: 'FR', name: 'Centre-Val de Loire', lat: 47.5, lng: 1.7, altitude: 0.5, localNames: ['Centre-Val de Loire'] },
  'FR-20R': { code: 'FR-20R', country: 'FR', name: 'Corsica', lat: 42.15, lng: 9.1, altitude: 0.35, localNames: ['Corse'] },
  'FR-GES': { code: 'FR-GES', country: 'FR', name: 'Grand Est', lat: 48.7, lng: 5.6, altitude: 0.5, localNames: ['Grand Est'] },
  'FR-HDF': { code: 'FR-HDF', country: 'FR', name: 'Hauts-de-France', lat: 50.0, lng: 2.8, altitude: 0.45, localNames: ['Hauts-de-France'] },
  'FR-IDF': { code: 'FR-IDF', country: 'FR', name: 'Île-de-France', lat: 48.7, lng: 2.5, altitude: 0.3, localNames: ['Île-de-France'] },
  'FR-NOR': { code: 'FR-NOR', country: 'FR', name: 'Normandy', lat: 49.1, lng: 0.1, altitude: 0.45, localNames: ['Normandie'] },
  'FR-NAQ': { code: 'FR-NAQ', country: 'FR', name: 'Nouvelle-Aquitaine', lat: 45.2, lng: 0.2, altitude: 0.6, localNames: ['Nouvelle-Aquitaine'] },
  'FR-OCC': { code: 'FR-OCC', country: 'FR', name: 'Occitanie', lat: 43.7, lng: 2.2, altitude: 0.55, localNames: ['Occitanie'] },
  'FR-PDL': { code: 'FR-PDL', country: 'FR', name: 'Pays de la Loire', lat: 47.4, lng: -0.8, altitude: 0.45, localNames: ['Pays de la Loire'] },
  'FR-PAC': { code: 'FR-PAC', country: 'FR', name: "Provence-Alpes-Côte d'Azur", lat: 43.95, lng: 6.05, altitude: 0.45, localNames: ["Provence-Alpes-Côte d'Azur", 'PACA'] },
  'DE-BW': { code: 'DE-BW', country: 'DE', name: 'Baden-Württemberg', lat: 48.6, lng: 9.0, altitude: 0.5, localNames: ['Baden-Württemberg'] },
  'DE-BY': { code: 'DE-BY', country: 'DE', name: 'Bavaria', lat: 48.95, lng: 11.4, altitude: 0.6, localNames: ['Bayern'] },
  'DE-BE': { code: 'DE-BE', country: 'DE', name: 'Berlin', lat: 52.52, lng: 13.4, altitude: 0.2, localNames: ['Berlin'] },
  'DE-BB': { code: 'DE-BB', country: 'DE', name: 'Brandenburg', lat: 52.45, lng: 13.2, altitude: 0.5, localNames: ['Brandenburg'] },
  'DE-HB': { code: 'DE-HB', country: 'DE', name: 'Bremen', lat: 53.3, lng: 8.7, altitude: 0.2, localNames: ['Bremen'] },
  'DE-HH': { code: 'DE-HH', country: 'DE', name: 'Hamburg', lat: 53.55, lng: 10.0, altitude: 0.2, localNames: ['Hamburg'] },
  'DE-HE': { code: 'DE-HE', country: 'DE', name: 'Hesse', lat: 50.6, lng: 9.0, altitude: 0.45, localNames: ['Hessen'] },
  'DE-MV': { code: 'DE-MV', country: 'DE', name: 'Mecklenburg-Western Pomerania', lat: 53.75, lng: 12.5, altitude: 0.5, localNames: ['Mecklenburg-Vorpommern', 'MV'] },
  'DE-NI': { code: 'DE-NI', country: 'DE', name: 'Lower Saxony', lat: 52.75, lng: 9.3, altitude: 0.55, localNames: ['Niedersachsen'] },
  'DE-NW': { code: 'DE-NW', country: 'DE', name: 'North Rhine-Westphalia', lat: 51.45, lng: 7.6, altitude: 0.45, localNames: ['Nordrhein-Westfalen', 'NRW'] },
  'DE-RP': { code: 'DE-RP', country: 'DE', name: 'Rhineland-Palatinate', lat: 49.9, lng: 7.4, altitude: 0.4, localNames: ['Rheinland-Pfalz'] },
  'DE-SL': { code: 'DE-SL', country: 'DE', name: 'Saarland', lat: 49.4, lng: 6.95, altitude: 0.25, localNames: ['Saarland'] },
  'DE-SN': { code: 'DE-SN', country: 'DE', name: 'Saxony', lat: 51.05, lng: 13.35, altitude: 0.4, localNames: ['Sachsen'] },
  'DE-ST': { code: 'DE-ST', country: 'DE', name: 'Saxony-Anhalt', lat: 51.95, lng: 11.7, altitude: 0.4, localNames: ['Sachsen-Anhalt'] },
  'DE-SH': { code: 'DE-SH', country: 'DE', name: 'Schleswig-Holstein', lat: 54.2, lng: 9.8, altitude: 0.4, localNames: ['Schleswig-Holstein'] },
  'DE-TH': { code: 'DE-TH', country: 'DE', name: 'Thuringia', lat: 50.9, lng: 11.0, altitude: 0.4, localNames: ['Thüringen'] },
  'US-AL': { code: 'US-AL', country: 'US', name: 'Alabama', lat: 32.62, lng: -86.7, altitude: 0.48 },
  'US-AK': { code: 'US-AK', country: 'US', name: 'Alaska', lat: 63.09, lng: -149.05, altitude: 1.4 },
  'US-AZ': { code: 'US-AZ', country: 'US', name: 'Arizona', lat: 34.16, lng: -111.94, altitude: 0.55 },
  'US-AR': { code: 'US-AR', country: 'US', name: 'Arkansas', lat: 34.75, lng: -92.16, altitude: 0.42 },
  'US-CA': { code: 'US-CA', country: 'US', name: 'California', lat: 37.27, lng: -119.25, altitude: 0.86 },
  'US-CO': { code: 'US-CO', country: 'US', name: 'Colorado', lat: 39.0, lng: -105.53, altitude: 0.54 },
  'US-CT': { code: 'US-CT', country: 'US', name: 'Connecticut', lat: 41.53, lng: -72.76, altitude: 0.21 },
  'US-DE': { code: 'US-DE', country: 'US', name: 'Delaware', lat: 39.15, lng: -75.41, altitude: 0.21 },
  'US-DC': { code: 'US-DC', country: 'US', name: 'District of Columbia', lat: 38.91, lng: -77.03, altitude: 0.2, localNames: ['Washington, D.C.', 'D.C.'] },
  'US-FL': { code: 'US-FL', country: 'US', name: 'Florida', lat: 28.06, lng: -83.83, altitude: 0.63 },
  'US-GA': { code: 'US-GA', country: 'US', name: 'Georgia', lat: 32.69, lng: -83.25, altitude: 0.47 },
  'US-HI': { code: 'US-HI', country: 'US', name: 'Hawaii', lat: 20.6, lng: -157.4, altitude: 0.6 },
  'US-ID': { code: 'US-ID', country: 'US', name: 'Idaho', lat: 45.5, lng: -114.12, altitude: 0.66 },
  'US-IL': { code: 'US-IL', country: 'US', name: 'Illinois', lat: 39.75, lng: -89.27, altitude: 0.54 },
  'US-IN': { code: 'US-IN', country: 'US', name: 'Indiana', lat: 39.77, lng: -86.44, altitude: 0.42 },
  'US-IA': { code: 'US-IA', country: 'US', name: 'Iowa', lat: 41.94, lng: -93.39, altitude: 0.49 },
  'US-KS': { code: 'US-KS', country: 'US', name: 'Kansas', lat: 38.5, lng: -98.32, altitude: 0.56 },
  'US-KY': { code: 'US-KY', country: 'US', name: 'Kentucky', lat: 37.81, lng: -85.71, altitude: 0.57 },
  'US-LA': { code: 'US-LA', country: 'US', name: 'Louisiana', lat: 31.0, lng: -91.53, altitude: 0.44 },
  'US-ME': { code: 'US-ME', country: 'US', name: 'Maine', lat: 45.27, lng: -69.03, altitude: 0.45 },
  'US-MD': { code: 'US-MD', country: 'US', name: 'Maryland', lat: 38.84, lng: -77.27, altitude: 0.38 },
  'US-MA': { code: 'US-MA', country: 'US', name: 'Massachusetts', lat: 42.19, lng: -71.72, altitude: 0.31 },
  'US-MI': { code: 'US-MI', country: 'US', name: 'Michigan', lat: 45.0, lng: -86.28, altitude: 0.63 },
  'US-MN': { code: 'US-MN', country: 'US', name: 'Minnesota', lat: 46.44, lng: -93.37, altitude: 0.57 },
  'US-MS': { code: 'US-MS', country: 'US', name: 'Mississippi', lat: 32.59, lng: -89.87, altitude: 0.48 },
  'US-MO': { code: 'US-MO', country: 'US', name: 'Missouri', lat: 38.3, lng: -92.44, altitude: 0.52 },
  'US-MT': { code: 'US-MT', country: 'US', name: 'Montana', lat: 46.7, lng: -110.03, altitude: 0.76 },
  'US-NE': { code: 'US-NE', country: 'US', name: 'Nebraska', lat: 41.5, lng: -99.69, altitude: 0.62 },
  'US-NV': { code: 'US-NV', country: 'US', name: 'Nevada', lat: 38.5, lng: -117.02, altitude: 0.66 },
  'US-NH': { code: 'US-NH', country: 'US', name: 'New Hampshire', lat: 44.0, lng: -71.64, altitude: 0.31 },
  'US-NJ': { code: 'US-NJ', country: 'US', name: 'New Jersey', lat: 40.15, lng: -74.72, altitude: 0.29 },
  'US-NM': { code: 'US-NM', country: 'US', name: 'New Mexico', lat: 34.16, lng: -106.03, altitude: 0.55 },
  'US-NY': { code: 'US-NY', country: 'US', name: 'New York', lat: 42.88, lng: -76.5, altitude: 0.48 },
  'US-NC': { code: 'US-NC', country: 'US', name: 'North Carolina', lat: 35.25, lng: -80.03, altitude: 0.66 },
  'US-ND': { code: 'US-ND', country: 'US', name: 'North Dakota', lat: 47.47, lng: -100.3, altitude: 0.5 },
  'US-OH': { code: 'US-OH', country: 'US', name: 'Ohio', lat: 40.36, lng: -82.67, altitude: 0.41 },
  'US-OK': { code: 'US-OK', country: 'US', name: 'Oklahoma', lat: 35.33, lng: -98.72, altitude: 0.66 },
  'US-OR': { code: 'US-OR', country: 'US', name: 'Oregon', lat: 44.11, lng: -120.51, altitude: 0.56 },
  'US-PA': { code: 'US-PA', country: 'US', name: 'Pennsylvania', lat: 41.13, lng: -77.61, altitude: 0.45 },
  'US-RI': { code: 'US-RI', country: 'US', name: 'Rhode Island', lat: 41.67, lng: -71.53, altitude: 0.2 },
  'US-SC': { code: 'US-SC', country: 'US', name: 'South Carolina', lat: 33.62, lng: -80.96, altitude: 0.42 },
  'US-SD': { code: 'US-SD', country: 'US', name: 'South Dakota', lat: 44.22, lng: -100.25, altitude: 0.54 },
  'US-TN': { code: 'US-TN', country: 'US', name: 'Tennessee', lat: 35.84, lng: -85.97, altitude: 0.66 },
  'US-TX': { code: 'US-TX', country: 'US', name: 'Texas', lat: 31.19, lng: -100.1, altitude: 1.0 },
  'US-UT': { code: 'US-UT', country: 'US', name: 'Utah', lat: 39.5, lng: -111.55, altitude: 0.5 },
  'US-VT': { code: 'US-VT', country: 'US', name: 'Vermont', lat: 43.87, lng: -72.47, altitude: 0.28 },
  'US-VA': { code: 'US-VA', country: 'US', name: 'Virginia', lat: 38.0, lng: -79.77, altitude: 0.59 },
  'US-WA': { code: 'US-WA', country: 'US', name: 'Washington', lat: 47.29, lng: -120.81, altitude: 0.52 },
  'US-WV': { code: 'US-WV', country: 'US', name: 'West Virginia', lat: 38.93, lng: -80.18, altitude: 0.4 },
  'US-WI': { code: 'US-WI', country: 'US', name: 'Wisconsin', lat: 44.9, lng: -89.58, altitude: 0.49 },
  'US-WY': { code: 'US-WY', country: 'US', name: 'Wyoming', lat: 43.0, lng: -107.53, altitude: 0.51 },
  'ES-AN': { code: 'ES-AN', country: 'ES', name: 'Andalusia', lat: 37.37, lng: -4.58, altitude: 0.63, localNames: ['Andalucía'] },
  'ES-AR': { code: 'ES-AR', country: 'ES', name: 'Aragon', lat: 41.39, lng: -0.7, altitude: 0.55, localNames: ['Aragón'] },
  'ES-AS': { code: 'ES-AS', country: 'ES', name: 'Asturias', lat: 43.27, lng: -5.84, altitude: 0.47, localNames: ['Principado de Asturias'] },
  'ES-IB': { code: 'ES-IB', country: 'ES', name: 'Balearic Islands', lat: 39.45, lng: 2.77, altitude: 0.51, localNames: ['Illes Balears', 'Islas Baleares', 'Baleares'] },
  'ES-PV': { code: 'ES-PV', country: 'ES', name: 'Basque Country', lat: 42.98, lng: -2.6, altitude: 0.4, localNames: ['Euskadi', 'País Vasco'] },
  'ES-CN': { code: 'ES-CN', country: 'ES', name: 'Canary Islands', lat: 28.44, lng: -15.8, altitude: 0.61, localNames: ['Canarias', 'Islas Canarias'] },
  'ES-CB': { code: 'ES-CB', country: 'ES', name: 'Cantabria', lat: 43.14, lng: -4, altitude: 0.4 },
  'ES-CL': { code: 'ES-CL', country: 'ES', name: 'Castile and León', lat: 41.67, lng: -4.43, altitude: 0.6, localNames: ['Castilla y León'] },
  'ES-CM': { code: 'ES-CM', country: 'ES', name: 'Castilla-La Mancha', lat: 39.67, lng: -3.15, altitude: 0.57 },
  'ES-CT': { code: 'ES-CT', country: 'ES', name: 'Catalonia', lat: 41.69, lng: 1.74, altitude: 0.5, localNames: ['Catalunya', 'Cataluña'] },
  'ES-EX': { code: 'ES-EX', country: 'ES', name: 'Extremadura', lat: 39.21, lng: -6.11, altitude: 0.52 },
  'ES-GA': { code: 'ES-GA', country: 'ES', name: 'Galicia', lat: 42.8, lng: -8.02, altitude: 0.47 },
  'ES-RI': { code: 'ES-RI', country: 'ES', name: 'La Rioja', lat: 42.28, lng: -2.41, altitude: 0.38 },
  'ES-MD': { code: 'ES-MD', country: 'ES', name: 'Madrid', lat: 40.52, lng: -3.82, altitude: 0.4, localNames: ['Comunidad de Madrid'] },
  'ES-MC': { code: 'ES-MC', country: 'ES', name: 'Murcia', lat: 38.06, lng: -1.52, altitude: 0.42, localNames: ['Región de Murcia'] },
  'ES-NC': { code: 'ES-NC', country: 'ES', name: 'Navarre', lat: 42.6, lng: -1.62, altitude: 0.42, localNames: ['Navarra', 'Nafarroa'] },
  'ES-VC': { code: 'ES-VC', country: 'ES', name: 'Valencian Community', lat: 39.31, lng: -0.5, altitude: 0.54, localNames: ['Comunitat Valenciana', 'Comunidad Valenciana'] },
  'IT-65': { code: 'IT-65', country: 'IT', name: 'Abruzzo', lat: 42.3, lng: 13.88, altitude: 0.41 },
  'IT-23': { code: 'IT-23', country: 'IT', name: 'Aosta Valley', lat: 45.72, lng: 7.35, altitude: 0.35, localNames: ["Valle d'Aosta"] },
  'IT-75': { code: 'IT-75', country: 'IT', name: 'Apulia', lat: 40.87, lng: 16.73, altitude: 0.53, localNames: ['Puglia'] },
  'IT-77': { code: 'IT-77', country: 'IT', name: 'Basilicata', lat: 40.52, lng: 16.1, altitude: 0.4 },
  'IT-78': { code: 'IT-78', country: 'IT', name: 'Calabria', lat: 39.03, lng: 16.41, altitude: 0.49 },
  'IT-72': { code: 'IT-72', country: 'IT', name: 'Campania', lat: 40.75, lng: 14.77, altitude: 0.43 },
  'IT-45': { code: 'IT-45', country: 'IT', name: 'Emilia-Romagna', lat: 44.44, lng: 10.97, altitude: 0.52 },
  'IT-36': { code: 'IT-36', country: 'IT', name: 'Friuli-Venezia Giulia', lat: 46.11, lng: 13.12, altitude: 0.38 },
  'IT-62': { code: 'IT-62', country: 'IT', name: 'Lazio', lat: 42.03, lng: 12.73, altitude: 0.47 },
  'IT-42': { code: 'IT-42', country: 'IT', name: 'Liguria', lat: 44.23, lng: 8.77, altitude: 0.46 },
  'IT-25': { code: 'IT-25', country: 'IT', name: 'Lombardy', lat: 45.66, lng: 9.96, altitude: 0.48, localNames: ['Lombardia'] },
  'IT-57': { code: 'IT-57', country: 'IT', name: 'Marche', lat: 43.33, lng: 13.05, altitude: 0.41 },
  'IT-67': { code: 'IT-67', country: 'IT', name: 'Molise', lat: 41.72, lng: 14.55, altitude: 0.36 },
  'IT-21': { code: 'IT-21', country: 'IT', name: 'Piedmont', lat: 45.27, lng: 7.91, altitude: 0.5, localNames: ['Piemonte'] },
  'IT-88': { code: 'IT-88', country: 'IT', name: 'Sardinia', lat: 40.06, lng: 8.98, altitude: 0.51, localNames: ['Sardegna'] },
  'IT-82': { code: 'IT-82', country: 'IT', name: 'Sicily', lat: 37.47, lng: 14.04, altitude: 0.52, localNames: ['Sicilia'] },
  'IT-32': { code: 'IT-32', country: 'IT', name: 'Trentino-South Tyrol', lat: 46.39, lng: 11.42, altitude: 0.42, localNames: ['Trentino-Alto Adige', 'Südtirol'] },
  'IT-52': { code: 'IT-52', country: 'IT', name: 'Tuscany', lat: 43.42, lng: 11.02, altitude: 0.48, localNames: ['Toscana'] },
  'IT-55': { code: 'IT-55', country: 'IT', name: 'Umbria', lat: 42.99, lng: 12.57, altitude: 0.4 },
  'IT-34': { code: 'IT-34', country: 'IT', name: 'Veneto', lat: 45.73, lng: 11.87, altitude: 0.47 },
  'CA-AB': { code: 'CA-AB', country: 'CA', name: 'Alberta', lat: 54.5, lng: -115, altitude: 0.99 },
  'CA-BC': { code: 'CA-BC', country: 'CA', name: 'British Columbia', lat: 54.5, lng: -126.56, altitude: 1.31, localNames: ['B.C.'] },
  'CA-MB': { code: 'CA-MB', country: 'CA', name: 'Manitoba', lat: 54.5, lng: -95.47, altitude: 0.99 },
  'CA-NB': { code: 'CA-NB', country: 'CA', name: 'New Brunswick', lat: 46.57, lng: -66.44, altitude: 0.32, localNames: ['Nouveau-Brunswick'] },
  'CA-NL': { code: 'CA-NL', country: 'CA', name: 'Newfoundland and Labrador', lat: 53.47, lng: -60.2, altitude: 1.23, localNames: ['Newfoundland', 'Labrador'] },
  'CA-NS': { code: 'CA-NS', country: 'CA', name: 'Nova Scotia', lat: 45.27, lng: -63.01, altitude: 0.4, localNames: ['Nouvelle-Écosse'] },
  'CA-NT': { code: 'CA-NT', country: 'CA', name: 'Northwest Territories', lat: 67.28, lng: -119.22, altitude: 1.31, localNames: ['N.W.T.'] },
  'CA-NU': { code: 'CA-NU', country: 'CA', name: 'Nunavut', lat: 71.56, lng: -90.95, altitude: 1.4 },
  'CA-ON': { code: 'CA-ON', country: 'CA', name: 'Ontario', lat: 49.26, lng: -84.75, altitude: 1.37 },
  'CA-PE': { code: 'CA-PE', country: 'CA', name: 'Prince Edward Island', lat: 46.52, lng: -63.21, altitude: 0.2, localNames: ['P.E.I.'] },
  'CA-QC': { code: 'CA-QC', country: 'CA', name: 'Quebec', lat: 53.78, lng: -68.41, altitude: 1.4, localNames: ['Québec'] },
  'CA-SK': { code: 'CA-SK', country: 'CA', name: 'Saskatchewan', lat: 54.5, lng: -105.69, altitude: 0.99 },
  'CA-YT': { code: 'CA-YT', country: 'CA', name: 'Yukon', lat: 64.83, lng: -132.41, altitude: 0.87 },
  'AU-ACT': { code: 'AU-ACT', country: 'AU', name: 'Australian Capital Territory', lat: -35.53, lng: 149.09, altitude: 0.2, localNames: ['ACT', 'Canberra'] },
  'AU-NSW': { code: 'AU-NSW', country: 'AU', name: 'New South Wales', lat: -32.82, lng: 147.31, altitude: 0.95, localNames: ['NSW'] },
  'AU-NT': { code: 'AU-NT', country: 'AU', name: 'Northern Territory', lat: -18.59, lng: 133.5, altitude: 1.33, localNames: ['NT'] },
  'AU-QLD': { code: 'AU-QLD', country: 'AU', name: 'Queensland', lat: -19.93, lng: 145.76, altitude: 1.4, localNames: ['Qld'] },
  'AU-SA': { code: 'AU-SA', country: 'AU', name: 'South Australia', lat: -32.03, lng: 135.01, altitude: 1.09, localNames: ['SA'] },
  'AU-TAS': { code: 'AU-TAS', country: 'AU', name: 'Tasmania', lat: -42.14, lng: 146.5, altitude: 0.27, localNames: ['Tas'] },
  'AU-VIC': { code: 'AU-VIC', country: 'AU', name: 'Victoria', lat: -36.58, lng: 145.45, altitude: 0.65, localNames: ['Vic'] },
  'AU-WA': { code: 'AU-WA', country: 'AU', name: 'Western Australia', lat: -24.42, lng: 121.09, altitude: 1.4, localNames: ['WA'] },
  'BR-AC': { code: 'BR-AC', country: 'BR', name: 'Acre', lat: -9.12, lng: -70.31, altitude: 0.65 },
  'BR-AL': { code: 'BR-AL', country: 'BR', name: 'Alagoas', lat: -9.66, lng: -36.69, altitude: 0.27 },
  'BR-AM': { code: 'BR-AM', country: 'BR', name: 'Amazonas', lat: -3.81, lng: -65.09, altitude: 1.4 },
  'BR-AP': { code: 'BR-AP', country: 'BR', name: 'Amapá', lat: 1.56, lng: -52.34, altitude: 0.49 },
  'BR-BA': { code: 'BR-BA', country: 'BR', name: 'Bahia', lat: -13.45, lng: -41.99, altitude: 0.88 },
  'BR-CE': { code: 'BR-CE', country: 'BR', name: 'Ceará', lat: -5.33, lng: -39.34, altitude: 0.46 },
  'BR-DF': { code: 'BR-DF', country: 'BR', name: 'Federal District', lat: -15.77, lng: -47.79, altitude: 0.2, localNames: ['Distrito Federal', 'Brasília'] },
  'BR-ES': { code: 'BR-ES', country: 'BR', name: 'Espírito Santo', lat: -19.59, lng: -40.78, altitude: 0.31 },
  'BR-GO': { code: 'BR-GO', country: 'BR', name: 'Goiás', lat: -15.95, lng: -49.56, altitude: 0.64 },
  'BR-MA': { code: 'BR-MA', country: 'BR', name: 'Maranhão', lat: -5.74, lng: -45.27, altitude: 0.83 },
  'BR-MG': { code: 'BR-MG', country: 'BR', name: 'Minas Gerais', lat: -18.57, lng: -45.43, altitude: 0.95 },
  'BR-MS': { code: 'BR-MS', country: 'BR', name: 'Mato Grosso do Sul', lat: -20.62, lng: -54.56, altitude: 0.62 },
  'BR-MT': { code: 'BR-MT', country: 'BR', name: 'Mato Grosso', lat: -12.69, lng: -55.92, altitude: 1 },
  'BR-PA': { code: 'BR-PA', country: 'BR', name: 'Pará', lat: -3.62, lng: -52.49, altitude: 1.16 },
  'BR-PB': { code: 'BR-PB', country: 'BR', name: 'Paraíba', lat: -7.15, lng: -36.77, altitude: 0.35 },
  'BR-PE': { code: 'BR-PE', country: 'BR', name: 'Pernambuco', lat: -8.37, lng: -38.1, altitude: 0.58 },
  'BR-PI': { code: 'BR-PI', country: 'BR', name: 'Piauí', lat: -6.83, lng: -43.2, altitude: 0.73 },
  'BR-PR': { code: 'BR-PR', country: 'BR', name: 'Paraná', lat: -24.61, lng: -51.35, altitude: 0.54 },
  'BR-RJ': { code: 'BR-RJ', country: 'BR', name: 'Rio de Janeiro', lat: -22.07, lng: -42.91, altitude: 0.32 },
  'BR-RN': { code: 'BR-RN', country: 'BR', name: 'Rio Grande do Norte', lat: -5.9, lng: -36.79, altitude: 0.33 },
  'BR-RO': { code: 'BR-RO', country: 'BR', name: 'Rondônia', lat: -10.83, lng: -63.33, altitude: 0.62 },
  'BR-RR': { code: 'BR-RR', country: 'BR', name: 'Roraima', lat: 1.9, lng: -61.84, altitude: 0.6 },
  'BR-RS': { code: 'BR-RS', country: 'BR', name: 'Rio Grande do Sul', lat: -30.41, lng: -53.66, altitude: 0.61 },
  'BR-SC': { code: 'BR-SC', country: 'BR', name: 'Santa Catarina', lat: -27.66, lng: -51.24, altitude: 0.43 },
  'BR-SE': { code: 'BR-SE', country: 'BR', name: 'Sergipe', lat: -10.54, lng: -37.33, altitude: 0.2 },
  'BR-SP': { code: 'BR-SP', country: 'BR', name: 'São Paulo', lat: -22.54, lng: -48.64, altitude: 0.74 },
  'BR-TO': { code: 'BR-TO', country: 'BR', name: 'Tocantins', lat: -9.28, lng: -48.24, altitude: 0.74 },
  'MX-AGU': { code: 'MX-AGU', country: 'MX', name: 'Aguascalientes', lat: 22.07, lng: -102.35, altitude: 0.2 },
  'MX-BCN': { code: 'MX-BCN', country: 'MX', name: 'Baja California', lat: 30.36, lng: -114.94, altitude: 0.42, localNames: ['BC'] },
  'MX-BCS': { code: 'MX-BCS', country: 'MX', name: 'Baja California Sur', lat: 25.44, lng: -112.25, altitude: 0.46, localNames: ['BCS'] },
  'MX-CAM': { code: 'MX-CAM', country: 'MX', name: 'Campeche', lat: 19.31, lng: -90.75, altitude: 0.3 },
  'MX-CHH': { code: 'MX-CHH', country: 'MX', name: 'Chihuahua', lat: 28.7, lng: -106.23, altitude: 0.55 },
  'MX-CHP': { code: 'MX-CHP', country: 'MX', name: 'Chiapas', lat: 16.27, lng: -92.25, altitude: 0.32 },
  'MX-CMX': { code: 'MX-CMX', country: 'MX', name: 'Mexico City', lat: 19.31, lng: -99.13, altitude: 0.2, localNames: ['Ciudad de México', 'CDMX'] },
  'MX-COA': { code: 'MX-COA', country: 'MX', name: 'Coahuila', lat: 27.23, lng: -101.88, altitude: 0.48 },
  'MX-COL': { code: 'MX-COL', country: 'MX', name: 'Colima', lat: 19.12, lng: -104.03, altitude: 0.2 },
  'MX-DUR': { code: 'MX-DUR', country: 'MX', name: 'Durango', lat: 24.58, lng: -104.81, altitude: 0.41 },
  'MX-GRO': { code: 'MX-GRO', country: 'MX', name: 'Guerrero', lat: 17.59, lng: -100.09, altitude: 0.36 },
  'MX-GUA': { code: 'MX-GUA', country: 'MX', name: 'Guanajuato', lat: 20.89, lng: -100.91, altitude: 0.2 },
  'MX-HID': { code: 'MX-HID', country: 'MX', name: 'Hidalgo', lat: 20.49, lng: -98.92, altitude: 0.2 },
  'MX-JAL': { code: 'MX-JAL', country: 'MX', name: 'Jalisco', lat: 20.86, lng: -103.61, altitude: 0.35 },
  'MX-MEX': { code: 'MX-MEX', country: 'MX', name: 'State of Mexico', lat: 19.35, lng: -99.61, altitude: 0.2, localNames: ['Estado de México', 'Edomex'] },
  'MX-MIC': { code: 'MX-MIC', country: 'MX', name: 'Michoacán', lat: 19.16, lng: -101.93, altitude: 0.31 },
  'MX-MOR': { code: 'MX-MOR', country: 'MX', name: 'Morelos', lat: 18.75, lng: -99.08, altitude: 0.2 },
  'MX-NAY': { code: 'MX-NAY', country: 'MX', name: 'Nayarit', lat: 21.87, lng: -104.84, altitude: 0.21 },
  'MX-NLE': { code: 'MX-NLE', country: 'MX', name: 'Nuevo León', lat: 25.49, lng: -99.84, altitude: 0.41, localNames: ['NL'] },
  'MX-OAX': { code: 'MX-OAX', country: 'MX', name: 'Oaxaca', lat: 17.16, lng: -96.2, altitude: 0.4 },
  'MX-PUE': { code: 'MX-PUE', country: 'MX', name: 'Puebla', lat: 19.36, lng: -97.89, altitude: 0.26 },
  'MX-QUE': { code: 'MX-QUE', country: 'MX', name: 'Querétaro', lat: 20.8, lng: -99.81, altitude: 0.2 },
  'MX-ROO': { code: 'MX-ROO', country: 'MX', name: 'Quintana Roo', lat: 19.76, lng: -88.08, altitude: 0.34 },
  'MX-SIN': { code: 'MX-SIN', country: 'MX', name: 'Sinaloa', lat: 24.77, lng: -107.41, altitude: 0.42 },
  'MX-SLP': { code: 'MX-SLP', country: 'MX', name: 'San Luis Potosí', lat: 22.87, lng: -100.32, altitude: 0.33, localNames: ['SLP'] },
  'MX-SON': { code: 'MX-SON', country: 'MX', name: 'Sonora', lat: 29.41, lng: -111.75, altitude: 0.56 },
  'MX-TAB': { code: 'MX-TAB', country: 'MX', name: 'Tabasco', lat: 17.95, lng: -92.56, altitude: 0.27 },
  'MX-TAM': { code: 'MX-TAM', country: 'MX', name: 'Tamaulipas', lat: 24.95, lng: -98.63, altitude: 0.49 },
  'MX-TLA': { code: 'MX-TLA', country: 'MX', name: 'Tlaxcala', lat: 19.42, lng: -98.16, altitude: 0.2 },
  'MX-VER': { code: 'MX-VER', country: 'MX', name: 'Veracruz', lat: 19.81, lng: -96.12, altitude: 0.48 },
  'MX-YUC': { code: 'MX-YUC', country: 'MX', name: 'Yucatán', lat: 20.63, lng: -88.98, altitude: 0.25 },
  'MX-ZAC': { code: 'MX-ZAC', country: 'MX', name: 'Zacatecas', lat: 23.11, lng: -102.58, altitude: 0.37 },
  'AR-A': { code: 'AR-A', country: 'AR', name: 'Salta', lat: -24.19, lng: -65.45, altitude: 0.51 },
  'AR-B': { code: 'AR-B', country: 'AR', name: 'Buenos Aires Province', lat: -37.16, lng: -60.02, altitude: 0.7, localNames: ['Provincia de Buenos Aires', 'bonaerense'] },
  'AR-C': { code: 'AR-C', country: 'AR', name: 'Buenos Aires City', lat: -34.65, lng: -58.44, altitude: 0.2, localNames: ['Ciudad de Buenos Aires', 'CABA', 'porteño'] },
  'AR-D': { code: 'AR-D', country: 'AR', name: 'San Luis', lat: -33.92, lng: -66.14, altitude: 0.37 },
  'AR-E': { code: 'AR-E', country: 'AR', name: 'Entre Ríos', lat: -32.1, lng: -59.28, altitude: 0.35, localNames: ['entrerriano'] },
  'AR-F': { code: 'AR-F', country: 'AR', name: 'La Rioja', lat: -29.84, lng: -67.53, altitude: 0.38, localNames: ['riojano'] },
  'AR-G': { code: 'AR-G', country: 'AR', name: 'Santiago del Estero', lat: -27.87, lng: -63.45, altitude: 0.41, localNames: ['santiagueño'] },
  'AR-H': { code: 'AR-H', country: 'AR', name: 'Chaco', lat: -26.06, lng: -60.88, altitude: 0.41, localNames: ['chaqueño'] },
  'AR-J': { code: 'AR-J', country: 'AR', name: 'San Juan', lat: -30.37, lng: -68.66, altitude: 0.35, localNames: ['sanjuanino'] },
  'AR-K': { code: 'AR-K', country: 'AR', name: 'Catamarca', lat: -27.65, lng: -67, altitude: 0.45 },
  'AR-L': { code: 'AR-L', country: 'AR', name: 'La Pampa', lat: -37.16, lng: -65.84, altitude: 0.39, localNames: ['pampeano'] },
  'AR-M': { code: 'AR-M', country: 'AR', name: 'Mendoza', lat: -34.76, lng: -68.55, altitude: 0.5, localNames: ['mendocino'] },
  'AR-N': { code: 'AR-N', country: 'AR', name: 'Misiones', lat: -26.82, lng: -54.84, altitude: 0.24, localNames: ['misionero'] },
  'AR-P': { code: 'AR-P', country: 'AR', name: 'Formosa', lat: -24.68, lng: -59.95, altitude: 0.4 },
  'AR-Q': { code: 'AR-Q', country: 'AR', name: 'Neuquén', lat: -38.62, lng: -69.98, altitude: 0.45, localNames: ['neuquino'] },
  'AR-R': { code: 'AR-R', country: 'AR', name: 'Río Negro', lat: -39.78, lng: -67.37, altitude: 0.63, localNames: ['rionegrino'] },
  'AR-S': { code: 'AR-S', country: 'AR', name: 'Santa Fe', lat: -31.19, lng: -60.86, altitude: 0.57, localNames: ['santafesino'] },
  'AR-T': { code: 'AR-T', country: 'AR', name: 'Tucumán', lat: -27.06, lng: -65.34, altitude: 0.2, localNames: ['tucumano'] },
  'AR-U': { code: 'AR-U', country: 'AR', name: 'Chubut', lat: -44, lng: -67.87, altitude: 0.55 },
  'AR-V': { code: 'AR-V', country: 'AR', name: 'Tierra del Fuego', lat: -53.84, lng: -66.89, altitude: 0.22, localNames: ['fueguino'] },
  'AR-W': { code: 'AR-W', country: 'AR', name: 'Corrientes', lat: -29.01, lng: -57.64, altitude: 0.32, localNames: ['correntino'] },
  'AR-X': { code: 'AR-X', country: 'AR', name: 'Córdoba', lat: -32.21, lng: -63.75, altitude: 0.5, localNames: ['cordobés'] },
  'AR-Y': { code: 'AR-Y', country: 'AR', name: 'Jujuy', lat: -23.2, lng: -65.7, altitude: 0.26, localNames: ['jujeño'] },
  'AR-Z': { code: 'AR-Z', country: 'AR', name: 'Santa Cruz', lat: -49.2, lng: -69.64, altitude: 0.58, localNames: ['santacruceño'] },
  'IN-AN': { code: 'IN-AN', country: 'IN', name: 'Andaman and Nicobar Islands', lat: 10.15, lng: 93.14, altitude: 0.61, localNames: ['Andaman', 'Port Blair'] },
  'IN-AP': { code: 'IN-AP', country: 'IN', name: 'Andhra Pradesh', lat: 15.89, lng: 80.75, altitude: 0.7, localNames: ['AP'] },
  'IN-AR': { code: 'IN-AR', country: 'IN', name: 'Arunachal Pradesh', lat: 28.05, lng: 94.46, altitude: 0.46 },
  'IN-AS': { code: 'IN-AS', country: 'IN', name: 'Assam', lat: 26.06, lng: 92.85, altitude: 0.51 },
  'IN-BR': { code: 'IN-BR', country: 'IN', name: 'Bihar', lat: 25.9, lng: 85.81, altitude: 0.4 },
  'IN-CG': { code: 'IN-CG', country: 'IN', name: 'Chhattisgarh', lat: 20.96, lng: 82.31, altitude: 0.57 },
  'IN-CH': { code: 'IN-CH', country: 'IN', name: 'Chandigarh', lat: 30.73, lng: 76.77, altitude: 0.2 },
  'IN-DH': { code: 'IN-DH', country: 'IN', name: 'Dadra and Nagar Haveli and Daman and Diu', lat: 20.18, lng: 73.03, altitude: 0.2, localNames: ['Daman', 'Diu', 'Silvassa'] },
  'IN-DL': { code: 'IN-DL', country: 'IN', name: 'Delhi', lat: 28.66, lng: 77.09, altitude: 0.2 },
  'IN-GA': { code: 'IN-GA', country: 'IN', name: 'Goa', lat: 15.33, lng: 73.99, altitude: 0.2 },
  'IN-GJ': { code: 'IN-GJ', country: 'IN', name: 'Gujarat', lat: 22.39, lng: 71.31, altitude: 0.52 },
  'IN-HP': { code: 'IN-HP', country: 'IN', name: 'Himachal Pradesh', lat: 31.8, lng: 77.29, altitude: 0.26, localNames: ['Himachal'] },
  'IN-HR': { code: 'IN-HR', country: 'IN', name: 'Haryana', lat: 29.3, lng: 76.03, altitude: 0.29 },
  'IN-JH': { code: 'IN-JH', country: 'IN', name: 'Jharkhand', lat: 23.66, lng: 85.62, altitude: 0.38 },
  'IN-JK': { code: 'IN-JK', country: 'IN', name: 'Jammu and Kashmir', lat: 33.53, lng: 75.27, altitude: 0.22, localNames: ['J&K', 'Kashmir', 'Jammu'] },
  'IN-KA': { code: 'IN-KA', country: 'IN', name: 'Karnataka', lat: 15.05, lng: 76.33, altitude: 0.61 },
  'IN-KL': { code: 'IN-KL', country: 'IN', name: 'Kerala', lat: 10.52, lng: 76.15, altitude: 0.4 },
  'IN-LA': { code: 'IN-LA', country: 'IN', name: 'Ladakh', lat: 33.93, lng: 77.42, altitude: 0.31 },
  'IN-LD': { code: 'IN-LD', country: 'IN', name: 'Lakshadweep', lat: 9.75, lng: 72.92, altitude: 0.27 },
  'IN-MH': { code: 'IN-MH', country: 'IN', name: 'Maharashtra', lat: 18.81, lng: 76.78, altitude: 0.7 },
  'IN-ML': { code: 'IN-ML', country: 'IN', name: 'Meghalaya', lat: 25.55, lng: 91.31, altitude: 0.24 },
  'IN-MN': { code: 'IN-MN', country: 'IN', name: 'Manipur', lat: 24.77, lng: 93.85, altitude: 0.2 },
  'IN-MP': { code: 'IN-MP', country: 'IN', name: 'Madhya Pradesh', lat: 23.96, lng: 78.42, altitude: 0.72, localNames: ['MP'] },
  'IN-MZ': { code: 'IN-MZ', country: 'IN', name: 'Mizoram', lat: 23.23, lng: 92.83, altitude: 0.22 },
  'IN-NL': { code: 'IN-NL', country: 'IN', name: 'Nagaland', lat: 26.12, lng: 94.3, altitude: 0.2 },
  'IN-OD': { code: 'IN-OD', country: 'IN', name: 'Odisha', lat: 20.18, lng: 84.44, altitude: 0.51 },
  'IN-PB': { code: 'IN-PB', country: 'IN', name: 'Punjab', lat: 31.04, lng: 75.39, altitude: 0.27 },
  'IN-PY': { code: 'IN-PY', country: 'IN', name: 'Puducherry', lat: 11.38, lng: 79.77, altitude: 0.2, localNames: ['Pondicherry'] },
  'IN-RJ': { code: 'IN-RJ', country: 'IN', name: 'Rajasthan', lat: 26.63, lng: 73.84, altitude: 0.7 },
  'IN-SK': { code: 'IN-SK', country: 'IN', name: 'Sikkim', lat: 27.59, lng: 88.44, altitude: 0.2 },
  'IN-TN': { code: 'IN-TN', country: 'IN', name: 'Tamil Nadu', lat: 10.78, lng: 78.29, altitude: 0.49, localNames: ['TN'] },
  'IN-TR': { code: 'IN-TR', country: 'IN', name: 'Tripura', lat: 23.77, lng: 91.75, altitude: 0.2 },
  'IN-TS': { code: 'IN-TS', country: 'IN', name: 'Telangana', lat: 17.85, lng: 79.52, altitude: 0.39 },
  'IN-UK': { code: 'IN-UK', country: 'IN', name: 'Uttarakhand', lat: 30.09, lng: 79.3, altitude: 0.27 },
  'IN-UP': { code: 'IN-UP', country: 'IN', name: 'Uttar Pradesh', lat: 27.15, lng: 80.84, altitude: 0.6, localNames: ['UP'] },
  'IN-WB': { code: 'IN-WB', country: 'IN', name: 'West Bengal', lat: 24.41, lng: 87.86, altitude: 0.51, localNames: ['Bengal'] },
};
