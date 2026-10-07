import type { SourceConfig } from '../sources.config';

type Province = 'AB' | 'BC' | 'MB' | 'NB' | 'NL' | 'NS' | 'NT' | 'NU' | 'ON' | 'PE' | 'QC' | 'SK' | 'YT';

const src = (
  id: string,
  name: string,
  province: Province,
  language: 'en' | 'fr',
  feedUrls: string[],
  authority: number,
): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'CA',
  language,
  region: `CA-${province}`,
  feedUrls,
  authority,
});

/** Radio-Canada regional newsroom, every story ("en continu"). */
const rc = (slug: string) => `https://ici.radio-canada.ca/info/rss/${slug}/en-continu`;
/** CTV News local site (Bell Media). Dates run a few hours ahead; the pipeline clamps them. */
const ctv = (section: string) => `https://www.ctvnews.ca/arc/outboundfeeds/rss/category/${section}/?outputType=xml`;
/** Global News city/province page (Corus). */
const global = (city: string) => `https://globalnews.ca/${city}/feed/`;
/** Postmedia paper, local-news section (the only Postmedia category that serves a feed). */
const postmedia = (host: string) => `https://${host}/category/news/local-news/feed`;
/** SaltWire (PNI Atlantic News) province section: The Chronicle Herald, The Guardian, The Telegram. */
const saltwire = (province: string) => `https://www.saltwire.com/category/${province}/feed`;

/**
 * Canada's 10 provinces and 3 territories: regional outlets, one region per
 * source. Radio-Canada regional newsrooms 8, main dailies' local sections 9
 * (smaller dailies 8), local TV and digital outlets 7.
 *
 * Unusable here: every CBC webfeed (rss-canada-<city>) hangs until timeout for
 * our User-Agent; the Toronto Star, Hamilton Spectator and Winnipeg Sun return
 * 429, Glacier papers (Times Colonist), VOCM, paNOW, CJME, CKRW, The Rover and
 * the Saskatchewan Dispatch 403; the Whitehorse Star's certificate has expired.
 * Postmedia only serves feeds for some categories: the Montreal Gazette,
 * Regina Leader-Post and Saskatoon StarPhoenix have no local-news feed. CityNews
 * city feeds (Rogers) are half Canadian Press wire, so only Toronto and Montreal
 * are kept; Global News' Ontario city pages all mirror Global Toronto.
 *
 * Black Press northern papers (NNSL, Nunavut News, Yukon News) share columns and
 * B.C. wire copy with each other; SaltWire's province sections share Atlantic
 * columns; Radio-Canada Acadie's province feeds share Acadie-wide items.
 */
