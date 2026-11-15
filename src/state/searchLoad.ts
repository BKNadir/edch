// The "results loaded per search" setting (Settings → Game and search): a search asks the sites for
// the nearest results up to this number, once; sorting them and changing page is then done here,
// without asking again. More results make a slower search, so a few choices, 500 by default.

/** Choices offered, in results. */
export const SEARCH_LOAD_CHOICES = [100, 250, 500, 1000, 2000] as const;

/** Results loaded until the setting is changed. */
export const DEFAULT_SEARCH_LOAD = 500;

/** The setting among the choices (anything else, or a missing value, gives the default). */
export function validSearchLoad(value: unknown): number {
  const number = Number(value);
  return (SEARCH_LOAD_CHOICES as readonly number[]).includes(number) ? number : DEFAULT_SEARCH_LOAD;
}
