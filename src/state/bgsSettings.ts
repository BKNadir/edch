// Settings of the BGS page: the minor faction you follow, and when a system's data counts as old.

/** The BGS page's settings, saved with the others (state/store.ts). */
export interface BgsSettings {
  /** The minor faction followed on the BGS page (as the game writes it); empty: none chosen yet. */
  faction: string;
  /** Days after which a system's newest data is marked as old (overview and systems table). */
  staleDays: number;
}

/** Choices offered for `staleDays`. */
export const STALE_DAY_CHOICES = [1, 2, 3, 5, 7, 14] as const;

export const DEFAULT_BGS: BgsSettings = { faction: "", staleDays: 3 };

/** The settings as saved, checked: a faction name is a short line of text. */
export function validBgsSettings(value: unknown): BgsSettings {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const faction = typeof saved.faction === "string" ? saved.faction.trim() : "";
  const staleDays = (STALE_DAY_CHOICES as readonly number[]).includes(Number(saved.staleDays))
    ? Number(saved.staleDays)
    : DEFAULT_BGS.staleDays;
  return { faction: faction.length <= 120 && !/[\u0000-\u001f]/.test(faction) ? faction : "", staleDays };
}
