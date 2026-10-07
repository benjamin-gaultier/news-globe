import type { SourceConfig } from '../sources.config';

type NorthState =
  | 'AC' | 'AM' | 'AP' | 'PA' | 'RO' | 'RR' | 'TO'
  | 'MA' | 'PI' | 'CE' | 'RN' | 'PB' | 'PE' | 'AL' | 'SE' | 'BA';

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
  country: 'BR',
  language: 'pt',
  region: `BR-${region}`,
  feedUrls,
  authority,
});

/** Globo's g1 state section (and its regional editions, e.g. g1 Caruaru). */
const g1 = (path: string) => `https://g1.globo.com/rss/g1/${path}/`;
/** O Povo (Fortaleza) news sections. */
const opovo = (section: string) => `https://www.opovo.com.br/noticias/${section}/rss.xml`;

/**
 * Brazil's North and Northeast (Acre, Amazonas, Amapá, Pará, Rondônia,
 * Roraima, Tocantins, Maranhão, Piauí, Ceará, Rio Grande do Norte, Paraíba,
 * Pernambuco, Alagoas, Sergipe, Bahia): regional outlets, one region per
 * source. g1 8, main dailies 9 (smaller dailies 8), state news portals,
 * local TV sites and regional blogs 7.
 *
 * Left out on purpose: Globo affiliates' own sites (Gazetaweb in Alagoas,
 * Jornal da Paraíba, iBahia, Imirante in Maranhão), which share copy with g1;
 * Amazônia Real and Marco Zero (a few stories a week); Diário do Nordeste and
 * O Liberal (their feeds are stale or mostly entertainment); Portal do Holanda,
 * A Gazeta do Amapá, Ceará Agora, Metro1, News Rondônia and Blog do Magno
 * (mostly national news); GP1 and Conexão Tocantins (no item dates);
 * Rondônia ao Vivo (bogus item dates); O Impacto (all-caps headlines mixed
 * with environmental licence notices).
 * Blocked to our User-Agent (403): D24AM, Amazonas Atual, Revista Cenarium,
 * Roraima em Tempo, Tudo Rondônia, Rondônia Dinâmica, Jornal do Tocantins,
 * Surgiu, Cleber Toledo, 180graus, Oito Meia, Diario de Pernambuco, LeiaJá,
 * Jornal da Cidade (SE), BNews, O Progresso, Opinião CE, GCMais.
 * No feed found: A Crítica, Meio Norte, Folha de Pernambuco, Correio (BA),
 * T1 Notícias, AF Notícias.
 */
