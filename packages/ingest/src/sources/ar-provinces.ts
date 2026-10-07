import type { SourceConfig } from '../sources.config';

/** ISO 3166-2:AR letters: A Salta, B Buenos Aires Province, C City of Buenos Aires, D San Luis, … */
type ProvinceCode =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z';

const src = (
  id: string,
  name: string,
  region: ProvinceCode,
  feedUrls: string[],
  authority: number,
): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'AR',
  language: 'es',
  region: `AR-${region}`,
  feedUrls,
  authority,
});

/** Página/12's regional supplements (Rosario/12, Salta/12, Buenos Aires/12), each its own desk. */
const pagina12 = (supplement: string) =>
  `https://www.pagina12.com.ar/arc/outboundfeeds/rss/suplementos/${supplement}/notas`;
/** Perfil's provincial and city editions. */
const perfil = (edition: string) => `https://www.perfil.com/feed/${edition}`;
/** Section feeds on the "contenidos/rss.html" CMS shared by many provincial papers. */
const rssPages = (host: string, ...slugs: string[]) =>
  slugs.map((slug) => `https://${host}/rss/pages/${slug}.xml`);
/** Feeds hosted by the eleco.com.ar CMS provider ("apiv3 feed-notes"). */
const eleco = (tenant: string) => `https://${tenant}apiv3.eleco.com.ar/feed-notes`;

/**
 * Argentina's 23 provinces and the City of Buenos Aires: regional outlets, one
 * region per source. Main provincial dailies 9 (smaller dailies 8), digital
 * outlets and local TV/radio sites 7. Big papers are taken through their
 * local section feeds where those exist; several site-wide Google News
 * sitemaps are kept where an outlet has nothing better, and they mix in some
 * national news (the clustering keeps those stories small in region files).
 *
 * Unusable here. These return 403 to our User-Agent: La Voz del Interior (all
 * its Arc feeds), El Diario del Centro del País, Comercio y Justicia, MDZ's
 * /rss, Infocielo, Qué Digital, El Liberal (Santiago del Estero), El
 * Chorrillero, Jujuy al Día, Época, Radio Dos and República de Corrientes,
 * Datachaco, Diario Chaco, Misiones Online, Misiones Cuatro, El Comercial and
 * Noticias Formosa, Ahora (Entre Ríos). El Sol (Mendoza) returns 429. These
 * did not answer at all (DNS or connection failure, or timeout): El Otro,
 * Agencia de Noticias San Luis, El Pregón, El Diario de Jujuy, Catamarca
 * Actual, La Reforma, Canal 3 La Pampa, La Mañana and Opinión Ciudadana
 * (Formosa), El Sureño, El Popular (Olavarría). No feed or news sitemap found:
 * Mendoza Post, Noticias Urbanas, Nueva Ciudad, Qué Pasa Salta, El
 * Independiente and Fénix (La Rioja), Contexto and El Tucumano, TiempoSur and
 * the other Santa Cruz sites, Crónica (Chubut), Jujuy Dice, El Diario de La
 * Pampa. Malformed XML: Nuevo Diario de Salta, Jornada (Chubut), El Litoral's
 * section feeds, Diario Río Negro's section pages. Mostly national, world or
 * celebrity news: La Gaceta (its /rss and news sitemap), El Litoral (Santa Fe)
 * news sitemap, MDZ's news sitemap, Los Andes' politics and latest-news
 * feeds, Uno Santa Fe's general feed, Cadena 3, El Doce (also Grupo Clarín,
 * with gaming advertorials), Diario Hoy (La Plata), Ciudadano News, El
 * Intransigente, Notife, Diario Huarpe, Análisis Digital, Diario Popular, La
 * Nación's and Infobae's society sections, Minuto Neuquén (also future-dated
 * items), La Licuadora, Diario Río Negro's main feed. Stale or near-empty:
 * Unidiversidad, Salta 4400, Uno Santa Fe's province feed, El Tribuno's Jujuy
 * feed, Periódico VAS, Más Neuquén, La Nación's Buenos Aires feed, Puntal's
 * region feed, El Día's city feed, La Capital (Mar del Plata) and La Verdad
 * (Junín) sitemaps, Santiago al Día, Catamarca/12, Primera Fuente (one
 * batch a day, also mixed). Other: Perspectiva Sur has
 * undated items; Minuto Fueguino's titles are mojibake; Tiempo de San Juan
 * mostly carries Mendoza stories and Corrientes Hoy San Nicolás ones; El
 * Cordillerano's and Noticias Net's province feeds are the same government
 * press releases; Diario Formosa's eleco-hosted feed duplicates its sitemap.
 */
