// @vitest-environment jsdom
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARCHIVE_SCHEMA_VERSION, SCHEMA_VERSION, type ArchiveDay, type IndexFile } from '@news-globe/shared';
import { App } from '../src/App';
import type { GlobeViewProps } from '../src/components/GlobeView';
import { article, cluster, countryFile } from './fixtures';

// The real globe needs WebGL; this stand-in records what the app hands it.
const globe = vi.hoisted(() => ({ props: null as GlobeViewProps | null }));
vi.mock('../src/components/GlobeView', () => ({
  default: (props: GlobeViewProps) => {
    globe.props = props;
    return <div data-testid="globe" />;
  },
}));

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function indexFile(): IndexFile {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: ago(10),
    countries: [
      { code: 'FR', name: 'France', updatedAt: ago(10), clusterCount: 2, topTitle: 'Budget', topOutlets: 3 },
      { code: 'US', name: 'United States', updatedAt: ago(10), clusterCount: 1, topTitle: 'Senate', topOutlets: 1 },
    ],
    regions: [{ code: 'FR-BRE', name: 'Brittany', updatedAt: ago(10), clusterCount: 1 }],
    world: [
      {
        id: 'w1',
        names: ['nato'],
        countries: [
          { code: 'FR', clusterId: 'c1', title: 'L’OTAN se réunit', url: 'https://fr.example/otan', outletCount24h: 3, language: 'fr' },
          { code: 'US', clusterId: 'c2', title: 'NATO meets', url: 'https://us.example/nato', outletCount24h: 2, language: 'en' },
        ],
        latestPublishedAt: ago(20),
      },
    ],
  };
}

function archiveDay(date: string): ArchiveDay {
  const run = `${date}T09:00:00.000Z`;
  return {
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    date,
    stories: [
      { unit: 'FR', title: 'Archived budget story', url: 'https://fr.example/old', sources: ['a', 'b'], articleIds: ['x'], firstSeen: run, lastSeen: run, bestRank: 1, peakOutlets: 2 },
    ],
    runs: { [`${date}T08:00:00.000Z`]: { FR: [0] }, [run]: { FR: [0] } },
  };
}

