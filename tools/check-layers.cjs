// Checks that src/ follows the layer rule of docs/ARCHITECTURE.md: a module may import from its
// own layer or from layers below it, never from a layer above. Type-only imports
// (`import type …`) are allowed everywhere, since they disappear at run time.
// Run by `npm test` (and so by CI). Exit code 1 lists the imports that break the rule.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "src");

/** Lowest first. The entry point (src/boot.ts) sits above everything. */
const LAYERS = ["platform", "game", "state", "ui", "services", "features", "views", "app"];

const layerOf = (file) => {
  const top = path.relative(SRC, file).split(path.sep)[0];
  return top.endsWith(".ts") ? LAYERS.length : LAYERS.indexOf(top);
};

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith(".ts") ? [path.join(dir, e.name)] : []));

const problems = [];
for (const file of walk(SRC)) {
  const from = layerOf(file);
  if (from < 0) problems.push(`${path.relative(ROOT, file)}: not in a known layer (${LAYERS.join(", ")})`);
  const src = fs.readFileSync(file, "utf8");
  // Static imports (not "import type") and dynamic import("…").
  const specs = [
    ...[...src.matchAll(/^import\s+(?!type\s)[^;]*?from\s+"(\.[^"]+)"/gms)].map((m) => m[1]),
    ...[...src.matchAll(/^export\s+(?!type\s)[^;]*?from\s+"(\.[^"]+)"/gms)].map((m) => m[1]),
    ...[...src.matchAll(/import\(\s*"(\.[^"]+)"\s*\)/g)].map((m) => m[1]),
  ];
  for (const spec of specs) {
    const target = path.resolve(path.dirname(file), spec.replace(/\.js$/, ".ts"));
    const to = layerOf(target);
    if (to > from) problems.push(`${path.relative(ROOT, file)} (${LAYERS[from] ?? "entry"}) imports ${path.relative(ROOT, target)} (${LAYERS[to] ?? "entry"})`);
  }
}

if (problems.length) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} import(s) break the layer rule (see docs/ARCHITECTURE.md)`);
  process.exit(1);
}
console.log(`layers OK (${LAYERS.join(" < ")})`);
