import { useEffect, useState } from 'react';
import { canTranslateOnDevice, TARGET_LANGUAGE, translateText } from '../lib/translate';

/**
 * `text` translated to English when `enabled`, otherwise (or until the
 * translation arrives, or if it fails) the original. `translated` says which.
 */
export function useTranslated(
  text: string | null,
  sourceLanguage: string,
  enabled: boolean,
): { text: string | null; translated: boolean } {
  const active = enabled && canTranslateOnDevice && !!text && sourceLanguage !== TARGET_LANGUAGE;
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

  return active && result?.from === text ? { text: result.to, translated: true } : { text, translated: false };
}
