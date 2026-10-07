/**
 * Data contract between the ingest worker and the web app.
 *
 * The worker writes these shapes as static JSON (`data/index.json`,
 * `data/countries/{CC}.json`, `data/regions/{CC}-{R}.json`); the web app only
 * ever reads them. Bump
 * `SCHEMA_VERSION` on any breaking change.
 */

export const SCHEMA_VERSION = 1;

/** ISO 3166-1 alpha-2 country code, upper case (e.g. "FR"). */
export type CountryCode = string;

/** ISO 3166-2 subdivision code, upper case (e.g. "FR-BRE"). */
export type RegionCode = string;

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
}

export interface CountryFile {
  schemaVersion: number;
  countryCode: CountryCode;
  countryName: string;
  /** Set on regional files (`regions/{code}.json`), which share this shape. */
  regionCode?: RegionCode;
  regionName?: string;
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
}

export interface IndexFile {
  schemaVersion: number;
  updatedAt: string;
  countries: IndexEntry[];
  /** Regions with a file. Optional: older index files have none. */
  regions?: IndexEntry[];
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
};
