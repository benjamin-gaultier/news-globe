import type { SourceConfig } from '../sources.config';

type NorthState =
  | 'BCN'
  | 'BCS'
  | 'SON'
  | 'CHH'
  | 'COA'
  | 'NLE'
  | 'TAM'
  | 'SIN'
  | 'DUR'
  | 'ZAC'
  | 'SLP'
  | 'AGU'
  | 'NAY'
  | 'JAL'
  | 'COL'
  | 'GUA';

const src = (id: string, name: string, region: NorthState, feedUrls: string[], authority: number): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'MX',
  language: 'es',
  region: `MX-${region}`,
  feedUrls,
  authority,
});

/**
 * Organización Editorial Mexicana's local papers (El Sol de …, El Heraldo de …).
 * Their feeds carry local copy plus local opinion columns. Where one state has
 * several OEM papers covering different cities, they are one source, so their
 * shared stories never count as independent outlets.
 */
const oem = (...papers: string[]) => papers.map((paper) => `https://oem.com.mx/${paper}/rss`);
/** WordPress category or section feeds. */
const wp = (host: string, ...paths: string[]) => paths.map((path) => `https://${host}/${path}/feed/`);
/** Posta (Monterrey) state news sitemaps: one per state desk. */
const posta = (state: string) => `https://www.posta.com.mx/sitemapnoticias/${state}`;

/**
 * Mexico's north, west and Bajío (BCN, BCS, SON, CHH, COA, NLE, TAM, SIN, DUR,
 * ZAC, SLP, AGU, NAY, JAL, COL, GUA): regional outlets, one region per source.
 * The state's main paper 9 (smaller dailies 8), digital outlets and local
 * radio/TV sites 7. One OEM source per state (OEM has no paper in NL, Nayarit
or Colima); Posta (Monterrey) has separate
 * desks for NL, Coahuila, Tamaulipas and Durango.
 *
 * Unusable here. These return 403 to our User-Agent: Frontera, La Crónica de
 * Baja California, Peninsular Digital, ABC Noticias, El Mañana (Nuevo Laredo and
 * Reynosa), El Debate, Ríodoce, Revista Espejo, NTR Zacatecas, La Jornada
 * Zacatecas, Astrolabio, Código San Luis, Zona Franca, Primera Hora, En Línea
 * Directa, El Diario de Coahuila, Rumbo Nuevo, El Siglo de Torreón (all but
 * its mixed main feed) and La Jornada Aguascalientes' section feeds; El
 * Comentario (Universidad de Colima) answers 468. These answer every feed URL
 * with an HTML page: El Diario (Juárez and Chihuahua), La Opción, Tiempo,
 * Puente Libre, Periódico Correo, Imagen (Zacatecas), El Clarinete, Durango al
 * Día, La Voz de Durango, Notigram and Periódico La Voz (Monclova). No feed or
 * news sitemap we could find: Milenio (and Telediario), Info7 (plain
 * sitemaps), El Horizonte, El Porvenir (its news sitemaps are stale or not
 * XML), Uniradio Informa, Omnia, Net Noticias, Dossier Político, Pulso, Plano
 * Informativo, Ecos de la Costa (feed 8 months stale), NTR Guadalajara,
 * Poplab, Noticias Vespertinas, Unión Jalisco and Unión Guanajuato; Diario de
 * Colima times out. Main feeds or news sitemaps that carry mostly national or
 * world news, with no usable local section feed: El Imparcial (its sitemap
 * also mixes Sonora, Tijuana and Mexicali), Vanguardia, Zócalo, El Siglo de
 * Torreón, El Siglo de Durango, Expreso (Sonora), Uniradio Sonora, Medios
 * Obson, Zeta (its city category feeds are weeks stale), La Jornada
 * Aguascalientes, El Bravo, Líder Web, ZonaDocs, Proyecto Diez, Verificado,
 * La Silla Rota, N+ and Azteca Jalisco (mostly viral and horoscopes). UDG TV's
 * only feed mixes radio programme episodes with national news. Too slow or
 * stale: La Verdad Juárez, Lindero Norte, El Informante BCS, Estación
 * Pacífico, Colima Noticias, Página 24, 4 Vientos, El Mundo desde Colima and
 * Newsweek Aguascalientes (weekly). Hidrocálido's feed only lists its daily
 * front pages; Diario El Independiente (BCS) stamps every item with the fetch
 * time.
 */
