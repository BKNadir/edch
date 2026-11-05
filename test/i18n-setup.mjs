// Loads the French and English texts before the app modules run, as boot.ts does in the app.
import { readFileSync } from "node:fs";
import { initTexts } from "../dist/js/i18n.js";

const texts = (lang) => JSON.parse(readFileSync(new URL(`../public/locales/${lang}.json`, import.meta.url), "utf8"));
await initTexts("fr", { fr: texts("fr"), en: texts("en") });
