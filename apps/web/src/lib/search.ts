import { COUNTRIES, REGIONS, type SearchFile } from '@news-globe/shared';

/** Lower case without accents: "Sénat" and "senat" match. */
export const foldForSearch = (s: string) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase();

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
  const words = foldForSearch(query).split(/\s+/).filter((w) => w.length > 0);
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
