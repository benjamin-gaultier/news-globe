import type { SourceConfig } from '../sources.config';
import type { AdapterContext, FetchResult, SourceAdapter } from './types';

/**
 * GDELT adapter — stub, not implemented in the MVP.
 *
 * TODO(gdelt): plan
 *  - Query the GDELT DOC 2.0 API (free, no key):
 *    https://api.gdeltproject.org/api/v2/doc/doc?query=sourcecountry:{FIPS}&mode=ArtList&format=json&maxrecords=250&timespan=6h
 *    Note GDELT uses FIPS 10-4 country codes (France = "FR", United States = "US",
 *    but e.g. Germany = "GM"), so add an ISO→FIPS map. Add `sourcelang:` to keep
 *    the national language and `domain:` / `-domain:` filters to exclude aggregators.
 *  - Map each result to a RawItem: `title`, `url`, `seendate` → publishedAt,
 *    `socialimage` → imageUrl. ArtList has no snippet, so description stays null.
 *  - Treat each article's `domain` as its outlet (one SourceConfig per country with
 *    a default authority, overridden by a domain→authority table) so clustering's
 *    "distinct outlets" signal still works.
 *  - GDELT updates every 15 minutes; go through HttpCache like RSS so the same
 *    throttle applies. It is the path to covering countries without curated feeds.
 */
export const gdeltAdapter: SourceAdapter = {
  type: 'gdelt',
  async fetch(source: SourceConfig, ctx: AdapterContext): Promise<FetchResult[]> {
    ctx.log(`  ${source.id.padEnd(12)} skipped: GDELT adapter not implemented yet`);
    return [];
  },
};
