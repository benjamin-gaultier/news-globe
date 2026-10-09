import type { SourceConfig } from '../sources.config';

type SouthRegion = 'MD' | 'CM' | 'EX' | 'AN' | 'MC' | 'VC' | 'IB' | 'CN';

const src = (
  id: string,
  name: string,
  region: SouthRegion,
  feedUrls: string[],
  authority: number,
  language: 'es' | 'ca' = 'es',
): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'ES',
  language,
  region: `ES-${region}`,
  feedUrls,
  authority,
});

/**
 * Spain, central, southern and island autonomous communities (MD, CM, EX, AN,
 * MC, VC, IB, CN): regional outlets, one region per source. Public broadcasters
 * 8, main dailies 9 (smaller provincial dailies 8), digital outlets and the
 * Europa Press regional desks 7.
 *
 * Unusable here: every Prensa Ibérica site (Levante-EMV, Información, Diario de
 * Mallorca, Diario de Ibiza, La Provincia, El Día, La Opinión de Murcia/Málaga,
 * El Periódico Extremadura, La Crónica de Badajoz, Diario Córdoba, Mediterráneo)
 * returns 406 to our User-Agent; Castilla-La Mancha Media and RTVC (Canarias)
 * publish no feed; Canal Extremadura's feed puts raw HTML in its titles and has
 * no dates; Onda Regional de Murcia's feed is empty; La Tribuna (Promecal) 403.
 * Región Digital (Extremadura) mostly reruns Europa Press copy almost word for
 * word, which made fake two-outlet clusters; La 7 Región de Murcia's region
 * feed is days stale and its main feed is half national news.
 */
