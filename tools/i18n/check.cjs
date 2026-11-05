// Checks the translation files against the code (run in CI: `npm run i18n:check`).
//  - every t("namespace.key") used in src/ exists in English (the reference language);
//  - every language has every English key (plural forms: at least the forms the language needs
//    or the plain key) and uses the same {{variables}};
//  - no key is left in the files that the code never uses.
// Exit code 1 when something is wrong, with the list of problems.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const LOCALES = path.join(ROOT, "public", "locales");
const LANGS = ["en", "fr", "de", "es", "pt", "ru"];
const PLURAL = /_(zero|one|two|few|many|other)$/;

const flatten = (texts) => {
  const out = new Map();
  for (const [ns, keys] of Object.entries(texts)) for (const [k, v] of Object.entries(keys)) out.set(`${ns}.${k}`, v);
  return out;
};
const load = (lang) => flatten(JSON.parse(fs.readFileSync(path.join(LOCALES, `${lang}.json`), "utf8")));
const variables = (text) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort().join(",");
const baseKey = (key) => key.replace(PLURAL, "");

/** Keys used in the code: t("ns.key"…) and t(`binds.${…}`) style prefixes. */
function usedInCode() {
  const used = new Set();
  const prefixes = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts")) {
        // Comments are left out: they may show t() examples.
        const src = fs.readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
        for (const m of src.matchAll(/\bt\(\s*"([a-z][A-Za-z0-9]*\.[A-Za-z0-9_]+)"/g)) used.add(m[1]);
        for (const m of src.matchAll(/\bt\(\s*`([a-z][A-Za-z0-9]*\.)\$\{/g)) prefixes.add(m[1]);
        // Rust error codes are looked up as "backend.<code>" (see backendMessage).
        if (src.includes("`backend.${")) prefixes.add("backend.");
      }
    }
  };
  walk(path.join(ROOT, "src"));
  return { used, prefixes };
}

const problems = [];
const en = load("en");
const enBases = new Set([...en.keys()].map(baseKey));
const { used, prefixes } = usedInCode();

for (const key of used) if (!enBases.has(key)) problems.push(`missing in en: ${key}`);
for (const key of enBases) {
  if (used.has(key) || [...prefixes].some((p) => key.startsWith(p))) continue;
  problems.push(`unused key: ${key}`);
}

for (const lang of LANGS.filter((l) => l !== "en")) {
  const texts = load(lang);
  const bases = new Set([...texts.keys()].map(baseKey));
  for (const key of enBases) if (!bases.has(key)) problems.push(`missing in ${lang}: ${key}`);
  for (const key of bases) if (!enBases.has(key)) problems.push(`not in en (${lang}): ${key}`);
  for (const [key, text] of texts) {
    const ref = en.get(key) ?? en.get(`${baseKey(key)}_other`) ?? en.get(baseKey(key));
    if (ref !== undefined && variables(ref) !== variables(text)) problems.push(`variables differ in ${lang}: ${key} ({{${variables(text)}}} vs en {{${variables(ref)}}})`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} translation problem(s)`);
  process.exit(1);
}
console.log(`translations OK: ${enBases.size} keys, ${LANGS.length} languages`);