export const MX_STATES_NORTH: SourceConfig[] = [
  // ---- Baja California: Tijuana, Mexicali, Ensenada ----
  src('mx_bcn_oem', 'El Sol de Tijuana / La Voz de la Frontera', 'BCN', oem('elsoldetijuana', 'lavozdelafrontera'), 9),
  src('mx_bcn_jornada', 'La Jornada Baja California', 'BCN', wp('jornadabc.com.mx', 'category/bajacalifornia'), 8),
  src('mx_bcn_puntonorte', 'Punto Norte', 'BCN', ['https://puntonorte.info/feed/'], 7),

  // ---- Baja California Sur ----
  src('mx_bcs_oem', 'El Sudcaliforniano', 'BCS', oem('elsudcaliforniano'), 9),
  src('mx_bcs_bcsnoticias', 'BCS Noticias', 'BCS', ['https://www.bcsnoticias.mx/feed/'], 7),

  // ---- Sonora ----
  src('mx_son_oem', 'El Sol de Hermosillo', 'SON', oem('elsoldehermosillo'), 9),
  src('mx_son_tribuna', 'Tribuna (Sonora)', 'SON', wp('tribuna.com.mx', 'seccion/sonora'), 8),
  src('mx_son_proyectopuente', 'Proyecto Puente', 'SON', wp('proyectopuente.com.mx', 'noticias-sonora', 'noticias-hermosillo'), 7),

  // ---- Chihuahua: Chihuahua city and Ciudad Juárez ----
  src('mx_chh_oem', 'El Heraldo de Chihuahua / El Heraldo de Juárez', 'CHH', oem('elheraldodechihuahua', 'elheraldodejuarez'), 9),
  src('mx_chh_entrelineas', 'Entrelíneas', 'CHH', ['https://www.entrelineas.com.mx/feed/'], 7),
  src(
    'mx_chh_nortedigital',
    'Norte Digital (Juárez)',
    'CHH',
    wp('nortedigital.mx', 'category/frontera', 'category/estado', 'category/policiaca'),
    7,
  ),
  src('mx_chh_canal44', 'Canal 44 (Juárez)', 'CHH', ['https://canal44.com/feed/'], 7),

  // ---- Coahuila: Saltillo and La Laguna (Torreón) ----
  src('mx_coa_oem', 'El Sol de la Laguna', 'COA', oem('elsoldelalaguna'), 9),
  src('mx_coa_heraldo', 'El Heraldo de Saltillo', 'COA', wp('www.elheraldodesaltillo.mx', 'category/coahuila'), 8),
  src('mx_coa_posta', 'Posta Coahuila', 'COA', [posta('coahuila')], 7),

  // ---- Nuevo León ----
  src('mx_nle_elnorte', 'El Norte', 'NLE', ['https://www.elnorte.com/rss/local.xml', 'https://www.elnorte.com/rss/seguridad.xml'], 9),
  src('mx_nle_posta', 'Posta Nuevo León', 'NLE', [posta('nuevo-leon')], 7),
  src('mx_nle_horacero', 'Hora Cero', 'NLE', ['https://horacero.com.mx/feed/'], 7),

  // ---- Tamaulipas ----
  src('mx_tam_oem', 'El Sol de Tampico', 'TAM', oem('elsoldetampico'), 9),
  src('mx_tam_expreso', 'Expreso (Ciudad Victoria)', 'TAM', ['https://expreso.press/feed/'], 8),
  src('mx_tam_posta', 'Posta Tamaulipas', 'TAM', [posta('tamaulipas')], 7),

  // ---- Sinaloa ----
  src('mx_sin_oem', 'El Sol de Sinaloa / El Sol de Mazatlán', 'SIN', oem('elsoldesinaloa', 'elsoldemazatlan'), 9),
  src('mx_sin_lineadirecta', 'Línea Directa', 'SIN', wp('lineadirectaportal.com', 'category/sinaloa'), 7),
  src('mx_sin_noticieristas', 'Los Noticieristas', 'SIN', wp('www.losnoticieristas.com', 'category/sinaloa'), 7),

  // ---- Durango ----
  src('mx_dur_oem', 'El Sol de Durango', 'DUR', oem('elsoldedurango'), 9),
  src('mx_dur_contexto', 'Contexto de Durango', 'DUR', ['https://www.contextodedurango.com.mx/feed/'], 7),
  src('mx_dur_contactohoy', 'Contacto Hoy', 'DUR', ['https://www.contactohoy.com.mx/feed/'], 7),
  src('mx_dur_posta', 'Posta Durango', 'DUR', [posta('durango')], 7),

  // ---- Zacatecas ----
  src('mx_zac_oem', 'El Sol de Zacatecas', 'ZAC', oem('elsoldezacatecas'), 9),
  src('mx_zac_zacatecasonline', 'Zacatecas Online', 'ZAC', ['https://www.zacatecasonline.com.mx/feed'], 7),

  // ---- San Luis Potosí ----
  src('mx_slp_oem', 'El Sol de San Luis', 'SLP', oem('elsoldesanluis'), 9),
  src('mx_slp_jornada', 'La Jornada San Luis', 'SLP', wp('lajornadasanluis.com.mx', 'seccion/slp'), 8),
  src('mx_slp_laorquesta', 'La Orquesta', 'SLP', ['https://laorquesta.mx/feed/'], 7),
  src('mx_slp_metropoli', 'Metrópoli San Luis', 'SLP', ['https://metropolisanluis.com/feed/'], 7),

  // ---- Aguascalientes ----
  src('mx_agu_oem', 'El Sol del Centro', 'AGU', oem('elsoldelcentro'), 9),
  src('mx_agu_heraldo', 'El Heraldo de Aguascalientes', 'AGU', wp('www.heraldo.mx', 'category/local', 'category/policiacas'), 8),

  // ---- Nayarit ----
  src('mx_nay_meridiano', 'Meridiano de Nayarit', 'NAY', ['https://meridiano.mx/feed'], 9),
  src('mx_nay_enfoque', 'Enfoque Nayarit', 'NAY', ['https://www.enfoquenayarit.com/feed/'], 7),

  // ---- Jalisco: Guadalajara and the state ----
  src('mx_jal_informador', 'El Informador', 'JAL', ['https://www.informador.mx/rss/jalisco.xml'], 9),
  src('mx_jal_mural', 'Mural', 'JAL', ['https://www.mural.com.mx/rss/portada.xml'], 9),
  src('mx_jal_oem', 'El Occidental', 'JAL', oem('eloccidental'), 8),
  src('mx_jal_notisistema', 'Notisistema', 'JAL', ['https://www.notisistema.com/noticias/seccion/jalisco/feed/'], 7),
  src('mx_jal_partidero', 'Partidero', 'JAL', ['https://partidero.com/feed/'], 7),
  src('mx_jal_concienciapublica', 'Conciencia Pública', 'JAL', ['https://www.concienciapublica.com.mx/feed/'], 7),

  // ---- Colima ----
  src('mx_col_afmedios', 'AF Medios', 'COL', ['https://www.afmedios.com/feed/'], 7),

  // ---- Guanajuato: León and the Bajío ----
  src('mx_gua_am', 'AM', 'GUA', wp('www.am.com.mx', 'leon', 'guanajuato', 'celaya', 'irapuato', 'guanajuato-sur'), 9),
  src(
    'mx_gua_oem',
    'El Sol de León / El Sol del Bajío / El Sol de Irapuato / El Sol de Salamanca',
    'GUA',
    oem('elsoldeleon', 'elsoldelbajio', 'elsoldeirapuato', 'elsoldesalamanca'),
    8,
  ),
  src('mx_gua_notus', 'Notus', 'GUA', ['https://www.notus.com.mx/feed/'], 7),
];
