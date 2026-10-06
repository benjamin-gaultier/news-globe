/**
 * Data contract between the ingest worker and the web app.
 *
 * The worker writes these shapes as static JSON (`data/index.json`,
 * `data/countries/{CC}.json`); the web app only ever reads them. Bump
 * `SCHEMA_VERSION` on any breaking change.
 */

export const SCHEMA_VERSION = 1;

/** ISO 3166-1 alpha-2 country code, upper case (e.g. "FR"). */
export type CountryCode = string;

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
  /** Sub-national region (ISO 3166-2). Reserved for regional headlines; always null for now. */
  regionCode: string | null;
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
}

export interface CountryFile {
  schemaVersion: number;
  countryCode: CountryCode;
  countryName: string;
  /** ISO 8601 time this file was generated. */
  updatedAt: string;
  /** Ranked, best first. */
  clusters: StoryCluster[];
}

export interface IndexEntry {
  code: CountryCode;
  name: string;
  updatedAt: string;
  clusterCount: number;
}

export interface IndexFile {
  schemaVersion: number;
  updatedAt: string;
  countries: IndexEntry[];
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
};
