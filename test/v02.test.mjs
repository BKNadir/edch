import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commodityMessage, fssMessage, journalMessage, navrouteMessage, outfittingMessage, shipyardMessage, trackSession } from "../dist/js/eddn.js";
import { extractLoadout, importLoadout } from "../dist/js/importer.js";
import { carrierEstimate, jumpModel } from "../dist/js/jump.js";
import { Game } from "../dist/js/data.js";
import { applyLines, emptyState } from "../dist/js/journal.js";
import { wishNeeds } from "../dist/js/store.js";

const game = new Game(JSON.parse(readFileSync(new URL("../public/data/game.json", import.meta.url))));

function session() {
  const s = {};
  for (const ev of [
    { event: "Fileheader", gameversion: "4.2.0.1", build: "r1/r0 " },
    { event: "LoadGame", Commander: "Jameson", Horizons: true, Odyssey: true },
    { event: "FSDJump", StarSystem: "Sol", SystemAddress: 10477373803, StarPos: [0, 0, 0] },
  ]) trackSession(s, ev);
  return s;
}

test("journal/1 strips personal data and localised keys", () => {
  const s = session();
  const m = journalMessage(s, {
    timestamp: "2026-10-31T00:00:00Z", event: "FSDJump", StarSystem: "Sol", SystemAddress: 10477373803, StarPos: [0, 0, 0],
    JumpDist: 12, FuelUsed: 1, FuelLevel: 20, BoostUsed: 1, Wanted: true, SystemEconomy_Localised: "Raffinage",
    Factions: [{ Name: "Mother Gaia", MyReputation: 50, HomeSystem: true, FactionState_Localised: "x" }],
  });
  assert.equal(m.$schemaRef, "https://eddn.edcd.io/schemas/journal/1");
  assert.deepEqual(m.header, { uploaderID: "Jameson", softwareName: "EDCH", softwareVersion: "0.8.4", gameversion: "4.2.0.1", gamebuild: "r1/r0 " });
  const msg = m.message;
  for (const k of ["JumpDist", "FuelUsed", "FuelLevel", "BoostUsed", "Wanted", "SystemEconomy_Localised"]) assert.ok(!(k in msg), k);
  assert.deepEqual(msg.Factions, [{ Name: "Mother Gaia" }]);
  assert.equal(msg.horizons, true);
  assert.equal(msg.odyssey, true);
});

test("Docked gets StarPos only when the system matches the last jump", () => {
  const s = session();
  const ok = journalMessage(s, { event: "Docked", StarSystem: "Sol", SystemAddress: 10477373803, StationName: "Abraham Lincoln", CockpitBreach: false, ActiveFine: true });
  assert.deepEqual(ok.message.StarPos, [0, 0, 0]);
  assert.ok(!("CockpitBreach" in ok.message) && !("ActiveFine" in ok.message));
  assert.equal(journalMessage(s, { event: "Docked", StarSystem: "Lave", SystemAddress: 1, StationName: "X" }), null, "mismatch is dropped");
  assert.equal(journalMessage(s, { event: "Undocked" }), null);
});

test("no LoadGame Odyssey flag → key omitted, beta → /test schema", () => {
  const s = {};
  trackSession(s, { event: "Fileheader", gameversion: "4.0.0.100 Beta", build: "b" });
  trackSession(s, { event: "LoadGame", Commander: "X", Horizons: true });
  trackSession(s, { event: "Location", StarSystem: "Sol", SystemAddress: 1, StarPos: [0, 0, 0] });
  const m = journalMessage(s, { event: "Location", StarSystem: "Sol", SystemAddress: 1, StarPos: [0, 0, 0], Latitude: 1, Longitude: 2 });
  assert.ok(!("odyssey" in m.message));
  assert.ok(!("Latitude" in m.message));
  assert.ok(m.$schemaRef.endsWith("/journal/1/test"));
});

