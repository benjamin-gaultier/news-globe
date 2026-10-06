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
  // ---- United Kingdom ----
  // The Telegraph's feed is stale (newest item months old); The Times has no
  // public RSS; ITV's feed doesn't respond. The i Paper and the Mirror replace them.
  {
    id: 'bbc',
    name: 'BBC News',
    type: 'rss',
    country: 'GB',
    language: 'en',
    feedUrls: ['https://feeds.bbci.co.uk/news/uk/rss.xml', 'https://feeds.bbci.co.uk/news/politics/rss.xml'],
    authority: 10,
  },
  {
    id: 'guardian',
    name: 'The Guardian',
    type: 'rss',
    country: 'GB',
    language: 'en',
    feedUrls: ['https://www.theguardian.com/uk-news/rss', 'https://www.theguardian.com/politics/rss'],
    authority: 9,
  },
  {
    id: 'independent',
    name: 'The Independent',
    type: 'rss',
    country: 'GB',
    language: 'en',
    feedUrls: ['https://www.independent.co.uk/news/uk/politics/rss', 'https://www.independent.co.uk/news/uk/rss'],
    authority: 8,
  },
  {
    id: 'sky',
    name: 'Sky News',
    type: 'rss',
    country: 'GB',
    language: 'en',
    feedUrls: ['https://feeds.skynews.com/feeds/rss/uk.xml', 'https://feeds.skynews.com/feeds/rss/politics.xml'],
    authority: 8,
  },
  {
    id: 'inews',
    name: 'The i Paper',
    type: 'rss',
    country: 'GB',
    language: 'en',
    feedUrls: ['https://inews.co.uk/news/feed'],
    authority: 7,
  },
  {
    id: 'standard',
    name: 'Evening Standard',
    type: 'rss',
    country: 'GB',
    language: 'en',
    feedUrls: ['https://www.standard.co.uk/news/uk/rss'],
    authority: 6,
  },
  {
    id: 'mirror',
    name: 'Daily Mirror',
    type: 'rss',
    country: 'GB',
    language: 'en',
    feedUrls: ['https://www.mirror.co.uk/news/uk-news/?service=rss'],
    authority: 5,
  },
  // ---- Germany ----
  {
    id: 'tagesschau',
    name: 'tagesschau',
    type: 'rss',
    country: 'DE',
    language: 'de',
    feedUrls: ['https://www.tagesschau.de/inland/innenpolitik/index~rss2.xml', 'https://www.tagesschau.de/inland/index~rss2.xml'],
    authority: 10,
  },
  {
    id: 'spiegel',
    name: 'DER SPIEGEL',
    type: 'rss',
    country: 'DE',
    language: 'de',
    feedUrls: ['https://www.spiegel.de/politik/deutschland/index.rss'],
    authority: 9,
  },
  {
    id: 'sz',
    name: 'Süddeutsche Zeitung',
    type: 'rss',
    country: 'DE',
    language: 'de',
    feedUrls: ['https://rss.sueddeutsche.de/rss/Politik'],
    authority: 9,
  },
  {
    id: 'faz',
    name: 'Frankfurter Allgemeine',
    type: 'rss',
    country: 'DE',
    language: 'de',
    feedUrls: ['https://www.faz.net/rss/aktuell/politik/inland/'],
    authority: 8,
  },
  {
    id: 'zeit',
    name: 'ZEIT ONLINE',
    type: 'rss',
    country: 'DE',
    language: 'de',
    feedUrls: ['https://newsfeed.zeit.de/politik/deutschland/index'],
    authority: 8,
  },
  {
    id: 'welt',
    name: 'WELT',
    type: 'rss',
    country: 'DE',
    language: 'de',
    feedUrls: ['https://www.welt.de/feeds/section/politik/deutschland.rss'],
    authority: 7,
  },
  {
    id: 'ntv',
    name: 'n-tv',
    type: 'rss',
    country: 'DE',
    language: 'de',
    feedUrls: ['https://www.n-tv.de/politik/rss'],
    authority: 6,
  },
  // ---- Spain ----
  // RTVE's public feeds are stale (newest items from 2022); Europa Press doesn't respond.
  {
    id: 'elpais',
    name: 'El País',
    type: 'rss',
    country: 'ES',
    language: 'es',
    feedUrls: ['https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/espana/portada'],
    authority: 10,
  },
  {
    id: 'elmundo',
    name: 'El Mundo',
    type: 'rss',
    country: 'ES',
    language: 'es',
    feedUrls: ['https://e00-elmundo.uecdn.es/elmundo/rss/espana.xml'],
    authority: 9,
  },
  {
    id: 'abc_es',
    name: 'ABC',
    type: 'rss',
    country: 'ES',
    language: 'es',
    feedUrls: ['https://www.abc.es/rss/2.0/espana/'],
    authority: 8,
  },
  {
    id: 'lavanguardia',
    name: 'La Vanguardia',
    type: 'rss',
    country: 'ES',
    language: 'es',
    feedUrls: ['https://www.lavanguardia.com/rss/politica.xml'],
    authority: 7,
  },
  {
    id: 'elconfidencial',
    name: 'El Confidencial',
    type: 'rss',
    country: 'ES',
    language: 'es',
    feedUrls: ['https://rss.elconfidencial.com/espana/'],
    authority: 7,
  },
  {
    id: 'eldiario',
    name: 'elDiario.es',
    type: 'rss',
    country: 'ES',
    language: 'es',
    feedUrls: ['https://www.eldiario.es/rss/politica/'],
    authority: 6,
  },
  {
    id: '20minutos_es',
    name: '20minutos',
    type: 'rss',
    country: 'ES',
    language: 'es',
    feedUrls: ['https://www.20minutos.es/rss/nacional/'],
    authority: 5,
  },
  // ---- Italy ----
  // Corriere della Sera's feeds are abandoned (last built 2024); La Stampa's
  // redirect to HTML; Il Fatto Quotidiano's section feed is empty.
  // Sky TG24 items carry no dates: the date comes from the URL (dateFromUrl).
  {
    id: 'ansa',
    name: 'ANSA',
    type: 'rss',
    country: 'IT',
    language: 'it',
    feedUrls: ['https://www.ansa.it/sito/notizie/politica/politica_rss.xml', 'https://www.ansa.it/sito/notizie/cronaca/cronaca_rss.xml'],
    authority: 10,
  },
  {
    id: 'repubblica',
    name: 'la Repubblica',
    type: 'rss',
    country: 'IT',
    language: 'it',
    feedUrls: ['https://www.repubblica.it/rss/politica/rss2.0.xml', 'https://www.repubblica.it/rss/cronaca/rss2.0.xml'],
    authority: 9,
  },
  {
    id: 'rainews',
    name: 'RaiNews',
    type: 'rss',
    country: 'IT',
    language: 'it',
    feedUrls: ['https://www.rainews.it/rss/politica'],
    authority: 8,
  },
  {
    id: 'sole24ore',
    name: 'Il Sole 24 Ore',
    type: 'rss',
    country: 'IT',
    language: 'it',
    feedUrls: ['https://www.ilsole24ore.com/rss/italia.xml'],
    authority: 7,
  },
  {
    id: 'skytg24',
    name: 'Sky TG24',
    type: 'rss',
    country: 'IT',
    language: 'it',
    feedUrls: ['https://tg24.sky.it/rss/tg24_politica.xml'],
    authority: 7,
  },
  {
    id: 'ilpost',
    name: 'Il Post',
    type: 'rss',
    country: 'IT',
    language: 'it',
    feedUrls: ['https://www.ilpost.it/italia/feed/'],
    authority: 6,
  },
  // ---- Canada ----
  // CBC's webfeed endpoints hang for non-browser clients (cbc.ca itself responds);
  // the Toronto Star's RSS search returns 429. French-language outlets cluster
  // separately from English ones (no cross-language matching).
  {
    id: 'globeandmail',
    name: 'The Globe and Mail',
    type: 'rss',
    country: 'CA',
    language: 'en',
    feedUrls: ['https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/politics/', 'https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/canada/'],
    authority: 10,
  },
  {
    id: 'ctv',
    name: 'CTV News',
    type: 'rss',
    country: 'CA',
    language: 'en',
    feedUrls: ['https://www.ctvnews.ca/arc/outboundfeeds/rss/category/canada/?outputType=xml'],
    authority: 9,
  },
  {
    id: 'radiocanada',
    name: 'Radio-Canada',
    type: 'rss',
    country: 'CA',
    language: 'fr',
    feedUrls: ['https://ici.radio-canada.ca/rss/4159'],
    authority: 9,
  },
  {
    id: 'globalnews',
    name: 'Global News',
    type: 'rss',
    country: 'CA',
    language: 'en',
    feedUrls: ['https://globalnews.ca/politics/feed/', 'https://globalnews.ca/canada/feed/'],
    authority: 8,
  },
  {
    id: 'nationalpost',
    name: 'National Post',
    type: 'rss',
    country: 'CA',
    language: 'en',
    feedUrls: ['https://nationalpost.com/category/news/politics/feed', 'https://nationalpost.com/category/news/canada/feed'],
    authority: 7,
  },
  {
    id: 'lapresse',
    name: 'La Presse',
    type: 'rss',
    country: 'CA',
    language: 'fr',
    feedUrls: ['https://www.lapresse.ca/actualites/politique/rss'],
    authority: 7,
  },
  // ---- Brazil ----
  // CNN Brasil's section feed returns 404; g1's /brasil feed is stale (2023).
  // Folha's feeds are ISO-8859-1 (see decodeBody in http.ts).
  {
    id: 'g1',
    name: 'g1',
    type: 'rss',
    country: 'BR',
    language: 'pt',
    feedUrls: ['https://g1.globo.com/rss/g1/politica/'],
    authority: 10,
  },
  {
    id: 'folha',
    name: 'Folha de S.Paulo',
    type: 'rss',
    country: 'BR',
    language: 'pt',
    feedUrls: ['https://feeds.folha.uol.com.br/poder/rss091.xml', 'https://feeds.folha.uol.com.br/cotidiano/rss091.xml'],
    authority: 9,
  },
  {
    id: 'estadao',
    name: 'Estadão',
    type: 'rss',
    country: 'BR',
    language: 'pt',
    feedUrls: ['https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/politica/'],
    authority: 9,
  },
  {
    id: 'oglobo',
    name: 'O Globo',
    type: 'rss',
    country: 'BR',
    language: 'pt',
    feedUrls: ['https://oglobo.globo.com/rss/oglobo'],
    authority: 8,
  },
  {
    id: 'agenciabrasil',
    name: 'Agência Brasil',
    type: 'rss',
    country: 'BR',
    language: 'pt',
    feedUrls: ['https://agenciabrasil.ebc.com.br/rss/politica/feed.xml', 'https://agenciabrasil.ebc.com.br/rss/geral/feed.xml'],
    authority: 7,
  },
  {
    id: 'poder360',
    name: 'Poder360',
    type: 'rss',
    country: 'BR',
    language: 'pt',
    feedUrls: ['https://www.poder360.com.br/feed/'],
    authority: 7,
  },
  // ---- Turkey ----
  // Mixes state (AA, TRT), mainstream and opposition (Sözcü, Cumhuriyet) outlets.
  // T24's feed is empty; AA's politika feed is stale (months old). Sabah,
  // Milliyet, Habertürk also work as substitutes. CNN Türk stamps local time
  // as GMT (dates ~3 h ahead); toArticle clamps them to now.
  {
    id: 'aa',
    name: 'Anadolu Ajansı',
    type: 'rss',
    country: 'TR',
    language: 'tr',
    feedUrls: ['https://www.aa.com.tr/tr/rss/default?cat=guncel'],
    authority: 10,
  },
  {
    id: 'trthaber',
    name: 'TRT Haber',
    type: 'rss',
    country: 'TR',
    language: 'tr',
    feedUrls: ['https://www.trthaber.com/gundem_articles.rss'],
    authority: 9,
  },
  {
    id: 'hurriyet',
    name: 'Hürriyet',
    type: 'rss',
    country: 'TR',
    language: 'tr',
    feedUrls: ['https://www.hurriyet.com.tr/rss/gundem'],
    authority: 8,
  },
  {
    id: 'ntv_tr',
    name: 'NTV',
    type: 'rss',
    country: 'TR',
    language: 'tr',
    feedUrls: ['https://www.ntv.com.tr/gundem.rss'],
    authority: 8,
  },
  {
    id: 'sozcu',
    name: 'Sözcü',
    type: 'rss',
    country: 'TR',
    language: 'tr',
    feedUrls: ['https://www.sozcu.com.tr/feeds-rss-category-gundem'],
    authority: 7,
  },
  {
    id: 'cumhuriyet',
    name: 'Cumhuriyet',
    type: 'rss',
    country: 'TR',
    language: 'tr',
    feedUrls: ['https://www.cumhuriyet.com.tr/rss/son_dakika.xml'],
    authority: 7,
  },
  {
    id: 'cnnturk',
    name: 'CNN Türk',
    type: 'rss',
    country: 'TR',
    language: 'tr',
    feedUrls: ['https://www.cnnturk.com/feed/rss/turkiye/news'],
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
  /**
   * Average-linkage guard when merging two groups. On the 2026-10-06 feeds,
   * 0.2 split the chained US "Supreme Court new term" + "climate case" group
   * in two while every genuine multi-outlet story stayed whole; 0.25 began
   * dropping real members.
   */
  clusterMinAverageLink: 0.2,
  maxClustersPerCountry: 15,
  descriptionMaxChars: 300,
  /** node-cron schedule for `pnpm ingest:watch`. */
  cronSchedule: '*/15 * * * *',
};
