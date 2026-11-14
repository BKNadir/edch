// Searches: a reference system typed on any page replaces your position everywhere; a faction's
// wanted states are matched on its main and active states.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { referenceOf } from "../dist/js/state/context.js";
import { hasState } from "../dist/js/services/spansh.js";

test("reference: your position by default, the typed system (with its coordinates) otherwise", () => {
  const state = {
    referenceSystem: "",
    cmdr: { location: { system: "Sol", pos: [0, 0, 0] } },
    settings: { fallbackSystem: "Sol" },
  };
  const ctx = { store: { state } };
  assert.deepEqual(referenceOf(ctx), { coords: [0, 0, 0], system: "Sol", label: "Sol" });
  state.referenceSystem = "Shinrarta Dezhra";
  state.referenceCoords = [55.7, 17.6, 27.2];
  assert.deepEqual(referenceOf(ctx), {
    coords: [55.7, 17.6, 27.2],
    system: "Shinrarta Dezhra",
    label: "Shinrarta Dezhra",
  });
});

test("faction states: main or active, any capitals", () => {
  const presence = { state: "Boom", active_states: ["Boom", "Expansion"] };
  assert.ok(hasState(presence, ["Expansion"]));
  assert.ok(hasState(presence, ["boom"]));
  assert.ok(!hasState(presence, ["War"]));
  assert.ok(!hasState(undefined, ["Boom"]));
});
