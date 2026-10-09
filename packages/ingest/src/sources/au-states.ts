import type { SourceConfig } from '../sources.config';

type AuRegion = 'ACT' | 'NSW' | 'NT' | 'QLD' | 'SA' | 'TAS' | 'VIC' | 'WA';

const src = (id: string, name: string, region: AuRegion, feedUrls: string[], authority: number): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'AU',
  language: 'en',
  region: `AU-${region}`,
  feedUrls,
  authority,
});

/**
 * ABC News state and territory "latest stories" collections. The state "top
 * stories" feeds (NSW 5555986 etc.) mix national and world stories in.
 */
const abc = (id: number) => `https://www.abc.net.au/news/feed/${id}/rss.xml`;
/** Nine mastheads' state sections (SMH, The Age, Brisbane Times, WAtoday). */
const nine = (host: string, section: string) => `https://www.${host}/rss/national/${section}.xml`;
/** 7NEWS (Seven West Media) state sections. */
const seven = (state: string) => `https://7news.com.au/news/${state}/rss`;
/** Australian Community Media mastheads. */
const acm = (host: string) => `https://www.${host}/rss.xml`;
/** Guardian Australia state tags. */
const guardian = (tag: string) => `https://www.theguardian.com/australia-news/${tag}/rss`;
/** Star News Group local papers (WordPress). They share a few syndicated features, which reach every site with the same headline. */
const star = (host: string) => `https://${host}/feed/`;

/**
 * Australia's 6 states and 2 mainland territories: regional outlets, one
 * region per source. ABC state desks 8, the main metropolitan papers' state
 * sections 9, Guardian Australia's state tags 8, local TV, regional dailies and
 * digital outlets 7.
 *
 * Unusable here: every News Corp feed (Daily Telegraph, Herald Sun,
 * Courier-Mail, The Advertiser, The Mercury, NT News, Townsville Bulletin...)
 * answers 200 with an empty body. InQueensland and CityNews (Canberra) return
 * 403 to our User-Agent, as do several ACM South Australian mastheads (Port
 * Lincoln Times, Victor Harbor Times, Murray Valley Standard, Whyalla News) and
 * The Border Watch. NT Independent prints an HTML fragment before its XML
 * declaration and Sunshine Coast News's feed does not parse. InDaily publishes
 * no feed we could find. 9News's state feeds return 404. ACM's smaller
 * mastheads (Mandurah Mail, Bunbury Mail, Redland City Bulletin) are mostly
 * network copy weeks old. 7NEWS ACT and Guardian Australia's ACT, NT, SA, WA
 * and Tasmania tags post a few times a week at most.
 */
