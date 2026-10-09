import type { CountryCode, StoryCluster, WorldStory } from '@news-globe/shared';
import { UnionFind } from './cluster';
import { foldText } from './normalize/text';

/**
 * Cross-border stories: the same story in several countries' top lists,
 * found without translation. Headlines in different languages still share
 * names: people, places, organisations ("Francis Halzen", "Kidal", "Warner
 * Bros"). So:
 *
 *  1. Names are runs of capitalised words, joined across particles like "du"
 *     (Corée du Sud) but never across punctuation. A title's first word, and
 *     every word of a title-case headline ("Interior Ministry Says…"), is
 *     capitalised anyway: there only words also seen capitalised mid-sentence
 *     elsewhere in the run count.
 *  2. Two clusters from different countries are linked when they share two
 *     separate names, one of them rare (in at most RARE clusters of the run).
 *     Words of one name count once, so "Saudi Arabia" alone is not enough.
 *  3. Links are applied strongest first; two groups merge only if their
 *     average pairwise weight stays high, so one loose link can't chain two
 *     stories together (as in clustering, see cluster.ts).
 *
 * Scripts without letter case (Chinese, Japanese, Arabic…) yield no names and
 * are never linked; Cyrillic and Greek names link among themselves.
 */

/** A name word in at most this many clusters of the run is rare. */
const RARE = 6;
/** Minimum summed weight (Σ log(N/df) over shared names) for a link. */
const MIN_LINK_WEIGHT = 9;
/** Minimum average pairwise weight between two groups for them to merge. */
const MIN_AVERAGE_LINK = 4.5;
/** Cross-border stories listed in index.json. */
export const MAX_WORLD_STORIES = 20;

// Capitalised words that are not names, in the languages feeds use most:
// function words, roles, institutions, calendar words and live-blog boilerplate.
const GENERIC = new Set(
  `the a an in on of and to for with at by from as is are was be new after over into about says said
   live update video photos watch news breaking today latest exclusive opinion analysis editorial
   le la les des un une et en du au aux pour sur dans par avec il elle direct video exclusif
   el los las del y con por para una hoy vivo directo ultima hora noticias
   der die das und mit von zu im am den ein eine heute live ticker
   il lo gli della di da per con oggi diretta ultime notizie
   o os do dos das no na em com um uma hoje ao vivo
   de het een en van in op met voor vandaag
   president presidente presidential prime minister ministre ministro minister ministry ministere ministerio ministerium
   government gouvernement gobierno governo regierung national nationale nacional nazionale general generale
   foreign affairs interior department federal federation federacion federation federazione
   parliament parlement parlamento parlament senate senat senado congress congreso court tribunal supreme
   police policia polizei army armee ejercito military state etat estado city ciudad ville
   university universidad universite league liga ligue cup copa coupe world mundial monde mondial
   international internacional internationale football futbol fussball
   january february march april may june july august september october november december
   janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre
   enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre
   januar februar marz juni juli oktober dezember gennaio febbraio aprile maggio giugno luglio settembre ottobre dicembre
   janeiro fevereiro marco maio junho julho setembro outubro novembro dezembro
   monday tuesday wednesday thursday friday saturday sunday
   lundi mardi mercredi jeudi vendredi samedi dimanche lunes martes miercoles jueves viernes sabado domingo`.split(/\s+/),
);

/** Lower-case particles that may sit inside a name: Corée du Sud, Ursula von der Leyen. */
const PARTICLES = new Set(['de', 'du', 'del', 'von', 'van', 'da', 'dos', 'bin', 'ibn']);

