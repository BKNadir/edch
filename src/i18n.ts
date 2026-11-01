// Translation layer. The UI is written in French; for other languages every text node and
// a few attributes are translated as they are rendered, from public/locales/<lang>.json
// (French text → translation). Entries may contain {0}, {1}… placeholders; captured values
// are translated too when they have their own entry.

export interface Lang {
  code: string;
  label: string;
  locale: string;
  /** Windows LANGID of the installer language (NSIS), for the first-run default. */
  langid: number[];
}

export const LANGS: Lang[] = [
  { code: "en", label: "English", locale: "en-GB", langid: [1033, 2057] },
  { code: "fr", label: "Français", locale: "fr-BE", langid: [1036, 2060, 3084, 4108] },
  { code: "de", label: "Deutsch", locale: "de-DE", langid: [1031, 3079, 2055] },
  { code: "es", label: "Español", locale: "es-ES", langid: [1034, 3082, 2058] },
  { code: "pt", label: "Português (Brasil)", locale: "pt-BR", langid: [1046, 2070] },
  { code: "ru", label: "Русский", locale: "ru-RU", langid: [1049] },
];

/** The UI is written in French; this is the language that needs no dictionary. */
const SOURCE = "fr";
/** Used when nothing was chosen (no installer choice). */
export const DEFAULT_LANG = "en";

const KEY = "edch.lang";
let current: Lang = LANGS.find((l) => l.code === SOURCE)!;
const exact = new Map<string, string>();
/** The game's own names (English in the data) as the localized game shows them. */
const game = new Map<string, string>();
const gameLower = new Map<string, string>();
/** Translated game name (lower case) → English, for searches typed in the app's language. */
const gameBack = new Map<string, string>();
const patterns: { re: RegExp; out: string }[] = [];

export const lang = () => current;
/** BCP 47 locale for numbers and dates. */
export const locale = () => current.locale;

export function savedLang(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveLang(code: string) {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* falls back to the default next time */
  }
}

/** Default when nothing was chosen yet: the installer language if any, else English. */
export function guessLang(installerLangId?: number | null): string {
  if (installerLangId) {
    const byId = LANGS.find((l) => l.langid.includes(installerLangId));
    if (byId) return byId.code;
  }
  return DEFAULT_LANG;
}

