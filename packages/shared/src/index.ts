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
};
