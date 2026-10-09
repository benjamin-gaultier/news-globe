import type { SourceConfig } from '../sources.config';

type WestState = 'AZ' | 'CO' | 'ID' | 'MT' | 'NV' | 'NM' | 'UT' | 'WY' | 'AK' | 'CA' | 'HI' | 'OR' | 'WA';

const src = (id: string, name: string, state: WestState, feedUrls: string[], authority: number): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'US',
  language: 'en',
  region: `US-${state}`,
  feedUrls,
  authority,
});

/**
 * US states, Census West (AZ, CO, ID, MT, NV, NM, UT, WY, AK, CA, HI, OR, WA):
 * local outlets, one region per source. Public radio 8, main dailies 9 (smaller
 * dailies 8), nonprofit / digital newsrooms and local TV 7.
 *
 * Unusable here: every States Newsroom site (Arizona Mirror, Colorado Newsline,
 * Idaho Capital Sun, Daily Montanan, Nevada Current, Source NM, Utah News
 * Dispatch, Alaska Beacon, Oregon Capital Chronicle, Washington State Standard)
 * returns 403; TownNews/BLOX search feeds (Lee papers, Santa Fe New Mexican,
 * Idaho Press, Bozeman, Fairbanks, Jackson Hole, Yakima) return 429/451; MediaNews
 * (Denver Post, Mercury News, OC Register, San Diego Union-Tribune) 403; Hearst TV
 * (KCRA, KOAT) 451; Tegna syndication feeds don't parse.
 */
