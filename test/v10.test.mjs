import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { superchargeMultiplier } from "../dist/js/jump.js";
import { fold, nameMatches } from "../dist/js/i18n.js";

test("neutron boost: x6 for the Caspian's Mk II drive, x4 otherwise", () => {
  assert.equal(superchargeMultiplier("int_hyperdrive_overcharge_size8_class5_overchargebooster_mkii"), 6);
  assert.equal(superchargeMultiplier("Int_HyperDrive_Overcharge_Size8_Class5_OverchargeBooster_MkII"), 6);
  assert.equal(superchargeMultiplier("int_hyperdrive_overcharge_size7_class5"), 4);
  assert.equal(superchargeMultiplier("int_hyperdrive_size5_class5"), 4);
  assert.equal(superchargeMultiplier(undefined), 4);
});

test("searches ignore accents, case and punctuation", () => {
  assert.equal(fold("Énergie  d'Ö"), "energie d'o");
  assert.ok(nameMatches("Low Temperature Diamonds", "temperature"));
  assert.ok(!nameMatches("Gold", "silver"));
});

import { readGalaxy, shipParams } from "../dist/js/galaxyRoute.js";

const loadout = (over = {}) => ({
  ship: "caspianexplorer", unladenMass: 600, fuelMain: 64, fuelReserve: 1.2,
  fsd: "int_hyperdrive_overcharge_size8_class5_overchargebooster_mkii", modules: [{ slot: "Slot01", item: "int_fuelscoop_size6_class5" }], ...over,
});

test("exact route: ship parameters from the journal, engineered values win", () => {
  const { params, missing, hasScoop } = shipParams(loadout({ fsdOptimalMass: 7000 }));
  assert.deepEqual(missing, []);
  assert.equal(hasScoop, true);
  assert.equal(params.optimal_mass, 7000);          // engineered (journal)
  assert.equal(params.max_fuel_per_jump, 6.8);      // Mk II base value (coriolis-data)
  assert.equal(params.fuel_power, 2.5025);
  assert.equal(params.base_mass, 600 + 64 + 1.2);   // full tanks
  assert.equal(params.range_boost, 0);
});

test("exact route: says what is missing instead of guessing", () => {
  assert.deepEqual(shipParams(undefined).missing, ["vaisseau (lance le jeu)"]);
  const r = shipParams(loadout({ fsd: "int_hyperdrive_unknown", modules: [] }));
  assert.equal(r.params, undefined);
  assert.equal(r.hasScoop, false);
  assert.ok(r.missing.some((m) => m.startsWith("FSD")));
});

test("exact route: Spansh answer → jumps, refuels and neutrons", () => {
  const r = readGalaxy({ jumps: [
    { name: "A", distance: 0, distance_to_destination: 50, fuel_in_tank: 10, fuel_used: 0, is_scoopable: true },
    { name: "B", distance: 30, distance_to_destination: 20, fuel_in_tank: 2, fuel_used: 3, must_refuel: true, has_neutron: true },
    { name: "C", distance: 20, distance_to_destination: 0, fuel_in_tank: 9, fuel_used: 2 },
  ] });
  assert.equal(r.jumps.length, 3);
  assert.equal(r.distance, 50);
  assert.equal(r.refuels, 1);
  assert.equal(r.neutrons, 1);
  assert.equal(r.jumps[1].mustRefuel, true);
  assert.equal(r.jumps[0].scoopable, true);
});

import { DEFAULT_ORDER, menuOrder, phoneHiddenPages, visibleNav } from "../dist/js/nav.js";

const ids = (list) => list.map((n) => n.id).join(" ");

test("menu: default order by groups, lines between them", () => {
  assert.equal(ids(visibleNav([])), DEFAULT_ORDER.join(" "));
});

test("menu: a saved order is kept, and pages added later take their default place", () => {
  // A player's order saved before a page existed: missions and navigation swapped, no "search".
  const saved = DEFAULT_ORDER.filter((id) => id !== "search").map((id) => (id === "missions" ? "navigation" : id === "navigation" ? "missions" : id));
  const order = menuOrder(saved);
  assert.deepEqual(order.slice(0, 3), ["navigation", "search", "missions"]); // the player's swap kept, search back next to navigation
  assert.equal(order.length, DEFAULT_ORDER.length);
  for (const id of DEFAULT_ORDER.filter((x) => x !== "-")) assert.ok(order.includes(id), id);
  assert.equal(order.indexOf("search"), order.indexOf("navigation") + 1); // after its nearest default neighbour
});

test("menu: the phone never shows PC pages nor those switched off, and no empty groups remain", () => {
  const phone = ids(visibleNav([], phoneHiddenPages(["controls"])));
  for (const id of ["mobile", "sync", "controls", "settings", "about"]) assert.ok(!phone.split(" ").includes(id), id);
  // …while on the PC, Settings and About can't be hidden
  assert.ok(ids(visibleNav(["settings", "about"])).includes("settings"));
  assert.ok(!/(^|\s)-\s-(\s|$)/.test(phone) && !phone.startsWith("-") && !phone.endsWith("-"));
});
