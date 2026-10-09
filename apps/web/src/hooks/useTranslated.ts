import { useEffect, useState } from 'react';
import { canTranslateOnDevice, TARGET_LANGUAGE, translateText } from '../lib/translate';
import { useServerTranslation } from '../lib/translations';

/**
 * `text` translated to English when `enabled`, otherwise (or until the
 * translation arrives, or if it fails) the original. `translated` says which.
 * The hourly workflow's translation (translations.json) comes first, on any
 * device; else the browser's on-device translator, where there is one.
 */
export function useTranslated(text: string | null, sourceLanguage: string, enabled: boolean): { text: string | null; translated: boolean } {
  const wanted = enabled && !!text && sourceLanguage !== TARGET_LANGUAGE;
  const server = useServerTranslation(wanted ? text : null);
  const active = wanted && !server && canTranslateOnDevice;
  const [result, setResult] = useState<{ from: string; to: string } | null>(null);

  useEffect(() => {
    if (!active || !text) return;
    let cancelled = false;
    translateText(text, sourceLanguage).then(
      (to) => !cancelled && setResult({ from: text, to }),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [active, text, sourceLanguage]);

  if (server) return { text: server, translated: true };
  return active && result?.from === text ? { text: result.to, translated: true } : { text, translated: false };
}
