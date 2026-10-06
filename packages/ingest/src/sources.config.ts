import type { CountryCode } from '@news-globe/shared';

export interface SourceConfig {
  /** Stable id; also the outlet identity used for "distinct outlets". */
  id: string;
  name: string;
  /** Adapter that fetches this source. Only "rss" is implemented. */
  type: 'rss' | 'gdelt';
  country: CountryCode;
  language: string;
  /**
   * Feed URLs for this outlet. Prefer national / politics / society section
   * feeds over "all news" feeds, which mix in international stories.
   */
  feedUrls: string[];
  /** Relative editorial authority, used to pick a cluster's representative. Higher wins. */
  authority: number;
}

/**
 * Curated national outlets. Every URL below was fetched and parsed with the
 * real User-Agent on 2026-10-06 — see the README ("Sources") for what was
 * swapped or dropped and why.
 */
export const SOURCES: SourceConfig[] = [
  // ---- France ----
  {
    id: 'lemonde',
    name: 'Le Monde',
    type: 'rss',
    country: 'FR',
    language: 'fr',
    feedUrls: [
      'https://www.lemonde.fr/politique/rss_full.xml',
      'https://www.lemonde.fr/societe/rss_full.xml',
    ],
    authority: 10,
  },
  {
    id: 'franceinfo',
    name: 'franceinfo',
    type: 'rss',
    country: 'FR',
    language: 'fr',
    feedUrls: ['https://www.franceinfo.fr/politique.rss', 'https://www.franceinfo.fr/france.rss'],
    authority: 9,
  },
  {
    id: 'lefigaro',
    name: 'Le Figaro',
    type: 'rss',
    country: 'FR',
    language: 'fr',
    feedUrls: [
      'https://www.lefigaro.fr/rss/figaro_politique.xml',
      'https://www.lefigaro.fr/rss/figaro_actualite-france.xml',
    ],
    authority: 8,
  },
  {
    id: 'liberation',
    name: 'Libération',
    type: 'rss',
    country: 'FR',
    language: 'fr',
    feedUrls: [
      'https://www.liberation.fr/arc/outboundfeeds/rss-all/category/politique/?outputType=xml',
      'https://www.liberation.fr/arc/outboundfeeds/rss-all/category/societe/?outputType=xml',
    ],
    authority: 7,
  },
  // Replaces Les Echos (all RSS endpoints return 403 to non-browser clients).
  {
    id: 'ouestfrance',
    name: 'Ouest-France',
    type: 'rss',
    country: 'FR',
    language: 'fr',
    feedUrls: ['https://www.ouest-france.fr/rss/france'],
    authority: 6,
  },
  {
    id: '20minutes',
    name: '20 Minutes',
    type: 'rss',
    country: 'FR',
    language: 'fr',
    feedUrls: [
      'https://www.20minutes.fr/feeds/rss-politique.xml',
      'https://www.20minutes.fr/feeds/rss-societe.xml',
    ],
    authority: 5,
  },

  // ---- United States ----
  // AP is dropped: it publishes no official RSS and apnews.com returns 403.
  {
    id: 'nyt',
    name: 'The New York Times',
    type: 'rss',
    country: 'US',
    language: 'en',
    feedUrls: [
      'https://rss.nytimes.com/services/xml/rss/nyt/Politics.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
    ],
    authority: 10,
  },
  {
    id: 'wapo',
    name: 'The Washington Post',
    type: 'rss',
    country: 'US',
    language: 'en',
    feedUrls: [
      'https://feeds.washingtonpost.com/rss/politics',
      'https://feeds.washingtonpost.com/rss/national',
    ],
    authority: 9,
  },
  {
    id: 'npr',
    name: 'NPR',
    type: 'rss',
    country: 'US',
    language: 'en',
    feedUrls: ['https://feeds.npr.org/1014/rss.xml', 'https://feeds.npr.org/1003/rss.xml'],
    authority: 8,
  },
  {
    id: 'pbs',
    name: 'PBS News',
    type: 'rss',
    country: 'US',
    language: 'en',
    feedUrls: [
      'https://www.pbs.org/newshour/feeds/rss/politics',
      'https://www.pbs.org/newshour/feeds/rss/nation',
    ],
    authority: 8,
  },
  // CBS and ABC stand in for AP as wire-like, high-volume national coverage.
  {
    id: 'cbs',
    name: 'CBS News',
    type: 'rss',
    country: 'US',
    language: 'en',
    feedUrls: ['https://www.cbsnews.com/latest/rss/politics', 'https://www.cbsnews.com/latest/rss/us'],
    authority: 7,
  },
  {
    id: 'abc',
    name: 'ABC News',
    type: 'rss',
    country: 'US',
    language: 'en',
    feedUrls: [
      'https://abcnews.com/abcnews/politicsheadlines',
      'https://abcnews.com/abcnews/usheadlines',
    ],
    authority: 7,
  },
];

export const INGEST_SETTINGS = {
  userAgent:
    'NewsGlobeBot/0.1 (+https://github.com/benjamin-gaultier/news-globe; headline metadata only)',
  /** Never request the same feed more often than this, even on manual runs. */
  minFetchIntervalMs: 15 * 60 * 1000,
  /**
   * Scheduling slack: cron fires every 15 min with millisecond jitter, so a
   * strict check would skip every other slot. Requests stay ≥ 14m55s apart.
   */
  fetchIntervalSlackMs: 5_000,
  fetchTimeoutMs: 20_000,
  /** Ignore articles older than this. */
  maxArticleAgeHours: 48,
  /** Window for counting distinct outlets when ranking. */
  rankingWindowHours: 24,
  /**
   * Token-set Jaccard similarity at or above which two headlines are merged.
   * 0.4 was the starting point, but on live FR/US feeds same-story headlines
   * from different outlets mostly score 0.3–0.5 (long, differently worded
   * titles); 0.3 caught them without merging distinct stories.
   */
  clusterThreshold: 0.3,
  /** Minimum shared tokens, so two very short titles can't merge on one word. */
  clusterMinSharedTokens: 2,
  maxClustersPerCountry: 15,
  descriptionMaxChars: 300,
  /** node-cron schedule for `pnpm ingest:watch`. */
  cronSchedule: '*/15 * * * *',
};