export const AU_STATES: SourceConfig[] = [
  // ---- Australian Capital Territory ----
  src('au_act_abc', 'ABC News Canberra', 'ACT', [abc(48320)], 8),
  src('au_act_canberratimes', 'The Canberra Times', 'ACT', [acm('canberratimes.com.au')], 9),
  src('au_act_region', 'Region Canberra', 'ACT', ['https://region.com.au/feed'], 7),
  // Also lists property listings and its daily digital edition ("8 October 2026").
  src('au_act_canberradaily', 'Canberra Daily', 'ACT', ['https://canberradaily.com.au/feed'], 7),

  // ---- New South Wales ----
  src('au_nsw_abc', 'ABC News NSW', 'NSW', [abc(52498)], 8),
  src('au_nsw_smh', 'Sydney Morning Herald (NSW)', 'NSW', [nine('smh.com.au', 'nsw')], 9),
  src('au_nsw_guardian', 'Guardian Australia (NSW)', 'NSW', [guardian('new-south-wales')], 8),
  src('au_nsw_7news', '7NEWS Sydney', 'NSW', [seven('nsw')], 7),
  src('au_nsw_newcastleherald', 'Newcastle Herald', 'NSW', [acm('newcastleherald.com.au')], 7),
  src('au_nsw_illawarramercury', 'Illawarra Mercury', 'NSW', [acm('illawarramercury.com.au')], 7),
  src('au_nsw_echo', 'The Echo (Byron Shire)', 'NSW', ['https://www.echo.net.au/feed/'], 7),

  // ---- Northern Territory ----
  src('au_nt_abc', 'ABC News NT', 'NT', [abc(53408)], 8),
  src('au_nt_7news', '7NEWS Darwin', 'NT', [seven('nt')], 7),
  src('au_nt_katherinetimes', 'Katherine Times', 'NT', [acm('katherinetimes.com.au')], 7),

  // ---- Queensland ----
  src('au_qld_abc', 'ABC News Queensland', 'QLD', [abc(50990)], 8),
  src('au_qld_brisbanetimes', 'Brisbane Times', 'QLD', [nine('brisbanetimes.com.au', 'queensland')], 9),
  src('au_qld_7news', '7NEWS Brisbane', 'QLD', [seven('qld')], 7),
  src('au_qld_noosatoday', 'Noosa Today', 'QLD', [star('noosatoday.com.au')], 7),
  src('au_qld_gympietoday', 'Gympie Today', 'QLD', [star('gympietoday.com.au')], 7),
  src('au_qld_nqr', 'North Queensland Register', 'QLD', [acm('northqueenslandregister.com.au')], 7),

  // ---- South Australia ----
  src('au_sa_abc', 'ABC News SA', 'SA', [abc(54702)], 8),
  src('au_sa_7news', '7NEWS Adelaide', 'SA', [seven('sa')], 7),
  src('au_sa_stockjournal', 'Stock Journal', 'SA', [acm('stockjournal.com.au')], 7),
  src('au_sa_glamadelaide', 'Glam Adelaide', 'SA', ['https://glamadelaide.com.au/feed/'], 7),

  // ---- Tasmania ----
  src('au_tas_abc', 'ABC News Tasmania', 'TAS', [abc(50042)], 8),
  // The Advocate (Burnie) shares much of The Examiner's copy, so only The Examiner is used.
  src('au_tas_examiner', 'The Examiner', 'TAS', [acm('examiner.com.au')], 9),
  src('au_tas_pulse', 'Pulse Tasmania', 'TAS', ['https://www.pulsetasmania.com.au/feed'], 7),
  src('au_tas_tasmaniantimes', 'Tasmanian Times', 'TAS', ['https://tasmaniantimes.com/feed'], 7),

  // ---- Victoria ----
  src('au_vic_abc', 'ABC News Victoria', 'VIC', [abc(54242)], 8),
  src('au_vic_theage', 'The Age (Victoria)', 'VIC', [nine('theage.com.au', 'victoria')], 9),
  src('au_vic_7news', '7NEWS Melbourne', 'VIC', [seven('vic')], 7),
  src('au_vic_bendigoadvertiser', 'Bendigo Advertiser', 'VIC', [acm('bendigoadvertiser.com.au')], 7),
  src('au_vic_sunraysiadaily', 'Sunraysia Daily', 'VIC', [star('www.sunraysiadaily.com.au')], 7),
  src('au_vic_gippslandtimes', 'Gippsland Times', 'VIC', [star('www.gippslandtimes.com.au')], 7),

  // ---- Western Australia ----
  src('au_wa_abc', 'ABC News WA', 'WA', [abc(52764)], 8),
  src('au_wa_thewest', 'The West Australian (WA)', 'WA', ['https://thewest.com.au/news/wa/rss'], 9),
  src('au_wa_watoday', 'WAtoday', 'WA', [nine('watoday.com.au', 'western-australia')], 9),
  src('au_wa_businessnews', 'Business News (WA)', 'WA', ['https://www.businessnews.com.au/rssfeed/latest.rss'], 7),
  src('au_wa_farmweekly', 'Farm Weekly', 'WA', [acm('farmweekly.com.au')], 7),
];
