import type { SourceConfig } from '../sources.config';

type SouthState =
  | 'AN'
  | 'AP'
  | 'AR'
  | 'AS'
  | 'BR'
  | 'JH'
  | 'KA'
  | 'KL'
  | 'LD'
  | 'ML'
  | 'MN'
  | 'MZ'
  | 'NL'
  | 'OD'
  | 'PY'
  | 'SK'
  | 'TN'
  | 'TR'
  | 'TS'
  | 'WB';

const src = (id: string, name: string, region: SouthState, feedUrls: string[], authority: number, language = 'en'): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'IN',
  language,
  region: `IN-${region}`,
  feedUrls,
  authority,
});

/** The Hindu: a state desk (`national/<state>`) or a city desk (`cities/<City>`). */
const hindu = (path: string) => `https://www.thehindu.com/news/${path}/feeder/default.rss`;
/** Times of India city sections, by section id. */
const toi = (id: string) => `https://timesofindia.indiatimes.com/rssfeeds/${id}.cms`;
/** The New Indian Express state and city sections (legacy feed ids still served). */
const nie = (path: string, id: number) => `https://www.newindianexpress.com/${path}/rssfeed/?id=${id}&getXmlFeed=true`;
/** The Indian Express city sections. */
const ie = (city: string) => `https://indianexpress.com/section/cities/${city}/feed/`;
/** Northeast Now's state sections. */
const nenow = (state: string) => `https://nenow.in/north-east-news/${state}/feed`;
/** The South First's state categories. */
const southFirst = (state: string) => `https://thesouthfirst.com/category/${state}/feed/`;

/**
 * India's east, Northeast and south: regional outlets, one region per source.
 * The big English papers' state and city desks 9 (The Hindu, Times of India,
 * The New Indian Express, The Indian Express, Deccan Herald),
 * regional digital newsrooms and TV sites 7-8. Each outlet's state and city
 * feeds of one region are one source (they share stories). West Bengal also
 * has two Bengali (`bn`) TV sites, since English coverage there is thin.
 *
 * Unusable here: The Telegraph, The Statesman, Millennium Post, Anandabazar,
 * The Wall, Deccan Chronicle, The Hans India, The Assam Tribune, EastMojo,
 * The Covai Post, The Federal, NewsMeter and Vartha Bharati return 403 to our
 * User-Agent. The Sentinel's only parseable feed is its whole site (about a
 * third national, science and world news; its section feeds serve HTML), as
 * are Pratidin Time's (plus entertainment). India Today NE's `/rss/<state>`
 * and Northeast Live's feed carry the whole Northeast, not one state.
 * Hindustan Times's city feeds
 * (Kolkata, Patna, Ranchi, Bengaluru, Chennai, Hyderabad) are empty or carry
 * one or two items a day. The Indian Express's Chennai, Patna and
 * Thiruvananthapuram sections post a few times a week. The Hindu's
 * "other-states" desk is stale. The main feeds of Orissa Post, The Shillong
 * Times, Nagaland Post, Sangbad Pratidin, Kalinga TV, Siasat, Guwahati Plus and
 * Mangalorean mix in mostly national, world or entertainment news (or Kannada
 * titles), and their section feeds are missing or serve HTML. Udayavani,
 * Sikkim Express, Gangtok Times, Eastern Mirror, Bihar Times, Live Cities,
 * Yo! Vizag and Sakshi Post serve malformed XML; Summit Times, Sikkim Now,
 * Patna Daily, Bihar Prabha and The Meghalayan don't answer. The Avenue Mail
 * lists only its daily e-paper; Jharkhand Mirror is mostly world news; The
 * Arunachal Times, Imphal Free Press, The Sikkim Chronicle, The Frontier
 * Manipur and Northeast Now's Sikkim section are weeks stale; Voice of Sikkim
 * and Ukhrul Times carry mostly other states' or world news; Coastal Digest
 * (Mangaluru) posts a few items a day, half of them national. Great Andhra is
 * film gossip. No outlet found for Sikkim or Lakshadweep (Dweep Diary's domain
 * is parked).
 */
