import { COUNTRIES, type CountryCode, REGIONS, type SearchFile } from '@news-globe/shared';

/** Lower case without accents: "Sénat" and "senat" match. */
export const foldForSearch = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

/** Words of a folded name or query: "Côte d'Ivoire" → cote, d, ivoire. */
const wordsOf = (s: string) =>
  foldForSearch(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);

/** Other names people type for a country, for finding it by name only. */
const COUNTRY_ALIASES: Partial<Record<CountryCode, readonly string[]>> = {
  US: ['USA', 'US', 'America'],
  GB: ['UK', 'Britain', 'Great Britain', 'England'],
  AE: ['UAE'],
  CD: ['DRC', 'Democratic Republic of the Congo'],
  CI: ['Ivory Coast'],
  CZ: ['Czech Republic'],
  KR: ['Korea'],
  NL: ['Holland'],
  MM: ['Burma'],
  TR: ['Türkiye'],
  MK: ['Macedonia'],
  SZ: ['Swaziland'],
  TL: ['East Timor'],
};

/**
 * Countries and regions that have headlines (`has`) and whose name (or a country's alias, or a
 * region's local name) has a word starting with each word of the query: "uni" finds the United
 * States and the United Kingdom, "bayern" Bavaria, "uk" the United Kingdom. A name that is exactly
 * the query comes first ("uk": the United Kingdom before Ukraine); then countries before regions.
 */
export function searchPlaces(query: string, has: (code: string) => boolean, limit = 6): string[] {
  const words = wordsOf(query);
  if (!words.length) return [];
  const typed = words.join(' ');
  /** 2: a name is the query; 1: each word of the query starts a word of a name; 0: no match. */
  const score = (names: readonly string[]) =>
    Math.max(
      ...names.map((name) => {
        const parts = wordsOf(name);
        if (parts.join(' ') === typed) return 2;
        return words.every((w) => parts.some((p) => p.startsWith(w))) ? 1 : 0;
      }),
    );
  return [
    ...Object.values(COUNTRIES)
      .filter((c) => has(c.code))
      .map((c) => ({ code: c.code, score: score([c.name, ...(COUNTRY_ALIASES[c.code] ?? [])]) })),
    ...Object.values(REGIONS)
      .filter((r) => has(r.code))
      .map((r) => ({ code: r.code, score: score([r.name, ...(r.localNames ?? [])]) })),
  ]
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((p) => p.code);
}

/** A place's display name: "Brittany, France" for a region, "France" for a country. */
export function placeName(code: string): string {
  const region = REGIONS[code];
  if (region) return `${region.name}, ${COUNTRIES[region.country]?.name ?? region.country}`;
  return COUNTRIES[code]?.name ?? code;
}

export interface SearchHit {
  unit: string;
  title: string;
  outlets: number;
}

export interface SearchGroup {
  unit: string;
  place: string;
  hits: SearchHit[];
}

/** search.json's rows with the folded text they match against (headline and place name). */
export interface SearchIndex {
  rows: { hit: SearchHit; text: string }[];
}

export function indexSearch(file: SearchFile): SearchIndex {
  return {
    rows: file.items.map(([unit, title, outlets]) => ({
      hit: { unit, title, outlets },
      text: foldForSearch(`${title} ${placeName(unit)}`),
    })),
  };
}

/**
 * Headlines containing every word of the query, as groups per place: places
 * with the most widely covered match first, at most `limit` headlines in all.
 */
export function searchHeadlines(index: SearchIndex, query: string, limit = 60): { groups: SearchGroup[]; total: number } {
  const words = foldForSearch(query)
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (!words.length) return { groups: [], total: 0 };
  const hits = index.rows.filter((r) => words.every((w) => r.text.includes(w))).map((r) => r.hit);
  const groups = new Map<string, SearchGroup>();
  for (const hit of [...hits].sort((a, b) => b.outlets - a.outlets).slice(0, limit)) {
    const group = groups.get(hit.unit) ?? { unit: hit.unit, place: placeName(hit.unit), hits: [] };
    group.hits.push(hit);
    groups.set(hit.unit, group);
  }
  return { groups: [...groups.values()], total: hits.length };
}
