import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { readFileSync } from "node:fs";
import { applyLines, applyLocker, emptyState } from "../dist/js/game/journal.js";
import { tradeRate } from "../dist/js/features/materials/trade.js";
import { buildRequest } from "../dist/js/services/spansh.js";
import { findersFor, traderFinder } from "../dist/js/features/materials/sources.js";

const game = JSON.parse(readFileSync(new URL("../public/data/game.json", import.meta.url)));
const byId = new Map(game.materials.map((m) => [m.id, m]));
const CAP = { 1: 300, 2: 250, 3: 200, 4: 150, 5: 100 };
const cap = (id) => (byId.get(id)?.grade ? CAP[byId.get(id).grade] : undefined);
const L = (o) => JSON.stringify({ timestamp: "2026-10-30T20:00:00Z", ...o });

const settings = { journalDir: "", hgeMinPopulation: 1_000_000, maxDistance: 300, maxAgeDays: 3, fallbackSystem: "Sol", largePadOnly: false };

test("Materials snapshot then incremental events", () => {
  const s = emptyState();
  applyLines(s, [
    L({ event: "Materials", Raw: [{ Name: "iron", Count: 10 }], Manufactured: [{ Name: "protoheatradiators", Count: 94 }], Encoded: [{ Name: "fsdtelemetry", Count: 5 }] }),
    L({ event: "MaterialCollected", Category: "Raw", Name: "iron", Count: 3 }),
    L({ event: "MaterialCollected", Category: "Manufactured", Name: "protoheatradiators", Count: 50 }),
    L({ event: "MaterialTrade", MarketID: 1, TraderType: "encoded", Paid: { Material: "fsdtelemetry", Category: "Encoded", Quantity: 3 }, Received: { Material: "scrambledemissiondata", Quantity: 9 } }),
    L({ event: "EngineerCraft", Engineer: "Felicity Farseer", Ingredients: [{ Name: "iron", Count: 2 }] }),
    L({ event: "Synthesis", Name: "FSD Basic", Materials: [{ Name: "iron", Count: 1 }] }),
    L({ event: "MissionCompleted", MaterialsReward: [{ Name: "iron", Category: "Raw", Count: 4 }] }),
    "not json at all",
  ], cap);
  assert.equal(s.materials.iron, 10 + 3 - 2 - 1 + 4);
  assert.equal(s.materials.protoheatradiators, 100, "clamped to grade-5 capacity");
  assert.equal(s.materials.fsdtelemetry, 2);
  assert.equal(s.materials.scrambledemissiondata, 9);
  assert.equal(s.engineers["Felicity Farseer"].progress, "Unlocked");
});

test("location keeps factions, states and security", () => {
  const s = emptyState();
  applyLines(s, [
    L({ event: "FSDJump", StarSystem: "Timbalderis", SystemAddress: 5, StarPos: [1, 2, 3], SystemAllegiance: "Independent", SystemSecurity: "$SYSTEM_SECURITY_high;", Population: 5000000,
      SystemFaction: { Name: "A" }, Factions: [{ Name: "A", FactionState: "Boom", ActiveStates: [{ State: "Boom" }, { State: "Expansion" }] }] }),
    L({ event: "Docked", StarSystem: "Timbalderis", StationName: "Levi-Montalcini Gateway" }),
  ]);
  assert.equal(s.location.system, "Timbalderis");
  assert.deepEqual(s.location.pos, [1, 2, 3]);
  assert.equal(s.location.security, "High");
  assert.deepEqual(s.location.factions[0].active, ["Boom", "Expansion"]);
  assert.equal(s.location.station, "Levi-Montalcini Gateway");
});

test("ship locker snapshot from ShipLocker.json", () => {
  const s = emptyState();
  assert.equal(applyLocker(s, { event: "ShipLocker", Items: [{ Name: "SuitSchematic", Count: 2 }], Components: [{ Name: "graphene", Count: 3 }, { Name: "graphene", Count: 1, OwnerID: 5 }], Consumables: [], Data: [] }), true);
  assert.deepEqual(s.locker, { suitschematic: 2, graphene: 4 });
  assert.equal(applyLocker(s, { event: "ShipLocker" }), false, "an empty event does not wipe the locker");
});

test("engineer progress, full list then single update", () => {
  const s = emptyState();
  applyLines(s, [
    L({ event: "EngineerProgress", Engineers: [{ Engineer: "The Dweller", EngineerID: 300180, Progress: "Invited" }] }),
    L({ event: "EngineerProgress", Engineer: "The Dweller", EngineerID: 300180, Progress: "Unlocked", Rank: 1 }),
  ]);
  assert.deepEqual(s.engineers["The Dweller"], { progress: "Unlocked", rank: 1, rankProgress: undefined });
});

test("trader rates match the game", () => {
  assert.deepEqual(tradeRate(5, 4, true), { paid: 1, received: 3 });   // 4 Proto Radiolic -> 12 Proto Light
  assert.deepEqual(tradeRate(5, 4, false), { paid: 2, received: 1 });  // 20 Military Grade -> 10 Proto Light
  assert.deepEqual(tradeRate(1, 2, true), { paid: 6, received: 1 });
  assert.deepEqual(tradeRate(3, 3, false), { paid: 6, received: 1 });
  assert.equal(tradeRate(3, 3, true), null);
});

test("Proto Light Alloys: Boom/Expansion HGE search near the commander", () => {
  const pla = byId.get("protolightalloys");
  const finders = findersFor(pla, settings);
  const hge = finders.find((f) => f.type === "systems");
  assert.ok(hge, "has a systems finder");
  const req = buildRequest(hge, { coords: [1, 2, 3], label: "x" }, settings);
  assert.deepEqual(req.filters.minor_faction_presences, [{ state: { value: ["Boom", "Expansion"] } }]);
  assert.deepEqual(req.filters.population, { comparison: "<=>", value: ["1000000", "100000000000"] });
  assert.deepEqual(req.reference_coords, { x: 1, y: 2, z: 3 });
  assert.ok(req.filters.updated_at, "BGS freshness filter");
  assert.deepEqual(req.sort, [{ distance: { direction: "asc" } }]);
  assert.equal(traderFinder(pla, settings).filters.material_trader.value[0], "Manufactured");
});

test("every ship material gets at least one actionable hint", () => {
  for (const m of game.materials.filter((x) => x.ledger === "ship")) {
    const f = findersFor(m, settings);
    assert.ok(f.length > 0, `${m.id} has a hint`);
  }
  const searchable = game.materials.filter((m) => m.ledger === "ship" && findersFor(m, settings).some((f) => f.type !== "info"));
  assert.ok(searchable.length > 120, `searchable ship materials: ${searchable.length}`);
});