export const BR_STATES_NORTH: SourceConfig[] = [
  // ---- Acre ----
  src('br_ac_g1', 'g1 Acre', 'AC', [g1('ac/acre')], 8),
  src('br_ac_gazeta', 'A Gazeta do Acre', 'AC', ['https://agazetadoacre.com/feed/'], 8),
  src('br_ac_ac24horas', 'ac24horas', 'AC', ['https://ac24horas.com/feed/'], 7),
  // ContilNet's main feed mixes national celebrity and sports news; its police desk is all Acre.
  src('br_ac_contilnet', 'ContilNet (Polícia)', 'AC', ['https://contilnetnoticias.com.br/policia/feed/'], 7),
  src('br_ac_altoacre', 'O Alto Acre', 'AC', ['https://www.oaltoacre.com/feed/'], 7),

  // ---- Amazonas ----
  src('br_am_g1', 'g1 Amazonas', 'AM', [g1('am/amazonas')], 8),
  src('br_am_emtempo', 'Em Tempo', 'AM', ['https://emtempo.com.br/feed/'], 8),
  src('br_am_amazonas1', 'Amazonas1', 'AM', ['https://amazonas1.com.br/feed/'], 7),
  src('br_am_manausalerta', 'Manaus Alerta', 'AM', ['https://www.manausalerta.com.br/feed/'], 7),

  // ---- Amapá ----
  src('br_ap_g1', 'g1 Amapá', 'AP', [g1('ap/amapa')], 8),
  src('br_ap_diario', 'Diário do Amapá', 'AP', ['https://www.diariodoamapa.com.br/feed/'], 8),
  src('br_ap_selesnafes', 'Portal SelesNafes', 'AP', ['https://selesnafes.com/feed/'], 7),

  // ---- Pará ----
  src('br_pa_g1', 'g1 Pará', 'PA', [g1('pa/para'), g1('pa/santarem-regiao')], 8),
  src('br_pa_dol', 'Diário do Pará (DOL)', 'PA', ['https://dol.com.br/rss'], 9),
  src('br_pa_carajas', 'Correio de Carajás', 'PA', ['https://www.correiodecarajas.com.br/feed/'], 8),
  src('br_pa_verofato', 'Ver-o-Fato', 'PA', ['https://ver-o-fato.com.br/feed/'], 7),

  // ---- Rondônia ----
  src('br_ro_g1', 'g1 Rondônia', 'RO', [g1('ro/rondonia')], 8),
  src('br_ro_rondoniagora', 'Rondoniagora', 'RO', ['https://www.rondoniagora.com/rss'], 7),
  src('br_ro_extra', 'Extra de Rondônia', 'RO', ['https://www.extraderondonia.com.br/feed/'], 7),
  src('br_ro_expressao', 'Expressão Rondônia', 'RO', ['https://www.expressaorondonia.com.br/feed/'], 7),

  // ---- Roraima ----
  src('br_rr_g1', 'g1 Roraima', 'RR', [g1('rr/roraima')], 8),
  src('br_rr_folhabv', 'Folha de Boa Vista', 'RR', ['https://folhabv.com.br/rss'], 9),
  src('br_rr_roraima1', 'Roraima 1', 'RR', ['https://roraima1.com.br/feed/'], 7),
  src('br_rr_emfoco', 'Roraima em Foco', 'RR', ['https://roraimaemfoco.com/feed/'], 7),

  // ---- Tocantins ----
  src('br_to_g1', 'g1 Tocantins', 'TO', [g1('to/tocantins')], 8),
  src('br_to_gazetacerrado', 'Gazeta do Cerrado', 'TO', ['https://gazetadocerrado.com.br/feed/'], 7),
  src('br_to_atitude', 'Atitude Tocantins', 'TO', ['https://atitudeto.com.br/feed/'], 7),

  // ---- Maranhão ----
  src('br_ma_g1', 'g1 Maranhão', 'MA', [g1('ma/maranhao')], 8),
  src('br_ma_imparcial', 'O Imparcial', 'MA', ['https://oimparcial.com.br/feed/'], 9),
  src('br_ma_jornalpequeno', 'Jornal Pequeno', 'MA', ['https://jornalpequeno.com.br/feed/'], 8),
  src('br_ma_gilbertoleda', 'Blog do Gilberto Léda', 'MA', ['https://gilbertoleda.com.br/feed/'], 7),

  // ---- Piauí ----
  src('br_pi_g1', 'g1 Piauí', 'PI', [g1('pi/piaui')], 8),
  src('br_pi_odia', 'O Dia (Piauí)', 'PI', ['https://www.portalodia.com/rss'], 8),
  src('br_pi_cidadeverde', 'Cidadeverde.com', 'PI', ['https://cidadeverde.com/rss'], 7),

  // ---- Ceará ----
  src('br_ce_g1', 'g1 Ceará', 'CE', [g1('ce/ceara')], 8),
  src('br_ce_opovo', 'O Povo', 'CE', [opovo('fortaleza'), opovo('ceara'), opovo('seguranca-publica')], 9),
  src('br_ce_cn7', 'CN7', 'CE', ['https://cn7.com.br/feed/'], 7),
  src('br_ce_miseria', 'Site Miséria (Cariri)', 'CE', ['https://www.miseria.com.br/feed/'], 7),

  // ---- Rio Grande do Norte ----
  src('br_rn_g1', 'g1 Rio Grande do Norte', 'RN', [g1('rn/rio-grande-do-norte')], 8),
  src(
    'br_rn_tribuna',
    'Tribuna do Norte',
    'RN',
    ['https://tribunadonorte.com.br/categoria/natal/feed/', 'https://tribunadonorte.com.br/categoria/rio-grande-do-norte/feed/'],
    9,
  ),
  src('br_rn_agora', 'Agora RN', 'RN', ['https://agorarn.com.br/feed/'], 8),
  src('br_rn_saibamais', 'Saiba Mais', 'RN', ['https://saibamais.jor.br/feed/'], 7),

  // ---- Paraíba ----
  src('br_pb_g1', 'g1 Paraíba', 'PB', [g1('pb/paraiba')], 8),
  src('br_pb_portalcorreio', 'Portal Correio', 'PB', ['https://portalcorreio.com.br/feed/'], 7),
  src('br_pb_clickpb', 'ClickPB', 'PB', ['https://www.clickpb.com.br/feed/'], 7),
  src('br_pb_wscom', 'WSCOM', 'PB', ['https://wscom.com.br/feed/'], 7),
  src('br_pb_maispb', 'MaisPB', 'PB', ['https://www.maispb.com.br/feed'], 7),

  // ---- Pernambuco ----
  src('br_pe_g1', 'g1 Pernambuco', 'PE', [g1('pe/pernambuco'), g1('pe/caruaru-regiao'), g1('pe/petrolina-regiao')], 8),
  src(
    'br_pe_jc',
    'Jornal do Commercio',
    'PE',
    ['https://jc.uol.com.br/pernambuco/rss.xml', 'https://jc.uol.com.br/politica/rss.xml'],
    9,
  ),
  src('br_pe_carlosbritto', 'Blog do Carlos Britto (Petrolina)', 'PE', ['https://www.carlosbritto.com/feed/'], 7),
  src('br_pe_nilljunior', 'Blog do Nill Júnior (Pajeú)', 'PE', ['https://www.nilljunior.com.br/feed/'], 7),

  // ---- Alagoas ----
  src('br_al_g1', 'g1 Alagoas', 'AL', [g1('al/alagoas')], 8),
  src('br_al_tnh1', 'TNH1', 'AL', ['https://www.tnh1.com.br/rss/'], 7),
  src('br_al_cadaminuto', 'Cada Minuto', 'AL', ['https://www.cadaminuto.com.br/feed.xml'], 7),
  src('br_al_alagoas24horas', 'Alagoas 24 Horas', 'AL', ['https://www.alagoas24horas.com.br/feed/'], 7),
  src('br_al_7segundos', '7Segundos', 'AL', ['https://www.7segundos.com.br/rss'], 7),

  // ---- Sergipe ----
  src('br_se_g1', 'g1 Sergipe', 'SE', [g1('se/sergipe')], 8),
  src('br_se_infonet', 'Infonet', 'SE', ['https://infonet.com.br/feed/'], 7),
  src('br_se_a8', 'Portal A8 (TV Atalaia)', 'SE', ['https://a8se.com/rss.xml'], 7),
  src('br_se_fanf1', 'Fan F1', 'SE', ['https://www.fanf1.com.br/feed/'], 7),
  src('br_se_nenoticias', 'NE Notícias', 'SE', ['https://www.nenoticias.com.br/feed/'], 7),

  // ---- Bahia ----
  src('br_ba_g1', 'g1 Bahia', 'BA', [g1('ba/bahia')], 8),
  src('br_ba_atarde', 'A Tarde', 'BA', ['https://atarde.com.br/rss'], 9),
  src('br_ba_bahianoticias', 'Bahia Notícias (Municípios)', 'BA', ['https://www.bahianoticias.com.br/municipios/rss.xml'], 7),
  src('br_ba_acordacidade', 'Acorda Cidade (Feira de Santana)', 'BA', ['https://www.acordacidade.com.br/feed/'], 7),
  src('br_ba_grandebahia', 'Jornal Grande Bahia', 'BA', ['https://jornalgrandebahia.com.br/feed/'], 7),
];
