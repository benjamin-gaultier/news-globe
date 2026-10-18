import type { SourceConfig } from '../sources.config';

type SouthState =
  | 'CMX'
  | 'MEX'
  | 'QUE'
  | 'HID'
  | 'MIC'
  | 'MOR'
  | 'PUE'
  | 'TLA'
  | 'GRO'
  | 'OAX'
  | 'VER'
  | 'TAB'
  | 'CHP'
  | 'CAM'
  | 'YUC'
  | 'ROO';

const src = (id: string, name: string, region: SouthState, feedUrls: string[], authority: number): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'MX',
  language: 'es',
  region: `MX-${region}`,
  feeds: { top: feedUrls },
  authority,
});

/** Organización Editorial Mexicana papers (El Sol de <city>, El Heraldo de <state>): one per state. */
const oem = (paper: string) => `https://oem.com.mx/${paper}/rss`;
/** El Universal's state franchises (Arc): section feeds, since the main feed carries national copy. */
const eluniversal = (host: string, ...sections: string[]) =>
  sections.length
    ? sections.map((s) => `https://www.${host}/arc/outboundfeeds/rss/category/${s}/?outputType=xml`)
    : [`https://www.${host}/arc/outboundfeeds/rss/?outputType=xml`];
/**
 * Quadratín franchises (WordPress). Their main feeds carry the network's
 * national copy and syndicated columns ("Nada Personal", "Descomplicado"),
 * so the local categories are used where the main feed mixes them in.
 */
const quadratin = (sub: string, ...categories: string[]) =>
  categories.length
    ? categories.map((c) => `https://${sub}.quadratin.com.mx/category/${c}/feed/`)
    : [`https://${sub}.quadratin.com.mx/feed/`];
/** Posta (Multimedios) state sections: Google News sitemaps. */
const posta = (section: string) => `https://www.posta.com.mx/sitemapnoticias/${section}`;

/**
 * Mexico City and Mexico's centre and south (CMX, MEX, QUE, HID, MIC, MOR,
 * PUE, TLA, GRO, OAX, VER, TAB, CHP, CAM, YUC, ROO): regional outlets, one
 * region per source. Main dailies 9 (smaller dailies 8), digital outlets 7.
 * One OEM paper and one Quadratín franchise per state. Mexico City sources are
 * city desks only (the capital's government, boroughs, transport, crime).
 *
 * Unusable here: Milenio has no section feeds (one site-wide news sitemap), nor
 * do La Jornada Maya, Por Esto (one feed for three states plus national news),
 * e-consulta, Criterio Hidalgo and Al Calor Político (no titles, or no feed);
 * XEVT and Diario Presente (Tabasco) and Cuarto Poder (Chiapas) have section
 * feeds without dates and site-wide sitemaps full of national news; Excélsior's
 * "comunidad" and state feeds are its whole site; Publimetro, XEU, Diario
 * Amanecer, Palabras Claras, Hipócrita Lector, Luces del Siglo, Turquesa News
 * and the Quadratín Chiapas and Yucatán main feeds mostly carry national news;
 * Lado B, Amapola, Istmo Press and Moreloshabla publish a few items a week;
 * Chilango is mostly listings; AD Noticias reruns Alfa Diario; Intolerancia's
 * sitemap is dated hours in the future. The Diario de Yucatán's main feed is
 * mostly national news (its Mérida section is used). These return 403: Diario Cambio, Periódico Central, Ángulo 7,
 * Puebla Online, e-veracruz, El Dictamen, Versiones, Imagen del Golfo, El Sur
 * de Acapulco, Cambio de Michoacán, La Jornada Michoacán, La Unión de Morelos,
 * El Piñero, Rumbo Nuevo, Tabasco al Día, Novedades (Sipse) and Mi Punto de
 * Vista. Feeds that don't parse: La Jornada Hidalgo, La Jornada Guerrero, La
 * Jornada Estado de México, Municipios, Zona Centro, Cuarto Poder.
 */