/** Files the fake data server answers with (`archive` on: any day has history); anything else is a 404. */
let files: Record<string, () => unknown>;
const fetchMock = vi.fn(async (input: string | URL | Request) => {
  const path = String(input).replace(/^\/data\//, '');
  const archive = /^archive\/(\d{4}-\d{2}-\d{2})\.json$/.exec(path);
  const body = archive ? (files.archive ? archiveDay(archive[1]!) : undefined) : files[path]?.();
  return body === undefined ? new Response('Not found', { status: 404 }) : new Response(JSON.stringify(body));
});
const requested = () => fetchMock.mock.calls.map(([url]) => String(url));

beforeEach(() => {
  files = {
    'index.json': indexFile,
    'countries/FR.json': () => countryFile([cluster(article({ title: 'Le budget adopté' }), [], { alsoIn: [{ code: 'US', clusterId: 'c2' }] })]),
    'countries/US.json': () => countryFile([cluster(article({ title: 'Senate passes bill', language: 'en' }))], { countryCode: 'US', countryName: 'United States' }),
    'regions/FR-BRE.json': () => countryFile([cluster(article({ title: 'Rennes : le métro' }))], { regionCode: 'FR-BRE', regionName: 'Brittany' }),
  };
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  globe.props = null;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderApp(hash = '') {
  history.replaceState(null, '', `/${hash}`);
  render(<App />);
  await screen.findByText('Updated 10 minutes ago');
  await waitFor(() => expect(globe.props).not.toBeNull());
}

const chip = (name: string) => within(screen.getByRole('navigation', { name: 'Countries' })).getByRole('button', { name });
const panel = () => screen.queryByRole('complementary');

describe('App', () => {
  it('loads the index and enables the countries that have headlines', async () => {
    history.replaceState(null, '', '/');
    render(<App />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    await screen.findByText('Updated 10 minutes ago');

    expect((chip('France') as HTMLButtonElement).disabled).toBe(false);
    expect((chip('United States') as HTMLButtonElement).disabled).toBe(false);
    expect((chip('Germany') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Tap a highlighted country to see its top headlines')).toBeTruthy();
    expect(screen.getByRole('figure', { name: /Shading/ })).toBeTruthy();
    await waitFor(() => expect([...globe.props!.available].sort()).toEqual(['FR', 'US']));
    expect(globe.props!.entries.get('FR')?.topOutlets).toBe(3);
    expect(document.title).toBe('News Globe');
    expect(panel()).toBeNull();
  });

  it('opens a country’s headlines, keeps the URL in step, and closes again', async () => {
    await renderApp();
    await userEvent.click(chip('France'));

    expect(await screen.findByRole('link', { name: 'Le budget adopté' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'France' })).toBeTruthy();
    expect(location.hash).toBe('#FR');
    expect(document.title).toBe('France · News Globe');
    expect(chip('France').getAttribute('aria-pressed')).toBe('true');
    expect(globe.props!.selected).toBe('FR');
    expect(globe.props!.regions.map((r) => r.code)).toEqual(['FR-BRE']);
    expect(screen.queryByText(/Tap a highlighted country/)).toBeNull();

    await userEvent.click(chip('France'));
    expect(panel()).toBeNull();
    expect(location.hash).toBe('');
    expect(document.title).toBe('News Globe');
  });

  it('closes the panel from its close button', async () => {
    await renderApp('#US');
    await screen.findByRole('link', { name: 'Senate passes bill' });
    await userEvent.click(screen.getByRole('button', { name: 'Close headlines' }));
    expect(panel()).toBeNull();
  });

  it('opens a region and returns to the country', async () => {
    await renderApp('#FR');
    await userEvent.click(within(await screen.findByRole('navigation', { name: 'Regions of France' })).getByRole('button', { name: 'Brittany' }));

    expect(await screen.findByRole('link', { name: 'Rennes : le métro' })).toBeTruthy();
    expect(location.hash).toBe('#FR-BRE');
    expect(document.title).toBe('Brittany · News Globe');
    expect(requested()).toContain('/data/regions/FR-BRE.json');
    expect(globe.props!.selectedRegion).toBe('FR-BRE');

    await userEvent.click(screen.getByRole('button', { name: '‹ France' }));
    expect(await screen.findByRole('link', { name: 'Le budget adopté' })).toBeTruthy();
    expect(location.hash).toBe('#FR');
  });

  it('opens straight on a shared region link', async () => {
    await renderApp('#fr-bre');
    expect(await screen.findByRole('link', { name: 'Rennes : le métro' })).toBeTruthy();
    expect(location.hash).toBe('#FR-BRE');
  });

  it('falls back from a link to a country without headlines, with a note', async () => {
    await renderApp('#DE');
    expect(await screen.findByText('Germany — coming soon')).toBeTruthy();
    expect(panel()).toBeNull();
    expect(location.hash).toBe('');
  });

  it('falls back from a link to a region without headlines to its country', async () => {
    await renderApp('#FR-NAQ');
    expect(await screen.findByRole('link', { name: 'Le budget adopté' })).toBeTruthy();
    expect(location.hash).toBe('#FR');
  });

  it('notes a country tapped on the globe that has no headlines yet', async () => {
    await renderApp();
    act(() => globe.props!.onUnavailable('Germany'));
    expect(screen.getByRole('status').textContent).toBe('Germany — coming soon');
  });

  it('follows Back and Forward', async () => {
    await renderApp();
    await userEvent.click(chip('France'));
    await screen.findByRole('link', { name: 'Le budget adopté' });

    act(() => {
      history.replaceState(null, '', '/#US');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(await screen.findByRole('link', { name: 'Senate passes bill' })).toBeTruthy();
    expect(globe.props!.selected).toBe('US');
  });

  it('shows the cross-border stories with arcs between their countries', async () => {
    files['countries/US.json'] = () =>
      countryFile([cluster(article({ title: 'Senate passes bill', language: 'en' }), [], { id: 'c2' })], { countryCode: 'US', countryName: 'United States' });
    await renderApp();
    await userEvent.click(chip('Across borders'));

    expect(screen.getByRole('heading', { name: 'Across borders' })).toBeTruthy();
    expect(screen.getByText('NATO meets', { selector: '.world-english' })).toBeTruthy();
    expect(location.hash).toBe('#world');
    expect(document.title).toBe('Across borders · News Globe');
    expect(globe.props!.arcs).toEqual([{ startLat: 46.6, startLng: 2.4, endLat: 39.5, endLng: -98.4 }]);

    // A country from a story opens that story's page there, replacing the world view.
    await userEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: 'United States' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Senate passes bill' })).toBeTruthy();
    expect(globe.props!.arcs).toEqual([]);
    expect(location.hash).toBe('#US/c2');
  });

  describe('Story pages', () => {
    beforeEach(() => {
      files['countries/FR.json'] = () =>
        countryFile([
          cluster(article({ title: 'Le budget adopté' }), [article({ title: 'Budget : le vote', source: { id: 'figaro', name: 'Le Figaro' } })], {
            id: 'bud1',
          }),
        ]);
    });

    it('opens a story’s page, with its own link, and Back returns to the list', async () => {
      await renderApp('#FR');
      await userEvent.click(await screen.findByRole('button', { name: '+1 other source' }));
      expect(await screen.findByRole('heading', { level: 2, name: 'Le budget adopté' })).toBeTruthy();
      expect(location.hash).toBe('#FR/bud1');
      expect(screen.getByRole('link', { name: 'Budget : le vote' })).toBeTruthy();

      act(() => history.back());
      await waitFor(() => expect(location.hash).toBe('#FR'));
      expect(await screen.findByRole('heading', { level: 2, name: 'France' })).toBeTruthy();
    });

    it('opens a shared story link', async () => {
      await renderApp('#FR/bud1');
      expect(await screen.findByRole('heading', { level: 2, name: 'Le budget adopté' })).toBeTruthy();
      expect(location.hash).toBe('#FR/bud1');
    });

    it('leaves the story page for the list, History or another country', async () => {
      files.archive = () => true;
      await renderApp('#FR/bud1');
      await screen.findByRole('heading', { level: 2, name: 'Le budget adopté' });
      await userEvent.click(screen.getByRole('button', { name: 'History' }));
      expect(await screen.findByRole('link', { name: 'Archived budget story' })).toBeTruthy();
      expect(location.hash).not.toContain('bud1');
    });
  });

  it('reports an unreachable index and retries', async () => {
    const working = files['index.json']!;
    files['index.json'] = () => undefined;
    history.replaceState(null, '', '/');
    render(<App />);

    expect(await screen.findByText(/Couldn’t reach the news data/)).toBeTruthy();
    files['index.json'] = working;
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Updated 10 minutes ago')).toBeTruthy();
  });

  it('reports a country that fails to load and retries it', async () => {
    const working = files['countries/FR.json']!;
    files['countries/FR.json'] = () => undefined;
    await renderApp('#FR');

    expect(await screen.findByRole('alert')).toBeTruthy();
    files['countries/FR.json'] = working;
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Le budget adopté' })).toBeTruthy();
  });

  describe('History', () => {
    it('replays a day’s runs on the globe and in the panel', async () => {
      files.archive = () => true;
      await renderApp();
      await userEvent.click(screen.getByRole('button', { name: 'History' }));

      const slider = await screen.findByRole('slider');
      const today = new Date().toISOString().slice(0, 10);
      expect(requested()).toContain(`/data/archive/${today}.json`);
      // Opens on the day's latest run.
      expect((slider as HTMLInputElement).value).toBe('1');
      await waitFor(() => expect(location.hash).toBe(`#@${today}T09:00`));
      expect(screen.getByRole('button', { name: 'History' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.queryByRole('button', { name: 'Across borders' })).toBeNull();
      expect([...globe.props!.entries.keys()]).toEqual(['FR']);
      expect(globe.props!.entries.get('FR')!.updatedAt).toBe(`${today}T09:00:00.000Z`);

      await userEvent.click(chip('France'));
      expect(await screen.findByRole('link', { name: 'Archived budget story' })).toBeTruthy();
      expect(location.hash).toBe(`#FR@${today}T09:00`);
      // The timeline moved into the panel, above the headlines.
      expect(within(panel()!).getByRole('slider')).toBe(screen.getByRole('slider'));
      // History never loads the live file.
      expect(requested()).not.toContain('/data/countries/FR.json');

      await userEvent.click(screen.getByRole('button', { name: 'Previous day' }));
      expect(await screen.findByRole('slider')).toBeTruthy();
      await waitFor(() => expect(location.hash.startsWith('#FR@')).toBe(true));
      expect(location.hash).not.toContain(today);

      await userEvent.click(screen.getByRole('button', { name: 'Live' }));
      expect(screen.queryByRole('slider')).toBeNull();
      expect(await screen.findByRole('link', { name: 'Le budget adopté' })).toBeTruthy();
      expect(location.hash).toBe('#FR');
    });

    it('goes back in time from a live panel, keeping the place', async () => {
      files.archive = () => true;
      await renderApp('#FR');
      await screen.findByRole('link', { name: 'Le budget adopté' });
      await userEvent.click(within(panel()!).getByRole('button', { name: 'History' }));
      expect(await screen.findByRole('link', { name: 'Archived budget story' })).toBeTruthy();
      expect(within(panel()!).getByRole('slider')).toBeTruthy();
      expect(location.hash.startsWith('#FR@')).toBe(true);
    });

    it('opens a shared link on the run it names', async () => {
      files.archive = () => true;
      await renderApp('#FR@2026-10-07T08:00');

      expect(await screen.findByRole('link', { name: 'Archived budget story' })).toBeTruthy();
      expect((screen.getByRole('slider') as HTMLInputElement).value).toBe('0');
      expect(location.hash).toBe('#FR@2026-10-07T08:00');
      expect(requested()).toContain('/data/archive/2026-10-07.json');
    });

    it('says when a day has no history', async () => {
      await renderApp('#@2026-10-07');
      expect(await screen.findByText('No history for this day')).toBeTruthy();
      expect(globe.props!.entries.size).toBe(0);
    });
  });
});

describe('Trends', () => {
  function withTrends(runAtOffset = 0) {
    const c = cluster(article({ title: 'Le budget adopté' }));
    const fr = countryFile([c]);
    files['countries/FR.json'] = () => fr;
    files['trends.json'] = () => ({
      schemaVersion: SCHEMA_VERSION,
      runAt: new Date(Date.parse(fr.updatedAt) + runAtOffset).toISOString(),
      runs: [ago(70), fr.updatedAt],
      units: { FR: { [c.id]: { ranks: [4, 1], firstSeen: ago(70), state: 'rising' } } },
      change: { FR: 2 },
    });
  }

  it('badges a story that rose since the previous run, with its rank history', async () => {
    withTrends();
    await renderApp('#FR');
    expect(await screen.findByText('↑ Rising')).toBeTruthy();
    expect(screen.getByRole('img', { name: "Rank over today's runs: #4, #1" })).toBeTruthy();
  });

  it('ignores trends describing another run than the file shown', async () => {
    withTrends(-3_600_000);
    await renderApp('#FR');
    await screen.findByRole('link', { name: 'Le budget adopté' });
    await waitFor(() => expect(requested()).toContain('/data/trends.json'));
    expect(screen.queryByText('↑ Rising')).toBeNull();
    expect(screen.queryByRole('img', { name: /Rank over/ })).toBeNull();
  });

  it('shades the globe by change on request', async () => {
    withTrends();
    await renderApp();
    await userEvent.click(await screen.findByRole('button', { name: 'Change' }));
    expect(globe.props!.shadeStep?.('FR')).toBe(2);
    expect(globe.props!.shadeStep?.('US')).toBe(0);
    expect(screen.getByRole('figure', { name: /new or rising/ })).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Coverage' }));
    expect(globe.props!.shadeStep).toBeUndefined();
  });

  it('offers no change shading before the workflow has written trends', async () => {
    await renderApp();
    await waitFor(() => expect(requested()).toContain('/data/trends.json'));
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });
});

describe('Search', () => {
  beforeEach(() => {
    files['search.json'] = () => ({
      schemaVersion: SCHEMA_VERSION,
      runAt: ago(10),
      items: [
        ['FR', 'Le budget adopté', 3],
        ['FR-BRE', 'Rennes : le métro', 1],
      ],
    });
  });

  it('finds a headline and opens its panel on that story', async () => {
    await renderApp();
    const box = screen.getByRole('searchbox', { name: /Search every country/ });
    expect(panel()).toBeNull();
    await userEvent.type(box, 'budget');
    expect(await screen.findByRole('heading', { name: 'Search results' })).toBeTruthy();
    await userEvent.click(await screen.findByRole('button', { name: /Le budget adopté/ }));

    const link = await screen.findByRole('link', { name: 'Le budget adopté' });
    expect(link.closest('li')!.className).toContain('story-focused');
    expect(location.hash).toBe('#FR');
    // The query stays in the box: focusing it shows the results again.
    await userEvent.click(box);
    expect(await screen.findByRole('heading', { name: 'Search results' })).toBeTruthy();
  });

  it('closes the results on Escape, emptying the box', async () => {
    await renderApp();
    const box = screen.getByRole('searchbox');
    await userEvent.type(box, 'budget');
    await screen.findByRole('heading', { name: 'Search results' });
    await userEvent.keyboard('{Escape}');
    expect(panel()).toBeNull();
    expect((box as HTMLInputElement).value).toBe('');
  });

  it('opens a result live from History', async () => {
    files.archive = () => true;
    await renderApp('#@2026-10-07');
    await userEvent.type(screen.getByRole('searchbox'), 'budget');
    await userEvent.click(await screen.findByRole('button', { name: /Le budget adopté/ }));
    expect(await screen.findByRole('link', { name: 'Le budget adopté' })).toBeTruthy();
    expect(location.hash).toBe('#FR');
  });

  it('opens a region result in its region', async () => {
    await renderApp();
    await userEvent.type(screen.getByRole('searchbox'), 'metro');
    await userEvent.click(await screen.findByRole('button', { name: /Rennes/ }));
    expect(await screen.findByRole('heading', { name: 'Brittany' })).toBeTruthy();
    expect(location.hash).toBe('#FR-BRE');
  });

  it('jumps to the search box with "/" unless typing in a field', async () => {
    await renderApp();
    await userEvent.keyboard('/');
    const box = screen.getByRole('searchbox');
    expect(document.activeElement).toBe(box);
    await userEvent.type(box, 'a/b');
    expect((box as HTMLInputElement).value).toBe('a/b');
  });
});
