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

// Format markers that say nothing about the story ("EN DIRECT", "LIVE UPDATES", "VIDEO").
const BOILERPLATE = `direct live video videos photo photos watch updates update podcast replay`;

const STOPWORDS = new Set([STOPWORDS_FR, STOPWORDS_EN, BOILERPLATE].flatMap((list) => list.split(/\s+/)).filter(Boolean));

/**
 * Crude suffix folding, not real stemming: drops a plural s/x, then a final
 * e, so "inscrites"/"inscrits", "lycees"/"lycee" and "charges"/"charge" match.
 * Short tokens are left alone to avoid collisions.
 */
export function stem(token: string): string {
  let t = token;
  if (t.length > 4 && /[^s][sx]$/.test(t)) t = t.slice(0, -1);
  if (t.length > 4 && t.endsWith('e')) t = t.slice(0, -1);
  return t;
}

/** Normalized token set for title similarity. */
export function titleTokens(title: string): Set<string> {
  const tokens = new Set<string>();
  for (const raw of foldText(title).split(' ')) {
    if (!raw || STOPWORDS.has(raw)) continue;
    if (raw.length < 2 && !/\d/.test(raw)) continue;
    tokens.add(stem(raw));
  }
  return tokens;
}
