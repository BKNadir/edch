// Search → Faction: every faction of the game offered while typing, whatever the capitals or accents.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./i18n-setup.mjs";
import { exactFaction, factionIndex, matchFactions } from "../dist/js/features/search/factionNames.js";

const all = readFileSync(new URL("../public/data/factions.txt", import.meta.url), "utf8")
  .split("\n")
  .filter(Boolean);

test("faction names: the bundled list holds the game's factions", () => {
  assert.ok(all.length > 50_000, `${all.length} factions`);
  assert.ok(all.includes("Diavol Space Fleet"));
});

test("faction names: capitals and accents don't matter, best matches first", () => {
  const index = factionIndex(
    ["Mon Escadrille"],
    ["Diavol Space Fleet", "Amicale des Compagnons de l'Espace", "The Diavol"],
  );
  assert.deepEqual(matchFactions(index, "diavol"), ["Diavol Space Fleet", "The Diavol"]);
  assert.deepEqual(matchFactions(index, "COMPAGNONS"), ["Amicale des Compagnons de l'Espace"]);
  assert.deepEqual(matchFactions(index, "escadrille"), ["Mon Escadrille"]);
  assert.deepEqual(matchFactions(index, "   "), []);
  assert.equal(exactFaction(index, "diavol space FLEET"), "Diavol Space Fleet");
  assert.equal(exactFaction(index, "unknown"), undefined);
});

test("faction names: the journal's spelling wins, no twins", () => {
  const index = factionIndex(["diavol space fleet"], ["Diavol Space Fleet"]);
  assert.deepEqual(index.names, ["diavol space fleet"]);
});

test("faction names: the full list answers fast", () => {
  const index = factionIndex([], all);
  const start = performance.now();
  for (const typed of ["d", "di", "dia", "diav", "diavol"]) matchFactions(index, typed);
  assert.ok(performance.now() - start < 250, "typing stays smooth");
  assert.equal(matchFactions(index, "diavol space")[0], "Diavol Space Fleet");
});
