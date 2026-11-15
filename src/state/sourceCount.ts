// The "systems shown per source" setting (Settings → Game and search): a material's page lists,
// for each way to get it (a kind of system, station or body), only the nearest few places, so the
// page stays short. A few choices, 5 by default.

/** Choices offered, in places per source. */
export const SOURCE_COUNT_CHOICES = [3, 5, 10] as const;

/** Places shown until the setting is changed. */
export const DEFAULT_SOURCE_COUNT = 5;

/** The setting among the choices (anything else, or a missing value, gives the default). */
export function validSourceCount(value: unknown): number {
  const number = Number(value);
  return (SOURCE_COUNT_CHOICES as readonly number[]).includes(number) ? number : DEFAULT_SOURCE_COUNT;
}
