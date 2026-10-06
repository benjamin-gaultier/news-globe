/**
 * On-device headline translation through the browser's built-in Translator API
 * (Chrome 138+ desktop). The browser downloads the language model once, and
 * text never leaves the device. No translation service is involved, so the
 * pipeline stays free of LLM and paid APIs. Elsewhere the API is missing and
 * headlines stay in their original language.
 */

export const TARGET_LANGUAGE = 'en';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface BrowserTranslator {
  translate(input: string): Promise<string>;
}

interface TranslatorFactory {
  availability(opts: { sourceLanguage: string; targetLanguage: string }): Promise<Availability>;
  create(opts: { sourceLanguage: string; targetLanguage: string }): Promise<BrowserTranslator>;
}

const factory = (globalThis as { Translator?: TranslatorFactory }).Translator;

export const canTranslateOnDevice = typeof factory?.create === 'function';

const AVAILABILITY_TIMEOUT_MS = 5_000;

const translators = new Map<string, Promise<BrowserTranslator | null>>();

/**
 * One translator per source language. Call this first from a click handler:
 * a model that still has to be downloaded can only be created with a user gesture.
 */
export function getTranslator(sourceLanguage: string): Promise<BrowserTranslator | null> {
  let pending = translators.get(sourceLanguage);
  if (!pending) {
    pending = (async () => {
      if (!factory || sourceLanguage === TARGET_LANGUAGE) return null;
      const opts = { sourceLanguage, targetLanguage: TARGET_LANGUAGE };
      // Some embedded Chromium builds expose the API but never settle availability().
      const availability = await Promise.race([
        factory.availability(opts),
        new Promise<Availability>((resolve) => setTimeout(() => resolve('unavailable'), AVAILABILITY_TIMEOUT_MS)),
      ]);
      if (availability === 'unavailable') return null;
      return factory.create(opts);
    })().catch(() => null);
    translators.set(sourceLanguage, pending);
    // Not created (unsupported pair, or no user gesture yet): allow a retry later.
    void pending.then((t) => t || translators.delete(sourceLanguage));
  }
  return pending;
}

const translations = new Map<string, Promise<string>>();

/** Translated text; rejects when no translator is available so callers keep the original. */
export function translateText(text: string, sourceLanguage: string): Promise<string> {
  const key = `${sourceLanguage}\n${text}`;
  let pending = translations.get(key);
  if (!pending) {
    pending = getTranslator(sourceLanguage).then((t) => {
      if (!t) throw new Error(`No ${sourceLanguage}→${TARGET_LANGUAGE} translator`);
      return t.translate(text);
    });
    pending.catch(() => translations.delete(key));
    translations.set(key, pending);
  }
  return pending;
}

/** The publisher's page, machine-translated by Google Translate's web proxy. */
export function translatedPageUrl(url: string, sourceLanguage: string): string {
  const params = new URLSearchParams({ sl: sourceLanguage, tl: TARGET_LANGUAGE, u: url });
  return `https://translate.google.com/translate?${params}`;
}
