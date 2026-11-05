import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { readFileSync } from "node:fs";
import { backendMessage, initTexts, t } from "../dist/js/i18n.js";
import { deviceLabel } from "../dist/js/binds.js";

const texts = (lang) => JSON.parse(readFileSync(new URL(`../public/locales/${lang}.json`, import.meta.url), "utf8"));

test("i18n: plurals follow each language's rules", async () => {
  await initTexts("en", { en: texts("en") });
  assert.equal(t("uploaders.events", { count: 1 }), "1 event");
  assert.equal(t("uploaders.events", { count: 3 }), "3 events");
  await initTexts("fr", { fr: texts("fr"), en: texts("en") });
  assert.equal(t("uploaders.events", { count: 0 }), "0 événement");
  assert.equal(t("uploaders.events", { count: 2 }), "2 événements");
  await initTexts("ru", { ru: texts("ru"), en: texts("en") });
  assert.equal(t("odyssey.recipes", { count: 2 }), "2 рецепта");
  assert.equal(t("odyssey.recipes", { count: 5 }), "5 рецептов");
});

test("i18n: a text missing in a language falls back to English", async () => {
  await initTexts("de", { de: {}, en: texts("en") });
  assert.equal(t("common.retry"), texts("en").common.retry);
});

test("i18n: Rust error codes are shown in the app's language, other messages unchanged", async () => {
  await initTexts("fr", { fr: texts("fr"), en: texts("en") });
  assert.equal(backendMessage("fileNotFound"), "Fichier introuvable");
  assert.equal(backendMessage("network: timed out"), "Réseau : timed out");
  assert.equal(backendMessage("local-server-off"), "local-server-off");
  assert.equal(backendMessage("somethingUnknown"), "somethingUnknown");
});

test("i18n: device names from the controls data", async () => {
  await initTexts("de", { de: texts("de"), en: texts("en") });
  assert.equal(deviceLabel({ label: "Keyboard", nameKey: "keyboard", kind: "keyboard" }), "Tastatur");
  assert.equal(deviceLabel({ label: "Saitek X55", part: "throttle", kind: "joystick" }), "Saitek X55 (Schubhebel)");
  assert.equal(deviceLabel({ label: "Saitek X52", kind: "joystick" }), "Saitek X52");
});
