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
  { code: "fr", label: "Français", locale: "fr-BE", langid: [1036, 2060, 3084, 4108] },
  { code: "en", label: "English", locale: "en-GB", langid: [1033, 2057] },
  { code: "de", label: "Deutsch", locale: "de-DE", langid: [1031, 3079, 2055] },
  { code: "es", label: "Español", locale: "es-ES", langid: [1034, 3082, 2058] },
  { code: "pt", label: "Português (Brasil)", locale: "pt-BR", langid: [1046, 2070] },
  { code: "ru", label: "Русский", locale: "ru-RU", langid: [1049] },
];

const KEY = "edch.lang";
let current: Lang = LANGS[0];
const exact = new Map<string, string>();
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

/** Best guess when nothing was chosen yet: installer language, then the OS/browser language. */
export function guessLang(installerLangId?: number | null): string {
  if (installerLangId) {
    const byId = LANGS.find((l) => l.langid.includes(installerLangId));
    if (byId) return byId.code;
  }
  for (const n of navigator.languages ?? [navigator.language]) {
    const code = n.slice(0, 2).toLowerCase();
    if (LANGS.some((l) => l.code === code)) return code;
  }
  return "en";
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function initI18n(code: string) {
  current = LANGS.find((l) => l.code === code) ?? LANGS[0];
  document.documentElement.lang = current.code;
  exact.clear();
  patterns.length = 0;
  if (current.code === "fr") return;
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
    current = LANGS[0]; // no dictionary: stay in French rather than half-translated
  }
}

/** Translates one string (trimmed match, surrounding whitespace kept). */
export function tr(text: string): string {
  if (current.code === "fr" || !text) return text;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  const core = m[2];
  if (!core) return text;
  const hit = exact.get(core);
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
  if (current.code === "fr") return;
  translateNode(root);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") translateNode(r.target);
      else if (r.type === "attributes") translateNode(r.target);
      else r.addedNodes.forEach(translateNode);
    }
  }).observe(root, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
