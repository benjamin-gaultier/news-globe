import { createContext, useContext } from 'react';

/**
 * English for the most-seen headlines, translated by the hourly workflow
 * (translations.json; see packages/ingest/src/translate.ts). Empty until it
 * loads, and when the workflow has no translator configured.
 */
export const TranslationsContext = createContext<ReadonlyMap<string, string>>(new Map());

/** The workflow's English for `text`, if it has one. */
export function useServerTranslation(text: string | null | undefined): string | undefined {
  const translations = useContext(TranslationsContext);
  return text ? translations.get(text.trim()) : undefined;
}