export const AR_PROVINCES: SourceConfig[] = [
  // ---- A: Salta ----
  src('ar_a_eltribuno', 'El Tribuno (Salta)', 'A', [
    'https://www.eltribuno.com/rss-new/salta.rss',
    'https://www.eltribuno.com/rss-new/municipios.rss',
  ], 9),
  src('ar_a_salta12', 'Salta/12 (Página/12)', 'A', [pagina12('salta12')], 8),
  src('ar_a_informate', 'Informate Salta', 'A', ['https://informatesalta.com.ar/sitemap-news.xml'], 7),
  src('ar_a_fm899', 'FM 89.9 Salta', 'A', ['https://fm899.com.ar/feed/'], 7),

  // ---- B: Buenos Aires Province (Conurbano and interior, not the City) ----
  src('ar_b_eldia', 'El Día (La Plata)', 'B', ['https://www.eldia.com/news_1.xml'], 9),
  src('ar_b_lanueva', 'La Nueva (Bahía Blanca)', 'B', [
    'https://www.lanueva.com/news/rss/category/1',
    'https://www.lanueva.com/news/rss/category/3',
  ], 9),
  src('ar_b_ba12', 'Buenos Aires/12 (Página/12)', 'B', [pagina12('buenos-aires12')], 8),
  src('ar_b_eleco', 'El Eco de Tandil', 'B', [eleco('artic')], 8),
  src('ar_b_0223', '0223 (Mar del Plata)', 'B', ['https://www.0223.com.ar/sitemaps_news.xml'], 7),
  src('ar_b_lanoticia1', 'La Noticia 1 (Conurbano)', 'B', [eleco('lanoticia1')], 7),
  src('ar_b_eldiariosur', 'El Diario Sur (Conurbano sur)', 'B', rssPages('www.eldiariosur.com', 'home'), 7),
  src('ar_b_infoeme', 'Infoeme (Olavarría)', 'B', ['https://www.infoeme.com/sitemaps_news.xml'], 7),

  // ---- C: City of Buenos Aires ----
  src('ar_c_clarin', 'Clarín (Ciudades)', 'C', ['https://www.clarin.com/rss/ciudades/'], 9),
  src('ar_c_perfil', 'Perfil (Ciudad de Buenos Aires)', 'C', [perfil('ciudad-de-buenos-aires')], 8),
  src('ar_c_palermo', 'Palermo Online', 'C', ['https://palermonline.com.ar/wordpress/feed/'], 7),

  // ---- D: San Luis ----
  src('ar_d_republica', 'El Diario de la República', 'D', ['https://www.eldiariodelarepublica.com/sitemap-news.xml'], 9),
  src('ar_d_lavoz', 'La Voz de San Luis', 'D', ['https://lavozdesanluis.com.ar/feed/'], 7),
  src('ar_d_sanluis24', 'San Luis 24', 'D', ['https://sanluis24.com.ar/feed/'], 7),

  // ---- E: Entre Ríos ----
  src('ar_e_uno', 'Uno Entre Ríos', 'E', rssPages('www.unoentrerios.com.ar', 'provincia'), 8),
  src('ar_e_elentrerios', 'El Entre Ríos', 'E', ['https://www.elentrerios.com/sitemap-news.xml'], 8),
  src('ar_e_elheraldo', 'El Heraldo (Concordia)', 'E', [eleco('elheraldo')], 8),
  src('ar_e_riouruguay', 'Diario Río Uruguay', 'E', ['https://diarioriouruguay.com/sitemap-news.xml'], 8),
  src('ar_e_elonce', 'Elonce', 'E', ['https://www.elonce.com/sitemap-news.xml'], 7),
  src('ar_e_ahora', 'Entre Ríos Ahora', 'E', ['https://entreriosahora.com/feed/'], 7),

  // ---- F: La Rioja ----
  src('ar_f_nuevarioja', 'Nueva Rioja', 'F', ['https://nuevarioja.com.ar/sitemap-news.xml'], 9),
  src('ar_f_mediosrioja', 'Medios Rioja', 'F', ['https://mediosrioja.com.ar/feed/'], 7),
  src('ar_f_riojavirtual', 'Rioja Virtual', 'F', ['https://riojavirtual.com.ar/feed/'], 7),
  src('ar_f_riojalibre', 'Rioja Libre', 'F', ['https://riojalibre.com.ar/feed/'], 7),

  // ---- G: Santiago del Estero ----
  src('ar_g_nuevodiario', 'Nuevo Diario', 'G', ['https://nuevodiarioweb.com.ar/sitemap-news.xml'], 8),
  // The token is the public one published in the site's robots.txt.
  src('ar_g_panorama', 'Diario Panorama', 'G', ['https://www.diariopanorama.com/rss/news?token=llo387fg12fu54ks'], 8),

  // ---- H: Chaco ----
  src('ar_h_norte', 'Diario Norte', 'H', ['https://www.diarionorte.com/rss'], 9),
  src('ar_h_primeralinea', 'Primera Línea', 'H', ['https://www.diarioprimeralinea.com.ar/feed/'], 8),
  src('ar_h_chacodpd', 'Chaco Día por Día', 'H', ['https://www.chacodiapordia.com/feed/'], 7),
  src('ar_h_sudamericana', 'Radio Sudamericana (Chaco)', 'H', ['https://www.radiosudamericana.com/chaco/sitemap-noticias.xml'], 7),

  // ---- J: San Juan ----
  src('ar_j_diariodecuyo', 'Diario de Cuyo', 'J', ['https://www.diariodecuyo.com.ar/sitemap-news.xml'], 9),
  src('ar_j_laprovincia', 'Diario La Provincia SJ', 'J', ['https://diariolaprovinciasj.com/feed/'], 8),
  src('ar_j_canal13', 'Canal 13 San Juan', 'J', ['https://www.canal13sanjuan.com/sitemap-news.xml'], 7),
  src('ar_j_0264', '0264 Noticias', 'J', ['https://www.0264noticias.com.ar/rss/noticias'], 7),
  src('ar_j_sanjuan8', 'San Juan 8', 'J', ['https://www.sanjuan8.com/sitemap-news.xml'], 7),

  // ---- K: Catamarca ----
  src('ar_k_elancasti', 'El Ancasti', 'K', rssPages('www.elancasti.com.ar', 'info-gral'), 9),
  src('ar_k_elesquiu', 'El Esquiú', 'K', ['https://www.elesquiu.com/sitemaps/news.xml'], 8),
  src('ar_k_valleviejo', 'Radio Valle Viejo', 'K', ['https://radiovalleviejo.com/feed/'], 7),

  // ---- L: La Pampa ----
  src('ar_l_laarena', 'La Arena', 'L', ['https://www.laarena.com.ar/sitemap-news.xml'], 9),
  src('ar_l_textual', 'Diario Textual', 'L', ['https://diariotextual.com/inicio/index.php/feed/'], 7),
  src('ar_l_infopico', 'Infopico', 'L', ['https://www.infopico.com/feed/'], 7),
  src('ar_l_planb', 'Plan B Noticias', 'L', ['https://www.planbnoticias.com.ar/index.php/feed/'], 7),

  // ---- M: Mendoza ----
  src('ar_m_losandes', 'Los Andes', 'M', rssPages('www.losandes.com.ar', 'sociedad'), 9),
  src('ar_m_uno', 'Diario Uno (Mendoza)', 'M', [
    'https://www.diariouno.com.ar/rss/sociedad.xml',
    'https://www.diariouno.com.ar/rss/policiales.xml',
  ], 8),
  src('ar_m_sanrafael', 'Diario San Rafael', 'M', ['https://diariosanrafael.com.ar/feed/'], 8),
  src('ar_m_sitioandino', 'Sitio Andino', 'M', rssPages('www.sitioandino.com.ar', 'departamentales', 'politica'), 7),

  // ---- N: Misiones ----
  src('ar_n_elterritorio', 'El Territorio', 'N', [
    'https://www.elterritorio.com.ar/rss/misiones',
    'https://www.elterritorio.com.ar/rss/policiales',
  ], 9),
  src('ar_n_primeraedicion', 'Primera Edición', 'N', ['https://www.primeraedicion.com.ar/feed/'], 8),
  src('ar_n_canal12', 'Canal 12 Misiones', 'N', ['https://www.canal12misiones.com/feed'], 7),
  src('ar_n_misionesopina', 'Misiones Opina', 'N', ['https://www.misionesopina.com.ar/feed/'], 7),
  src('ar_n_noticiasdel6', 'Noticias del 6', 'N', ['https://noticiasdel6.com/feed/'], 7),

  // ---- P: Formosa ----
  src('ar_p_diarioformosa', 'Diario Formosa', 'P', ['https://www.diarioformosa.net/sitemap-news.xml'], 8),

  // ---- Q: Neuquén ----
  src('ar_q_lmn', 'LMNeuquén', 'Q', ['https://www.lmneuquen.com/rss/neuquen.xml'], 9),
  src('ar_q_alinstante', 'Neuquén al Instante', 'Q', [
    'https://www.neuquenalinstante.com.ar/rss/ciudad',
    'https://www.neuquenalinstante.com.ar/rss/provinciales',
    'https://www.neuquenalinstante.com.ar/rss/policiales',
  ], 7),
  src('ar_q_angosturadigital', 'La Angostura Digital', 'Q', ['https://www.laangosturadigital.com.ar/feed/'], 7),
  src('ar_q_diarioandino', 'Diario Andino (Villa La Angostura)', 'Q', ['https://www.diarioandino.com.ar/rss/sociedad'], 7),

  // ---- R: Río Negro ----
  // LM Cipolletti belongs to La Mañana's group like LMNeuquén, but covers the other province.
  src('ar_r_lmcipolletti', 'LM Cipolletti', 'R', ['https://www.lmcipolletti.com/sitemap-news.xml'], 8),
  src('ar_r_cordillerano', 'El Cordillerano (Bariloche)', 'R', ['https://www.elcordillerano.com.ar/rss/policiales/'], 8),
  src('ar_r_adn', 'ADN Río Negro', 'R', ['https://www.adnrionegro.com.ar/feed/'], 7),
  src('ar_r_barilocheopina', 'Bariloche Opina', 'R', ['https://www.barilocheopina.com/rss/noticias'], 7),
  src('ar_r_anb', 'ANB (Agencia de Noticias Bariloche)', 'R', ['https://www.anbariloche.com.ar/rss/noticias'], 7),

  // ---- S: Santa Fe ----
  src('ar_s_lacapital', 'La Capital (Rosario)', 'S', rssPages('www.lacapital.com.ar', 'laciudad', 'laregion', 'policiales'), 9),
  src('ar_s_rosario12', 'Rosario/12 (Página/12)', 'S', [pagina12('rosario12')], 8),
  src('ar_s_aire', 'Aire de Santa Fe', 'S', rssPages('www.airedesantafe.com.ar', 'santa-fe'), 7),
  src('ar_s_elciudadano', 'El Ciudadano (Rosario)', 'S', ['https://elciudadanoweb.com/feed/'], 7),
  src('ar_s_rosarioplus', 'Rosario Plus', 'S', ['https://www.rosarioplus.com/sitemap-news.xml'], 7),

  // ---- T: Tucumán (no local-only feed exists; both mix in national news) ----
  src('ar_t_losprimeros', 'Los Primeros', 'T', ['https://www.losprimeros.tv/sitemap-news.xml'], 7),
  src('ar_t_alas7', 'Tucumán a las 7', 'T', ['https://tucumanalas7.com.ar/feed/'], 7),

  // ---- U: Chubut ----
  src('ar_u_elpatagonico', 'El Patagónico (Comodoro Rivadavia)', 'U', [
    'https://www.elpatagonico.com/rss/regionales.xml',
    'https://www.elpatagonico.com/rss/policiales.xml',
  ], 9),
  src('ar_u_elchubut', 'El Chubut', 'U', ['https://www.elchubut.com.ar/sitemap-news.xml'], 9),
  src('ar_u_madryn', 'El Diario de Madryn', 'U', ['https://www.eldiarioweb.com/feed'], 8),
  src('ar_u_adnsur', 'ADN Sur', 'U', ['https://www.adnsur.com.ar/sitemap-news.xml'], 7),

  // ---- V: Tierra del Fuego ----
  src('ar_v_prensa', 'Diario Prensa', 'V', ['https://www.diarioprensa.com.ar/feed/'], 8),
  src('ar_v_infofueguina', 'Infofueguina', 'V', ['https://www.infofueguina.com/feeds/rss'], 7),
  src('ar_v_actualidadtdf', 'Actualidad TDF', 'V', ['https://www.actualidadtdf.com.ar/feed/'], 7),
  src('ar_v_sur54', 'Sur54', 'V', [
    'https://www.sur54.com/rss/provinciales',
    'https://www.sur54.com/rss/municipales',
  ], 7),

  // ---- W: Corrientes ----
  src('ar_w_ellitoral', 'El Litoral (Corrientes)', 'W', ['https://www.ellitoral.com.ar/sitemaps_news.xml'], 9),
  src('ar_w_ellibertador', 'El Libertador', 'W', ['https://www.diarioellibertador.com.ar/feed/'], 8),
  src('ar_w_sudamericana', 'Radio Sudamericana (Corrientes)', 'W', ['https://www.radiosudamericana.com/sitemap-noticias.xml'], 7),

  // ---- X: Córdoba ----
  src('ar_x_puntal', 'Puntal (Río Cuarto)', 'X', [
    'https://www.puntal.com.ar/rss/rio-cuarto.xml',
    'https://www.puntal.com.ar/rss/provincia.xml',
  ], 8),
  src('ar_x_carlospaz', 'El Diario de Carlos Paz', 'X', ['https://www.eldiariodecarlospaz.com.ar/feeds/rss'], 8),
  src('ar_x_perfil', 'Perfil Córdoba', 'X', [perfil('cordoba')], 8),
  src('ar_x_hoydia', 'Hoy Día Córdoba', 'X', ['https://hoydia.com.ar/feed/'], 7),
  src('ar_x_cba24n', 'Cba24n (SRT)', 'X', ['https://www.cba24n.com.ar/sitemap-news.xml'], 7),
  src('ar_x_lmdiario', 'La Nueva Mañana', 'X', ['https://lmdiario.com.ar/news_sitemap.xml'], 7),

  // ---- Y: Jujuy ----
  src('ar_y_todojujuy', 'Todo Jujuy', 'Y', rssPages('www.todojujuy.com', 'jujuy'), 7),
  src('ar_y_somosjujuy', 'Somos Jujuy', 'Y', ['https://www.somosjujuy.com.ar/feed/'], 7),
  src('ar_y_almomento', 'Jujuy al Momento', 'Y', ['https://www.jujuyalmomento.com/sitemap-news.xml'], 7),

  // ---- Z: Santa Cruz ----
  src('ar_z_opinionaustral', 'La Opinión Austral', 'Z', ['https://laopinionaustral.com.ar/sitemaps/sitemaps-googlenews.xml'], 9),
  src('ar_z_ahoracalafate', 'Ahora Calafate', 'Z', ['https://ahoracalafate.com.ar/news_sitemap.xml'], 7),
];
