// BGS page with EliteBGS: its answer read (states in the game's names, influence in percent), and
// its more recent data recorded without losing the other factions' influence.
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
