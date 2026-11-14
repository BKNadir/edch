// Settings of the BGS page: the minor faction you follow.

/** The BGS page's settings, saved with the others (state/store.ts). */
export interface BgsSettings {
  /** The minor faction followed on the BGS page (as the game writes it); empty: none chosen yet. */
  faction: string;
}

export const DEFAULT_BGS: BgsSettings = { faction: "" };

/** The settings as saved, checked: a faction name is a short line of text. */
export function validBgsSettings(value: unknown): BgsSettings {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const faction = typeof saved.faction === "string" ? saved.faction.trim() : "";
  return { faction: faction.length <= 120 && !/[\u0000-\u001f]/.test(faction) ? faction : "" };
}
