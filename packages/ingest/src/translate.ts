import { COUNTRIES, SCHEMA_VERSION, type IndexFile, type TodayFile, type TranslationsFile } from '@news-globe/shared';
import type { PublishedUnit } from './derived';

/**
 * English for the headlines most people see: Today's stories, each country's
 * top story (the globe's tooltips) and the cross-border stories. The hourly
 * workflow (archive-remote.ts) translates them with Azure AI Translator's free
 * tier (2M characters a month): each headline once, remembered in KV
 * (`translate-cache`), within a monthly character budget, and publishes the
 * ones in use as `translations` (served as /data/translations.json). The site
 * shows them wherever English is asked for, on every device.
 *
 * Without the AZURE_TRANSLATOR_KEY secret nothing is translated or published,
 * and the site keeps its on-device translation and Google Translate links.
 */

/** Characters translated a month at most: under the free tier's 2M, with room for retries. */
export const MONTHLY_CHAR_BUDGET = 1_800_000;
/** A remembered translation is dropped after this many days unused. */
export const CACHE_DAYS = 14;
/** Azure accepts up to 1000 texts and 50,000 characters a request; stay well under. */
const BATCH_TEXTS = 100;
const BATCH_CHARS = 10_000;

export interface Headline {
  text: string;
  /** BCP 47 tag of the headline; English ones are skipped. */
  language: string;
}

export interface TranslateCache {
  schemaVersion: number;
  /** Characters sent this calendar month (UTC), for the budget. */
  usage: { month: string; chars: number };
  /** Original → English, with the UTC day it was last wanted. */
  entries: Record<string, { en: string; used: string }>;
}

export const emptyCache = (): TranslateCache => ({ schemaVersion: 1, usage: { month: '', chars: 0 }, entries: {} });

/** Translates texts to English, in order. Throws when the service refuses (quota, key). */
export type Translator = (texts: string[]) => Promise<string[]>;

const isEnglish = (language: string) => language.toLowerCase().split('-')[0] === 'en';

/** The headlines worth translating this run, most seen first, once each. */
export function headlinesToTranslate(today: TodayFile, index: IndexFile, units: PublishedUnit[]): Headline[] {
  const out = new Map<string, Headline>();
  const add = (text: string | undefined, language: string | undefined) => {
    const t = text?.trim();
    if (t && language && !isEnglish(language) && !out.has(t)) out.set(t, { text: t, language });
  };
  for (const s of [...today.top, ...today.rising, ...today.lasting]) add(s.title, s.language);
  for (const w of index.world ?? []) for (const c of w.countries) add(c.title, c.language);
  // Each country's top story, as its index entry and the globe's tooltip show it.
  for (const { code, clusters } of units) {
    const top = clusters[0]?.representative;
    if (COUNTRIES[code] && top) add(top.title, top.language);
  }
  return [...out.values()];
}

/** Batches of texts within Azure's per-request limits. */
function batches(texts: string[]): string[][] {
  const out: string[][] = [];
  let current: string[] = [];
  let chars = 0;
  for (const t of texts) {
    if (current.length && (current.length >= BATCH_TEXTS || chars + t.length > BATCH_CHARS)) {
      out.push(current);
      current = [];
      chars = 0;
    }
    current.push(t);
    chars += t.length;
  }
  if (current.length) out.push(current);
  return out;
}

export interface TranslateResult {
  file: TranslationsFile;
  cache: TranslateCache;
  /** Characters sent to the service this run. */
  sent: number;
  /** Whether the cache changed (and needs writing back). */
  changed: boolean;
}

/**
 * English for `headlines`: from the cache, else from `translator` while the
 * month's budget lasts. A failing service (quota, bad key) stops this run's
 * translating; whatever is cached is still published.
 */
export async function translateHeadlines(
  headlines: Headline[],
  previous: TranslateCache | null,
  translator: Translator,
  opts: { runAt: string; budget?: number; log?: (msg: string) => void },
): Promise<TranslateResult> {
  const log = opts.log ?? console.log;
  const budget = opts.budget ?? MONTHLY_CHAR_BUDGET;
  const day = opts.runAt.slice(0, 10);
  const month = opts.runAt.slice(0, 7);
  const cache: TranslateCache = previous ? structuredClone(previous) : emptyCache();
  if (cache.usage.month !== month) cache.usage = { month, chars: 0 };
  let changed = false;

  const missing: string[] = [];
  for (const { text } of headlines) {
    const hit = cache.entries[text];
    if (hit) {
      if (hit.used !== day) {
        hit.used = day;
        changed = true;
      }
    } else missing.push(text);
  }

  // Most-seen first, as far as the month's budget goes.
  const affordable: string[] = [];
  let left = budget - cache.usage.chars;
  for (const t of missing) {
    if (t.length > left) break;
    affordable.push(t);
    left -= t.length;
  }
  if (affordable.length < missing.length) log(`[translate] monthly budget reached: ${missing.length - affordable.length} headlines left untranslated`);

  let sent = 0;
  for (const batch of batches(affordable)) {
    let english: string[];
    try {
      english = await translator(batch);
    } catch (err) {
      log(`[translate] stopped: ${err instanceof Error ? err.message : String(err)}`);
      break;
    }
    const chars = batch.reduce((n, t) => n + t.length, 0);
    sent += chars;
    cache.usage.chars += chars;
    batch.forEach((text, i) => {
      const en = english[i]?.trim();
      if (en) cache.entries[text] = { en, used: day };
    });
    changed = true;
  }

  // Forget translations nobody has wanted for a while.
  const cutoff = new Date(Date.parse(`${day}T00:00:00Z`) - CACHE_DAYS * 86_400_000).toISOString().slice(0, 10);
  for (const [text, e] of Object.entries(cache.entries)) {
    if (e.used < cutoff) {
      delete cache.entries[text];
      changed = true;
    }
  }

  const items: Record<string, string> = {};
  for (const { text } of headlines) {
    const e = cache.entries[text];
    if (e && e.en !== text) items[text] = e.en;
  }
  return { file: { schemaVersion: SCHEMA_VERSION, runAt: opts.runAt, items }, cache, sent, changed };
}

export interface AzureConfig {
  key: string;
  region: string;
}

export function azureConfigFromEnv(env: NodeJS.ProcessEnv = process.env): AzureConfig | null {
  const key = env.AZURE_TRANSLATOR_KEY?.trim();
  if (!key) return null;
  const region = env.AZURE_TRANSLATOR_REGION?.trim();
  if (!region) throw new Error('AZURE_TRANSLATOR_KEY is set but AZURE_TRANSLATOR_REGION is not');
  return { key, region };
}

/** Azure AI Translator (Translator Text API v3), source language detected. */
export function azureTranslator(cfg: AzureConfig, doFetch: typeof fetch = fetch): Translator {
  return async (texts) => {
    const res = await doFetch('https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=en', {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': cfg.key,
        'Ocp-Apim-Subscription-Region': cfg.region,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(texts.map((Text) => ({ Text }))),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: { code?: number; message?: string } } | null;
      throw new Error(`Azure Translator HTTP ${res.status}${body?.error?.message ? `: ${body.error.message}` : ''}`);
    }
    const json = (await res.json()) as { translations?: { text: string }[] }[];
    return texts.map((_, i) => json[i]?.translations?.[0]?.text ?? '');
  };
}
