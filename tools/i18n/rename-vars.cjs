// Renames a {{variable}} of one key in every locale file and in its t() calls in src/.
//   node tools/i18n/rename-vars.cjs namespace.key old=new [old2=new2 …]
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const LOCALES = path.join(ROOT, "public", "locales");
const [fullKey, ...pairs] = process.argv.slice(2);
const [ns, key] = fullKey.split(".");
const renames = pairs.map((p) => p.split("="));

for (const file of fs.readdirSync(LOCALES).filter((f) => /^[a-z]{2}\.json$/.test(f))) {
  const texts = JSON.parse(fs.readFileSync(path.join(LOCALES, file), "utf8"));
  for (const k of Object.keys(texts[ns] ?? {})) {
    // The key itself and its plural forms (key_one, key_other…).
    if (k !== key && !k.startsWith(`${key}_`)) continue;
    for (const [from, to] of renames) texts[ns][k] = texts[ns][k].split(`{{${from}}}`).join(`{{${to}}}`);
  }
  fs.writeFileSync(path.join(LOCALES, file), JSON.stringify(texts, null, 2) + "\n");
}

const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : [],
    );
const call = new RegExp(`t\\("${fullKey.replace(".", "\\.")}", \\{([^}]*)\\}`, "g");
for (const file of walk(path.join(ROOT, "src"))) {
  const src = fs.readFileSync(file, "utf8");
  const out = src.replace(call, (whole, props) => {
    let p = props;
    for (const [from, to] of renames) {
      // "from: expr" → "to: expr"; shorthand "from" → "to: from".
      p = p
        .replace(new RegExp(`(^|,)(\\s*)${from}(\\s*):`), `$1$2${to}$3:`)
        .replace(new RegExp(`(^|,)(\\s*)${from}(\\s*)(?=,|$)`), `$1$2${to}: ${from}$3`);
    }
    return `t("${fullKey}", {${p}}`;
  });
  if (out !== src) fs.writeFileSync(file, out);
}
