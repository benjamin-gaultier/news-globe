// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNTRIES, REGIONS, type CountryFile } from '@news-globe/shared';
import { NewsPanel } from '../src/components/NewsPanel';
import type { AsyncState } from '../src/hooks/useAsync';
import { article, cluster, countryFile, NOW } from './fixtures';
import { resetTranslator, translateModule, translator } from './translate-mock';

vi.mock('../src/lib/translate', () => import('./translate-mock').then((m) => m.translateModule));

beforeEach(resetTranslator);

const FR = COUNTRIES.FR!;
const BRE = REGIONS['FR-BRE']!;
const NAQ = REGIONS['FR-NAQ']!;

type Props = Parameters<typeof NewsPanel>[0];

function renderPanel(props: Partial<Props> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onRetry: vi.fn(),
    onSheetChange: vi.fn(),
    onOpenStory: vi.fn(),
    onOpenStoryIn: vi.fn(),
    onToast: vi.fn(),
    onSelectRegion: vi.fn(),
  };
  const all: Props = {
    country: FR,
    regions: [],
    state: { status: 'loading' },
    now: NOW,
    isMobile: false,
    story: null,
    world: [],
    ...handlers,
    ...props,
  };
  const view = render(<NewsPanel {...all} />);
  return { ...handlers, rerender: (p: Partial<Props>) => view.rerender(<NewsPanel {...all} {...p} />) };
}

const ready = (data: CountryFile): AsyncState<CountryFile> => ({ status: 'ready', data });
const headlines = () =>
  screen
    .queryAllByRole('link')
    .filter((a) => a.classList.contains('story-title'))
    .map((a) => a.textContent);

