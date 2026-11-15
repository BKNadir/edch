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