const WORD = /\p{L}[\p{L}\p{M}\p{N}'’.-]*/gu;

const fold = (word: string) => foldText(word).replace(/\s+/g, '');
const isCapitalised = (word: string) => /^\p{Lu}/u.test(word);

/** Most longer words capitalised: an English-style title-case headline. */
function isTitleCase(words: string[]): boolean {
  const long = words.slice(1).filter((w) => w.length >= 4);
  return long.length >= 3 && long.filter(isCapitalised).length / long.length > 0.6;
}

/**
 * Names in a headline, each a list of folded words. The first word, and words
 * of a title-case or all-caps headline, count only when in `known`.
 */
export function namesIn(title: string, known?: ReadonlySet<string>): string[][] {
  const matches = [...title.matchAll(WORD)];
  const words = matches.map((m) => m[0]);
  const titleCase = isTitleCase(words);
  // True when only spaces separate word i from the word before it.
  const joined = (i: number) => i > 0 && title.slice(matches[i - 1]!.index + words[i - 1]!.length, matches[i]!.index).trim() === '';
  const nameWord = (i: number): string | null => {
    const w = words[i]!;
    const f = fold(w);
    if (!isCapitalised(w) || f.length < 3 || /^\d/.test(f) || GENERIC.has(f)) return null;
    // The first word is capitalised anyway, title-case and all-caps headlines capitalise
    // everything: there, only words seen capitalised mid-sentence elsewhere count.
    const shouting = w.length >= 5 && w === w.toUpperCase();
    if ((i === 0 || titleCase || shouting) && !known?.has(f)) return null;
    return f;
  };

  const names: string[][] = [];
  let run: string[] | null = null;
  for (let i = 0; i < words.length; i++) {
    const f = nameWord(i);
    if (f) {
      if (run && joined(i)) run.push(f);
      else {
        run = [f];
        names.push(run);
      }
      continue;
    }
    // A particle between two name words keeps the name going.
    const particle = PARTICLES.has(fold(words[i]!));
    if (run && particle && joined(i) && i + 1 < words.length && joined(i + 1) && nameWord(i + 1)) continue;
    run = null;
  }
  return names;
}

/** Words seen capitalised mid-sentence in sentence-case headlines: the run's vocabulary of names. */
export function knownNames(titles: Iterable<string>): Set<string> {
  const known = new Set<string>();
  for (const title of titles) {
    if (isTitleCase([...title.matchAll(WORD)].map((m) => m[0]))) continue;
    for (const name of namesIn(title)) for (const w of name) known.add(w);
  }
  return known;
}

interface Doc {
  country: CountryCode;
  cluster: StoryCluster;
  names: string[][];
  words: Set<string>;
}

const titlesOf = (c: StoryCluster) => [c.representative.title, ...c.related.map((a) => a.title)];

/** Shared words grouped so that words of one name (in either cluster) form one unit. */
function sharedUnits(a: Doc, b: Doc): string[][] {
  const shared = [...a.words].filter((w) => b.words.has(w));
  const parent = new Map(shared.map((w) => [w, w]));
  const find = (w: string): string => {
    let x = w;
    while (parent.get(x) !== x) x = parent.get(x)!;
    return x;
  };
  for (const name of [...a.names, ...b.names]) {
    const inShared = name.filter((w) => parent.has(w));
    for (let i = 1; i < inShared.length; i++) parent.set(find(inShared[i - 1]!), find(inShared[i]!));
  }
  const units = new Map<string, string[]>();
  for (const w of shared) units.set(find(w), [...(units.get(find(w)) ?? []), w]);
  return [...units.values()];
}

export interface CountryClusters {
  code: CountryCode;
  clusters: StoryCluster[];
}

/**
 * Groups of clusters from different countries about the same story, as lists
 * of [country, cluster], best linked first. Clusters in no group are left out.
 */
function linkAcrossCountries(countries: CountryClusters[]): Doc[][] {
  const allTitles = countries.flatMap((c) => c.clusters.flatMap(titlesOf));
  const known = knownNames(allTitles);
  const docs: Doc[] = countries.flatMap(({ code, clusters }) =>
    clusters.map((cluster) => {
      const names = titlesOf(cluster).flatMap((t) => namesIn(t, known));
      return { country: code, cluster, names, words: new Set(names.flat()) };
    }),
  );

  const df = new Map<string, number>();
  for (const d of docs) for (const w of d.words) df.set(w, (df.get(w) ?? 0) + 1);
  const weight = (w: string) => Math.log(docs.length / df.get(w)!);

  // Only clusters sharing a rare word can link, so compare along those words' postings.
  const postings = new Map<string, number[]>();
  docs.forEach((d, i) => {
    for (const w of d.words) if (df.get(w)! <= RARE) postings.set(w, [...(postings.get(w) ?? []), i]);
  });
  const links: { a: number; b: number; w: number }[] = [];
  const seen = new Set<string>();
  for (const ids of postings.values()) {
    for (let x = 0; x < ids.length; x++) {
      for (let y = x + 1; y < ids.length; y++) {
        const a = ids[x]!;
        const b = ids[y]!;
        const key = `${a},${b}`;
        if (seen.has(key) || docs[a]!.country === docs[b]!.country) continue;
        seen.add(key);
        const units = sharedUnits(docs[a]!, docs[b]!);
        if (units.length < 2) continue;
        const weights = units.map((u) => Math.max(...u.map(weight)));
        const w = weights.reduce((s, x) => s + x, 0);
        if (w >= MIN_LINK_WEIGHT && Math.max(...weights) >= Math.log(docs.length / RARE)) links.push({ a, b, w });
      }
    }
  }

  // Strongest first, merging groups only while their average pairwise weight stays high.
  links.sort((p, q) => q.w - p.w);
  const pairWeight = new Map(links.flatMap(({ a, b, w }) => [[`${a},${b}`, w] as const, [`${b},${a}`, w] as const]));
  const groups = new UnionFind(docs.length);
  for (const { a, b } of links) {
    const ra = groups.find(a);
    const rb = groups.find(b);
    if (ra === rb) continue;
    const A = groups.members[ra]!;
    const B = groups.members[rb]!;
    let total = 0;
    for (const x of A) for (const y of B) total += pairWeight.get(`${x},${y}`) ?? 0;
    if (total / (A.length * B.length) < MIN_AVERAGE_LINK) continue;
    groups.union(ra, rb);
  }

  return groups.members
    .filter((ids) => ids.length > 0)
    .map((ids) => ids.map((i) => docs[i]!))
    .filter((g) => new Set(g.map((d) => d.country)).size > 1);
}

/**
 * Links each country's clusters to the same story elsewhere: sets `alsoIn` on
 * linked clusters (in place) and returns the cross-border stories, most
 * countries first.
 */
export function buildWorld(countries: CountryClusters[], limit = MAX_WORLD_STORIES): WorldStory[] {
  const stories: WorldStory[] = [];
  for (const group of linkAcrossCountries(countries)) {
    // One cluster per country: its best-covered one.
    const byCountry = new Map<CountryCode, StoryCluster>();
    for (const { country, cluster } of group) {
      const current = byCountry.get(country);
      if (!current || cluster.outletCount24h > current.outletCount24h) byCountry.set(country, cluster);
    }
    for (const [code, cluster] of byCountry) {
      cluster.alsoIn = [...byCountry].filter(([c]) => c !== code).map(([c, other]) => ({ code: c, clusterId: other.id }));
    }
    // A label: each name cut down to the words other countries' clusters share, most shared first.
    const countriesWith = new Map<string, Set<CountryCode>>();
    for (const d of group) for (const w of d.words) countriesWith.set(w, (countriesWith.get(w) ?? new Set()).add(d.country));
    const counts = new Map<string, number>();
    for (const d of group) {
      for (const name of d.names) {
        const shared = name.filter((w) => countriesWith.get(w)!.size > 1);
        if (shared.length) counts.set(shared.join(' '), Math.min(...shared.map((w) => countriesWith.get(w)!.size)));
      }
    }
    const names = [...counts]
      .sort((p, q) => q[1] - p[1] || q[0].length - p[0].length)
      .map(([name]) => name)
      .filter((name, i, all) => {
        const words = name.split(' ');
        return !all.slice(0, i).some((prev) => prev.split(' ').some((w) => words.includes(w)));
      })
      .slice(0, 4);
    const entries = [...byCountry].map(([code, c]) => ({
      code,
      clusterId: c.id,
      title: c.representative.title,
      url: c.representative.url,
      outletCount24h: c.outletCount24h,
      language: c.representative.language,
    }));
    stories.push({
      id: [...entries.map((e) => e.clusterId)].sort()[0]!,
      names,
      countries: entries.sort((p, q) => q.outletCount24h - p.outletCount24h),
      latestPublishedAt: [...byCountry.values()]
        .map((c) => c.latestPublishedAt)
        .sort()
        .at(-1)!,
    });
  }
  const outlets = (s: WorldStory) => s.countries.reduce((n, c) => n + c.outletCount24h, 0);
  return stories.sort((p, q) => q.countries.length - p.countries.length || outlets(q) - outlets(p)).slice(0, limit);
}
