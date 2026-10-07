import type { SourceConfig } from '../sources.config';

type NorthRegion = '21' | '23' | '25' | '32' | '34' | '36' | '42' | '45';

const src = (
  id: string,
  name: string,
  region: NorthRegion,
  feedUrls: string[],
  authority: number,
  language: 'it' | 'de' = 'it',
): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'IT',
  language,
  region: `IT-${region}`,
  feedUrls,
  authority,
});

/**
 * Italy, northern regions (Piemonte, Valle d'Aosta, Lombardia, Trentino-Alto
 * Adige, Veneto, Friuli-Venezia Giulia, Liguria, Emilia-Romagna): regional
 * outlets, one region per source. ANSA's regional desks 8, main dailies' local
 * editions 9 (smaller dailies 8), digital locals and local TV 7.
 *
 * RAI TGR (8) is at rainews.it/tgr/<region>/rss/tutti; Trentino-Alto Adige has
 * two newsrooms, Trento and Bolzano, used as one source.
 *
 * Unusable here: Il Gazzettino's feeds have no dates; the NEM papers (Messaggero
 * Veneto, Il Piccolo, Mattino di Padova, Nuova Venezia, Tribuna di Treviso) have
 * no feeds; L'Adige's and Alto Adige's only feeds are mostly national wire copy,
 * and stol.it (Dolomiten) and Südtirol News mix in a lot of world news;
 * La Stampa's local feeds redirect to its national front page; Il Secolo XIX
 * returns 429; Fanpage's local feeds return 403; the Morenews sites (Torino Oggi,
 * Targato CN) mix in national press-agency copy; Corriere's old
 * xml2.corriereobjects.it local feeds are years stale.
 */
const tgr = (slug: string) => `https://www.rainews.it/tgr/${slug}/rss/tutti`;

