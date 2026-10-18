import type { SourceConfig } from '../sources.config';

type SouthRegion = '52' | '55' | '57' | '62' | '65' | '67' | '72' | '75' | '77' | '78' | '82' | '88';

const src = (id: string, name: string, region: SouthRegion, feedUrls: string[], authority: number): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'IT',
  language: 'it',
  region: `IT-${region}`,
  feeds: { top: feedUrls },
  authority,
});

/** RAI TGR regional newsroom: every story, plus bulletin episodes ("TGR Toscana del 07/10/2026 ore 14:00"). */
const tgr = (slug: string) => `https://www.rainews.it/tgr/${slug}/rss/tutti`;
/** ANSA regional desk. */
const ansa = (slug: string) => `https://www.ansa.it/${slug}/notizie/${slug}_rss.xml`;
/** Corriere della Sera local editions (Corriere Fiorentino, Corriere del Mezzogiorno). */
const corriere = (section: string) => `https://www.corriere.it/dynamic-feed/rss/section/${section}.xml`;
/** la Repubblica local editions, city news section. */
const repubblica = (city: string) => `https://${city}.repubblica.it/rss/cronaca/rss2.0.xml`;
/** La Gazzetta del Mezzogiorno province sections. */
const gdm = (section: number) => `https://www.lagazzettadelmezzogiorno.it/rss.jsp?sezione=${section}`;
/** Gazzetta del Sud / Giornale di Sicilia (SES) edition homepages. */
const ses = (host: string, edition: string) => `https://${host}/upload/assets/rss/producer-${edition}-homepage.xml`;

/**
 * Italy, central and southern regions and islands (Toscana, Umbria, Marche,
 * Lazio, Abruzzo, Molise, Campania, Puglia, Basilicata, Calabria, Sicilia,
 * Sardegna): regional outlets, one region per source. RAI TGR and ANSA's
 * regional desks 8, main dailies' local editions 9 (smaller provincial dailies
 * 8), digital local outlets and local TV 7.
 *
 * Unusable here: Caltagirone feeds (Il Messaggero, Il Mattino, Corriere
 * Adriatico, Quotidiano di Puglia) have no item dates; Il Tirreno, Il Centro,
 * La Nuova Sardegna, La Sicilia and Corriere dell'Umbria publish no feed; the
 * Giornale di Sicilia "sicilia" and L'Unione Sarda feeds mix national and world
 * news in; Corriere della Sera's Roma section carries national politics.
 * Citynews sites return 403 to our User-Agent intermittently (rate limiting);
 * the ones kept here (PerugiaToday, RomaToday, LeccePrima, CataniaToday) got
 * through, while NapoliToday, IlPescara, ChietiToday, AnconaToday, BariToday,
 * PalermoToday, SalernoToday and ReggioToday never did.
 */