export const CA_PROVINCES: SourceConfig[] = [
  // ---- Alberta ----
  src('ca_ab_radiocanada', 'Radio-Canada Alberta', 'AB', 'fr', [rc('alberta')], 8),
  src('ca_ab_calgary_herald', 'Calgary Herald', 'AB', 'en', [postmedia('calgaryherald.com')], 9),
  src('ca_ab_edmonton_journal', 'Edmonton Journal', 'AB', 'en', [postmedia('edmontonjournal.com')], 9),
  src('ca_ab_global', 'Global News Calgary / Edmonton', 'AB', 'en', [global('calgary'), global('edmonton')], 7),
  src('ca_ab_ctv', 'CTV News Calgary / Edmonton', 'AB', 'en', [ctv('calgary'), ctv('edmonton')], 7),

  // ---- British Columbia ----
  src('ca_bc_radiocanada', 'Radio-Canada Colombie-Britannique', 'BC', 'fr', [rc('colombie-britannique')], 8),
  src('ca_bc_vancouver_sun', 'Vancouver Sun', 'BC', 'en', [postmedia('vancouversun.com')], 9),
  src('ca_bc_global', 'Global News BC', 'BC', 'en', [global('bc')], 7),
  src('ca_bc_ctv', 'CTV News Vancouver', 'BC', 'en', [ctv('vancouver')], 7),
  src('ca_bc_chek', 'CHEK News', 'BC', 'en', ['https://www.cheknews.ca/feed/'], 7),
  src('ca_bc_castanet', 'Castanet', 'BC', 'en', ['https://www.castanet.net/rss/topheadlines.xml'], 7),

  // ---- Manitoba ----
  src('ca_mb_radiocanada', 'Radio-Canada Manitoba', 'MB', 'fr', [rc('manitoba')], 8),
  src('ca_mb_free_press', 'Winnipeg Free Press', 'MB', 'en', ['https://www.winnipegfreepress.com/local/feed'], 9),
  src('ca_mb_global', 'Global News Winnipeg', 'MB', 'en', [global('winnipeg')], 7),
  src('ca_mb_ctv', 'CTV News Winnipeg', 'MB', 'en', [ctv('winnipeg')], 7),

  // ---- New Brunswick ----
  src('ca_nb_radiocanada', 'Radio-Canada Acadie (Nouveau-Brunswick)', 'NB', 'fr', [rc('acadie/nouveau-brunswick')], 8),
  src('ca_nb_telegraph_journal', 'Telegraph-Journal', 'NB', 'en', ['https://tj.news/feed'], 9),
  src('ca_nb_acadie_nouvelle', 'Acadie Nouvelle', 'NB', 'fr', ['https://www.acadienouvelle.com/feed/'], 8),
  src('ca_nb_ctv', 'CTV News Atlantic (New Brunswick)', 'NB', 'en', [ctv('atlantic/new-brunswick')], 7),

  // ---- Newfoundland and Labrador ----
  src('ca_nl_radiocanada', 'Radio-Canada Acadie (Terre-Neuve-et-Labrador)', 'NL', 'fr', [rc('acadie/terre-neuve-et-labrador')], 8),
  src('ca_nl_saltwire', 'SaltWire / The Telegram', 'NL', 'en', [saltwire('newfoundland-labrador')], 9),
  src('ca_nl_ntv', 'NTV News', 'NL', 'en', ['https://ntv.ca/feed/'], 7),

  // ---- Nova Scotia ----
  src('ca_ns_radiocanada', 'Radio-Canada Acadie (Nouvelle-Écosse)', 'NS', 'fr', [rc('acadie/nouvelle-ecosse')], 8),
  src('ca_ns_saltwire', 'SaltWire / The Chronicle Herald', 'NS', 'en', [saltwire('nova-scotia')], 9),
  src('ca_ns_ctv', 'CTV News Atlantic (Nova Scotia)', 'NS', 'en', [ctv('atlantic/nova-scotia')], 7),
  src('ca_ns_global', 'Global News Halifax', 'NS', 'en', [global('halifax')], 7),
  src('ca_ns_halifax_examiner', 'Halifax Examiner', 'NS', 'en', ['https://www.halifaxexaminer.ca/feed/'], 7),

  // ---- Northwest Territories ----
  src('ca_nt_cabin_radio', 'Cabin Radio', 'NT', 'en', ['https://cabinradio.ca/feed/'], 7),
  src('ca_nt_nnsl', 'NWT News/North (NNSL)', 'NT', 'en', ['https://www.nnsl.com/feed/'], 8),
  src('ca_nt_cklb', 'CKLB Radio', 'NT', 'en', ['https://www.cklbradio.com/feed/'], 7),

  // ---- Nunavut ----
  src('ca_nu_nunatsiaq', 'Nunatsiaq News', 'NU', 'en', ['https://nunatsiaq.com/feed/'], 8),
  src('ca_nu_nunavut_news', 'Nunavut News', 'NU', 'en', ['https://www.nunavutnews.com/feed/'], 8),

  // ---- Ontario ----
  src(
    'ca_on_radiocanada',
    'Radio-Canada Ontario',
    'ON',
    'fr',
    [rc('ontario/toronto'), rc('ontario/nord-de-l-ontario'), rc('ontario/windsor')],
    8,
  ),
  src('ca_on_ottawa_citizen', 'Ottawa Citizen', 'ON', 'en', [postmedia('ottawacitizen.com')], 9),
  src('ca_on_toronto_sun', 'Toronto Sun', 'ON', 'en', [postmedia('torontosun.com')], 8),
  src('ca_on_global', 'Global News Toronto', 'ON', 'en', [global('toronto')], 7),
  src('ca_on_ctv', 'CTV News Ontario', 'ON', 'en', [ctv('toronto'), ctv('ottawa'), ctv('london'), ctv('northern-ontario')], 7),
  src('ca_on_citynews', 'CityNews Toronto', 'ON', 'en', ['https://toronto.citynews.ca/feed/'], 7),
  src(
    'ca_on_le_droit',
    'Le Droit (Ottawa)',
    'ON',
    'fr',
    [
      'https://www.ledroit.com/arc/outboundfeeds/rss/category/actualites/actualites-locales/ottawa/?outputType=xml',
      'https://www.ledroit.com/arc/outboundfeeds/rss/category/franco/?outputType=xml',
    ],
    8,
  ),
  src('ca_on_onfr', 'ONFR', 'ON', 'fr', ['https://onfr.tfo.org/feed/'], 7),

  // ---- Prince Edward Island ----
  src('ca_pe_radiocanada', 'Radio-Canada Acadie (Île-du-Prince-Édouard)', 'PE', 'fr', [rc('acadie/ile-du-prince-edouard')], 8),
  src('ca_pe_saltwire', 'SaltWire / The Guardian', 'PE', 'en', [saltwire('prince-edward-island')], 9),
  src('ca_pe_ctv', 'CTV News Atlantic (P.E.I.)', 'PE', 'en', [ctv('atlantic/prince-edward-island')], 7),

  // ---- Quebec ----
  src(
    'ca_qc_radiocanada',
    'Radio-Canada Québec',
    'QC',
    'fr',
    [rc('grandmontreal'), rc('quebec'), rc('estrie'), rc('mauricie'), rc('saguenay-lac-saint-jean')],
    8,
  ),
  src('ca_qc_la_presse', 'La Presse (Grand Montréal)', 'QC', 'fr', ['https://www.lapresse.ca/actualites/grand-montreal/rss'], 9),
  src('ca_qc_le_devoir', 'Le Devoir (Politique québécoise)', 'QC', 'fr', ['https://www.ledevoir.com/rss/section/politique/quebec.xml'], 9),
  src(
    'ca_qc_le_soleil',
    'Le Soleil',
    'QC',
    'fr',
    ['https://www.lesoleil.com/arc/outboundfeeds/rss/category/actualites/?outputType=xml'],
    9,
  ),
  src(
    'ca_qc_journal',
    'Le Journal de Montréal / de Québec',
    'QC',
    'fr',
    ['https://www.journaldemontreal.com/rss.xml', 'https://www.journaldequebec.com/rss.xml'],
    8,
  ),
  src('ca_qc_ctv', 'CTV News Montreal', 'QC', 'en', [ctv('montreal')], 7),
  src('ca_qc_global', 'Global News Montreal', 'QC', 'en', [global('montreal')], 7),
  src('ca_qc_citynews', 'CityNews Montreal', 'QC', 'en', ['https://montreal.citynews.ca/feed/'], 7),

  // ---- Saskatchewan ----
  src('ca_sk_radiocanada', 'Radio-Canada Saskatchewan', 'SK', 'fr', [rc('saskatchewan')], 8),
  src('ca_sk_global', 'Global News Regina / Saskatoon', 'SK', 'en', [global('regina'), global('saskatoon')], 7),
  src('ca_sk_ctv', 'CTV News Regina / Saskatoon', 'SK', 'en', [ctv('regina'), ctv('saskatoon')], 7),
  src('ca_sk_pa_herald', 'Prince Albert Daily Herald', 'SK', 'en', ['https://paherald.sk.ca/feed/'], 8),

  // ---- Yukon ----
  // The only reachable Yukon outlet: CBC North is down for us, the Whitehorse
  // Star's certificate has expired, CKRW returns 403, and Radio-Canada Grand Nord
  // mixes all three territories and Nunavik.
  src('ca_yt_yukon_news', 'Yukon News', 'YT', 'en', ['https://www.yukon-news.com/feed/'], 8),
];
