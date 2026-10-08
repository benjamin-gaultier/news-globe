import { afterEach, describe, expect, it, vi } from 'vitest';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

/** Load translate.ts against a fresh (or absent) browser Translator API. */
async function load(factory?: { availability: (o: unknown) => Promise<Availability>; create: (o: unknown) => Promise<unknown> }) {
  vi.resetModules();
  vi.stubGlobal('Translator', factory);
  return import('../src/lib/translate');
}

function fakeFactory(availability: Availability = 'available') {
  const translate = vi.fn(async (text: string) => `EN:${text}`);
  return {
    translate,
    availability: vi.fn(async () => availability),
    create: vi.fn(async () => ({ translate })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('translate', () => {
  it('reports no on-device translation without the Translator API', async () => {
    const t = await load(undefined);
    expect(t.canTranslateOnDevice).toBe(false);
    expect(await t.getTranslator('fr')).toBeNull();
    await expect(t.translateText('Bonjour', 'fr')).rejects.toThrow('No fr→en translator');
  });

  it('translates, creating one translator per language and caching each text', async () => {
    const factory = fakeFactory();
    const t = await load(factory);
    expect(t.canTranslateOnDevice).toBe(true);

    expect(await t.translateText('Bonjour', 'fr')).toBe('EN:Bonjour');
    expect(await t.translateText('Bonjour', 'fr')).toBe('EN:Bonjour');
    expect(await t.translateText('Salut', 'fr')).toBe('EN:Salut');

    expect(factory.create).toHaveBeenCalledOnce();
    expect(factory.create).toHaveBeenCalledWith({ sourceLanguage: 'fr', targetLanguage: 'en' });
    expect(factory.translate).toHaveBeenCalledTimes(2);
  });

  it('never translates English into English', async () => {
    const factory = fakeFactory();
    const t = await load(factory);
    expect(await t.getTranslator('en')).toBeNull();
    expect(factory.availability).not.toHaveBeenCalled();
  });

  it('gives up on an unavailable pair, and retries it later', async () => {
    const factory = fakeFactory('unavailable');
    const t = await load(factory);

    await expect(t.translateText('Hallo', 'de')).rejects.toThrow('No de→en translator');
    await Promise.resolve();
    factory.availability.mockResolvedValue('downloadable');

    expect(await t.translateText('Hallo', 'de')).toBe('EN:Hallo');
    expect(factory.availability).toHaveBeenCalledTimes(2);
  });

  it('treats a failed create (no user gesture yet) as no translator', async () => {
    const factory = fakeFactory();
    factory.create.mockRejectedValueOnce(new Error('NotAllowedError'));
    const t = await load(factory);
    expect(await t.getTranslator('it')).toBeNull();
  });

  it('times out an availability check that never settles', async () => {
    vi.useFakeTimers();
    const factory = fakeFactory();
    factory.availability.mockReturnValue(new Promise(() => {}));
    const t = await load(factory);

    const pending = t.getTranslator('ja');
    await vi.advanceTimersByTimeAsync(5_000);

    expect(await pending).toBeNull();
    expect(factory.create).not.toHaveBeenCalled();
  });

  it('links to the publisher page through Google Translate', async () => {
    const t = await load(undefined);
    expect(t.translatedPageUrl('https://lemonde.fr/a?b=1&c=2', 'fr')).toBe(
      'https://translate.google.com/translate?sl=fr&tl=en&u=https%3A%2F%2Flemonde.fr%2Fa%3Fb%3D1%26c%3D2',
    );
  });
});
