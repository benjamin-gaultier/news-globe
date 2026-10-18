import { COUNTRIES, type CountryCode, type TodayStory, type WorldStory } from '@news-globe/shared';

/** A story in one country's top headlines: its cluster there, that country's headline, and its outlets there. */
export interface BriefCountry {
  code: CountryCode;
  clusterId: string;
  title: string;
  /** BCP 47; absent from older index files. */
  language?: string;
  outlets: number;
}

/** One line of the world briefing: a story and the countries whose top headlines carry it, best covered first. */
export interface Brief {
  key: string;
  countries: BriefCountry[];
  /** Outlets covering it, added up across its countries. */
  outlets: number;
  /** From Today's file, which lists national stories with their outlet, image and trend. */
  source: string | null;
  imageUrl: string | null;
  state: 'new' | 'rising' | null;
}

const storyKey = (code: string, clusterId: string) => `${code}/${clusterId}`;

/** A national story from Today's lists, as a line of its own. */
export const briefOf = (s: TodayStory): Brief => ({
  key: storyKey(s.unit, s.clusterId),
  countries: [{ code: s.unit, clusterId: s.clusterId, title: s.title, language: s.language, outlets: s.outlets }],
  outlets: s.outlets,
  source: s.source,
  imageUrl: s.imageUrl,
  state: s.state,
});

/**
 * The top stories worldwide right now: Today's most covered national stories and
 * the cross-border stories, one line per story. A national story that is also in
 * other countries' headlines joins its cross-border story. Most outlets first,
 * then most countries.
 */
export function topStories(top: readonly TodayStory[], world: readonly WorldStory[]): Brief[] {
  const briefs: Brief[] = [];
  const byStory = new Map<string, Brief>();
  for (const story of world) {
    const countries = story.countries
      .filter((c) => COUNTRIES[c.code])
      .map((c) => ({ code: c.code, clusterId: c.clusterId, title: c.title, language: c.language, outlets: c.outletCount24h }));
    if (!countries.length) continue;
    const brief: Brief = {
      key: story.id,
      countries,
      outlets: countries.reduce((n, c) => n + c.outlets, 0),
      source: null,
      imageUrl: null,
      state: null,
    };
    briefs.push(brief);
    for (const c of countries) byStory.set(storyKey(c.code, c.clusterId), brief);
  }
  for (const s of top) {
    const shared = byStory.get(storyKey(s.unit, s.clusterId));
    if (!shared) {
      briefs.push(briefOf(s));
      continue;
    }
    shared.imageUrl ??= s.imageUrl;
    shared.state ??= s.state;
  }
  return briefs.sort((a, b) => b.outlets - a.outlets || b.countries.length - a.countries.length);
}

/** Today's stories that aren't already lines of `briefs`, so the briefing shows each story once. */
export function notIn(briefs: readonly Brief[], stories: readonly TodayStory[]): TodayStory[] {
  const shown = new Set(briefs.flatMap((b) => b.countries.map((c) => storyKey(c.code, c.clusterId))));
  return stories.filter((s) => !shown.has(storyKey(s.unit, s.clusterId)));
}