export const IT_REGIONS_SOUTH: SourceConfig[] = [
  // ---- Toscana ----
  src('it_52_tgr', 'TGR Toscana (RAI)', '52', [tgr('toscana')], 8),
  src('it_52_ansa', 'ANSA Toscana', '52', [ansa('toscana')], 8),
  src('it_52_repubblica', 'la Repubblica Firenze', '52', [repubblica('firenze')], 9),
  src('it_52_corriere', 'Corriere Fiorentino', '52', [corriere('firenze')], 9),
  src('it_52_nazione', 'La Nazione (Firenze)', '52', ['https://www.lanazione.it/firenze/rss'], 9),

  // ---- Umbria ----
  src('it_55_tgr', 'TGR Umbria (RAI)', '55', [tgr('umbria')], 8),
  src('it_55_ansa', 'ANSA Umbria', '55', [ansa('umbria')], 8),
  // Monrif, like La Nazione in Toscana, but its Umbria edition is a separate desk.
  src('it_55_nazione', 'La Nazione Umbria', '55', ['https://www.lanazione.it/umbria/rss'], 9),
  src('it_55_perugiatoday', 'PerugiaToday', '55', ['https://www.perugiatoday.it/rss'], 7),
  src('it_55_umbria24', 'Umbria 24', '55', ['https://www.umbria24.it/feed'], 7),
  src('it_55_tuttoggi', 'TuttOggi', '55', ['https://www.tuttoggi.info/feed/'], 7),

  // ---- Marche ----
  src('it_57_tgr', 'TGR Marche (RAI)', '57', [tgr('marche')], 8),
  src('it_57_ansa', 'ANSA Marche', '57', [ansa('marche')], 8),
  src(
    'it_57_carlino',
    'il Resto del Carlino (Marche)',
    '57',
    [
      'https://www.ilrestodelcarlino.it/ancona/rss',
      'https://www.ilrestodelcarlino.it/pesaro/rss',
      'https://www.ilrestodelcarlino.it/macerata/rss',
      'https://www.ilrestodelcarlino.it/ascoli/rss',
    ],
    9,
  ),
  src('it_57_cronache_maceratesi', 'Cronache Maceratesi', '57', ['https://www.cronachemaceratesi.it/feed/'], 7),
  src('it_57_centropagina', 'CentroPagina', '57', ['https://www.centropagina.it/feed/'], 7),

  // ---- Lazio ----
  src('it_62_tgr', 'TGR Lazio (RAI)', '62', [tgr('lazio')], 8),
  src('it_62_ansa', 'ANSA Lazio', '62', [ansa('lazio')], 8),
  src('it_62_repubblica', 'la Repubblica Roma', '62', [repubblica('roma')], 9),
  src('it_62_romatoday', 'RomaToday', '62', ['https://www.romatoday.it/rss'], 7),
  // Sister dailies for the provinces of Latina and Frosinone: one source.
  src(
    'it_62_oggi',
    'Latina Oggi / Ciociaria Oggi',
    '62',
    ['https://www.latinaoggi.eu/rss.jsp?sezione=909', 'https://www.ciociariaoggi.it/rss.jsp?sezione=909'],
    8,
  ),
  src('it_62_faro', 'Il Faro online', '62', ['https://www.ilfaroonline.it/feed/'], 7),

  // ---- Abruzzo ----
  src('it_65_tgr', 'TGR Abruzzo (RAI)', '65', [tgr('abruzzo')], 8),
  src('it_65_ansa', 'ANSA Abruzzo', '65', [ansa('abruzzo')], 8),
  src('it_65_rete8', 'Rete8', '65', ['https://www.rete8.it/feed/'], 7),
  src('it_65_abruzzolive', 'AbruzzoLive', '65', ['https://www.abruzzolive.it/feed/'], 7),
  src('it_65_ekuonews', 'Ekuonews', '65', ['https://www.ekuonews.it/feed/'], 7),

  // ---- Molise ----
  src('it_67_tgr', 'TGR Molise (RAI)', '67', [tgr('molise')], 8),
  src('it_67_ansa', 'ANSA Molise', '67', [ansa('molise')], 8),
  src('it_67_isnews', 'isNews', '67', ['https://www.isnews.it/feed/'], 7),
  src('it_67_termolionline', 'TermoliOnLine', '67', ['https://www.termolionline.it/feed/'], 7),
  src('it_67_molisenetwork', 'Molise Network', '67', ['https://www.molisenetwork.net/feed/'], 7),

  // ---- Campania ----
  src('it_72_tgr', 'TGR Campania (RAI)', '72', [tgr('campania')], 8),
  src('it_72_ansa', 'ANSA Campania', '72', [ansa('campania')], 8),
  src('it_72_corriere', 'Corriere del Mezzogiorno (Napoli)', '72', [corriere('napoli')], 9),
  src('it_72_repubblica', 'la Repubblica Napoli', '72', [repubblica('napoli')], 9),
  src('it_72_irpinianews', 'Irpinianews', '72', ['https://www.irpinianews.it/feed/'], 7),
  src('it_72_meridiano', 'Il Meridiano News', '72', ['https://www.ilmeridianonews.it/feed/'], 7),
  src('it_72_anteprima24', 'Anteprima24', '72', ['https://www.anteprima24.it/feed/'], 7),

  // ---- Puglia ----
  src('it_75_tgr', 'TGR Puglia (RAI)', '75', [tgr('puglia')], 8),
  src('it_75_ansa', 'ANSA Puglia', '75', [ansa('puglia')], 8),
  // Bari, Lecce, Foggia, Taranto.
  src('it_75_gdm', 'La Gazzetta del Mezzogiorno', '75', [gdm(145), gdm(113), gdm(112), gdm(114)], 9),
  src('it_75_corriere', 'Corriere del Mezzogiorno (Bari)', '75', [corriere('bari')], 9),
  src('it_75_repubblica', 'la Repubblica Bari', '75', [repubblica('bari')], 9),
  src('it_75_lecceprima', 'LeccePrima', '75', ['https://www.lecceprima.it/rss'], 7),
  src('it_75_telenorba', 'Telenorba', '75', ['https://www.telenorba.it/feed/'], 7),

  // ---- Basilicata ----
  src('it_77_tgr', 'TGR Basilicata (RAI)', '77', [tgr('basilicata')], 8),
  src('it_77_ansa', 'ANSA Basilicata', '77', [ansa('basilicata')], 8),
  src('it_77_sassilive', 'SassiLive', '77', ['https://www.sassilive.it/feed/'], 7),
  src('it_77_basilicata24', 'Basilicata24', '77', ['https://www.basilicata24.it/feed/'], 7),
  src('it_77_potenzanews', 'Potenza News', '77', ['https://www.potenzanews.net/feed/'], 7),
  src('it_77_ivl24', 'ivl24', '77', ['https://www.ivl24.it/feed/'], 7),

  // ---- Calabria ----
  src('it_78_tgr', 'TGR Calabria (RAI)', '78', [tgr('calabria')], 8),
  src('it_78_ansa', 'ANSA Calabria', '78', [ansa('calabria')], 8),
  src(
    'it_78_gazzettadelsud',
    'Gazzetta del Sud (Calabria)',
    '78',
    [
      ses('calabria.gazzettadelsud.it', 'calabria'),
      ses('cosenza.gazzettadelsud.it', 'cosenza'),
      ses('catanzaro.gazzettadelsud.it', 'catanzaro'),
      ses('reggio.gazzettadelsud.it', 'reggio'),
    ],
    9,
  ),
  src('it_78_corrieredellacalabria', 'Corriere della Calabria', '78', ['https://www.corrieredellacalabria.it/feed/'], 7),
  src('it_78_catanzaroinforma', 'CatanzaroInforma', '78', ['https://www.catanzaroinforma.it/feed/'], 7),

  // ---- Sicilia ----
  src('it_82_tgr', 'TGR Sicilia (RAI)', '82', [tgr('sicilia')], 8),
  src('it_82_ansa', 'ANSA Sicilia', '82', [ansa('sicilia')], 8),
  src('it_82_repubblica', 'la Repubblica Palermo', '82', [repubblica('palermo')], 9),
  // Same publisher (SES) as Gazzetta del Sud; Palermo edition vs Messina edition.
  src('it_82_gds', 'Giornale di Sicilia (Palermo)', '82', [ses('gds.it', 'palermo')], 9),
  src('it_82_gazzettadelsud', 'Gazzetta del Sud (Messina)', '82', [ses('messina.gazzettadelsud.it', 'messina')], 9),
  src('it_82_cataniatoday', 'CataniaToday', '82', ['https://www.cataniatoday.it/rss'], 7),
  src('it_82_blogsicilia', 'BlogSicilia', '82', ['https://www.blogsicilia.it/feed/'], 7),
  src('it_82_newsicilia', 'NewSicilia', '82', ['https://www.newsicilia.it/feed'], 7),

  // ---- Sardegna ----
  src('it_88_tgr', 'TGR Sardegna (RAI)', '88', [tgr('sardegna')], 8),
  src('it_88_ansa', 'ANSA Sardegna', '88', [ansa('sardegna')], 8),
  src('it_88_casteddu', 'Casteddu Online', '88', ['https://www.castedduonline.it/feed/'], 7),
  src('it_88_vistanet', 'Vistanet Cagliari', '88', ['https://www.vistanet.it/cagliari/feed/'], 7),
  src('it_88_galluraoggi', 'Gallura Oggi', '88', ['https://www.galluraoggi.it/feed/'], 7),
];
