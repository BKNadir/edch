// Translation layer, built on i18next.
//  - App texts: t("namespace.key", { variables }) with the texts in public/locales/<lang>.json
//    (English is the reference and the fallback for any missing text).
//  - Game names (materials, modules, blueprints…): the data is in English; gameName() gives the
//    name the localized game shows, from public/locales/game.<lang>.json. Text nodes that are
//    exactly a game name are also translated as they are rendered (watchGameNames).
// The language is chosen before the app's modules load (see boot.ts), so module-level constants
// may call t(). Changing the language reloads the page.

import i18next from "#i18next";

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

/** Used when nothing was chosen (no installer choice), and for texts missing in a language. */
export const DEFAULT_LANG = "en";

const STORAGE_KEY = "edch.lang";
let current: Lang = LANGS.find((l) => l.code === DEFAULT_LANG)!;
/** The game's own names (English in the data) as the localized game shows them. */
const game = new Map<string, string>();
const gameLower = new Map<string, string>();
/** Translated game name (lower case) → English, for searches typed in the app's language. */
const gameBack = new Map<string, string>();

export const lang = () => current;
/** BCP 47 locale for numbers and dates. */
export const locale = () => current.locale;

/** Translated text for `key` ("namespace.key"), with {{variables}} filled in. */
export function t(key: string, variables?: Record<string, unknown>): string {
  return i18next.t(key, variables as any) as string;
}

/**
 * Errors from the Rust side are codes, alone or followed by a detail ("fileNotFound",
 * "network: timed out"): their text in the app's language (see "backend" in the locale files).
 * Anything else is returned unchanged.
 */
export function backendMessage(message: string): string {
  const m = /^([a-z][A-Za-z]+)(?::\s([\s\S]*))?$/.exec(message);
  if (!m || !i18next.exists(`backend.${m[1]}`)) return message;
  return t(`backend.${m[1]}`, { detail: m[2] ?? "" });
}

export function savedLang(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLang(code: string) {
  try {
    localStorage.setItem(STORAGE_KEY, code);
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

type Texts = Record<string, Record<string, string>>;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/** Starts i18next with the given texts (used directly by the tests). */
export async function initTexts(code: string, texts: Record<string, Texts>) {
  current = LANGS.find((l) => l.code === code) ?? LANGS.find((l) => l.code === DEFAULT_LANG)!;
  await i18next.init({
    lng: current.code,
    fallbackLng: DEFAULT_LANG,
    resources: Object.fromEntries(Object.entries(texts).map(([l, tr]) => [l, { translation: tr }])),
    // Texts end up in text nodes and attributes, never in innerHTML: no HTML escaping.
    interpolation: { escapeValue: false },
    returnNull: false,
    initAsync: false,
  } as any);
}

/**
 * The language to write in for someone else (Hailport speaks): `code` when EDCH has it (its
 * texts loaded on demand), else English. Returns the language used.
 */
export async function useTextsOf(code: string): Promise<string> {
  const wanted = LANGS.some((l) => l.code === code) ? code : DEFAULT_LANG;
  if (!i18next.hasResourceBundle(wanted, "translation")) {
    const texts = await fetchJson<Texts>(`locales/${wanted}.json`);
    if (!texts) return DEFAULT_LANG;
    i18next.addResourceBundle(wanted, "translation", texts, true, true);
  }
  return wanted;
}

/** Text for `key` in language `code` (loaded with useTextsOf; English when missing). */
export function tIn(code: string, key: string, variables?: Record<string, unknown>): string {
  return i18next.t(key, { ...(variables ?? {}), lng: code } as any) as string;
}

/** A game name in language `code`: translated when it is the app's language, else in English. */
export function gameNameIn(code: string, name: string): string {
  return code === current.code ? gameName(name) : name;
}

/** Loads the app texts and the game names for `code`. */
export async function initI18n(code: string) {
  const wanted = LANGS.some((l) => l.code === code) ? code : DEFAULT_LANG;
  const texts: Record<string, Texts> = {};
  const [reference, own] = await Promise.all([
    fetchJson<Texts>(`locales/${DEFAULT_LANG}.json`),
    wanted === DEFAULT_LANG ? null : fetchJson<Texts>(`locales/${wanted}.json`),
  ]);
  if (reference) texts[DEFAULT_LANG] = reference;
  if (own) texts[wanted] = own;
  await initTexts(wanted, texts);
  if (typeof document !== "undefined") document.documentElement.lang = current.code;

  game.clear();
  gameLower.clear();
  gameBack.clear();
  if (current.code !== "en") {
    const names = await fetchJson<Record<string, string>>(`locales/game.${current.code}.json`);
    for (const [en, out] of Object.entries(names ?? {})) {
      game.set(en, out);
      gameLower.set(en.toLowerCase(), out);
      if (!gameBack.has(out.toLowerCase())) gameBack.set(out.toLowerCase(), en);
    }
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

/** A text that is exactly a game name, translated (surrounding whitespace kept); other texts unchanged. */
export function gameText(text: string): string {
  if (!game.size || !text) return text;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  const hit = m[2] ? (game.get(m[2]) ?? gameLower.get(m[2].toLowerCase())) : undefined;
  return hit === undefined ? text : m[1] + hit + m[3];
}

const ATTRS = ["title", "placeholder", "aria-label", "alt"];
const done = new WeakMap<Node, string>();

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node as Text;
    if (done.get(text) === text.data) return;
    const out = gameText(text.data);
    if (out !== text.data) text.data = out;
    done.set(text, text.data);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const el = node as Element;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "TEXTAREA" || el.closest("[data-no-tr]"))
    return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) {
      const out = gameText(v);
      if (out !== v) el.setAttribute(a, out);
    }
  }
  for (const child of Array.from(el.childNodes)) translateNode(child);
}

/**
 * Shows game names (English in the data) as the localized game does, under `root`, now and
 * whenever it changes. Only texts that are exactly a known game name are touched; app texts go
 * through t(). Nothing to do in English. `data-no-tr` keeps a subtree as it is.
 */
export function watchGameNames(root: Node) {
  if (!game.size) return;
  translateNode(root);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData" || r.type === "attributes") translateNode(r.target);
      else r.addedNodes.forEach(translateNode);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
