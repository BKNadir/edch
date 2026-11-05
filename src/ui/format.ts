import { locale, t } from "../platform/i18n.js";

/** "in 3 hours", "2 days ago"… in the app's language. */
export function relTime(iso: string | undefined, now = Date.now()): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const diff = (ms - now) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400 * 2) return rtf.format(Math.round(diff / 3600), "hour");
  return rtf.format(Math.round(diff / 86400), "day");
}

/** "2 h 05", "45 min" */
export function duration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return t("common.min", { min });
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h >= 48) return t("time.dH", { value: Math.floor(h / 24), value2: h % 24 });
  return t("common.h", { h, padStart: String(m).padStart(2, "0") });
}

export const hoursLeft = (iso: string | undefined, now = Date.now()) => (iso ? (Date.parse(iso) - now) / 3600000 : Infinity);

/** Short credit amounts in the app's language: 1.2M, 1,2 Mio., 950K… */
export function credits(n: number): string {
  return new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: Math.abs(n) >= 1e6 ? 1 : 0 }).format(n);
}
