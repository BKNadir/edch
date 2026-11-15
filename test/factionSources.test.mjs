// Search → Faction: each system keeps the most recent data among Spansh, EliteBGS and EDSM, and the
// filters (controlled only, wanted states) apply to that data.
import "./i18n-setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { freshestSystems, matchesQuery, factionLine } = await import("../dist/js/features/search/factionSources.js");

const presence = (state, active = [], influence = 40) => ({
  name: "Diavol Space Fleet",
  influence,
  state,
  active,
  pending: [],
  recovering: [],
});

test("faction sources: the newest data wins, coordinates kept from the source that has them", () => {
  const merged = freshestSystems([
    {
      source: "Spansh",
      systems: [
        {
          name: "LHS 2995",
          id64: "42",
          coords: [1, 2, 3],
          distance: 12,
          updatedAt: "2026-11-10T10:00:00.000Z",
          factions: [presence("None")],
        },
      ],
    },
    {
      source: "EliteBGS",
      systems: [
        {
          name: "lhs 2995",
          updatedAt: "2026-11-14T10:00:00.000Z",
          controlling: "Diavol Space Fleet",
          factions: [presence("Expansion")],
        },
        { name: "Only EliteBGS", updatedAt: "2026-11-14T10:00:00.000Z", factions: [presence("Boom")] },
      ],
    },
  ]);
  const lhs = merged.find((s) => s.name.toLowerCase() === "lhs 2995");
  assert.equal(merged.length, 2);
  assert.equal(lhs.source, "EliteBGS");
  assert.equal(lhs.factions[0].state, "Expansion");
  assert.deepEqual(lhs.coords, [1, 2, 3]);
  assert.equal(lhs.distance, 12);
  assert.equal(lhs.id64, "42");

  // Merging again keeps where each system came from.
  const again = freshestSystems([{ source: "Spansh", systems: merged }]);
  assert.equal(again.find((s) => s.name === "Only EliteBGS").source, "EliteBGS");
});

test("faction sources: controlled only and states (main or active) filter the merged data", () => {
  const system = {
    name: "LHS 2995",
    controlling: "Diavol Space Fleet",
    source: "EDSM",
    factions: [presence("Boom", ["Expansion"])],
  };
  const q = (more) => ({ faction: "diavol space fleet", ownerOnly: false, states: [], ...more });
  assert.ok(matchesQuery(system, q({ states: ["Expansion"] })));
  assert.ok(matchesQuery(system, q({ ownerOnly: true })));
  assert.ok(!matchesQuery(system, q({ states: ["War"] })));
  assert.ok(!matchesQuery({ ...system, controlling: "Someone else" }, q({ ownerOnly: true })));
  const row = factionLine(system, q({ states: ["Expansion"] }));
  assert.equal(row.source, "EDSM");
  assert.ok(row.badges.some((b) => b.tone === "hit" && /Expansion/.test(b.text)));
});
