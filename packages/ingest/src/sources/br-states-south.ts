import type { SourceConfig } from '../sources.config';

type SouthState = 'DF' | 'GO' | 'MT' | 'MS' | 'ES' | 'MG' | 'RJ' | 'SP' | 'PR' | 'SC' | 'RS';

const src = (id: string, name: string, region: SouthState, feedUrls: string[], authority: number): SourceConfig => ({
  id,
  name,
  type: 'rss',
  country: 'BR',
  language: 'pt',
  region: `BR-${region}`,
  feedUrls,
  authority,
});

/** Globo's g1 regional sections: the state desk, plus the interior editions of the large states. */
const g1 = (...slugs: string[]) => slugs.map((slug) => `https://g1.globo.com/rss/g1/${slug}/`);
/** Metrópoles state sections (a Brasília outlet with São Paulo and Minas desks). */
const metropoles = (section: string) => `https://www.metropoles.com/${section}/feed`;

/**
 * Brazil's Centre-West, Southeast and South (DF, GO, MT, MS, ES, MG, RJ, SP,
 * PR, SC, RS): regional outlets, one region per source. g1's state sections 8,
 * main dailies 9 (smaller dailies 8), digital outlets and local TV sites 7.
 * Every outlet here is independent of Globo except g1 itself (O Globo, Extra
 * and NSC, Globo's SC affiliate, are left out).
 *
 * Unusable here: Correio Braziliense (its only feed stopped in 2023), Estado de
 * Minas (main feed only, mostly national and celebrity news), O Tempo,
 * Itatiaia, Hoje em Dia, Gazeta Digital and Correio do Estado publish no feed
 * we could find; GZH's feed is malformed XML; Correio do Povo's feeds are a
 * day stale. These return 403 to our User-Agent: Agência Brasília, O Popular,
 * Mais Goiás, Jornal Opção, Diário de Goiás, MidiaNews, RD News, Repórter MT,
 * VG Notícias, Midiamax, Diário do Rio, Jornal do Brasil, Plural, RIC, SCC10,
 * Matinal and Jornal Cruzeiro do Sul. Main feeds that mix in too much national
 * news: NSC Total, ND+, O Fluminense, Diário do Grande ABC, O Hoje, Brasil de
 * Fato's state editions, Diário do Litoral. Primeira Página covers both MT and
 * MS; Diário do Estado (GO) aggregates the whole country. Gazeta do Povo's
 * Curitiba feed is only obituary lists.
 */
