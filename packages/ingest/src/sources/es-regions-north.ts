import type { SourceConfig } from '../sources.config';

type NorthRegion = 'GA' | 'AS' | 'CB' | 'PV' | 'NC' | 'RI' | 'AR' | 'CT' | 'CL';

const src = (
  id: string,
  name: string,
  region: NorthRegion,
  language: 'es' | 'ca' | 'gl' | 'eu',
  feedUrls: string[],
  authority: number,
): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'ES',
  language,
  region: `ES-${region}`,
  feeds: { top: feedUrls },
  authority,
});

/**
 * Spain, northern autonomous communities (GA, AS, CB, PV, NC, RI, AR, CT, CL):
 * regional outlets, one region per source. Public broadcasters 8, main regional
 * dailies 9 (smaller provincial dailies 8), digital outlets, radio desks and
 * elDiario.es regional editions 7.
 *
 * Unusable here: every Prensa Ibérica and Grupo Noticias site (Faro de Vigo,
 * La Opinión A Coruña, La Nueva España, El Periódico, El Periódico de Aragón,
 * La Opinión de Zamora, Diari de Girona, Regió7, Deia, Noticias de Gipuzkoa,
 * Noticias de Navarra) returns 406 to our requests; EITB's and RTVE's regional
 * feeds stopped updating in 2025 and 2022; RTPA's feed carries dates with day
 * and month swapped; CRTVG, Aragón TV and Diario de Teruel have no working feed;
 * NueveCuatroUno returns 403.
 */
