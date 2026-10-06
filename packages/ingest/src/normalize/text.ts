const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  hellip: '…',
  laquo: '«',
  raquo: '»',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  eacute: 'é',
  egrave: 'è',
  ecirc: 'ê',
  agrave: 'à',
  acirc: 'â',
  ccedil: 'ç',
  ocirc: 'ô',
  icirc: 'î',
  ucirc: 'û',
  ugrave: 'ù',
  euro: '€',
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Strip tags, decode entities, collapse whitespace. */
export function stripHtml(input: string): string {
  return decodeEntities(
    input
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>|<\/p>/gi, ' ')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Truncate at a word boundary, appending an ellipsis if anything was cut. */
export function truncate(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  const cut = input.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const base = lastSpace > maxChars * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[\s.,;:!?–—-]+$/, '')}…`;
}

/** Clean a feed-provided snippet: plain text, ~maxChars, null if empty. */
export function cleanDescription(raw: string | undefined | null, maxChars: number): string | null {
  if (!raw) return null;
  const text = stripHtml(raw);
  return text ? truncate(text, maxChars) : null;
}

export function cleanTitle(raw: string): string {
  return stripHtml(raw);
}

/** Lower-case, strip accents (NFD + drop combining marks), turn punctuation into spaces. */
export function foldText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    // Turkish dotless ı has no decomposition; fold it so "IĞDIR" and "Iğdır" match.
    .replace(/ı/g, 'i')
    .replace(/[’'`]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Accent-folded, so they match folded tokens.
const STOPWORDS_FR = `
a au aux avec ce ces cet cette dans de des du elle elles en et eux il ils je la le les leur leurs lui
ma mais me meme mes moi mon ne nos notre nous on ou par pas pour qu que qui sa se ses son sont sur ta
te tes toi ton tu un une vos votre vous c d j l m n s t y ete etre est sont fait faire plus moins
apres avant selon sans sous chez entre contre comme tout tous toute toutes tres aussi encore deja
quand ont avait sera seront peut doit va vont ca cela ceci celui celle dont alors donc car si non oui
voici voila depuis pendant lors vers fois rien`;

const STOPWORDS_EN = `
a an the and or but if of at by for with about against between into through during before after
above below to from up down in out on off over under again further then once here there when where
why how all any both each few more most other some such no nor not only own same so than too very
can will just should now is are was were be been being have has had having do does did doing
i me my we our you your he him his she her it its they them their what which who whom this that
these those am would could says said say new amid vs`;

// Umlauts fold to the bare vowel (für → fur). Kept out of the FR/EN set on
// purpose: "die", "war", "man", "dies" and "hat" are real English words.
const STOPWORDS_DE = `
der die das den dem des ein eine einer einem einen eines und oder aber doch sondern als wie wenn weil
dass ob zu zum zur im in ins am an auf aus bei mit nach von vor uber unter um durch fur gegen ohne
bis seit wahrend ab ich du er sie es wir ihr ihm ihn ihnen sich sein seine ihre ihren ihrem unser
nicht kein keine keinen auch noch schon nur sehr mehr so da dann hier dort jetzt nun wieder immer
ist sind war waren wird werden wurde wurden worden hat haben hatte hatten sei kann konnen soll sollen
muss mussen will wollen darf alle alles viel viele dieser diese dieses diesem diesen jeder jede was wer
wo warum wieso man neue neuer neuen neues erst ersten gibt geht laut heute mal`;

const STOPWORDS_ES = `
el la los las lo un una unos unas y o u e ni pero sino que de del al a en con por para sin sobre
entre hasta desde hacia contra segun tras ante bajo como cuando donde quien quienes cual cuales
se su sus le les me te nos os mi mis tu tus yo el ella ellos ellas usted ustedes este esta estos
estas ese esa esos esas aquel aquella esto eso es son fue fueron ser sera seran ha han hay habia
haber estar esta estan era eran muy mas menos ya no si tambien todo toda todos todas otro otra
otros otras mismo misma tras durante cada asi aun nuevo nueva nuevos nuevas ultima hora directo
dice dicen`;

const STOPWORDS_IT = `
il lo la i gli le un uno una di a da in con su per tra fra del dello della dei degli delle al allo
alla ai agli alle dal dallo dalla dai dagli dalle nel nello nella nei negli nelle sul sullo sulla
sui sugli sulle e ed o ma anche se che chi cui non piu meno come dove quando perche quale quali
questo questa questi queste quello quella quelli quelle suo sua suoi sue loro mi ti ci vi si ne
lui lei noi voi essi e sono era erano stato stata stati essere ha hanno aveva avere fa fare dopo
prima ancora gia solo tutto tutti tutta tutte molto poi cosa ecco oggi nuovo nuova ora diretta`;

const STOPWORDS_PT = `
o a os as um uma uns umas e ou mas que de do da dos das em no na nos nas ao aos a as pelo pela pelos
pelas por para com sem sobre entre ate apos contra desde se seu sua seus suas ele ela eles elas
lhe isso isto esse essa este esta esses essas aquele aquela nao sim mais menos muito ja ainda
tambem como quando onde quem qual quais e sao foi foram ser sera ter tem tinha ha diz dizem
apos novo nova novos novas ao vivo agora hoje veja saiba leia confira entenda`;

