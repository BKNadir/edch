// EliteBGS: its answers read (states in the game's names, influence in percent), the BGS page's
// more recent data recorded without losing the other factions' influence, and a material's
// systems getting their faction states from it.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { decodeEliteBgs, eliteBgsState } from "../dist/js/services/eliteBgs.js";
import { eliteBgsSnapshot } from "../dist/js/features/bgs/eliteBgsMerge.js";

const ANSWER = {
  docs: [
    {
      name: "Diavol Space Fleet",
      faction_presence: [
        {
          system_name: "Synuefe XR-H d11-102",
          state: "civilwar",
          influence: 0.412,
          active_states: [{ state: "civilwar" }, { state: "boom" }],
          pending_states: [{ state: "expansion" }],
          recovering_states: [],
          updated_at: "2026-11-14T20:00:00.000Z",
          system_details: {
            x: 1,
            y: 2,
            z: 3,
            system_address: "123",
            controlling_minor_faction_cased: "Diavol Space Fleet",
            factions: [{ name: "Diavol Space Fleet" }, { name: "Rivals Inc" }],
          },
        },
      ],
    },
  ],
};

test("EliteBGS: states in the game's names", () => {
  assert.equal(eliteBgsState("civilwar"), "Civil War");
  assert.equal(eliteBgsState("pirateattack"), "Pirate Attack");
  assert.equal(eliteBgsState("none"), undefined);
});

test("EliteBGS: the faction's systems, its influence in percent, rivals by name", () => {
  const [system] = decodeEliteBgs(ANSWER, "diavol space fleet");
  assert.equal(system.name, "Synuefe XR-H d11-102");
  assert.deepEqual(system.coords, [1, 2, 3]);
  assert.equal(system.controlling, "Diavol Space Fleet");
  assert.deepEqual(system.factions[0], {
    name: "Diavol Space Fleet",
    influence: 41.2,
    state: "Civil War",
    active: ["Civil War", "Boom"],
    pending: ["Expansion"],
    recovering: [],
  });
  assert.equal(system.factions[1].name, "Rivals Inc");
  assert.ok(Number.isNaN(system.factions[1].influence));
  assert.deepEqual(decodeEliteBgs({ docs: [] }, "x"), []);
});

test("EliteBGS: newer data keeps the rivals' influence from the older snapshot", () => {
  const [system] = decodeEliteBgs(ANSWER, "Diavol Space Fleet");
  const previous = {
    at: "2026-11-10T00:00:00.000Z",
    source: "spansh",
    controlling: "Rivals Inc",
    factions: [
      { name: "Diavol Space Fleet", influence: 30, state: "None", active: [], pending: [], recovering: [] },
      { name: "Rivals Inc", influence: 35, state: "None", active: [], pending: [], recovering: [] },
    ],
  };
  const snapshot = eliteBgsSnapshot(system, previous);
  assert.equal(snapshot.source, "elitebgs");
  assert.equal(snapshot.at, "2026-11-14T20:00:00.000Z");
  assert.equal(snapshot.factions[0].influence, 41.2);
  assert.equal(snapshot.factions[1].influence, 35);
});

test("elitebgs systems: each system's factions with their states in the game's names", async () => {
  const { decodeEliteBgsSystems } = await import("../dist/js/services/eliteBgs.js");
  const [system] = decodeEliteBgsSystems({
    docs: [
      {
        name: "Synuefe UW-I a91-4",
        updated_at: "2026-11-14T08:00:00.000Z",
        controlling_minor_faction_cased: "Owners Inc",
        faction_details: [
          { name: "Owners Inc", faction_presence: { state: "boom", active_states: [{ state: "boom" }] } },
          { name: "Rivals", faction_presence: { state: "civilwar", active_states: [{ state: "civilwar" }] } },
        ],
      },
      { updated_at: "no name: dropped" },
    ],
  });
  assert.equal(system.name, "Synuefe UW-I a91-4");
  assert.equal(system.updatedAt, "2026-11-14T08:00:00.000Z");
  assert.equal(system.controllingState, "Boom");
  assert.deepEqual(system.factions[1], { name: "Rivals", influence: NaN, state: "Civil War", active: ["Civil War"] });
  assert.deepEqual(decodeEliteBgsSystems(null), []);
});

test("faction state badges: wanted states with who is in them, then the controlling faction's state", async () => {
  const { factionStateBadges } = await import("../dist/js/services/spansh.js");
  const factions = [
    { name: "A", state: "Boom", active: ["Boom"] },
    { name: "B", state: "War", active: ["War", "Expansion"] },
    { name: "C", state: "None", active: ["Expansion"] },
  ];
  const badges = factionStateBadges(factions, "Boom", new Set(["Expansion"]));
  assert.equal(badges.length, 2);
  assert.equal(badges[0].tone, "hit");
  assert.equal(badges[1].tone, "muted");
  assert.deepEqual(factionStateBadges(factions, "None", new Set()), []);
});

test("fresh states: recent Spansh rows are kept as they are, without asking EliteBGS", async () => {
  const { withFreshStates } = await import("../dist/js/features/materials/freshStates.js");
  const now = Date.parse("2026-11-15T12:00:00Z");
  const rows = [
    { system: "A", title: "A", distance: 1, sub: [], badges: [], links: [], updated: "2026-11-15T08:00:00Z" },
  ];
  assert.equal(await withFreshStates(rows, [], null, now), rows);
});

test("elitebgs systems: influence in percent and the controlling faction's name", async () => {
  const { decodeEliteBgsSystems } = await import("../dist/js/services/eliteBgs.js");
  const [system] = decodeEliteBgsSystems({
    docs: [
      {
        name: "Sol",
        updated_at: "2026-11-18T08:00:00.000Z",
        controlling_minor_faction_cased: "Mother Gaia",
        faction_details: [{ name: "Mother Gaia", faction_presence: { state: "none", influence: 0.4251 } }],
      },
    ],
  });
  assert.equal(system.controlling, "Mother Gaia");
  assert.equal(system.factions[0].influence, 42.5);
  assert.equal(system.factions[0].state, "None");
});

test("system page factions: Spansh's are kept when recent enough, without asking EliteBGS", async () => {
  const { freshFactions } = await import("../dist/js/features/systems/freshFactions.js");
  const now = Date.parse("2026-11-19T12:00:00Z");
  const details = { name: "Sol", updatedAt: "2026-11-19T08:00:00Z", factions: [] };
  assert.equal(await freshFactions(details, now), null);
});