export const BR_STATES_SOUTH: SourceConfig[] = [
  // ---- Distrito Federal: Brasília and the DF, not federal politics ----
  src('br_df_g1', 'g1 Distrito Federal', 'DF', g1('df/distrito-federal'), 8),
  src('br_df_metropoles', 'Metrópoles (Distrito Federal)', 'DF', [metropoles('distrito-federal')], 8),
  src('br_df_jbr', 'Jornal de Brasília', 'DF', ['https://jornaldebrasilia.com.br/brasilia/feed/'], 8),

  // ---- Goiás ----
  src('br_go_g1', 'g1 Goiás', 'GO', g1('go/goias'), 8),
  src('br_go_aredacao', 'A Redação', 'GO', ['https://www.aredacao.com.br/feed'], 7),
  src('br_go_goias24h', 'Goiás 24 Horas', 'GO', ['https://www.goias24horas.com.br/feed/'], 7),
  src('br_go_contexto', 'Portal Contexto (Anápolis)', 'GO', ['https://www.portalcontexto.com/feed/'], 7),
  src('br_go_folhaz', 'Folha Z', 'GO', ['https://www.folhaz.com.br/feed'], 7),

  // ---- Mato Grosso ----
  src('br_mt_g1', 'g1 Mato Grosso', 'MT', g1('mt/mato-grosso'), 8),
  src('br_mt_sonoticias', 'Só Notícias', 'MT', ['https://www.sonoticias.com.br/feed/'], 7),
  src('br_mt_hnt', 'HiperNotícias', 'MT', ['https://www.hnt.com.br/feed'], 7),
  src('br_mt_leiagora', 'Leia Agora', 'MT', ['https://www.leiagora.com.br/feed'], 7),

  // ---- Mato Grosso do Sul ----
  src('br_ms_g1', 'g1 Mato Grosso do Sul', 'MS', g1('ms/mato-grosso-do-sul'), 8),
  src('br_ms_cgnews', 'Campo Grande News', 'MS', ['https://www.campograndenews.com.br/rss'], 7),
  src('br_ms_jd1', 'JD1 Notícias', 'MS', ['https://www.jd1noticias.com/feed'], 7),
  src('br_ms_investiga', 'Investiga MS', 'MS', ['https://www.investigams.com.br/feed/'], 7),

  // ---- Espírito Santo ----
  src('br_es_g1', 'g1 Espírito Santo', 'ES', g1('es/espirito-santo'), 8),
  src('br_es_agazeta', 'A Gazeta', 'ES', ['https://www.agazeta.com.br/rss'], 9),
  src('br_es_tribuna', 'A Tribuna (Tribuna Online)', 'ES', ['https://tribunaonline.com.br/feed/'], 8),
  src('br_es_folhavitoria', 'Folha Vitória (TV Vitória)', 'ES', ['https://www.folhavitoria.com.br/feed/'], 7),
  src('br_es_eshoje', 'ES Hoje', 'ES', ['https://eshoje.com.br/feed/'], 7),

  // ---- Minas Gerais ----
  src('br_mg_g1', 'g1 Minas Gerais', 'MG', g1('mg/minas-gerais', 'mg/sul-de-minas', 'mg/triangulo-mineiro', 'mg/zona-da-mata'), 8),
  src('br_mg_tribuna', 'Tribuna de Minas (Juiz de Fora)', 'MG', ['https://www.tribunademinas.com.br/feed/'], 8),
  src('br_mg_diariodocomercio', 'Diário do Comércio', 'MG', ['https://diariodocomercio.com.br/feed/'], 8),
  src('br_mg_metropoles', 'Metrópoles (Minas Gerais)', 'MG', [metropoles('minas-gerais')], 7),
  src('br_mg_bhaz', 'BHAZ', 'MG', ['https://bhaz.com.br/feed/'], 7),

  // ---- Rio de Janeiro ----
  src(
    'br_rj_g1',
    'g1 Rio de Janeiro',
    'RJ',
    g1('rj/rio-de-janeiro', 'rj/regiao-serrana', 'rj/norte-fluminense', 'rj/sul-do-rio-costa-verde'),
    8,
  ),
  src('br_rj_odia', 'O Dia', 'RJ', ['https://odia.ig.com.br/_conteudo/rio-de-janeiro/rss.xml'], 9),
  src('br_rj_osaogoncalo', 'O São Gonçalo', 'RJ', ['https://www.osaogoncalo.com.br/feed'], 8),
  src('br_rj_agendadopoder', 'Agenda do Poder', 'RJ', ['https://www.agendadopoder.com.br/feed/'], 7),
  src('br_rj_enfoco', 'Enfoco (Niterói)', 'RJ', ['https://enfoco.com.br/feed'], 7),

  // ---- São Paulo ----
  src(
    'br_sp_g1',
    'g1 São Paulo',
    'SP',
    g1(
      'sp/sao-paulo',
      'sp/campinas-regiao',
      'sp/ribeirao-preto-franca',
      'sp/vale-do-paraiba-regiao',
      'sp/santos-regiao',
      'sp/sorocaba-jundiai',
    ),
    8,
  ),
  src(
    'br_sp_estadao',
    'Estadão (São Paulo)',
    'SP',
    ['https://www.estadao.com.br/arc/outboundfeeds/feeds/rss/sections/sao-paulo/?body=%7B%22layout%22:%22google-news%22%7D'],
    9,
  ),
  src('br_sp_folha', 'Folha de S.Paulo (Cotidiano)', 'SP', ['https://feeds.folha.uol.com.br/cotidiano/rss091.xml'], 9),
  src('br_sp_metropoles', 'Metrópoles (São Paulo)', 'SP', [metropoles('sao-paulo')], 7),
  src('br_sp_mural', 'Agência Mural', 'SP', ['https://agenciamural.org.br/feed/'], 7),
  src('br_sp_guarulhoshoje', 'Guarulhos Hoje', 'SP', ['https://www.guarulhoshoje.com.br/feed/'], 7),

  // ---- Paraná ----
  src('br_pr_g1', 'g1 Paraná', 'PR', g1('pr/parana', 'pr/campos-gerais-sul', 'pr/norte-noroeste', 'pr/oeste-sudoeste'), 8),
  src('br_pr_gazetadopovo', 'Gazeta do Povo (Paraná)', 'PR', ['https://www.gazetadopovo.com.br/feed/rss/parana.xml'], 9),
  src('br_pr_bemparana', 'Bem Paraná', 'PR', ['https://www.bemparana.com.br/feed/'], 8),
  src('br_pr_folhadelondrina', 'Folha de Londrina', 'PR', ['https://www.folhadelondrina.com.br/feed'], 8),
  src('br_pr_bandab', 'Banda B', 'PR', ['https://www.bandab.com.br/feed/'], 7),
  src('br_pr_massa', 'Massa News', 'PR', ['https://massanews.com/feed/'], 7),

  // ---- Santa Catarina ----
  src('br_sc_g1', 'g1 Santa Catarina', 'SC', g1('sc/santa-catarina'), 8),
  src('br_sc_ocp', 'OCP News (Jaraguá do Sul)', 'SC', ['https://ocp.news/feed'], 7),
  src('br_sc_omunicipio', 'O Município (Brusque)', 'SC', ['https://omunicipio.com.br/feed/'], 7),
  src('br_sc_blumenauense', 'O Blumenauense', 'SC', ['https://oblumenauense.com.br/feed/'], 7),
  src('br_sc_clicrdc', 'ClicRDC (Chapecó)', 'SC', ['https://www.clicrdc.com.br/feed'], 7),

  // ---- Rio Grande do Sul ----
  src('br_rs_g1', 'g1 Rio Grande do Sul', 'RS', g1('rs/rio-grande-do-sul'), 8),
  src('br_rs_osul', 'O Sul', 'RS', ['https://www.osul.com.br/feed/'], 8),
  src('br_rs_sul21', 'Sul21', 'RS', ['https://www.sul21.com.br/feed/'], 7),
  // The main Guaíba feed mixes in national and world wire copy; its state and police sections don't.
  src(
    'br_rs_guaiba',
    'Rádio Guaíba',
    'RS',
    ['https://www.guaiba.com.br/category/geral/feed/', 'https://www.guaiba.com.br/category/policia/feed/'],
    7,
  ),
  src('br_rs_abcmais', 'ABC+ (Vale do Sinos)', 'RS', ['https://www.abcmais.com/feed/'], 7),
];