export const US_STATES_WEST: SourceConfig[] = [
  // ---- Arizona ----
  src('us_az_kjzz', 'KJZZ', 'AZ', ['https://www.kjzz.org/kjzz-news.rss'], 8),
  src('us_az_capitol_times', 'Arizona Capitol Times', 'AZ', ['https://azcapitoltimes.com/feed/'], 7),
  src('us_az_luminaria', 'Arizona Luminaria', 'AZ', ['https://azluminaria.org/feed/'], 7),
  src('us_az_tucson_sentinel', 'Tucson Sentinel', 'AZ', ['https://www.tucsonsentinel.com/local/rss/'], 7),
  src('us_az_cronkite', 'Cronkite News', 'AZ', ['https://cronkitenews.azpbs.org/feed/'], 7),
  // Gray's main Arc feed mixes in network features (InvestigateTV etc.); the news category doesn't.
  src(
    'us_az_azfamily',
    "Arizona's Family (KTVK/KPHO)",
    'AZ',
    ['https://www.azfamily.com/arc/outboundfeeds/rss/category/news/?outputType=xml'],
    7,
  ),
  src('us_az_kgun', 'KGUN 9 Tucson', 'AZ', ['https://www.kgun9.com/news/local-news.rss'], 7),

  // ---- Colorado ----
  src('us_co_cpr', 'Colorado Public Radio', 'CO', ['https://www.cpr.org/feed/'], 8),
  src('us_co_colorado_sun', 'The Colorado Sun', 'CO', ['https://coloradosun.com/feed/'], 7),
  // CPR-owned, but a Denver city desk with its own stories.
  src('us_co_denverite', 'Denverite', 'CO', ['https://denverite.com/feed/'], 7),
  src('us_co_kdvr', 'FOX31 Denver (KDVR)', 'CO', ['https://kdvr.com/news/local/feed/'], 7),

  // ---- Idaho ----
  src('us_id_bspr', 'Boise State Public Radio', 'ID', ['https://www.boisestatepublicradio.org/news.rss'], 8),
  src('us_id_kivi', 'Idaho News 6 (KIVI)', 'ID', ['https://www.kivitv.com/news/local-news.rss'], 7),
  src('us_id_kboi', 'CBS2 Idaho News (KBOI)', 'ID', ['https://idahonews.com/news/local.rss'], 7),
  src('us_id_kmvt', 'KMVT Twin Falls', 'ID', ['https://www.kmvt.com/arc/outboundfeeds/rss/category/news/?outputType=xml'], 7),
  src('us_id_idahoednews', 'Idaho Education News', 'ID', ['https://www.idahoednews.org/feed/'], 7),

  // ---- Montana ----
  src('us_mt_free_press', 'Montana Free Press', 'MT', ['https://montanafreepress.org/feed/'], 7),
  src('us_mt_flathead_beacon', 'Flathead Beacon', 'MT', ['https://flatheadbeacon.com/feed/'], 7),
  // MTN News (Scripps): the Billings and Missoula stations share statewide stories, so one source.
  src(
    'us_mt_mtn_news',
    'MTN News (KTVQ / KPAX)',
    'MT',
    ['https://www.ktvq.com/news/local-news.rss', 'https://www.kpax.com/news/local-news.rss'],
    7,
  ),

  // ---- Nevada ----
  src('us_nv_review_journal', 'Las Vegas Review-Journal', 'NV', ['https://www.reviewjournal.com/local/feed/'], 9),
  src('us_nv_independent', 'The Nevada Independent', 'NV', ['https://thenevadaindependent.com/feed'], 7),
  src('us_nv_kunr', 'KUNR Public Radio', 'NV', ['https://www.kunr.org/news.rss'], 8),
  src('us_nv_8newsnow', '8 News Now (KLAS)', 'NV', ['https://www.8newsnow.com/news/local-news/feed/'], 7),
  src('us_nv_this_is_reno', 'This Is Reno', 'NV', ['https://thisisreno.com/feed/'], 7),

  // ---- New Mexico ----
  src('us_nm_kunm', 'KUNM', 'NM', ['https://www.kunm.org/local-news.rss'], 8),
  src('us_nm_searchlight', 'Searchlight New Mexico', 'NM', ['https://searchlightnm.org/feed/'], 7),
  src('us_nm_krqe', 'KRQE News 13', 'NM', ['https://www.krqe.com/news/feed/'], 7),
  // Nexstar like KRQE, but its Las Cruces desk only.
  src('us_nm_ktsm_las_cruces', 'KTSM Las Cruces', 'NM', ['https://www.ktsm.com/local/las-cruces-news/feed/'], 7),

  // ---- Utah ----
  src('us_ut_kuer', 'KUER', 'UT', ['https://www.kuer.org/news.rss'], 8),
  src('us_ut_sltrib', 'The Salt Lake Tribune', 'UT', ['https://www.sltrib.com/arc/outboundfeeds/rss/category/news/?outputType=xml'], 9),
  src('us_ut_deseret', 'Deseret News', 'UT', ['https://www.deseret.com/arc/outboundfeeds/rss/category/utah/?outputType=xml'], 9),
  src('us_ut_abc4', 'ABC4 Utah (KTVX)', 'UT', ['https://www.abc4.com/news/local-news/feed/'], 7),
  src('us_ut_fox13', 'FOX 13 Salt Lake City', 'UT', ['https://www.fox13now.com/news/local-news.rss'], 7),

  // ---- Wyoming ----
  src('us_wy_wyofile', 'WyoFile', 'WY', ['https://wyofile.com/feed/'], 7),
  // Oil City News shares copy with its sister County 17 (Gillette); only Oil City is used.
  src('us_wy_oil_city', 'Oil City News', 'WY', ['https://oilcity.news/feed/'], 7),
  src('us_wy_buckrail', 'Buckrail', 'WY', ['https://buckrail.com/feed/'], 7),
  src('us_wy_sweetwaternow', 'SweetwaterNOW', 'WY', ['https://www.sweetwaternow.com/feed/'], 7),
  src('us_wy_sheridan_media', 'Sheridan Media', 'WY', ['https://sheridanmedia.com/feed/'], 7),

  // ---- Alaska ----
  src('us_ak_alaska_public', 'Alaska Public Media', 'AK', ['https://alaskapublic.org/news.rss'], 8),
  src('us_ak_ktoo', 'KTOO Juneau', 'AK', ['https://www.ktoo.org/feed/'], 8),
  src('us_ak_juneau_empire', 'Juneau Empire', 'AK', ['https://www.juneauempire.com/feed/'], 8),
  src(
    'us_ak_ans',
    "Alaska's News Source (KTUU)",
    'AK',
    ['https://www.alaskasnewssource.com/arc/outboundfeeds/rss/category/news/?outputType=xml'],
    7,
  ),

  // ---- California: statewide, then LA, Bay Area, San Diego, Sacramento ----
  src('us_ca_calmatters', 'CalMatters', 'CA', ['https://calmatters.org/feed/'], 7),
  src('us_ca_latimes', 'Los Angeles Times (California)', 'CA', ['https://www.latimes.com/california/rss2.0.xml'], 9),
  src('us_ca_laist', 'LAist', 'CA', ['https://laist.com/index.rss'], 8),
  src('us_ca_ktla', 'KTLA 5', 'CA', ['https://ktla.com/news/local-news/feed/'], 7),
  src('us_ca_kqed', 'KQED', 'CA', ['https://ww2.kqed.org/news/feed/'], 8),
  src('us_ca_sfgate', 'SFGATE', 'CA', ['https://www.sfgate.com/bayarea/feed/Bay-Area-News-429.php'], 8),
  src('us_ca_sf_standard', 'The San Francisco Standard', 'CA', ['https://sfstandard.com/feed/'], 7),
  src('us_ca_mission_local', 'Mission Local', 'CA', ['https://missionlocal.org/feed/'], 7),
  src('us_ca_kron', 'KRON 4', 'CA', ['https://www.kron4.com/news/bay-area/feed/'], 7),
  src('us_ca_kpbs', 'KPBS', 'CA', ['https://www.kpbs.org/news/local.rss'], 8),
  src('us_ca_voice_of_san_diego', 'Voice of San Diego', 'CA', ['https://voiceofsandiego.org/feed/'], 7),
  src('us_ca_times_of_san_diego', 'Times of San Diego', 'CA', ['https://timesofsandiego.com/feed/'], 7),
  src('us_ca_fox5_san_diego', 'FOX 5 San Diego', 'CA', ['https://fox5sandiego.com/news/local-news/feed/'], 7),
  src('us_ca_fox40', 'FOX40 Sacramento', 'CA', ['https://fox40.com/news/local-news/feed/'], 7),

  // ---- Hawaii ----
  src('us_hi_hpr', 'Hawaiʻi Public Radio', 'HI', ['https://www.hawaiipublicradio.org/local-news.rss'], 8),
  src('us_hi_star_advertiser', 'Honolulu Star-Advertiser', 'HI', ['https://www.staradvertiser.com/category/hawaii-news/feed/'], 9),
  src('us_hi_civil_beat', 'Honolulu Civil Beat', 'HI', ['https://www.civilbeat.org/feed/'], 7),
  src('us_hi_khon', 'KHON2', 'HI', ['https://www.khon2.com/local-news/feed/'], 7),
  // Sister site Big Island Now is left out (shared Pacific Media Group copy).
  src('us_hi_maui_now', 'Maui Now', 'HI', ['https://mauinow.com/feed/'], 7),

  // ---- Oregon ----
  src('us_or_opb', 'OPB', 'OR', ['https://www.opb.org/arc/outboundfeeds/rss/category/news/?outputType=xml'], 8),
  src(
    'us_or_oregonlive',
    'The Oregonian/OregonLive',
    'OR',
    ['https://www.oregonlive.com/arc/outboundfeeds/rss/category/portland/?outputType=xml'],
    9,
  ),
  src('us_or_koin', 'KOIN 6', 'OR', ['https://www.koin.com/news/feed/'], 7),
  src(
    'us_or_lookout_eugene',
    'Lookout Eugene-Springfield',
    'OR',
    [
      // The main feed is about half obituaries; latest-news isn't.
      'https://lookouteugene-springfield.com/story/latest-news/feed/',
    ],
    7,
  ),
  src('us_or_salem_reporter', 'Salem Reporter', 'OR', ['https://www.salemreporter.com/feed/'], 7),

  // ---- Washington ----
  // The seattle-news section feed carries about a third wire copy; politics and crime don't.
  src(
    'us_wa_seattle_times',
    'The Seattle Times',
    'WA',
    ['https://www.seattletimes.com/seattle-news/politics/feed/', 'https://www.seattletimes.com/seattle-news/crime/feed/'],
    9,
  ),
  src('us_wa_knkx', 'KNKX', 'WA', ['https://www.knkx.org/local-news.rss'], 8),
  src('us_wa_komo', 'KOMO News', 'WA', ['https://komonews.com/news/local.rss'], 7),
  src('us_wa_heraldnet', 'The Everett Herald', 'WA', ['https://www.heraldnet.com/feed/'], 8),
  src('us_wa_columbian', 'The Columbian', 'WA', ['https://www.columbian.com/news/local/feed/'], 8),
];
