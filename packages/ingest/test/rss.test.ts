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

describe('parseFeed: malformed feeds', () => {
  const item = (extra = '') => `<item><title>Titre &amp; sous-titre</title><link>https://www.example.ma/a</link>
    <pubDate>Tue, 06 Oct 2026 06:30:00 GMT</pubDate>${extra}
    <enclosure url="https://img.example.ma/a.jpg" type="image/jpeg"/></item>`;

  it('repairs bare ampersands and junk before the first tag', async () => {
    const body = `\uFEFF\n Notice: undefined index\n<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
      <item><title>Q&A sur le budget</title><link>https://www.example.ma/b?x=1&y=2</link></item></channel></rss>`;
    const items = await parseFeed(body, 'https://www.example.ma/rss');
    expect(items.map((i) => [i.title, i.url])).toEqual([['Q&A sur le budget', 'https://www.example.ma/b?x=1&y=2']]);
  });

  it('unwraps escaped CDATA sections (Excélsior, Correio da Manhã)', async () => {
    const body = `<rss version="2.0"><channel><title>X</title><item>
      <title>
        &lt;![CDATA[Así terminó el medallero: México en la cima]]&gt;        </title>
      <description>&lt;![CDATA[Sumando un total de 407 preseas]]&gt;</description>
      <pubDate>Wed, 07 Oct 2026 07:02:43 -0600</pubDate>
      <link>https://www.excelsior.com.mx/nacional/a</link></item></channel></rss>`;
    const items = await parseFeed(body, 'https://www.excelsior.com.mx/rss/nacional');
    expect(items).toEqual([
      expect.objectContaining({
        title: 'Así terminó el medallero: México en la cima',
        description: 'Sumando un total de 407 preseas',
        publishedAt: '2026-10-07T13:02:43.000Z',
      }),
    ]);
  });

  it('falls back to a loose parse, keeping images', async () => {
    const body = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
      ${item('<description><iframe allowfullscreen src="x"></iframe></description>')}</channel></rss>`;
    const items = await parseFeed(body, 'https://www.example.ma/rss');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: 'Titre & sous-titre',
      url: 'https://www.example.ma/a',
      publishedAt: '2026-10-06T06:30:00.000Z',
      imageUrl: 'https://img.example.ma/a.jpg',
    });
  });
});
