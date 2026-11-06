// Mining: the mining types of a mineral in a ring of a given type.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { miningMethods, ringMethods } from "../dist/js/features/mining/miningSpots.js";

test("mining types: core only in the rings where the mineral has motherlodes", () => {
  assert.deepEqual(miningMethods("Bromellite"), ["laser", "subsurface", "core"]);
  assert.deepEqual(ringMethods("Bromellite", "Icy"), ["laser", "subsurface", "core"]);
  assert.deepEqual(ringMethods("Bromellite", "Rocky"), ["laser"]);
  assert.deepEqual(ringMethods("Void Opal", "Icy"), ["subsurface", "core"]);
  assert.deepEqual(ringMethods("Platinum", "Metallic"), ["laser", "subsurface"]);
  assert.deepEqual(ringMethods("Painite", undefined), ["laser", "subsurface", "core"], "unknown ring type: all");
});
