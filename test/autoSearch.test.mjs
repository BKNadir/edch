// Search → Auto: a typed name is recognised as a commodity, ship, module, service or faction (in
// English or French, any capitals or accents); anything else is a system name.
import "./i18n-setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { guessSearch } = await import("../dist/js/features/search/autoSearch.js");
const { factionIndex } = await import("../dist/js/features/search/factionNames.js");

const names = {
  commodities: ["Tritium", "Gold", "Low Temperature Diamonds"],
  ships: ["Anaconda", "Krait Mk II"],
  modules: ["Frame Shift Drive", "Beam Laser"],
  services: [
    ["Material Trader", "Négociant de matériaux"],
    ["Interstellar Factors Contact", "Interstellar Factors"],
  ],
  factions: factionIndex(["Mother Gaia", "Aegis Core"]),
};

test("auto search: each kind is recognised, whatever the capitals", () => {
  assert.deepEqual(guessSearch("tritium", names), { kind: "commodity", name: "Tritium" });
  assert.deepEqual(guessSearch("  KRAIT mk ii ", names), { kind: "ship", name: "Krait Mk II" });
  assert.deepEqual(guessSearch("beam laser", names), { kind: "module", name: "Beam Laser" });
  assert.deepEqual(guessSearch("negociant de materiaux", names), { kind: "service", name: "Material Trader" });
  assert.deepEqual(guessSearch("interstellar factors", names), {
    kind: "service",
    name: "Interstellar Factors Contact",
  });
  assert.deepEqual(guessSearch("mother gaia", names), { kind: "faction", name: "Mother Gaia" });
});

test("auto search: an unknown name is a system, nothing typed is nothing", () => {
  assert.deepEqual(guessSearch("Synuefe XR-H d11-102", names), { kind: "system", name: "Synuefe XR-H d11-102" });
  assert.equal(guessSearch("   ", names), null);
});