/** The device's own language when it is one of ours (phones), else English. */
export function browserLang(): string {
  const wanted = typeof navigator !== "undefined" ? [...(navigator.languages ?? []), navigator.language] : [];
  for (const w of wanted) {
    const code = (w ?? "").toLowerCase().split("-")[0];
    if (LANGS.some((l) => l.code === code)) return code;
  }
  return DEFAULT_LANG;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function initI18n(code: string) {
  current = LANGS.find((l) => l.code === code) ?? LANGS.find((l) => l.code === DEFAULT_LANG)!;
  document.documentElement.lang = current.code;
  exact.clear();
  game.clear();
  gameLower.clear();
  gameBack.clear();
  patterns.length = 0;
  if (current.code !== "en") {
    try {
      const res = await fetch(`locales/game.${current.code}.json`);
      const dict: Record<string, string> = await res.json();
      for (const [en, out] of Object.entries(dict)) {
        game.set(en, out);
        gameLower.set(en.toLowerCase(), out);
        if (!gameBack.has(out.toLowerCase())) gameBack.set(out.toLowerCase(), en);
      }
    } catch {
      /* game names stay in English */
    }
  }
  if (current.code === SOURCE) return;
  try {
    const res = await fetch(`locales/${current.code}.json`);
    const dict: Record<string, string> = await res.json();
    for (const [fr, out] of Object.entries(dict)) {
      if (!out) continue;
      if (/\{\d+\}/.test(fr)) {
        const re = new RegExp(`^${fr.split(/(\{\d+\})/).map((p) => (/^\{\d+\}$/.test(p) ? "([\\s\\S]*?)" : escapeRe(p))).join("")}$`);
        const order = [...fr.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
        // Rewrite the output's {n} to the capture group index of that placeholder.
        const remapped = out.replace(/\{(\d+)\}/g, (_, n) => `{${order.indexOf(Number(n))}}`);
        patterns.push({ re, out: remapped });
      } else exact.set(fr, out);
    }
    // Longer patterns first: more specific.
    patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  } catch {
    current = LANGS.find((l) => l.code === SOURCE)!; // no dictionary: show the source text rather than half-translated
  }
}

/** A game name (material, module, blueprint, effect…) as the localized game shows it. */
export function gameName(name: string): string {
  return game.get(name) ?? gameLower.get(name.toLowerCase()) ?? name;
}

/** The English game name behind a name typed in the app's language (unchanged if unknown). */
export function gameEnglish(text: string): string {
  return gameBack.get(text.trim().toLowerCase()) ?? text;
}

/** Text reduced for searching: no accents, no case, apostrophes unified, punctuation as spaces. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[^\p{L}\p{N}']+/gu, " ")
    .trim();
}

/** Does a game name match a search, in English or in the current language (accents and case ignored)? */
export function nameMatches(name: string, query: string): boolean {
  const q = fold(query);
  return !q || fold(name).includes(q) || fold(gameName(name)).includes(q);
}

/**
 * The game name (English) meant by what was typed, among `candidates` (English names): exact
 * match first, in English or in the app's language, accents and case ignored, then the only name
 * that starts with the text, then the only one that contains it. `suggestions` when it's ambiguous.
 */
export function resolveGameName(typed: string, candidates: string[]): { name?: string; suggestions: string[] } {
  const q = fold(typed);
  if (!q) return { suggestions: [] };
  const forms = candidates.map((c) => ({ c, f: [fold(c), fold(gameName(c))] }));
  const exact = forms.find((x) => x.f.includes(q));
  if (exact) return { name: exact.c, suggestions: [] };
  const back = gameBack.get(typed.trim().toLowerCase());
  if (back && candidates.includes(back)) return { name: back, suggestions: [] };
  const tiers = [
    forms.filter((x) => x.f.some((f) => f.startsWith(q))),
    forms.filter((x) => x.f.some((f) => f.split(" ").some((w) => w.startsWith(q)) || f.includes(` ${q}`))),
    forms.filter((x) => x.f.some((f) => f.includes(q))),
  ];
  for (const tier of tiers) {
    if (tier.length === 1) return { name: tier[0].c, suggestions: [] };
    if (tier.length > 1) return { suggestions: tier.slice(0, 8).map((x) => x.c) };
  }
  return { suggestions: [] };
}

/** Translates one string (trimmed match, surrounding whitespace kept). */
export function tr(text: string): string {
  if (!text || (current.code === SOURCE && !game.size)) return text;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  const core = m[2];
  if (!core) return text;
  const hit = exact.get(core) ?? game.get(core) ?? gameLower.get(core.toLowerCase());
  if (hit !== undefined) return m[1] + hit + m[3];
  for (const p of patterns) {
    const r = p.re.exec(core);
    if (r) return m[1] + p.out.replace(/\{(\d+)\}/g, (_, i) => tr(r[Number(i) + 1] ?? "")) + m[3];
  }
  return text;
}

const ATTRS = ["title", "placeholder", "aria-label", "alt"];
const done = new WeakMap<Node, string>();

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const t = node as Text;
    if (done.get(t) === t.data) return;
    const out = tr(t.data);
    if (out !== t.data) t.data = out;
    done.set(t, t.data);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "TEXTAREA" || el.closest("[data-no-tr]")) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) {
      const out = tr(v);
      if (out !== v) el.setAttribute(a, out);
    }
  }
  for (const child of Array.from(el.childNodes)) translateNode(child);
}

/** Translates everything under `root` now and whenever it changes. */
export function watchTranslations(root: Node) {
  if (current.code === SOURCE && !game.size) return;
  translateNode(root);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") translateNode(r.target);
      else if (r.type === "attributes") translateNode(r.target);
      else r.addedNodes.forEach(translateNode);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