export const MX_STATES_SOUTH: SourceConfig[] = [
  // ---- Mexico City: the city and its boroughs, not federal politics ----
  src('mx_cmx_eluniversal', 'El Universal (Metrópoli)', 'CMX', eluniversal('eluniversal.com.mx', 'metropoli'), 9),
  src('mx_cmx_reforma', 'Reforma (Ciudad)', 'CMX', ['https://www.reforma.com/rss/ciudad.xml'], 9),
  src('mx_cmx_jornada', 'La Jornada (Capital)', 'CMX', ['https://www.jornada.com.mx/rss/capital.xml'], 9),
  src('mx_cmx_laprensa', 'La Prensa', 'CMX', [oem('la-prensa')], 8),
  src('mx_cmx_24horas', '24 Horas (CDMX)', 'CMX', ['https://www.24-horas.mx/category/cdmx/feed/'], 8),
  src('mx_cmx_posta', 'Posta (CDMX)', 'CMX', [posta('cdmx')], 7),

  // ---- State of Mexico ----
  src('mx_mex_soltoluca', 'El Sol de Toluca', 'MEX', [oem('elsoldetoluca')], 9),
  src('mx_mex_alfadiario', 'Alfa Diario', 'MEX', ['https://www.alfadiario.mx/feed/'], 7),
  src('mx_mex_asisucede', 'Así Sucede', 'MEX', ['https://www.asisucede.com.mx/feed/'], 7),
  src('mx_mex_quadratin', 'Quadratín Estado de México', 'MEX', quadratin('edomex'), 7),
  src('mx_mex_planamayor', 'Plana Mayor', 'MEX', ['https://planamayor.com.mx/feed/'], 7),

  // ---- Querétaro ----
  src('mx_que_diarioqueretaro', 'Diario de Querétaro', 'QUE', [oem('diariodequeretaro')], 9),
  src('mx_que_eluniversal', 'El Universal Querétaro', 'QUE', eluniversal('eluniversalqueretaro.mx'), 9),
  src('mx_que_quadratin', 'Quadratín Querétaro', 'QUE', quadratin('queretaro'), 7),
  src('mx_que_codice', 'Códice Informativo', 'QUE', ['https://codiceinformativo.com/feed/'], 7),
  src('mx_que_plazadearmas', 'Plaza de Armas', 'QUE', ['https://plazadearmas.com.mx/feed/'], 7),

  // ---- Hidalgo ----
  src('mx_hid_solhidalgo', 'El Sol de Hidalgo', 'HID', [oem('elsoldehidalgo')], 9),
  src(
    'mx_hid_eluniversal',
    'El Universal Hidalgo',
    'HID',
    eluniversal('eluniversalhidalgo.com.mx', 'estado', 'municipios', 'seguridad'),
    8,
  ),
  src('mx_hid_quadratin', 'Quadratín Hidalgo', 'HID', quadratin('hidalgo', 'municipios'), 7),
  // Plaza Juárez's main feed carries national sport; its general and police sections are local.
  src(
    'mx_hid_plazajuarez',
    'Plaza Juárez',
    'HID',
    ['https://plazajuarez.mx/category/general/feed/', 'https://plazajuarez.mx/category/barandilla/feed/'],
    7,
  ),

  // ---- Michoacán ----
  src('mx_mic_solmorelia', 'El Sol de Morelia', 'MIC', [oem('elsoldemorelia')], 9),
  src('mx_mic_lavoz', 'La Voz de Michoacán', 'MIC', ['https://www.lavozdemichoacan.com.mx/feed/'], 9),
  src('mx_mic_quadratin', 'Quadratín Michoacán', 'MIC', ['https://www.quadratin.com.mx/feed/'], 7),
  src('mx_mic_primeraplana', 'Primera Plana', 'MIC', ['https://primeraplana.mx/feed'], 7),
  src('mx_mic_respuesta', 'Respuesta', 'MIC', ['https://www.respuesta.com.mx/feed/'], 7),
  src('mx_mic_changoonga', 'Changoonga', 'MIC', ['https://www.changoonga.com/feed/'], 7),

  // ---- Morelos ----
  src(
    'mx_mor_diariomorelos',
    'Diario de Morelos',
    'MOR',
    ['https://www.diariodemorelos.com/uploads/feeds/feed_diario-de-morelos_es.xml'],
    9,
  ),
  src('mx_mor_solcuernavaca', 'El Sol de Cuernavaca', 'MOR', [oem('elsoldecuernavaca')], 9),
  src('mx_mor_jornada', 'La Jornada Morelos', 'MOR', ['https://www.lajornadamorelos.mx/feed/'], 8),
  src('mx_mor_quadratin', 'Quadratín Morelos', 'MOR', quadratin('morelos'), 7),

  // ---- Puebla ----
  src('mx_pue_solpuebla', 'El Sol de Puebla', 'PUE', [oem('elsoldepuebla')], 9),
  src('mx_pue_eluniversal', 'El Universal Puebla', 'PUE', eluniversal('eluniversalpuebla.com.mx', 'estado', 'ciudad'), 8),
  src('mx_pue_jornada', 'La Jornada de Oriente', 'PUE', ['https://www.lajornadadeoriente.com.mx/feed/'], 8),
  src('mx_pue_poblanerias', 'Poblanerías', 'PUE', ['https://www.poblanerias.com/feed/'], 7),
  src('mx_pue_urbano', 'Urbano Puebla', 'PUE', ['https://urbanopuebla.com.mx/feed/'], 7),
  src('mx_pue_status', 'Status Puebla', 'PUE', ['https://www.statuspuebla.com.mx/feed/'], 7),

  // ---- Tlaxcala ----
  src('mx_tla_soltlaxcala', 'El Sol de Tlaxcala', 'TLA', [oem('elsoldetlaxcala')], 9),
  src('mx_tla_quadratin', 'Quadratín Tlaxcala', 'TLA', quadratin('tlaxcala', 'municipios', 'local'), 7),
  src('mx_tla_gentetlx', 'Gente Tlx', 'TLA', ['https://gentetlx.com.mx/feed/'], 7),
  src('mx_tla_lineadecontraste', 'Línea de Contraste', 'TLA', ['https://www.lineadecontraste.com/feed/'], 7),

  // ---- Guerrero ----
  src('mx_gro_solacapulco', 'El Sol de Acapulco', 'GRO', [oem('elsoldeacapulco')], 9),
  src('mx_gro_quadratin', 'Quadratín Guerrero', 'GRO', quadratin('guerrero', 'municipios'), 7),
  src('mx_gro_enfoque', 'Enfoque Informativo', 'GRO', ['https://enfoqueinformativo.mx/feed/'], 7),

  // ---- Oaxaca ----
  src('mx_oax_imparcial', 'El Imparcial de Oaxaca', 'OAX', ['https://imparcialoaxaca.mx/feed/'], 9),
  // NVI's main feed is half national news; this is its Oaxaca section.
  src('mx_oax_nvi', 'NVI Noticias', 'OAX', ['https://www.nvinoticias.com/taxonomy/term/1/feed'], 8),
  src('mx_oax_quadratin', 'Quadratín Oaxaca', 'OAX', quadratin('oaxaca', 'ciudad', 'regiones'), 7),
  src('mx_oax_pagina3', 'Página 3', 'OAX', ['https://pagina3.mx/feed/'], 7),

  // ---- Veracruz ----
  src('mx_ver_diarioxalapa', 'Diario de Xalapa', 'VER', [oem('diariodexalapa')], 9),
  src('mx_ver_jornada', 'La Jornada Veracruz', 'VER', ['https://www.jornadaveracruz.com.mx/feed/'], 8),
  src('mx_ver_quadratin', 'Quadratín Veracruz', 'VER', quadratin('veracruz', 'estatal'), 7),
  src('mx_ver_plumaslibres', 'Plumas Libres', 'VER', ['https://plumaslibres.com.mx/feed/'], 7),
  src('mx_ver_golpepolitico', 'Golpe Político', 'VER', ['https://golpepolitico.com/feed/'], 7),
  src('mx_ver_formato7', 'Formato 7', 'VER', ['https://www.formato7.com/category/noticias-de-veracruz/feed/'], 7),

  // ---- Tabasco ----
  src('mx_tab_heraldo', 'El Heraldo de Tabasco', 'TAB', [oem('elheraldodetabasco')], 9),
  src('mx_tab_tabascohoy', 'Tabasco Hoy', 'TAB', ['https://www.tabascohoy.com/category/tabasco/feed/'], 9),
  src('mx_tab_quadratin', 'Quadratín Tabasco', 'TAB', quadratin('tabasco', 'politica'), 7),

  // ---- Chiapas ----
  src('mx_chp_heraldo', 'El Heraldo de Chiapas', 'CHP', [oem('elheraldodechiapas')], 9),
  // OEM's Tapachula paper: a different city and desk from El Heraldo (Tuxtla).
  src('mx_chp_diariodelsur', 'Diario del Sur (Tapachula)', 'CHP', ['https://www.diariodelsur.com.mx/rss'], 8),
  src('mx_chp_diariochiapas', 'Diario de Chiapas', 'CHP', ['https://www.diariodechiapas.com/feed/'], 8),
  src('mx_chp_alerta', 'Alerta Chiapas', 'CHP', ['https://www.alertachiapas.com/feed/'], 7),
  src('mx_chp_paralelo', 'Chiapas Paralelo', 'CHP', ['https://chiapasparalelo.com/feed/'], 7),

  // ---- Campeche: most of the state's papers have closed; Tribuna is all that's left with a feed ----
  src('mx_cam_tribuna', 'Tribuna Campeche', 'CAM', ['https://tribunacampeche.com/feed/'], 8),

  // ---- Yucatán ----
  // One feed only: the site answered 429 to two requests in quick succession.
  src('mx_yuc_diarioyucatan', 'Diario de Yucatán (Mérida)', 'YUC', ['https://www.yucatan.com.mx/merida/feed'], 9),
  src('mx_yuc_posta', 'Posta Yucatán', 'YUC', [posta('yucatan')], 7),
  src('mx_yuc_infolliteras', 'Infolliteras', 'YUC', ['https://www.infolliteras.com/feed/'], 7),
  src('mx_yuc_quadratin', 'Quadratín Yucatán', 'YUC', quadratin('yucatan', 'yucatan', 'merida'), 7),
  src('mx_yuc_encorto', 'Yucatán en Corto', 'YUC', ['https://www.yucatanencorto.com/noticias/feed/'], 7),

  // ---- Quintana Roo ----
  src('mx_roo_noticaribe', 'Noticaribe', 'ROO', ['https://noticaribe.com.mx/feed/'], 7),
  src('mx_roo_quadratin', 'Quadratín Quintana Roo', 'ROO', quadratin('quintanaroo', 'quintana-roo', 'cancun'), 7),
  src('mx_roo_qroohoy', 'Quintana Roo Hoy', 'ROO', ['https://quintanaroohoy.com/feed/'], 7),
  src('mx_roo_quintafuerza', 'Quinta Fuerza', 'ROO', ['https://quintafuerza.mx/feed/'], 7),
];
