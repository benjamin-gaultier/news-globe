// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldStory } from '@news-globe/shared';
import { WorldPanel } from '../src/components/WorldPanel';
import { minutesAgo, NOW } from './fixtures';
import { resetTranslator, translator } from './translate-mock';

vi.mock('../src/lib/translate', () => import('./translate-mock').then((m) => m.translateModule));

beforeEach(resetTranslator);

const entry = (code: string, title: string, language: string | undefined, outletCount24h = 1) => ({
  code,
  clusterId: `${code}-1`,
  title,
  url: `https://${code.toLowerCase()}.example/story`,
  outletCount24h,
  ...(language && { language }),
});

const story = (countries: WorldStory['countries'], names = ['warner bros', 'paramount']): WorldStory => ({
  id: countries.map((c) => c.clusterId).join('+'),
  names,
  countries,
  latestPublishedAt: minutesAgo(15),
});

function renderWorld(stories: WorldStory[]) {
  const onOpenStory = vi.fn();
  const onClose = vi.fn();
  render(<WorldPanel stories={stories} now={NOW} isMobile={false} onClose={onClose} onSheetChange={vi.fn()} onOpenStory={onOpenStory} />);
  return { onOpenStory, onClose };
}

const items = () => screen.getAllByRole('listitem').filter((li) => li.classList.contains('world-story'));

describe('WorldPanel', () => {
  it('says when no story crosses borders', () => {
    renderWorld([]);
    expect(screen.getByRole('heading', { name: 'Across borders' })).toBeTruthy();
    expect(screen.getByText(/No story is in several countries/)).toBeTruthy();
  });

  it('lists each story with its shared names, countries and their headlines', async () => {
    const { onOpenStory } = renderWorld([
      story([entry('DE', 'Warner Bros kauft Paramount', 'de', 4), entry('US', 'Warner Bros buys Paramount', 'en', 1), entry('ZZ', 'Unknown', 'xx')]),
    ]);
    const [item] = items();
    expect(item!.querySelector('.world-names')!.textContent).toBe('Warner Bros · Paramount');
    // An English-language country's headline leads.
    expect(item!.querySelector('.world-english')!.textContent).toBe('Warner Bros buys Paramount');
    expect(within(item!).getByText('In 2 countries · latest 15 minutes ago')).toBeTruthy();
    expect(within(item!).getAllByRole('button').map((b) => b.textContent)).toEqual(['Germany', 'United States']);
    expect(within(item!).getByRole('link', { name: 'Warner Bros kauft Paramount' }).getAttribute('href')).toBe('https://de.example/story');
    expect(within(item!).getByText('· 4 outlets')).toBeTruthy();
    expect(within(item!).queryByText('· 1 outlets')).toBeNull();

    await userEvent.click(within(item!).getByRole('button', { name: 'Germany' }));
    expect(onOpenStory).toHaveBeenCalledWith('DE', 'DE-1');
  });

  it('translates the best-covered headline when no country is English-speaking', async () => {
    renderWorld([story([entry('DE', 'Warner Bros kauft Paramount', 'de'), entry('FR', 'Warner Bros rachète Paramount', 'fr')])]);
    expect(await screen.findByText('[en] Warner Bros kauft Paramount')).toBeTruthy();
  });

  it('shows no English line when it can’t translate, and a fallback when no name is shared', async () => {
    translator.available = false;
    renderWorld([story([entry('DE', 'Ein Satz', 'de'), entry('FR', 'Une phrase', 'fr')], [])]);
    await Promise.resolve();
    expect(document.querySelector('.world-english')).toBeNull();
    expect(screen.getByText('Same story')).toBeTruthy();
  });
});