export const ES_REGIONS_SOUTH: SourceConfig[] = [
  // ---- Comunidad de Madrid (Comunidad and city desks, not national politics) ----
  src('es_md_telemadrid', 'Telemadrid', 'MD', ['https://www.telemadrid.es/rss/section/6/'], 8),
  src(
    'es_md_elpais',
    'El País (Madrid)',
    'MD',
    ['https://feeds.elpais.com/mrss-s/list/ep/site/elpais.com/section/espana/subsection/madrid'],
    9,
  ),
  src('es_md_elmundo', 'El Mundo (Madrid)', 'MD', ['https://e00-elmundo.uecdn.es/elmundo/rss/madrid.xml'], 9),
  src('es_md_abc', 'ABC (Madrid)', 'MD', ['https://www.abc.es/rss/2.0/espana/madrid/'], 9),
  src('es_md_madridiario', 'Madridiario', 'MD', ['https://www.madridiario.es/rss/ultimasNoticias/'], 7),
  src('es_md_eldiario', 'elDiario.es Madrid', 'MD', ['https://www.eldiario.es/rss/madrid/'], 7),
  src('es_md_20minutos', '20minutos (Madrid)', 'MD', ['https://www.20minutos.es/rss/madrid/'], 7),
  src('es_md_europapress', 'Europa Press Madrid', 'MD', ['https://www.europapress.es/rss/rss.aspx?ch=289'], 7),

  // ---- Castilla-La Mancha ----
  src('es_cm_eldigital', 'El Digital Castilla-La Mancha', 'CM', ['https://www.elespanol.com/rss/eldigitalcastillalamancha/'], 7),
  src('es_cm_lanza', 'Lanza (Ciudad Real)', 'CM', ['https://www.lanzadigital.com/feed/'], 8),
  src('es_cm_nueva_alcarria', 'Nueva Alcarria (Guadalajara)', 'CM', ['https://nuevaalcarria.com/secciones/rss/5'], 8),
  src('es_cm_encastillalamancha', 'encastillalamancha.es', 'CM', ['https://www.encastillalamancha.es/feed/'], 7),
  src('es_cm_eldiario', 'elDiario.es Castilla-La Mancha', 'CM', ['https://www.eldiario.es/rss/castilla-la-mancha/'], 7),
  src('es_cm_europapress', 'Europa Press Castilla-La Mancha', 'CM', ['https://www.europapress.es/rss/rss.aspx?ch=282'], 7),

  // ---- Extremadura ----
  src('es_ex_hoy', 'Hoy', 'EX', ['https://www.hoy.es/rss/2.0/?section=extremadura'], 9),
  src('es_ex_eldiario', 'elDiario.es Extremadura', 'EX', ['https://www.eldiario.es/rss/extremadura/'], 7),
  src('es_ex_europapress', 'Europa Press Extremadura', 'EX', ['https://www.europapress.es/rss/rss.aspx?ch=285'], 7),

  // ---- Andalucía ----
  src('es_an_canalsur', 'Canal Sur', 'AN', ['https://www.canalsur.es/rss/category/section/8010/'], 8),
  src('es_an_diario_sevilla', 'Diario de Sevilla', 'AN', ['https://www.diariodesevilla.es/rss/category/section/140006/'], 9),
  // Grupo Joly, like Diario de Sevilla, but the Cádiz city desk.
  src('es_an_diario_cadiz', 'Diario de Cádiz', 'AN', ['https://www.diariodecadiz.es/rss/category/section/140180/'], 8),
  src('es_an_abc_sevilla', 'ABC Sevilla', 'AN', ['https://www.abc.es/rss/2.0/sevilla/'], 9),
  // Vocento, like ABC, but the Málaga and Granada desks.
  src('es_an_sur', 'Sur (Málaga)', 'AN', ['https://www.diariosur.es/rss/2.0/?section=malaga-capital'], 9),
  src('es_an_ideal', 'Ideal (Granada)', 'AN', ['https://www.ideal.es/rss/2.0/?section=granada'], 9),
  src('es_an_eldiario', 'elDiario.es Andalucía', 'AN', ['https://www.eldiario.es/rss/andalucia/'], 7),
  src('es_an_europapress', 'Europa Press Andalucía', 'AN', ['https://www.europapress.es/rss/rss.aspx?ch=279'], 7),

  // ---- Región de Murcia ----
  src('es_mc_laverdad', 'La Verdad', 'MC', ['https://www.laverdad.es/rss/2.0/?section=murcia'], 9),
  src('es_mc_murciaplaza', 'Murcia Plaza', 'MC', ['https://murciaplaza.com/noticias/rss/murciaplaza'], 7),
  src('es_mc_murciadiario', 'Murcia Diario', 'MC', ['https://www.murciadiario.com/rss/'], 7),
  src('es_mc_cartagena_actualidad', 'Cartagena Actualidad', 'MC', ['https://www.cartagenaactualidad.com/rss/'], 7),
  src('es_mc_eldiario', 'elDiario.es Murcia', 'MC', ['https://www.eldiario.es/rss/murcia/'], 7),
  src('es_mc_europapress', 'Europa Press Región de Murcia', 'MC', ['https://www.europapress.es/rss/rss.aspx?ch=295'], 7),

  // ---- Comunitat Valenciana ----
  // The Societat section: the main news feed mixes in world news and programme episodes.
  src('es_vc_apunt', 'À Punt', 'VC', ['https://www.apuntmedia.es/rss/category/section/1100/'], 8, 'ca'),
  src('es_vc_lasprovincias', 'Las Provincias', 'VC', ['https://www.lasprovincias.es/rss/2.0/?section=comunitat'], 9),
  // Sister papers of one group, one source so their shared regional stories don't count twice.
  src(
    'es_vc_plaza',
    'Valencia Plaza / Alicante Plaza',
    'VC',
    ['https://valenciaplaza.com/noticias/rss/valenciaplaza', 'https://alicanteplaza.es/noticias/rss/alicanteplaza'],
    7,
  ),
  src('es_vc_eldiario', 'elDiario.es Comunitat Valenciana', 'VC', ['https://www.eldiario.es/rss/comunitat-valenciana/'], 7),
  src('es_vc_europapress', 'Europa Press Comunitat Valenciana', 'VC', ['https://www.europapress.es/rss/rss.aspx?ch=292'], 7),

  // ---- Illes Balears ----
  src('es_ib_ib3', 'IB3', 'IB', ['https://ib3.org/feed'], 8, 'ca'),
  src('es_ib_ultimahora', 'Última Hora', 'IB', ['https://www.ultimahora.es/noticias/local.rss'], 9),
  src('es_ib_arabalears', 'Ara Balears', 'IB', ['https://www.arabalears.cat/rss/'], 8, 'ca'),
  src('es_ib_noudiari', 'Noudiari (Eivissa)', 'IB', ['https://www.noudiari.es/feed/'], 7),
  src('es_ib_eldiario', 'elDiario.es Illes Balears', 'IB', ['https://www.eldiario.es/rss/illes-balears/'], 7),
  src('es_ib_europapress', 'Europa Press Illes Balears', 'IB', ['https://www.europapress.es/rss/rss.aspx?ch=288'], 7),

  // ---- Canarias ----
  src('es_cn_canarias7', 'Canarias7', 'CN', ['https://www.canarias7.es/rss/2.0/?section=canarias'], 9),
  src('es_cn_diariodeavisos', 'Diario de Avisos', 'CN', ['https://diariodeavisos.elespanol.com/tenerife/feed/'], 8),
  src('es_cn_canariasahora', 'Canarias Ahora (elDiario.es)', 'CN', ['https://www.eldiario.es/rss/canariasahora/'], 7),
  src('es_cn_atlanticohoy', 'Atlántico Hoy', 'CN', ['https://www.atlanticohoy.com/uploads/feeds/feed_atlantico-hoy_es.xml'], 7),
  src('es_cn_europapress', 'Europa Press Canarias', 'CN', ['https://www.europapress.es/rss/rss.aspx?ch=287'], 7),
];
