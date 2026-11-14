// The "data age" setting (Settings → Maximum data age): for trade and system searches, data seen
// longer ago than this is left out. Old prices are of no use, so 3 months at most.

/** Choices offered, in days. */
export const DATA_AGE_CHOICES = [1, 3, 7, 14, 30, 90] as const;

/** The setting within the choices' range (a saved 0, which meant "any age", becomes the longest). */
export function validDataAge(days: unknown): number {
  const value = Math.round(Number(days));
  const longest = DATA_AGE_CHOICES[DATA_AGE_CHOICES.length - 1];
  return value >= 1 ? Math.min(value, longest) : longest;
}
