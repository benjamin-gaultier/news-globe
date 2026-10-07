import type { SourceConfig } from '../sources.config';

type NorthState =
  | 'JK'
  | 'LA'
  | 'HP'
  | 'PB'
  | 'CH'
  | 'HR'
  | 'DL'
  | 'UK'
  | 'UP'
  | 'RJ'
  | 'GJ'
  | 'DH'
  | 'MH'
  | 'GA'
  | 'MP'
  | 'CG';

const src = (
  id: string,
  name: string,
  region: NorthState,
  feedUrls: string[],
  authority: number,
): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'IN',
  language: 'en',
  region: `IN-${region}`,
  feedUrls,
  authority,
});

/** The Hindu's state pages. Most post one to three stories a day. */
const hinduState = (slug: string) => `https://www.thehindu.com/news/national/${slug}/feeder/default.rss`;
/** The Hindu's city pages. */
const hinduCity = (slug: string) => `https://www.thehindu.com/news/cities/${slug}/feeder/default.rss`;
/**
 * Times of India city feeds, by section id: Delhi -2128839596, Mumbai
 * -2128838597, Pune -2128821991, Nagpur 442002, Lucknow -2128819658, Kanpur
 * 3947067, Varanasi 3947071, Prayagraj 3947060, Noida 8021716, Gurgaon 6547154,
 * Jaipur 3012544, Ahmedabad -2128821153, Surat 3942660, Rajkot 3942663,
 * Vadodara 3942666, Goa 3012535.
 */
const toi = (...ids: string[]) => ids.map((id) => `https://timesofindia.indiatimes.com/rssfeeds/${id}.cms`);
/** Hindustan Times city sections. */
const ht = (...cities: string[]) =>
  cities.map((city) => `https://www.hindustantimes.com/feeds/rss/cities/${city}-news/rssfeed.xml`);
/** The Indian Express city sections. */
const ie = (...cities: string[]) => cities.map((city) => `https://indianexpress.com/section/cities/${city}/feed/`);
/** The Tribune's state and city sections. */
const tribune = (...paths: string[]) => paths.map((path) => `https://publish.tribuneindia.com/${path}/feed/`);
/** Naidunia's English site (Dainik Jagran MP/CG) state sections. */
const naidunia = (path: string) => `https://english.dainikjagranmpcg.com/states/${path}/rss`;

/**
 * India's north and west (16 states and union territories): regional
 * outlets, one region per source, all in English. The big papers' state and
 * city sections (The Hindu, Times of India, Hindustan Times, The Indian
 * Express, The Tribune) 9; Mid-Day, Greater Kashmir and Herald Goa 8; other
 * regional and digital outlets 7.
 *
 * Delhi is the city and its government, not national politics: The Hindu's
 * Delhi page and The Tribune's Delhi section carry too much national copy
 * (Election Commission, Rahul Gandhi, foreign affairs). Regional desks that
 * span several regions are left out: Times of India "Chandigarh" and
 * Hindustan Times Chandigarh mix Punjab, Haryana, Himachal, J&K and the city;
 * The Indian Express's Chandigarh section is mostly Punjab, so it goes there.
 *
 * Unusable here. Main feeds that mix in national and world news: Kashmir
 * Observer, Kashmir Reader, Rising Kashmir, Yes Punjab's main feed, Vibes of
 * India's main feed, Free Press Journal (no section feeds; ?section= is
 * ignored), The Bridge Chronicle, Goa Chronicle (opinion and world), Hill Post,
 * NDTV's cities feed (all cities), Naidunia's main feed. Stale or too thin:
 * The Hindu's Gujarat (six days), Himachal (also files Sikkim and Arunachal
 * stories) and Goa (a few a week) pages; The Tribune's Rajasthan, Chhattisgarh,
 * Madhya Pradesh, Uttarakhand and Uttar Pradesh sections (thin, and mixed with
 * national copy); Times of India Ludhiana; Indian Express Jaipur, Bhopal,
 * Nagpur, Goa, Amritsar, Ludhiana and Jalandhar (months or years old); India TV
 * state feeds other than Delhi and Uttar Pradesh; Himachal Watcher; Kashmir
 * Times; ABP Live Delhi; DNA Delhi; Rajasthan Chronicle. Hindustan Times has no
 * Jaipur, Bhopal, Indore, Dehradun, Kanpur, Varanasi, Agra, Meerut, Ludhiana,
 * Shimla or Jammu feed (empty). These return 403 to our User-Agent: Daily
 * Excelsior, State Times, Punekar News, Central Chronicle, Millennium Post,
 * The Statesman, Business Standard, NewsClick, Babushahi. Navhind Times and
 * Lokmat Times answer 500; O Heraldo does not answer. Feeds that do not parse
 * (HTML or broken XML): DeshGujarat, Reach Ladakh, Nagpur Today's sections (its
 * main feed is mostly Hindi and Marathi), The Goan, Prudent Media, Morning News
 * India, City Air News, Bhaskar English, newsbits.in. No English outlet with a
 * feed was found for Dadra and Nagar Haveli and Daman and Diu.
 */
