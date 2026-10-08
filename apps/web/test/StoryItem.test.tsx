// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoryCluster } from '@news-globe/shared';
import { StoryItem } from '../src/components/StoryItem';
import { article, cluster, minutesAgo, NOW } from './fixtures';
import { resetTranslator, translator } from './translate-mock';

vi.mock('../src/lib/translate', () => import('./translate-mock').then((m) => m.translateModule));

beforeEach(resetTranslator);

function renderStory(c: StoryCluster, english = false) {
  const onOpen = vi.fn();
  const onOpenStoryIn = vi.fn();
  render(
    <ul>
      <StoryItem cluster={c} now={NOW} english={english} onOpen={onOpen} onOpenStoryIn={onOpenStoryIn} />
    </ul>,
  );
  return { onOpen, onOpenStoryIn, item: screen.getAllByRole('listitem')[0]! };
}

describe('StoryItem', () => {
  it('links the headline to the publisher in a new tab, with outlet, time and snippet', () => {
    const rep = article({ title: 'Le budget adopté', description: 'Les députés ont voté.', publishedAt: minutesAgo(120) });
    renderStory(cluster(rep));

    const link = screen.getByRole('link', { name: 'Le budget adopté' });
    expect(link.getAttribute('href')).toBe(rep.url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link.getAttribute('lang')).toBe('fr');
    expect(screen.getByText('Le Monde')).toBeTruthy();
    expect(screen.getByText('2 hours ago').getAttribute('datetime')).toBe(rep.publishedAt);
    expect(screen.getByText('Les députés ont voté.').getAttribute('lang')).toBe('fr');
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Story details']);
    expect(screen.queryByRole('link', { name: /Read in English/ })).toBeNull();
  });

  it('shows the image until it fails to load', () => {
    const { item } = renderStory(cluster(article({ imageUrl: 'https://img.example/a.jpg' })));
    const img = item.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://img.example/a.jpg');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    fireEvent.error(img);
    expect(item.querySelector('img')).toBeNull();
  });

  it('opens the story page from its other sources', async () => {
    const related = [article({ source: { id: 'figaro', name: 'Le Figaro' } }), article({ source: { id: 'liberation', name: 'Libération' } })];
    const { onOpen } = renderStory(cluster(article(), related));
    // The other outlets are on the story page, not in the list.
    expect(screen.queryByText('Le Figaro')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: '+2 other sources' }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('says "source" for a single other outlet', () => {
    renderStory(cluster(article(), [article()]));
    expect(screen.getByRole('button', { name: '+1 other source' })).toBeTruthy();
  });

  it('links to the same story in other countries, skipping unknown codes', async () => {
    const { onOpenStoryIn, item } = renderStory(
      cluster(article(), [], { alsoIn: [{ code: 'DE', clusterId: 'x' }, { code: 'ZZ', clusterId: 'y' }, { code: 'CL', clusterId: 'z' }] }),
    );
    expect(screen.getByText('Also in')).toBeTruthy();
    const also = item.querySelector('.story-also') as HTMLElement;
    expect(within(also).getAllByRole('button').map((b) => b.textContent)).toEqual(['Germany', 'Chile']);
    await userEvent.click(screen.getByRole('button', { name: 'Chile' }));
    expect(onOpenStoryIn).toHaveBeenCalledWith('CL', 'z');
  });

  it('in English, shows translated text with the original as a tooltip and a translated-page link', async () => {
    const rep = article({ title: 'Le budget adopté', description: 'Les députés ont voté.' });
    renderStory(cluster(rep), true);

    const link = await screen.findByRole('link', { name: '[en] Le budget adopté' });
    expect(link.getAttribute('href')).toBe(rep.url);
    expect(link.getAttribute('lang')).toBe('en');
    expect(link.getAttribute('title')).toBe('Le budget adopté');
    expect((await screen.findByText('[en] Les députés ont voté.')).getAttribute('lang')).toBe('en');
    expect(screen.getByRole('link', { name: 'Read in English ↗' }).getAttribute('href')).toContain('sl=fr');
  });

  it('keeps the original when no translator is available', async () => {
    translator.missing.add('fr');
    renderStory(cluster(article({ title: 'Le budget adopté' })), true);
    await Promise.resolve();
    const link = screen.getByRole('link', { name: 'Le budget adopté' });
    expect(link.getAttribute('title')).toBeNull();
    // The publisher's page can still be read through the web translator.
    expect(screen.getByRole('link', { name: 'Read in English ↗' })).toBeTruthy();
  });

  it('never offers to translate English', () => {
    renderStory(cluster(article({ language: 'en', title: 'Budget passes' })), true);
    expect(screen.getByRole('link', { name: 'Budget passes' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Read in English/ })).toBeNull();
  });
});

describe('StoryItem trends', () => {
  const trendOf = (state: 'new' | 'rising' | null, ranks: (number | null)[]) => ({ ranks, firstSeen: minutesAgo(60), state });

  it('badges new and rising stories', () => {
    render(
      <ul>
        <StoryItem cluster={cluster(article())} now={NOW} english={false} onOpen={vi.fn()} onOpenStoryIn={vi.fn()} trend={trendOf('new', [null, 3])} />
        <StoryItem cluster={cluster(article())} now={NOW} english={false} onOpen={vi.fn()} onOpenStoryIn={vi.fn()} trend={trendOf('rising', [7, 2])} />
      </ul>,
    );
    expect(screen.getByText('New')).toBeTruthy();
    expect(screen.getByText('↑ Rising')).toBeTruthy();
  });

  it('draws the rank history, gaps included, once there are two ranked runs', () => {
    render(
      <ul>
        <StoryItem cluster={cluster(article())} now={NOW} english={false} onOpen={vi.fn()} onOpenStoryIn={vi.fn()} trend={trendOf(null, [2, null, 3, 1])} />
        <StoryItem cluster={cluster(article())} now={NOW} english={false} onOpen={vi.fn()} onOpenStoryIn={vi.fn()} trend={trendOf(null, [null, 5])} />
      </ul>,
    );
    const imgs = screen.getAllByRole('img');
    expect(imgs.map((i) => i.getAttribute('aria-label'))).toEqual(["Rank over today's runs: #2, unranked, #3, #1"]);
    // Two pieces either side of the gap: a lone point, then a line.
    expect(imgs[0]!.querySelectorAll('polyline')).toHaveLength(1);
    expect(screen.queryByText('New')).toBeNull();
  });
});
