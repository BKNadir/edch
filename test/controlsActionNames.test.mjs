// Control action names in EDCH's language: each language with a file of names
// (public/data/binds.<code>.json) names every action, other languages and unknown actions fall
// back to English, and the game's bindings never change.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./i18n-setup.mjs";
import {
  ACTION_NAME_LANGUAGES,
  actionName,
  englishActionName,
  parseBinds,
  setActionNames,
} from "../dist/js/features/controls/binds.js";
import { DEMO_BINDS } from "../dist/js/game/demo.js";

const meta = JSON.parse(readFileSync(new URL("../public/data/binds.json", import.meta.url), "utf8"));
const namesOf = (code) =>
  JSON.parse(readFileSync(new URL(`../public/data/binds.${code}.json`, import.meta.url), "utf8"));

test("Controls: action names follow EDCH's language, English otherwise", () => {
  const original = parseBinds(DEMO_BINDS).binds;
  setActionNames(namesOf("fr"));
  assert.equal(actionName(meta, "LandingGearToggle"), "Train d'atterrissage");
  assert.equal(actionName(meta, "FireChaffLauncher"), "Lanceur de paillettes");
  assert.equal(actionName(meta, "UnknownFutureControl"), englishActionName(meta, "UnknownFutureControl"));
  setActionNames({});
  assert.equal(actionName(meta, "LandingGearToggle"), "Landing Gear");
  assert.deepEqual(parseBinds(DEMO_BINDS).binds, original);
});

test("Controls: every language with a names file names every known action", () => {
  for (const code of ACTION_NAME_LANGUAGES) {
    const names = namesOf(code);
    assert.deepEqual(
      Object.keys(meta.controls).filter((action) => !names[action]?.trim()),
      [],
      code,
    );
    assert.deepEqual(
      Object.keys(names).filter((action) => !meta.controls[action]),
      [],
      `${code}: names for unknown actions`,
    );
  }
});
