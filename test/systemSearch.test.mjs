// Search → Systems: the criteria become the filters Spansh's systems search takes (checked
// against spansh.co.uk/api/systems/searchable_fields), and a system becomes a result line.
import "./i18n-setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const { systemFilters, systemRow } = await import("../dist/js/services/systemSearch.js");

test("system search: only the chosen criteria filter, with Spansh's field names", () => {
  assert.deepEqual(systemFilters({}, 300), { distance: { min: "0", max: "300" } });
  assert.deepEqual(
    systemFilters(
      {
        starType: "Neutron Star",
        power: "Aisling Duval",
        powerState: "Fortified",
        allegiance: "Empire",
        government: "Democracy",
        economy: "High Tech",
        security: "Low",
        factionState: "Boom",
        stationType: "Orbis Starport",
        minBodies: 20,
      },
      150,
    ),
    {
      distance: { min: "0", max: "150" },
      bodies: [{ type: { value: ["Star"] }, subtype: { value: ["Neutron Star"] } }],
      controlling_power: { value: ["Aisling Duval"] },
      power_state: { value: ["Fortified"] },
      allegiance: { value: ["Empire"] },
      government: { value: ["Democracy"] },
      primary_economy: { value: ["High Tech"] },
      security: { value: ["Low"] },
      controlling_minor_faction_state: { value: ["Boom"] },
      stations: [{ type: { value: ["Orbis Starport"] } }],
      body_count: { min: "20", max: "100000" },
    },
  );
});

test("system search: a result shows the main star, Powerplay, the wanted star and old data", () => {
  const row = systemRow(
    {
      name: "18 Camelopardalis",
      id64: 42,
      distance: 139.3,
      controlling_power: "Aisling Duval",
      power_state: "Fortified",
      allegiance: "Federation",
      security: "Medium",
      body_count: 45,
      updated_at: "2020-01-01 10:00:00+00",
      bodies: [{ subtype: "F (White) Star", is_main_star: true }, { subtype: "Neutron Star" }],
      stations: [{}],
    },
    { starType: "Neutron Star" },
    7,
  );
  assert.equal(row.system, "18 Camelopardalis");
  assert.equal(row.distance, 139.3);
  const badges = row.badges.map((b) => b.text);
  assert.ok(badges.includes("F (White) Star"));
  assert.ok(badges.includes("Neutron Star"));
  assert.ok(badges.some((b) => b.startsWith("Aisling Duval")));
  assert.equal(row.badges.at(-1).tone, "warn");
  assert.match(row.sub.join(" "), /45/);
  assert.ok(row.links.some((l) => l.url.endsWith("/system/42")));
});

test("system page: a Spansh record becomes the page's data, nearest stations and bodies first", async () => {
  const { decodeSystemDetails } = await import("../dist/js/services/systemSearch.js");
  const d = decodeSystemDetails({
    name: "Sol",
    id64: 10477373803,
    x: 0,
    y: 0,
    z: 0,
    allegiance: "Federation",
    security: "High",
    population: 22780919531,
    needs_permit: true,
    controlling_minor_faction: "Mother Gaia",
    controlling_power: "Jerome Archer",
    power: ["Jerome Archer", "Aisling Duval"],
    power_state: "Stronghold",
    power_state_control_progress: 0.547506,
    body_count: 40,
    updated_at: "2026-11-14 23:38:39+00",
    minor_faction_presences: [
      { name: "Aegis Core", influence: 0.00996, state: "None" },
      { name: "Mother Gaia", influence: 0.6, state: "Boom" },
    ],
    stations: [
      { name: "Daedalus", type: "Orbis Starport", distance_to_arrival: 156.1, large_pads: 6, services: ["Market"] },
      { name: "Abraham Lincoln", type: "Orbis Starport", distance_to_arrival: 497 },
      { name: "Outpost", type: "Outpost", distance_to_arrival: 12, medium_pads: 1, small_pads: 2 },
    ],
    bodies: [
      { name: "Saturn", type: "Planet", subtype: "Class I gas giant", distance_to_arrival: 4713 },
      { name: "Sol", type: "Star", subtype: "G (White-Yellow) Star", distance_to_arrival: 0, is_main_star: true },
    ],
  });
  assert.equal(d.name, "Sol");
  assert.equal(d.id64, "10477373803");
  assert.deepEqual(d.coords, [0, 0, 0]);
  assert.equal(d.needsPermit, true);
  assert.equal(d.controlProgress, 54.8);
  assert.equal(d.updatedAt, "2026-11-14T23:38:39.000Z");
  assert.deepEqual(
    d.factions.map((f) => [f.name, f.influence, f.controls]),
    [
      ["Mother Gaia", 60, true],
      ["Aegis Core", 1, false],
    ],
  );
  assert.deepEqual(
    d.stations.map((s) => [s.name, s.largestPad]),
    [
      ["Outpost", "M"],
      ["Daedalus", "L"],
      ["Abraham Lincoln", undefined],
    ],
  );
  assert.deepEqual(
    d.bodies.map((b) => [b.name, b.mainStar]),
    [
      ["Sol", true],
      ["Saturn", false],
    ],
  );
  assert.equal(decodeSystemDetails({}), null);
});