export const IT_REGIONS_NORTH: SourceConfig[] = [
  // ---- Piemonte ----
  src('it_21_tgr', 'TGR Piemonte (RAI)', '21', [tgr('piemonte')], 8),
  src('it_21_ansa', 'ANSA Piemonte', '21', ['https://www.ansa.it/piemonte/notizie/piemonte_rss.xml'], 8),
  src('it_21_corriere_torino', 'Corriere Torino', '21', [
    'https://www.corriere.it/dynamic-feed/rss/section/Torino.xml',
  ], 9),
  src('it_21_repubblica_torino', 'la Repubblica Torino', '21', [
    'https://torino.repubblica.it/rss/cronaca/rss2.0.xml',
  ], 9),
  src('it_21_quotidiano_piemontese', 'Quotidiano Piemontese', '21', ['https://www.quotidianopiemontese.it/feed/'], 7),
  // Citynews. TorinoToday returned 403 to our User-Agent on both probes.
  src('it_21_novaratoday', 'NovaraToday', '21', ['https://www.novaratoday.it/rss'], 7),

  // ---- Valle d'Aosta ----
  src('it_23_tgr', 'TGR Valle d\'Aosta (RAI)', '23', [tgr('vda')], 8),
  src('it_23_ansa', 'ANSA Valle d\'Aosta', '23', ['https://www.ansa.it/valledaosta/notizie/valledaosta_rss.xml'], 8),
  src('it_23_aostasera', 'AostaSera', '23', ['https://www.aostasera.it/feed/'], 7),
  src('it_23_glocal', 'Valle d\'Aosta Glocal', '23', [
    'https://www.valledaostaglocal.it/links/rss/argomenti/valledaostaglocalit/rss.xml',
  ], 7),
  src('it_23_aostanews24', 'AostaNews24', '23', ['https://www.aostanews24.it/feed/'], 7),
  src('it_23_gazzetta_matin', 'Gazzetta Matin', '23', ['https://www.gazzettamatin.com/feed/'], 7),

  // ---- Lombardia ----
  src('it_25_tgr', 'TGR Lombardia (RAI)', '25', [tgr('lombardia')], 8),
  src('it_25_ansa', 'ANSA Lombardia', '25', ['https://www.ansa.it/lombardia/notizie/lombardia_rss.xml'], 8),
  // Corriere's Milano, Bergamo and Brescia editions: one outlet, different cities.
  src('it_25_corriere', 'Corriere della Sera (Milano, Bergamo, Brescia)', '25', [
    'https://www.corriere.it/dynamic-feed/rss/section/Milano.xml',
    'https://www.corriere.it/dynamic-feed/rss/section/Bergamo.xml',
    'https://www.corriere.it/dynamic-feed/rss/section/Brescia.xml',
  ], 9),
  src('it_25_repubblica_milano', 'la Repubblica Milano', '25', [
    'https://milano.repubblica.it/rss/cronaca/rss2.0.xml',
  ], 9),
  src('it_25_ilgiorno', 'Il Giorno', '25', [
    'https://www.ilgiorno.it/milano/rss',
    'https://www.ilgiorno.it/monza-brianza/rss',
  ], 9),
  src('it_25_eco_bergamo', 'L\'Eco di Bergamo', '25', ['https://www.ecodibergamo.it/feeds/latesthp/268/'], 8),
  src('it_25_citynews', 'MilanoToday / BresciaToday', '25', [
    'https://www.milanotoday.it/rss',
    'https://www.bresciatoday.it/rss',
  ], 7),

  // ---- Trentino-Alto Adige / Südtirol ----
  src('it_32_tgr', 'TGR Trento and Bolzano (RAI)', '32', [tgr('trento'), tgr('bolzano')], 8),
  src('it_32_ansa', 'ANSA Trentino-Alto Adige', '32', ['https://www.ansa.it/trentino/notizie/trentino_rss.xml'], 8),
  src('it_32_corriere', 'Corriere del Trentino / Corriere dell\'Alto Adige', '32', [
    'https://www.corriere.it/dynamic-feed/rss/section/Trentino.xml',
  ], 9),
  src('it_32_ildolomiti', 'il Dolomiti', '32', ['https://www.ildolomiti.it/rss.xml'], 7),
  src('it_32_trentotoday', 'TrentoToday', '32', ['https://www.trentotoday.it/rss'], 7),
  // Bilingual: mostly German titles, some Italian.
  src('it_32_salto', 'salto.bz', '32', ['https://salto.bz/de/rss.xml'], 7, 'de'),

  // ---- Veneto ----
  src('it_34_tgr', 'TGR Veneto (RAI)', '34', [tgr('veneto')], 8),
  src('it_34_ansa', 'ANSA Veneto', '34', ['https://www.ansa.it/veneto/notizie/veneto_rss.xml'], 8),
  src('it_34_corriere_veneto', 'Corriere del Veneto', '34', [
    'https://www.corriere.it/dynamic-feed/rss/section/Veneto.xml',
  ], 9),
  src('it_34_citynews', 'VeneziaToday / TrevisoToday', '34', [
    'https://www.veneziatoday.it/rss',
    'https://www.trevisotoday.it/rss',
  ], 7),
  src('it_34_tviweb', 'TViWeb (Vicenza)', '34', ['https://www.tviweb.it/feed/'], 7),
  src('it_34_nuovo_terraglio', 'Il Nuovo Terraglio (Treviso)', '34', ['https://www.ilnuovoterraglio.it/feed/'], 7),

  // ---- Friuli-Venezia Giulia ----
  src('it_36_tgr', 'TGR Friuli Venezia Giulia (RAI)', '36', [tgr('fvg')], 8),
  src('it_36_ansa', 'ANSA Friuli Venezia Giulia', '36', [
    'https://www.ansa.it/friuliveneziagiulia/notizie/friuliveneziagiulia_rss.xml',
  ], 8),
  // Telefriuli is its sister TV and runs the same headlines; this feed has no programme episodes.
  src('it_36_ilfriuli', 'Il Friuli', '36', ['https://www.ilfriuli.it/feed/'], 7),
  src('it_36_friulioggi', 'Friuli Oggi', '36', ['https://www.friulioggi.it/feed/'], 7),
  src('it_36_triestenews', 'Trieste News', '36', ['https://www.triestenews.it/feed/'], 7),
  src('it_36_pordenoneoggi', 'Pordenone Oggi', '36', ['https://www.pordenoneoggi.it/feed/'], 7),

  // ---- Liguria ----
  src('it_42_tgr', 'TGR Liguria (RAI)', '42', [tgr('liguria')], 8),
  src('it_42_ansa', 'ANSA Liguria', '42', ['https://www.ansa.it/liguria/notizie/liguria_rss.xml'], 8),
  src('it_42_repubblica_genova', 'la Repubblica Genova', '42', [
    'https://genova.repubblica.it/rss/cronaca/rss2.0.xml',
  ], 9),
  src('it_42_genovatoday', 'GenovaToday', '42', ['https://www.genovatoday.it/rss'], 7),
  // One network sharing copy: Genova24 (Genova), IVG (Savona), Riviera24 (Imperia).
  src('it_42_genova24', 'Genova24 / IVG / Riviera24', '42', [
    'https://www.genova24.it/feed/',
    'https://www.ivg.it/feed/',
    'https://www.riviera24.it/feed/',
  ], 7),
  src('it_42_cittadellaspezia', 'Città della Spezia', '42', ['https://www.cittadellaspezia.com/feed/'], 7),
  src('it_42_levantenews', 'Levante News (Tigullio)', '42', ['https://www.levantenews.it/feed/'], 7),

  // ---- Emilia-Romagna ----
  src('it_45_tgr', 'TGR Emilia-Romagna (RAI)', '45', [tgr('emiliaromagna')], 8),
  src('it_45_ansa', 'ANSA Emilia-Romagna', '45', ['https://www.ansa.it/emiliaromagna/notizie/emiliaromagna_rss.xml'], 8),
  src('it_45_corriere_bologna', 'Corriere di Bologna', '45', [
    'https://www.corriere.it/dynamic-feed/rss/section/Bologna.xml',
  ], 9),
  src('it_45_repubblica_bologna', 'la Repubblica Bologna', '45', [
    'https://bologna.repubblica.it/rss/cronaca/rss2.0.xml',
  ], 9),
  // City feeds only: Carlino's main feed also carries its Marche editions.
  src('it_45_carlino', 'il Resto del Carlino', '45', [
    'https://www.ilrestodelcarlino.it/bologna/rss',
    'https://www.ilrestodelcarlino.it/modena/rss',
    'https://www.ilrestodelcarlino.it/reggio-emilia/rss',
    'https://www.ilrestodelcarlino.it/ferrara/rss',
    'https://www.ilrestodelcarlino.it/ravenna/rss',
    'https://www.ilrestodelcarlino.it/rimini/rss',
    'https://www.ilrestodelcarlino.it/forli/rss',
  ], 9),
  src('it_45_citynews', 'BolognaToday / ParmaToday', '45', [
    'https://www.bolognatoday.it/rss',
    'https://www.parmatoday.it/rss',
  ], 7),
  src('it_45_estense', 'Estense.com (Ferrara)', '45', ['https://www.estense.com/feed/'], 7),
  src('it_45_newsrimini', 'newsRimini', '45', ['https://www.newsrimini.it/feed/rss'], 7),
  src('it_45_reggionline', 'Reggionline (Telereggio)', '45', ['https://www.reggionline.com/feed/'], 7),
];
