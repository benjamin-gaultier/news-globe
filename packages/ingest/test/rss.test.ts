import { describe, expect, it } from 'vitest';
import { parseFeed } from '../src/adapters/rss';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Test</title>
    <item>
      <title><![CDATA[L&#8217;Assemblée adopte le budget]]></title>
      <link>https://www.example.fr/politique/budget.html?xtor=RSS-1</link>
      <description><![CDATA[<p>Les députés ont <b>voté</b> le texte.</p>]]></description>
      <content:encoded><![CDATA[<p>FULL ARTICLE TEXT that must never be stored.</p>]]></content:encoded>
      <pubDate>Tue, 06 Oct 2026 08:30:00 +0200</pubDate>
      <media:content url="https://img.example.fr/small.jpg" medium="image" width="200"/>
      <media:content url="https://img.example.fr/large.jpg" medium="image" width="1200"/>
    </item>
    <item>
      <title>No link, skipped</title>
    </item>
    <item>
      <title>Enclosure image, no date</title>
      <link>https://www.example.fr/b</link>
      <enclosure url="https://img.example.fr/b.png" type="image/png" length="0"/>
    </item>
  </channel>
</rss>`;

describe('parseFeed', () => {
  it('extracts metadata only', async () => {
    const items = await parseFeed(FEED, 'https://www.example.fr/rss.xml');
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      title: 'L’Assemblée adopte le budget',
      url: 'https://www.example.fr/politique/budget.html?xtor=RSS-1',
      description: 'Les députés ont voté le texte.',
      publishedAt: '2026-10-06T06:30:00.000Z',
      imageUrl: 'https://img.example.fr/large.jpg',
    });
    expect(JSON.stringify(items)).not.toContain('FULL ARTICLE TEXT');
    expect(items[1]).toMatchObject({ imageUrl: 'https://img.example.fr/b.png', publishedAt: null, description: null });
  });
});