export const IN_STATES_NORTH: SourceConfig[] = [
  // ---- Jammu and Kashmir ----
  src('in_jk_greaterkashmir', 'Greater Kashmir', 'JK', [
    'https://www.greaterkashmir.com/kashmir/feed/',
    'https://www.greaterkashmir.com/jammu/feed/',
  ], 8),
  src('in_jk_tribune', 'The Tribune (J&K)', 'JK', tribune('state/j-k'), 9),
  src('in_jk_hindu', 'The Hindu (Jammu and Kashmir)', 'JK', [hinduState('jammu-and-kashmir')], 9),
  src('in_jk_kashmirlife', 'Kashmir Life', 'JK', ['https://kashmirlife.net/feed/'], 7),

  // ---- Ladakh ----
  src('in_la_greaterkashmir', 'Greater Kashmir (Ladakh)', 'LA', ['https://www.greaterkashmir.com/ladakh/feed/'], 8),
  // A few stories a week.
  src('in_la_hindu', 'The Hindu (Ladakh)', 'LA', [hinduState('ladakh')], 9),

  // ---- Himachal Pradesh ----
  src('in_hp_tribune', 'The Tribune (Himachal)', 'HP', tribune('state/himachal'), 9),

  // ---- Punjab ----
  src('in_pb_tribune', 'The Tribune (Punjab)', 'PB', tribune(
    'state/punjab',
    'city/amritsar',
    'city/jalandhar',
    'city/ludhiana',
    'city/patiala',
    'city/bathinda',
  ), 9),
  src('in_pb_ie', 'The Indian Express (Chandigarh and Punjab)', 'PB', ie('chandigarh'), 9),
  src('in_pb_hindu', 'The Hindu (Punjab)', 'PB', [hinduState('punjab')], 9),
  src('in_pb_yespunjab', 'Yes Punjab', 'PB', ['https://yespunjab.com/category/punjab/feed/'], 7),

  // ---- Chandigarh: the Tricity desk (Chandigarh, Mohali, Panchkula) ----
  src('in_ch_tribune', 'The Tribune (Chandigarh)', 'CH', tribune('city/chandigarh'), 9),

  // ---- Haryana ----
  src('in_hr_tribune', 'The Tribune (Haryana)', 'HR', tribune('state/haryana'), 9),
  src('in_hr_toi', 'Times of India (Gurgaon)', 'HR', toi('6547154'), 9),
  src('in_hr_ht', 'Hindustan Times (Gurugram)', 'HR', ht('gurugram'), 9),
  src('in_hr_hindu', 'The Hindu (Haryana)', 'HR', [hinduState('haryana')], 9),

  // ---- Delhi: the city and its government ----
  src('in_dl_toi', 'Times of India (Delhi)', 'DL', toi('-2128839596'), 9),
  src('in_dl_ht', 'Hindustan Times (Delhi)', 'DL', ht('delhi'), 9),
  src('in_dl_ie', 'The Indian Express (Delhi)', 'DL', ie('delhi'), 9),
  src('in_dl_indiatv', 'India TV (Delhi)', 'DL', ['https://www.indiatvnews.com/rssnews/topstory-delhi.xml'], 7),

  // ---- Uttarakhand ----
  src('in_uk_hindu', 'The Hindu (Uttarakhand)', 'UK', [hinduState('uttarakhand')], 9),
  src('in_uk_garhwalpost', 'Garhwal Post', 'UK', ['https://www.garhwalpost.in/category/uttarakhand/feed/'], 7),

  // ---- Uttar Pradesh: Lucknow, Kanpur, Varanasi, Prayagraj, Noida ----
  src('in_up_toi', 'Times of India (Uttar Pradesh)', 'UP', toi('-2128819658', '3947067', '3947071', '3947060', '8021716'), 9),
  src('in_up_ht', 'Hindustan Times (Lucknow, Noida)', 'UP', ht('lucknow', 'noida'), 9),
  src('in_up_ie', 'The Indian Express (Lucknow)', 'UP', ie('lucknow'), 9),
  src('in_up_hindu', 'The Hindu (Uttar Pradesh)', 'UP', [hinduState('uttar-pradesh')], 9),
  src('in_up_indiatv', 'India TV (Uttar Pradesh)', 'UP', ['https://www.indiatvnews.com/rssnews/topstory-uttar-pradesh.xml'], 7),

  // ---- Rajasthan ----
  src('in_rj_toi', 'Times of India (Jaipur)', 'RJ', toi('3012544'), 9),
  src('in_rj_hindu', 'The Hindu (Rajasthan)', 'RJ', [hinduState('rajasthan')], 9),

  // ---- Gujarat: Ahmedabad, Surat, Rajkot, Vadodara ----
  src('in_gj_toi', 'Times of India (Gujarat)', 'GJ', toi('-2128821153', '3942660', '3942663', '3942666'), 9),
  src('in_gj_ie', 'The Indian Express (Ahmedabad)', 'GJ', ie('ahmedabad'), 9),
  src('in_gj_vibesofindia', 'Vibes of India', 'GJ', ['https://www.vibesofindia.com/category/gujarat/feed/'], 7),

  // ---- Maharashtra: Mumbai, Pune, Nagpur ----
  src('in_mh_toi', 'Times of India (Maharashtra)', 'MH', toi('-2128838597', '-2128821991', '442002'), 9),
  src('in_mh_ht', 'Hindustan Times (Mumbai, Pune)', 'MH', ht('mumbai', 'pune'), 9),
  src('in_mh_ie', 'The Indian Express (Mumbai, Pune)', 'MH', ie('mumbai', 'pune'), 9),
  src('in_mh_hindu', 'The Hindu (Maharashtra)', 'MH', [hinduCity('mumbai'), hinduState('maharashtra')], 9),
  src('in_mh_midday', 'Mid-Day', 'MH', ['https://www.mid-day.com/Resources/midday/rss/mumbai.xml'], 8),

  // ---- Goa ----
  src('in_ga_heraldgoa', 'Herald Goa', 'GA', ['https://www.heraldgoa.in/goa/feed/'], 8),
  // Also carries some football from outside Goa.
  src('in_ga_toi', 'Times of India (Goa)', 'GA', toi('3012535'), 9),

  // ---- Madhya Pradesh ----
  src('in_mp_naidunia', 'Naidunia English (Madhya Pradesh)', 'MP', [
    naidunia('madhya-pradesh/category-18'),
    naidunia('madhya-pradesh/vindhya-rewa/category-15252'),
  ], 7),
  src('in_mp_hindu', 'The Hindu (Madhya Pradesh)', 'MP', [hinduState('madhya-pradesh')], 9),

  // ---- Chhattisgarh ----
  src('in_cg_naidunia', 'Naidunia English (Chhattisgarh)', 'CG', [naidunia('chhattisgarh/category-19')], 7),
  src('in_cg_hindu', 'The Hindu (Chhattisgarh)', 'CG', [hinduState('chhattisgarh')], 9),
];