export const IN_STATES_SOUTH: SourceConfig[] = [
  // ---- Bihar ----
  src('in_br_toi', 'Times of India (Patna)', 'BR', [toi('-2128817995')], 9),

  // ---- Jharkhand ----
  src('in_jh_toi', 'Times of India (Ranchi)', 'JH', [toi('4118245')], 9),

  // ---- West Bengal ----
  src('in_wb_hindu', 'The Hindu (Kolkata)', 'WB', [hindu('cities/kolkata')], 9),
  src('in_wb_toi', 'Times of India (Kolkata)', 'WB', [toi('-2128830821')], 9),
  src('in_wb_ie', 'The Indian Express (Kolkata)', 'WB', [ie('kolkata')], 9),
  src('in_wb_tv9bangla', 'TV9 Bangla', 'WB', ['https://tv9bangla.com/west-bengal/feed', 'https://tv9bangla.com/kolkata/feed'], 7, 'bn'),
  src(
    'in_wb_abpananda',
    'ABP Ananda',
    'WB',
    ['https://bengali.abplive.com/district/feed', 'https://bengali.abplive.com/news/kolkata/feed'],
    7,
    'bn',
  ),

  // ---- Odisha ----
  src('in_od_toi', 'Times of India (Bhubaneswar)', 'OD', [toi('4118235')], 9),
  src('in_od_nie', 'The New Indian Express (Odisha)', 'OD', [nie('states/odisha', 182)], 9),
  src('in_od_otv', 'OdishaTV', 'OD', ['https://odishatv.in/odisha/feed'], 8),
  src('in_od_odishabytes', 'Odisha Bytes', 'OD', ['https://odishabytes.com/category/odisha/feed/'], 7),

  // ---- Assam ----
  src('in_as_toi', 'Times of India (Guwahati)', 'AS', [toi('4118215')], 9),
  src('in_as_nenow', 'Northeast Now (Assam)', 'AS', [nenow('assam')], 8),

  // ---- Arunachal Pradesh ----
  src('in_ar_arunachal24', 'Arunachal24', 'AR', ['https://arunachal24.in/feed/'], 7),
  src('in_ar_nenow', 'Northeast Now (Arunachal Pradesh)', 'AR', [nenow('arunachal-pradesh')], 8),
  // Posts its daily edition in one batch each evening.
  src('in_ar_observer', 'Arunachal Observer', 'AR', ['https://arunachalobserver.org/feed/'], 7),

  // ---- Nagaland ----
  src('in_nl_morung', 'The Morung Express', 'NL', ['https://morungexpress.com/feed'], 8),
  src('in_nl_nenow', 'Northeast Now (Nagaland)', 'NL', [nenow('nagaland')], 8),

  // ---- Manipur ----
  src('in_mn_imphaltimes', 'Imphal Times', 'MN', ['https://www.imphaltimes.com/feed/'], 7),
  src('in_mn_nenow', 'Northeast Now (Manipur)', 'MN', [nenow('manipur')], 8),

  // ---- Mizoram ----
  src('in_mz_nenow', 'Northeast Now (Mizoram)', 'MZ', [nenow('mizoram')], 8),

  // ---- Tripura ----
  src('in_tr_tripurachronicle', 'Tripura Chronicle', 'TR', ['https://tripurachronicle.in/feed/'], 7),
  src('in_tr_nenow', 'Northeast Now (Tripura)', 'TR', [nenow('tripura')], 8),

  // ---- Meghalaya ----
  src('in_ml_syllad', 'Syllad', 'ML', ['https://syllad.com/feed/'], 7),
  src('in_ml_highlandpost', 'Highland Post', 'ML', ['https://highlandpost.com/category/meghalaya/feed/'], 7),
  src('in_ml_nenow', 'Northeast Now (Meghalaya)', 'ML', [nenow('meghalaya')], 8),

  // ---- Andhra Pradesh ----
  src(
    'in_ap_hindu',
    'The Hindu (Andhra Pradesh)',
    'AP',
    [hindu('national/andhra-pradesh'), hindu('cities/Vijayawada'), hindu('cities/Visakhapatnam')],
    9,
  ),
  src('in_ap_nie', 'The New Indian Express (Andhra Pradesh)', 'AP', [nie('states/andhra-pradesh', 181)], 9),
  src('in_ap_southfirst', 'The South First (Andhra Pradesh)', 'AP', [southFirst('andhrapradesh')], 7),

  // ---- Telangana ----
  src('in_ts_hindu', 'The Hindu (Telangana)', 'TS', [hindu('national/telangana'), hindu('cities/Hyderabad')], 9),
  src('in_ts_toi', 'Times of India (Hyderabad)', 'TS', [toi('-2128816011')], 9),
  src('in_ts_nie', 'The New Indian Express (Telangana)', 'TS', [nie('states/telangana', 183), nie('cities/hyderabad', 186)], 9),
  src(
    'in_ts_telanganatoday',
    'Telangana Today',
    'TS',
    ['https://telanganatoday.com/telangana/feed', 'https://telanganatoday.com/hyderabad/feed'],
    8,
  ),
  src('in_ts_siasat', 'The Siasat Daily (Telangana)', 'TS', ['https://www.siasat.com/category/news/telangana/feed/'], 7),
  src('in_ts_southfirst', 'The South First (Telangana)', 'TS', [southFirst('telangana')], 7),

  // ---- Karnataka ----
  src('in_ka_hindu', 'The Hindu (Karnataka)', 'KA', [hindu('national/karnataka'), hindu('cities/bangalore'), hindu('cities/Mangalore')], 9),
  src('in_ka_deccanherald', 'Deccan Herald (Karnataka)', 'KA', ['https://www.deccanherald.com/stories.rss?section=karnataka'], 9),
  src('in_ka_toi', 'Times of India (Bengaluru)', 'KA', [toi('-2128833038')], 9),
  src('in_ka_ie', 'The Indian Express (Bengaluru)', 'KA', [ie('bangalore')], 9),
  src('in_ka_nie', 'The New Indian Express (Karnataka)', 'KA', [nie('states/karnataka', 180), nie('cities/bengaluru', 185)], 9),
  src('in_ka_starofmysore', 'Star of Mysore', 'KA', ['https://starofmysore.com/feed/'], 7),
  src('in_ka_southfirst', 'The South First (Karnataka)', 'KA', [southFirst('karnataka')], 7),

  // ---- Kerala ----
  src(
    'in_kl_hindu',
    'The Hindu (Kerala)',
    'KL',
    [hindu('national/kerala'), hindu('cities/Kochi'), hindu('cities/Thiruvananthapuram'), hindu('cities/Kozhikode')],
    9,
  ),
  src('in_kl_toi', 'Times of India (Thiruvananthapuram)', 'KL', [toi('878156304')], 9),
  src(
    'in_kl_nie',
    'The New Indian Express (Kerala)',
    'KL',
    [nie('states/kerala', 179), nie('cities/kochi', 187), nie('cities/thiruvananthapuram', 188)],
    9,
  ),
  src('in_kl_onmanorama', 'Onmanorama', 'KL', ['https://www.onmanorama.com/news/kerala.feeds.rss.xml'], 8),
  src('in_kl_southfirst', 'The South First (Kerala)', 'KL', [southFirst('keralam')], 7),

  // ---- Tamil Nadu ----
  src(
    'in_tn_hindu',
    'The Hindu (Tamil Nadu)',
    'TN',
    [
      hindu('national/tamil-nadu'),
      hindu('cities/chennai'),
      hindu('cities/Madurai'),
      hindu('cities/Coimbatore'),
      hindu('cities/Tiruchirapalli'),
    ],
    9,
  ),
  src('in_tn_toi', 'Times of India (Chennai)', 'TN', [toi('2950623')], 9),
  src('in_tn_nie', 'The New Indian Express (Tamil Nadu)', 'TN', [nie('states/tamil-nadu', 178), nie('cities/chennai', 184)], 9),
  src('in_tn_dtnext', 'DT Next (Tamil Nadu)', 'TN', ['https://www.dtnext.in/stories.rss?section=tamilnadu'], 8),
  src('in_tn_southfirst', 'The South First (Tamil Nadu)', 'TN', [southFirst('tamilnadu')], 7),

  // ---- Puducherry ----
  src('in_py_hindu', 'The Hindu (Puducherry)', 'PY', [hindu('cities/puducherry')], 9),

  // ---- Andaman and Nicobar Islands ----
  // Both run the Lieutenant Governor's office handouts, which cluster together.
  src('in_an_sheekha', 'Andaman Sheekha', 'AN', ['https://andamansheekha.com/feed/'], 7),
  src('in_an_chronicle', 'Andaman Chronicle', 'AN', ['https://andamanchronicle.net/feed/'], 7),
];