export const ES_REGIONS_NORTH: SourceConfig[] = [
  // ---- Galicia ----
  src('es_ga_lavozdegalicia', 'La Voz de Galicia', 'GA', 'es', ['https://www.lavozdegalicia.es/galicia/index.xml'], 9),
  src('es_ga_nosdiario', 'Nós Diario', 'GA', 'gl', ['https://www.nosdiario.gal/rss/'], 8),
  src('es_ga_elprogreso', 'El Progreso (Lugo)', 'GA', 'es', ['https://www.elprogreso.es/rss/lugo/'], 8),
  // The city section; the main feed mixes in national agency copy.
  src('es_ga_diariodepontevedra', 'Diario de Pontevedra', 'GA', 'es', ['https://www.diariodepontevedra.es/rss/pontevedra/'], 8),
  src('es_ga_praza', 'Praza', 'GA', 'gl', ['https://praza.gal/rss/novas'], 7),
  // Galicia Confidencial runs the same press releases in Galician, so only one of the two.
  src('es_ga_galiciapress', 'Galiciapress', 'GA', 'es', ['https://www.galiciapress.es/feed/all'], 7),
  src('es_ga_eldiario', 'elDiario.es Galicia', 'GA', 'es', ['https://www.eldiario.es/rss/galicia/'], 7),

  // ---- Asturias ----
  src('es_as_elcomercio', 'El Comercio', 'AS', 'es', ['https://www.elcomercio.es/rss/2.0/?section=/asturias'], 9),
  src('es_as_lavozdeasturias', 'La Voz de Asturias', 'AS', 'es', ['https://www.lavozdeasturias.es/index.xml'], 8),
  src('es_as_nortes', 'Nortes', 'AS', 'es', ['https://www.nortes.me/feed/'], 7),
  src('es_as_migijon', 'miGijón', 'AS', 'es', ['https://migijon.com/feed/'], 7),
  // The news feed only; the station feed also lists every bulletin and programme episode.
  src('es_as_cope', 'COPE Asturias', 'AS', 'es', ['https://www.cope.es/api/es/emisoras/asturias/news/rss.xml'], 7),
  src('es_as_eldiario', 'elDiario.es Asturias', 'AS', 'es', ['https://www.eldiario.es/rss/asturias/'], 7),

  // ---- Cantabria ----
  src('es_cb_diariomontanes', 'El Diario Montañés', 'CB', 'es', ['https://www.eldiariomontanes.es/rss/2.0/?section=/cantabria'], 9),
  src('es_cb_alerta', 'Alerta', 'CB', 'es', ['https://www.eldiarioalerta.com/rss/'], 8),
  src('es_cb_eldiariocantabria', 'El Diario Cantabria', 'CB', 'es', ['https://eldiariocantabria.publico.es/rss/'], 7),
  src('es_cb_elfaradio', 'El Faradio', 'CB', 'es', ['https://www.elfaradio.com/feed/'], 7),
  src('es_cb_eldiario', 'elDiario.es Cantabria', 'CB', 'es', ['https://www.eldiario.es/rss/cantabria/'], 7),

  // ---- Basque Country ----
  // Vocento: El Correo covers Bizkaia and Álava, Diario Vasco Gipuzkoa.
  src(
    'es_pv_elcorreo',
    'El Correo',
    'PV',
    'es',
    ['https://www.elcorreo.com/rss/2.0/?section=/bizkaia', 'https://www.elcorreo.com/rss/2.0/?section=/alava/araba'],
    9,
  ),
  src('es_pv_diariovasco', 'Diario Vasco', 'PV', 'es', ['https://www.diariovasco.com/rss/2.0/?section=/gipuzkoa'], 9),
  src('es_pv_berria', 'Berria', 'PV', 'eu', ['https://www.berria.eus/uploads/feeds/feed_berria_eu.xml'], 8),
  // Mostly Spanish titles, with some in Basque and French.
  src('es_pv_naiz', 'Naiz', 'PV', 'es', ['https://www.naiz.eus/eu/rss/news.rss'], 7),
  src('es_pv_eldiario', 'elDiario.es Euskadi', 'PV', 'es', ['https://www.eldiario.es/rss/euskadi/'], 7),

  // ---- Navarre ----
  src('es_nc_diariodenavarra', 'Diario de Navarra', 'NC', 'es', ['https://www.diariodenavarra.es/rss/contenidos.xml'], 9),
  src('es_nc_navarracom', 'Navarra.com', 'NC', 'es', ['https://navarra.okdiario.com/rss/'], 7),
  src('es_nc_pamplonaactual', 'Pamplona Actual', 'NC', 'es', ['https://pamplonaactual.com/feed/'], 7),
  src('es_nc_cope', 'COPE Navarra', 'NC', 'es', ['https://www.cope.es/api/es/emisoras/navarra/news/rss.xml'], 7),
  src('es_nc_eldiario', 'elDiario.es Navarra', 'NC', 'es', ['https://www.eldiario.es/rss/navarra/'], 7),

  // ---- La Rioja ----
  src(
    'es_ri_larioja',
    'La Rioja',
    'RI',
    'es',
    ['https://www.larioja.com/rss/2.0/?section=/la-rioja', 'https://www.larioja.com/rss/2.0/?section=/logrono'],
    9,
  ),
  // Rioja2 is elDiario.es's La Rioja edition.
  src('es_ri_rioja2', 'Rioja2 (elDiario.es La Rioja)', 'RI', 'es', ['https://www.rioja2.com/rss/la-rioja/'], 7),
  src('es_ri_cope', 'COPE La Rioja', 'RI', 'es', ['https://www.cope.es/api/es/emisoras/la-rioja/news/rss.xml'], 7),

  // ---- Aragon ----
  src('es_ar_heraldo', 'Heraldo de Aragón', 'AR', 'es', ['https://www.heraldo.es/rss/aragon/'], 9),
  src('es_ar_diarioaltoaragon', 'Diario del AltoAragón', 'AR', 'es', ['https://www.diariodelaltoaragon.es/rss/'], 8),
  src('es_ar_aragondigital', 'Aragón Digital', 'AR', 'es', ['https://www.aragondigital.es/rss/'], 7),
  src('es_ar_elespanol', 'El Español Aragón', 'AR', 'es', ['https://www.elespanol.com/rss/aragon/'], 7),
  src('es_ar_cope', 'COPE Aragón', 'AR', 'es', ['https://www.cope.es/api/es/emisoras/aragon/news/rss.xml'], 7),
  src('es_ar_eldiario', 'elDiario.es Aragón', 'AR', 'es', ['https://www.eldiario.es/rss/aragon/'], 7),

  // ---- Catalonia ----
  // 3Cat's Catalunya collection (society, local and weather news from around the country).
  src(
    'es_ct_3cat',
    '3Cat',
    'CT',
    'ca',
    ['https://api.3cat.cat/noticies?_format=rss&id=22453&origen=colleccio&items_pagina=31&version=2.0'],
    8,
  ),
  src('es_ct_lavanguardia', 'La Vanguardia', 'CT', 'es', ['https://www.lavanguardia.com/rss/local/catalunya.xml'], 9),
  src('es_ct_elpuntavui', 'El Punt Avui', 'CT', 'ca', ['https://www.elpuntavui.cat/barcelona.feed?type=rss'], 9),
  src('es_ct_segre', 'Segre', 'CT', 'ca', ['https://www.segre.com/ca/rss/home.xml'], 8),
  src('es_ct_beteve', 'betevé', 'CT', 'ca', ['https://beteve.cat/feed/'], 8),
  src('es_ct_naciodigital', 'Nació Digital', 'CT', 'ca', ['https://www.naciodigital.cat/rss/'], 7),
  src('es_ct_eldiario', 'elDiario.es Catalunya', 'CT', 'es', ['https://www.eldiario.es/rss/catalunya/'], 7),

  // ---- Castile and León ----
  src('es_cl_nortedecastilla', 'El Norte de Castilla', 'CL', 'es', ['https://www.elnortedecastilla.es/rss/2.0/?section=/castillayleon'], 9),
  src(
    'es_cl_diariodeleon',
    'Diario de León',
    'CL',
    'es',
    ['https://www.diariodeleon.es/rss/leon.xml', 'https://www.diariodeleon.es/rss/castilla-y-leon.xml'],
    8,
  ),
  src('es_cl_diariodeburgos', 'Diario de Burgos', 'CL', 'es', ['https://www.diariodeburgos.es/RSS/DBlocal.xml'], 8),
  src('es_cl_gacetasalamanca', 'La Gaceta de Salamanca', 'CL', 'es', ['https://www.lagacetadesalamanca.es/rss/2.0/?section=/salamanca'], 8),
  src('es_cl_heraldodiariodesoria', 'Heraldo-Diario de Soria', 'CL', 'es', ['https://www.heraldodiariodesoria.es/rss/home.xml'], 8),
  src('es_cl_elespanol', 'El Español Castilla y León', 'CL', 'es', ['https://www.elespanol.com/rss/castilla-y-leon/'], 7),
  src('es_cl_eldiario', 'elDiario.es Castilla y León', 'CL', 'es', ['https://www.eldiario.es/rss/castilla-y-leon/'], 7),
];
