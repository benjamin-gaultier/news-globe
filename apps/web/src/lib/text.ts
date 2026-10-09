/** "1 outlet", "3 outlets". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** The headline and its snippet, as one text to translate. */
export const headlineText = (a: { title: string; description?: string | null }) =>
  a.description ? `${a.title}\n\n${a.description}` : a.title;