// Turkish suffixes split off by an apostrophe ("Erdoğan'ın" → erdogan + in) are listed too,
// as are light verbs (etti, yaptı) and police-blotter formula words ("operasyon: 26
// gözaltı"), which otherwise merged unrelated raids and visits on 2026-10-06.
const STOPWORDS_TR = `
ve ile bir bu su o da de ki mi mu icin gibi ama ancak fakat veya ya ne daha cok en cok olan olarak
oldu olacak olan olur sonra once kadar uzere her hem ise diye dedi soyledi yeni son dakika canli
in un nin nun ya ye ta te dan den tan ten yi yu la le na ne nda nde ndan nden yla yle
etti edildi eden etmek yapti yapildi yapilan aldi alindi verdi kimdir nedir
operasyon operasyonu gozalti gozaltina gozaltinda tutuklandi tutuklama supheli`;

// Format markers that say nothing about the story ("EN DIRECT", "LIVE UPDATES", "VIDEO", "LIVE-TICKER").
// Japanese is matched on kanji bigrams and katakana words (see japaneseTokens), so
// its stopwords are those units: news-site labels and the most generic bigrams.
const STOPWORDS_JA = `
速報 動画 写真 独自 中継 詳報 更新 解説 一覧 発表 記者 会見 午前 午後 今日 明日 昨日 去年 今年 来年
ニュース ライブ まとめ
`;

// Calendar words in service headlines ("¿A qué hora juega…? hoy martes 6 de octubre",
// "dólar blue hoy") merged unrelated Argentine stories on 2026-10-06.
const CALENDAR_ES = `
hoy ayer manana lunes martes miercoles jueves viernes sabado domingo enero febrero marzo abril
mayo junio julio agosto septiembre setiembre octubre noviembre diciembre hora horas cuanto
`;
const CALENDAR_PT = `
hoje ontem amanha segunda terca quarta quinta sexta sabado domingo feira janeiro fevereiro marco
abril maio junho julho agosto setembro outubro novembro dezembro
`;

const BOILERPLATE = `direct live video videos photo photos watch updates update podcast replay liveblog ticker newsblog`;

const wordSet = (...lists: string[]) => new Set(lists.flatMap((list) => list.split(/\s+/)).filter(Boolean));

/**
 * Stopwords per feed language. English is included everywhere: wire-style
 * English words turn up in every country's titles ("live", "update").
 */
const STOPWORDS_FR_EN = wordSet(STOPWORDS_FR, STOPWORDS_EN, BOILERPLATE);
const STOPWORDS_BY_LANGUAGE: Record<string, Set<string>> = {
  fr: STOPWORDS_FR_EN,
  en: STOPWORDS_FR_EN,
  de: wordSet(STOPWORDS_DE, STOPWORDS_EN, BOILERPLATE),
  es: wordSet(STOPWORDS_ES, CALENDAR_ES, STOPWORDS_EN, BOILERPLATE),
  it: wordSet(STOPWORDS_IT, STOPWORDS_EN, BOILERPLATE),
  pt: wordSet(STOPWORDS_PT, CALENDAR_PT, STOPWORDS_EN, BOILERPLATE),
  tr: wordSet(STOPWORDS_TR, STOPWORDS_EN, BOILERPLATE),
  ja: wordSet(STOPWORDS_JA, STOPWORDS_EN, BOILERPLATE),
};

const HAN = /\p{Script=Han}/u;
const KANA_OR_HAN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;

/**
 * Japanese has no spaces between words, so a title is cut into script runs:
 * kanji runs become overlapping bigrams (石破首相 → 石破, 破首, 首相), katakana
 * runs stay whole (loanwords and foreign names), hiragana runs (particles,
 * verb endings) are dropped, and Latin/digit runs are kept as words. Dakuten
 * are kept (NFKC, not foldText's NFD + mark stripping), so バス ≠ パス.
 */
function japaneseTokens(title: string): string[] {
  const text = title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  const out: string[] = [];
  const runs = /\p{Script=Han}+|[\p{Script=Katakana}ー]+|\p{Script=Hiragana}+|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/gu;
  for (const [run] of text.matchAll(runs)) {
    if (HAN.test(run)) {
      for (let i = 0; i + 1 < run.length; i++) out.push(run.slice(i, i + 2));
    } else if (/^[\p{Script=Katakana}ー]+$/u.test(run)) {
      if (run.length >= 2) out.push(run);
    } else if (!KANA_OR_HAN.test(run)) {
      out.push(...foldText(run).split(' '));
    }
  }
  return out;
}

/**
 * Crude suffix folding, not real stemming: drops a plural s/x, then a final
 * e, so "inscrites"/"inscrits", "lycees"/"lycee" and "charges"/"charge" match.
 * Short tokens are left alone to avoid collisions.
 */
export function stem(token: string, language?: string): string {
  let t = token;
  // German plurals and inflections: Grünen/Grüne, Parteien/Partei, Wahlen/Wahl.
  if (language === 'de' && t.length > 5 && t.endsWith('en')) t = t.slice(0, -2);
  if (t.length > 4 && /[^s][sx]$/.test(t)) t = t.slice(0, -1);
  if (t.length > 4 && t.endsWith('e')) t = t.slice(0, -1);
  return t;
}

/** Normalized token set for title similarity. `language` picks the stopword list (default: French + English). */
export function titleTokens(title: string, language?: string): Set<string> {
  const stopwords = (language && STOPWORDS_BY_LANGUAGE[language]) || STOPWORDS_FR_EN;
  const tokens = new Set<string>();
  const words = language === 'ja' ? japaneseTokens(title) : foldText(title).split(' ');
  for (const raw of words) {
    if (!raw || stopwords.has(raw)) continue;
    if (raw.length < 2 && !/\d/.test(raw)) continue;
    tokens.add(stem(raw, language));
  }
  return tokens;
}
