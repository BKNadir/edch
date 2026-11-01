// Colour themes: a few presets, free colour pickers and a global OLED (pure black) mode.
// Applied as CSS variables on <html>; the phone receives the same settings from the PC.

export interface ThemeSettings {
  /** Preset id, or "custom" once a colour was picked by hand. */
  preset: string;
  accent: string;
  cyan: string;
  bg: string;
  /** Pure black background and panels (OLED screens). */
  oled: boolean;
}

export const PRESETS: { id: string; label: string; accent: string; cyan: string; bg: string }[] = [
  { id: "elite", label: "Elite (d'origine)", accent: "#ff7a18", cyan: "#5cc8e8", bg: "#0a0c0f" },
  { id: "blue", label: "Bleu", accent: "#4da3ff", cyan: "#7fe0d2", bg: "#090c12" },
  { id: "green", label: "Vert", accent: "#3ddc84", cyan: "#5cc8e8", bg: "#090d0b" },
  { id: "purple", label: "Violet", accent: "#b07cff", cyan: "#ff7ad9", bg: "#0c0a10" },
  { id: "red", label: "Rouge", accent: "#ff4d4d", cyan: "#ffb347", bg: "#0f0909" },
  { id: "contrast", label: "Contraste élevé", accent: "#ffd400", cyan: "#00e5ff", bg: "#000000" },
];

export const DEFAULT_THEME: ThemeSettings = { preset: "elite", accent: "#ff7a18", cyan: "#5cc8e8", bg: "#0a0c0f", oled: false };

const HEX = /^#[0-9a-f]{6}$/i;
const safe = (c: string, fallback: string) => (HEX.test(c) ? c : fallback);

let last = "";

export function applyTheme(t: ThemeSettings) {
  const key = JSON.stringify(t);
  if (key === last) return;
  last = key;
  const accent = safe(t.accent, DEFAULT_THEME.accent);
  const cyan = safe(t.cyan, DEFAULT_THEME.cyan);
  const bg = t.oled ? "#000000" : safe(t.bg, DEFAULT_THEME.bg);
  const mix = (pct: number) => `color-mix(in srgb, ${bg}, #9fb4cc ${pct}%)`;
  const vars: Record<string, string> = {
    "--accent": accent,
    "--accent-dim": `color-mix(in srgb, ${accent} 14%, transparent)`,
    "--accent-line": `color-mix(in srgb, ${accent} 42%, transparent)`,
    "--accent-soft": `color-mix(in srgb, ${accent} 62%, #ffffff)`,
    "--cyan": cyan,
    "--cyan-dim": `color-mix(in srgb, ${cyan} 12%, transparent)`,
    "--bg": bg,
    "--panel": t.oled ? "#000000" : mix(5),
    "--panel-inset": t.oled ? "#000000" : mix(3),
    "--panel-2": t.oled ? "#07080a" : mix(8),
    "--line": t.oled ? "#1a1e24" : mix(14),
    "--line-2": t.oled ? "#252b33" : mix(19),
  };
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  root.classList.toggle("oled", t.oled);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
}
