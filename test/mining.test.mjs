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

test("prospected asteroid: the content level is kept as Low / Medium / High", async () => {
  const { applyActivity } = await import("../dist/js/game/activity/index.js");
  const { emptyActivity } = await import("../dist/js/game/activity/state.js");
  const st = emptyActivity();
  applyActivity(st, {
    event: "ProspectedAsteroid",
    timestamp: "2026-11-06T15:00:00Z",
    Materials: [{ Name: "Bromellite", Proportion: 21.3 }],
    Content: "$AsteroidMaterialContent_Low;",
    Content_Localised: "Material Content: Low",
    Remaining: 100,
  });
  assert.equal(st.mining.last[0].content, "Low");
  assert.equal(st.mining.last[0].materials[0].pct, 21.3);
});
