// Control labels follow the EDCH UI locale; the underlying game bindings do not change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./i18n-setup.mjs";
import { actionName, englishActionName, parseBinds, setActionNamesForLocale } from "../dist/js/features/controls/binds.js";
import { DEMO_BINDS } from "../dist/js/game/demo.js";

const meta = JSON.parse(readFileSync(new URL("../public/data/binds.json", import.meta.url), "utf8"));
const french = JSON.parse(readFileSync(new URL("../public/data/binds.fr.json", import.meta.url), "utf8"));

test("Controls: labels follow the EDCH interface language automatically", () => {
  const original = parseBinds(DEMO_BINDS).binds;
  setActionNamesForLocale("fr", french);
  assert.equal(actionName(meta, "LandingGearToggle"), "Train d'atterrissage");
  assert.equal(actionName(meta, "HumanoidReloadButton"), "Recharger");
  assert.equal(actionName(meta, "GalaxyMapOpen"), "Carte galactique");
  assert.equal(actionName(meta, "UnknownFutureControl"), englishActionName(meta, "UnknownFutureControl"));

  setActionNamesForLocale("en", french);
  assert.equal(actionName(meta, "LandingGearToggle"), "Landing Gear");
  setActionNamesForLocale("de", french);
  assert.equal(actionName(meta, "HumanoidReloadButton"), "Reload");

  assert.deepEqual(parseBinds(DEMO_BINDS).binds, original);
});

test("Controls: all known action IDs have French display names", () => {
  assert.deepEqual(Object.keys(meta.controls).filter((action) => !french[action]?.trim()), []);
});