test("commodity/3, outfitting/2, shipyard/2, navroute/1, fss", () => {
  const s = session();
  const c = commodityMessage(s, {
    timestamp: "t", MarketID: 5, StationName: "A", StarSystem: "Sol", StationType: "Coriolis",
    Items: [
      { id: 1, Name: "$gold_name;", Name_Localised: "Or", Category: "$MARKET_category_metals;", BuyPrice: 9000, SellPrice: 8900, MeanPrice: 9100, StockBracket: 2, DemandBracket: 0, Stock: 100, Demand: 0, Producer: true, Rare: false },
      { id: 2, Name: "$drones_name;", Category: "$MARKET_category_nonmarketable;", BuyPrice: 101, SellPrice: 101, MeanPrice: 101, StockBracket: 3, DemandBracket: 0, Stock: 9, Demand: 0 },
    ],
  });
  assert.deepEqual(c.message.commodities, [{ name: "gold", meanPrice: 9100, buyPrice: 9000, stock: 100, stockBracket: 2, sellPrice: 8900, demand: 0, demandBracket: 0 }]);
  assert.equal(c.message.marketId, 5);
  const o = outfittingMessage(s, { timestamp: "t", MarketID: 5, StationName: "A", StarSystem: "Sol", Items: [{ Name: "hpt_pulselaser_fixed_small" }, { Name: "int_planetapproachsuite" }, { Name: "krait_mkii_armour_grade1" }, { Name: "paintjob_x" }] });
  assert.deepEqual(o.message.modules, ["Hpt_pulselaser_fixed_small", "krait_mkii_Armour_grade1"]);
  const y = shipyardMessage(s, { timestamp: "t", MarketID: 5, StationName: "A", StarSystem: "Sol", PriceList: [{ ShipType: "python" }, { ShipType: "adder" }] });
  assert.deepEqual(y.message.ships, ["adder", "python"]);
  assert.equal(shipyardMessage(s, { MarketID: 5, PriceList: [] }), null);
  const n = navrouteMessage(s, { timestamp: "t", event: "NavRoute", Route: [{ StarSystem: "Sol", SystemAddress: 1, StarPos: [0, 0, 0], StarClass: "G", Extra: 1 }] });
  assert.deepEqual(n.message.Route[0], { StarSystem: "Sol", SystemAddress: 1, StarPos: [0, 0, 0], StarClass: "G" });
  const f = fssMessage(s, { timestamp: "t", event: "FSSDiscoveryScan", Progress: 0.4, BodyCount: 8, NonBodyCount: 3, SystemName: "Sol", SystemAddress: 10477373803 });
  assert.deepEqual(f.message.StarPos, [0, 0, 0]);
  assert.ok(!("Progress" in f.message));
});

test("EDSY/Coriolis SLEF import → wishlist lines", () => {
  const slef = JSON.stringify([{ header: { appName: "EDSY" }, data: { event: "Loadout", Ship: "krait_mkii", ShipName: "Nightjar", Modules: [
    { Slot: "FrameShiftDrive", Item: "int_hyperdrive_size5_class5", Engineering: { BlueprintName: "FSD_LongRange", Level: 5, ExperimentalEffect: "special_fsd_heavy" } },
    { Slot: "TinyHardpoint1", Item: "hpt_shieldbooster_size0_class5", Engineering: { BlueprintName: "ShieldBooster_HeavyDuty", Level: 5 } },
    { Slot: "TinyHardpoint2", Item: "hpt_shieldbooster_size0_class5", Engineering: { BlueprintName: "ShieldBooster_HeavyDuty", Level: 5 } },
    { Slot: "MediumHardpoint1", Item: "hpt_multicannon_gimbal_medium", Engineering: { BlueprintName: "Weapon_Overcharged", Level: 3, ExperimentalEffect: "special_corrosive_shell" } },
    { Slot: "Armour", Item: "krait_mkii_armour_grade1" },
  ] } }]);
  const loadout = extractLoadout(slef);
  const res = importLoadout(game, loadout);
  const labels = res.items.map((i) => `${i.bp}|${i.gradeFrom}-${i.gradeTo}x${i.count}`);
  assert.ok(labels.some((l) => l.startsWith("modification|Frame Shift Drive|Increased FSD Range|1-5x1")), labels.join("\n"));
  assert.ok(labels.some((l) => /^modification\|Shield Booster\|.*\|1-5x2$/.test(l)), labels.join("\n"));
  assert.ok(labels.some((l) => l.startsWith("modification|Multi-cannon|Overcharged Weapon|1-3x1")), labels.join("\n"));
  assert.ok(labels.some((l) => l.startsWith("experimental|Frame Shift Drive|")), labels.join("\n"));
  assert.ok(labels.some((l) => l.startsWith("experimental|Multi-cannon|Corrosive")), labels.join("\n"));
  assert.deepEqual(res.skipped, []);
  const needs = wishNeeds(game, res.items.find((i) => i.bp.includes("Increased FSD Range")));
  assert.ok(Object.keys(needs).length >= 5);
  assert.equal(extractLoadout("not json"), null);
});

test("jump range calibrated on the game's MaxJumpRange", () => {
  const s = emptyState();
  applyLines(s, [JSON.stringify({ event: "Loadout", Ship: "asp", ShipID: 1, UnladenMass: 400, CargoCapacity: 64, MaxJumpRange: 40, FuelCapacity: { Main: 32, Reserve: 0.6 },
    Modules: [{ Slot: "FrameShiftDrive", Item: "int_hyperdrive_size5_class5" }, { Slot: "Slot01", Item: "int_guardianfsdbooster_size5" }] })]);
  const m = jumpModel(s.loadout);
  assert.equal(m.maxFuelPerJump, 5);
  assert.equal(m.boost, 10.5);
  assert.ok(Math.abs(m.rangeAt(405) - 40) < 1e-9, "calibration point");
  assert.ok(m.rangeAt(400 + 32.6 + 64) < m.rangeAt(400 + 32.6));
  const est = carrierEstimate(1200, 25000);
  assert.equal(est.jumps, 3);
  assert.equal(est.fuel, 130 + 130 + Math.round(5 + (200 * 50) / 200));
});
