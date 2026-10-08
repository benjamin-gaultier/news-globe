import { vi } from 'vitest';

/**
 * Controls for the mocked lib/translate. Use in a test file with:
 *   vi.mock('../src/lib/translate', () => import('./translate-mock').then((m) => m.translateModule));
 */
export const translator = {
  /** Whether the browser has the on-device Translator API. */
  available: true,
  /** Languages with no model (translations reject, getTranslator gives null). */
  missing: new Set<string>(),
};

export const translateModule = {
  TARGET_LANGUAGE: 'en',
  get canTranslateOnDevice() {
    return translator.available;
  },
  getTranslator: vi.fn(async (lang: string) => (translator.available && !translator.missing.has(lang) ? {} : null)),
  translateText: vi.fn(async (text: string, lang: string) => {
    if (!translator.available || translator.missing.has(lang)) throw new Error('no translator');
    return `[en] ${text}`;
  }),
  translatedPageUrl: (url: string, lang: string) => `https://translate.example/?sl=${lang}&u=${encodeURIComponent(url)}`,
};

export function resetTranslator() {
  translator.available = true;
  translator.missing.clear();
  translateModule.getTranslator.mockClear();
  translateModule.translateText.mockClear();
}
