// Copies public/ into dist/ next to the compiled TypeScript (no bundler needed).
import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "dist"), { recursive: true });
cpSync(join(root, "public"), join(root, "dist"), { recursive: true });
// What's new after an update is read from the changelog shipped with the app.
copyFileSync(join(root, "CHANGELOG.md"), join(root, "dist", "CHANGELOG.md"));
console.log("static files copied to dist/");
