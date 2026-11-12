// The settings a phone may change on the PC, and the check of what a phone sends: only those
// settings, each of the kind it already has. A paired phone is trusted, but what reaches the PC's
// settings is still checked field by field.

import type { Settings } from "./store.js";
import { DEFAULT_THEME, validTheme } from "./themeSettings.js";

/** Settings a phone can change (display only: never keys, paths or the PC's behaviour). */
export const PHONE_SETTINGS = [
  "theme",
  "hiddenViews",
  "uiScale",
  "startView",
  "systemOpensNav",
  "notify",
  "mining",
  "copyOnPhone",
  "kbLayout",
  "kbFormat",
  "engineers",
  "navAutoCopy",
  "navNotifyCopy",
  "copyOnGameFocus",
  "navExact",
] as const;

/** Whether `value` has the same kind as `current` (string, number, true/false, list or object). */
function sameKind(value: unknown, current: unknown): boolean {
  // A setting not set yet: any plain value.
  if (current === undefined) return ["string", "boolean"].includes(typeof value) || Number.isFinite(value);
  if (Array.isArray(current)) return Array.isArray(value);
  if (current && typeof current === "object")
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  return typeof value === typeof current && (typeof value !== "number" || Number.isFinite(value));
}

/**
 * The part of a phone's settings change the PC accepts: only PHONE_SETTINGS, each of the same kind
 * as the setting it replaces; for a group of settings, only its known fields of the same kind.
 * The theme's colours are checked one by one.
 */
export function validPhoneSettings(patch: Record<string, unknown>, settings: Settings): Partial<Settings> {
  const accepted: Record<string, unknown> = {};
  const current = settings as unknown as Record<string, unknown>;
  for (const key of PHONE_SETTINGS) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (key === "theme") {
      accepted.theme = { ...DEFAULT_THEME, ...settings.theme, ...validTheme(value) };
      continue;
    }
    if (!sameKind(value, current[key])) continue;
    if (Array.isArray(value)) {
      // Lists of page names and the like: short strings only.
      accepted[key] = value.filter((item) => typeof item === "string" && item.length <= 64).slice(0, 200);
    } else if (value && typeof value === "object") {
      const group = current[key] as Record<string, unknown>;
      const fields = Object.fromEntries(
        Object.entries(value).filter(([field, fieldValue]) => field in group && sameKind(fieldValue, group[field])),
      );
      accepted[key] = { ...group, ...fields };
    } else if (typeof value === "string") {
      if (value.length <= 200) accepted[key] = value;
    } else accepted[key] = value;
  }
  return accepted as Partial<Settings>;
}
