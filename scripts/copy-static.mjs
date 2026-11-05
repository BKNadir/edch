// Copies public/ into dist/ next to the compiled TypeScript (no bundler needed).
import { copyFileSync, cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "dist"), { recursive: true });
cpSync(join(root, "public"), join(root, "dist"), { recursive: true });
// What's new after an update is read from the changelog shipped with the app.
copyFileSync(join(root, "CHANGELOG.md"), join(root, "dist", "CHANGELOG.md"));
// Vendored libraries (plain ES modules), loaded through the import map in index.html.
mkdirSync(join(root, "dist", "vendor", "i18next"), { recursive: true });
for (const file of readdirSync(join(root, "vendor", "i18next"))) {
  if (file.endsWith(".js")) copyFileSync(join(root, "vendor", "i18next", file), join(root, "dist", "vendor", "i18next", file));
}
console.log("static files copied to dist/");