describe('NewsPanel', () => {
  it('shows a placeholder while the first load is in flight', () => {
    renderPanel();
    expect(screen.getByRole('heading', { name: 'France' })).toBeTruthy();
    expect(screen.getByText('Top national headlines')).toBeTruthy();
    expect(document.querySelectorAll('.skeleton')).toHaveLength(6);
  });

  it('lists the stories in order with when the file was updated', () => {
    renderPanel({ state: ready(countryFile([cluster(article({ title: 'One' })), cluster(article({ title: 'Two' }))])) });
    expect(headlines()).toEqual(['One', 'Two']);
    expect(screen.getByText(/Top national headlines/).textContent).toBe('Top national headlines · updated 10 minutes ago');
  });

  it('keeps showing the previous data for the same view while it refreshes', () => {
    const previous = countryFile([cluster(article({ title: 'Earlier' }))]);
    renderPanel({ state: { status: 'loading', previous } });
    expect(headlines()).toEqual(['Earlier']);
  });

  it('keeps showing the previous data when a refresh fails', () => {
    const previous = countryFile([cluster(article({ title: 'Earlier' }))]);
    renderPanel({ state: { status: 'error', error: 'HTTP 503', previous } });
    expect(headlines()).toEqual(['Earlier']);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not show another view’s data while the new one loads', () => {
    const previous = countryFile([cluster(article({ title: 'National' }))]);
    renderPanel({ region: BRE, state: { status: 'loading', previous } });
    expect(headlines()).toEqual([]);
    expect(document.querySelectorAll('.skeleton')).toHaveLength(6);
  });

  it('says when there are no headlines', () => {
    renderPanel({ state: ready(countryFile([])) });
    expect(screen.getByText('No headlines for France right now.')).toBeTruthy();
  });

  it('reports a failed load and retries', async () => {
    const { onRetry } = renderPanel({ state: { status: 'error', error: 'HTTP 503' } });
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Couldn’t load headlines for France.');
    expect(alert.textContent).toContain('HTTP 503');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('offers the country’s regions, and a way back from one', async () => {
    const { onSelectRegion, rerender } = renderPanel({ regions: [BRE, NAQ], state: ready(countryFile([])) });
    const picker = screen.getByRole('navigation', { name: 'Regions of France' });
    await userEvent.click(within(picker).getByRole('button', { name: BRE.name }));
    expect(onSelectRegion).toHaveBeenCalledWith('FR-BRE');

    rerender({ region: BRE, state: ready(countryFile([], { regionCode: 'FR-BRE' })) });
    expect(screen.getByRole('heading', { name: BRE.name })).toBeTruthy();
    expect(screen.getByText(/Top regional headlines/)).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Regions of France' })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '‹ France' }));
    expect(onSelectRegion).toHaveBeenLastCalledWith(null);
  });

  it('opens a story’s counterpart in another country', async () => {
    const { onOpenStoryIn } = renderPanel({
      state: ready(countryFile([cluster(article(), [], { alsoIn: [{ code: 'DE', clusterId: 'x' }] })])),
    });
    await userEvent.click(screen.getByRole('button', { name: 'Germany' }));
    expect(onOpenStoryIn).toHaveBeenCalledWith('DE', 'x');
  });

  describe('story page', () => {
    const one = article({ title: 'Le budget adopté', source: { id: 'lemonde', name: 'Le Monde' }, publishedAt: '2026-10-08T11:00:00Z' });
    const two = article({ title: 'Budget : le vote', source: { id: 'figaro', name: 'Le Figaro' }, publishedAt: '2026-10-08T10:00:00Z' });
    const file = () =>
      countryFile([cluster(article({ title: 'Other story' })), cluster(one, [two], { alsoIn: [{ code: 'US', clusterId: 'us1' }] })]);

    it('opens from a story’s sources button', async () => {
      const { onOpenStory } = renderPanel({ state: ready(file()) });
      await userEvent.click(screen.getByRole('button', { name: '+1 other source' }));
      expect(onOpenStory).toHaveBeenCalledWith(one.id);
    });

    it('shows the story: headline, every outlet earliest first, the same story elsewhere', async () => {
      const world = [
        {
          id: 'w',
          names: ['budget'],
          countries: [
            { code: 'FR', clusterId: one.id, title: 'Le budget adopté', url: one.url, outletCount24h: 2 },
            { code: 'US', clusterId: 'us1', title: 'French budget passes', url: 'https://us.example/b', outletCount24h: 3, language: 'en' },
          ],
          latestPublishedAt: one.publishedAt,
        },
      ];
      const { onOpenStoryIn, onOpenStory } = renderPanel({ state: ready(file()), story: one.id, world });
      expect(screen.getByRole('heading', { level: 2, name: 'Le budget adopté' })).toBeTruthy();
      expect(screen.getByText('Story · Le Monde')).toBeTruthy();
      expect(screen.getByRole('link', { name: 'Read at Le Monde ↗' }).getAttribute('href')).toBe(one.url);
      // No list, no region picker: just the story.
      expect(screen.queryByText('Other story')).toBeNull();

      const coverage = screen.getByRole('region', { name: 'Coverage · 2 outlets' });
      expect([...coverage.querySelectorAll('.story-source')].map((s) => s.textContent)).toEqual(['Le Figaro', 'Le Monde']);
      expect(within(coverage).getByText('First')).toBeTruthy();

      const elsewhere = screen.getByRole('region', { name: 'In other countries' });
      expect(within(elsewhere).getByRole('link', { name: 'French budget passes' }).getAttribute('href')).toBe('https://us.example/b');
      await userEvent.click(within(elsewhere).getByRole('button', { name: 'United States' }));
      expect(onOpenStoryIn).toHaveBeenCalledWith('US', 'us1');

      await userEvent.click(screen.getByRole('button', { name: '‹ France' }));
      expect(onOpenStory).toHaveBeenCalledWith(null);
    });

    it('finds the story by any of its articles, and draws its rank today', () => {
      const runs = ['2026-10-08T09:00:00.000Z', '2026-10-08T10:00:00.000Z', '2026-10-08T11:00:00.000Z'];
      const c = file().clusters[1]!;
      renderPanel({
        state: ready(file()),
        story: two.id,
        trends: { [c.id]: { ranks: [null, 4, 2], firstSeen: runs[1]!, state: 'rising' } },
        trendRuns: runs,
      });
      expect(screen.getByRole('heading', { level: 2, name: 'Le budget adopté' })).toBeTruthy();
      expect(screen.getByText(/#2 in France now/)).toBeTruthy();
      expect(screen.getByText('↑ Rising')).toBeTruthy();
      expect(screen.getByRole('img', { name: /^Rank at each run today: .* not ranked, .* #4, .* #2$/ })).toBeTruthy();
    });

    it('says when the story has left the top stories', async () => {
      const { onOpenStory } = renderPanel({ state: ready(file()), story: 'gone123' });
      expect(screen.getByText('This story is no longer among France’s top stories.')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'See today’s top stories' }));
      expect(onOpenStory).toHaveBeenCalledWith(null);
    });

    it('copies the link when the browser has no share sheet', async () => {
      const writeText = vi.fn(async () => {});
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      const { onToast } = renderPanel({ state: ready(file()), story: one.id });
      await userEvent.click(screen.getByRole('button', { name: 'Share' }));
      expect(writeText).toHaveBeenCalledWith(location.href);
      expect(onToast).toHaveBeenCalledWith('Link copied');
    });
  });

  describe('headline language', () => {
    const foreign = () => ready(countryFile([cluster(article({ title: 'Le budget', language: 'fr' }), [article({ language: 'br' })])]));

    it('has no toggle when every headline is already English', () => {
      renderPanel({ state: ready(countryFile([cluster(article({ language: 'en' }))])) });
      expect(screen.queryByRole('group', { name: 'Headline language' })).toBeNull();
    });

    it('switches to English, remembers the choice and prepares a translator per language', async () => {
      renderPanel({ state: foreign() });
      const group = screen.getByRole('group', { name: 'Headline language' });
      const original = within(group).getByRole('button', { name: 'Original' });
      const english = within(group).getByRole('button', { name: 'English' });
      expect(original.getAttribute('aria-pressed')).toBe('true');

      await userEvent.click(english);

      expect(english.getAttribute('aria-pressed')).toBe('true');
      expect(localStorage.getItem('news-globe:language')).toBe('en');
      expect(translateModule.getTranslator.mock.calls.map(([l]) => l)).toEqual(expect.arrayContaining(['fr', 'br']));
      expect(await screen.findByRole('link', { name: '[en] Le budget' })).toBeTruthy();
      expect(screen.queryByText(/Translating headlines/)).toBeNull();

      await userEvent.click(original);
      expect(localStorage.getItem('news-globe:language')).toBe('original');
      expect(screen.getByRole('link', { name: 'Le budget' })).toBeTruthy();
    });

    it('starts in the language chosen on an earlier visit', async () => {
      localStorage.setItem('news-globe:language', 'en');
      renderPanel({ state: foreign() });
      expect(within(screen.getByRole('group')).getByRole('button', { name: 'English' }).getAttribute('aria-pressed')).toBe('true');
      expect(await screen.findByRole('link', { name: '[en] Le budget' })).toBeTruthy();
    });

    it('says so while translators load, and when the browser can’t translate', async () => {
      let resolve!: (t: object | null) => void;
      translateModule.getTranslator.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
      translator.missing.add('br');
      localStorage.setItem('news-globe:language', 'en');

      renderPanel({ state: foreign() });

      expect(screen.getByText('Translating headlines on this device…')).toBeTruthy();
      resolve({});
      expect(await screen.findByText(/can’t translate on the device/)).toBeTruthy();
      expect(screen.queryByText('Translating headlines on this device…')).toBeNull();
    });

    it('explains the fallback right away without the Translator API', () => {
      translator.available = false;
      localStorage.setItem('news-globe:language', 'en');
      renderPanel({ state: foreign() });
      expect(screen.getByText(/can’t translate on the device/)).toBeTruthy();
    });
  });
});
