// Moves or renames translation keys in every locale file and in src/.
//   node tools/i18n/rename-keys.cjs old.key=new.key [old.key2=new.key2 …]
// Keeps the files sorted. Used while tidying the keys produced by the migration.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const LOCALES = path.join(ROOT, "public", "locales");
const pairs = process.argv.slice(2).map((a) => a.split("="));

const sortDeep = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, typeof o[k] === "object" ? sortDeep(o[k]) : o[k]]));

for (const file of fs.readdirSync(LOCALES).filter((f) => /^[a-z]{2}\.json$/.test(f))) {
  const texts = JSON.parse(fs.readFileSync(path.join(LOCALES, file), "utf8"));
  for (const [from, to] of pairs) {
    const [fns, fk] = from.split(".");
    const [tns, tk] = to.split(".");
    const value = texts[fns]?.[fk];
    if (value === undefined) continue;
    delete texts[fns][fk];
    if (!Object.keys(texts[fns]).length) delete texts[fns];
    (texts[tns] ??= {})[tk] = value;
  }
  fs.writeFileSync(path.join(LOCALES, file), JSON.stringify(sortDeep(texts), null, 2) + "\n");
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));
for (const file of walk(path.join(ROOT, "src"))) {
  let src = fs.readFileSync(file, "utf8");
  const before = src;
  for (const [from, to] of pairs) src = src.split(`"${from}"`).join(`"${to}"`);
  if (src !== before) fs.writeFileSync(file, src);
}
