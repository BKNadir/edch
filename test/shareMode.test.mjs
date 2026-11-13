// Share modes (top bar switch): what EDDN, EDSM and Inara may get of a journal event.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BGS_ACTION_EVENTS, shareableEvent } from "../dist/js/services/sync/shareMode.js";

const jump = {
  timestamp: "2026-11-12T10:00:00Z",
  event: "FSDJump",
  StarSystem: "HIP 1",
  StarPos: [0, 0, 0],
  SystemAddress: 1,
  SystemAllegiance: "Federation",
  SystemFaction: { Name: "Some Faction", FactionState: "War" },
  Factions: [{ Name: "Some Faction", Influence: 0.4, FactionState: "War" }],
  Conflicts: [{ WarType: "war", Status: "active" }],
};

test("normal mode: the event is shared as it is", () => {
  assert.equal(shareableEvent(jump, "normal"), jump);
});

test("BGS mode: the location event loses its BGS data, the rest stays", () => {
  const shared = shareableEvent(jump, "bgs");
  assert.equal(shared.StarSystem, "HIP 1");
  assert.deepEqual(shared.StarPos, [0, 0, 0]);
  assert.equal(shared.SystemAllegiance, "Federation");
  for (const field of ["Factions", "Conflicts", "SystemFaction"]) assert.equal(field in shared, false);
  // EDCH's own event is untouched.
  assert.equal(jump.Factions.length, 1);
});

test("BGS mode: the BGS actions aren't shared, other events are", () => {
  for (const event of ["MissionCompleted", "RedeemVoucher", "MarketSell", "MultiSellExplorationData"]) {
    assert.ok(BGS_ACTION_EVENTS.has(event));
    assert.equal(shareableEvent({ event }, "bgs"), null);
  }
  const docked = shareableEvent({ event: "Docked", StationName: "X", StationFaction: { Name: "F" } }, "bgs");
  assert.deepEqual(docked, { event: "Docked", StationName: "X" });
  const scan = { event: "Scan", BodyName: "HIP 1 A" };
  assert.equal(shareableEvent(scan, "bgs"), scan);
});

test("BGS mode: signals lose the faction and state that spawned them; wing deliveries stay private", () => {
  const signal = shareableEvent(
    {
      event: "FSSSignalDiscovered",
      SignalName: "$Warzone_PointRace_Med;",
      SpawningFaction: "Some Faction",
      SpawningState: "$FactionState_War;",
      SpawningState_Localised: "War",
    },
    "bgs",
  );
  assert.deepEqual(signal, { event: "FSSSignalDiscovered", SignalName: "$Warzone_PointRace_Med;" });
  assert.equal(shareableEvent({ event: "CargoDepot", MissionID: 1 }, "bgs"), null);
});

test("invisible mode: nothing is shared", () => {
  assert.equal(shareableEvent(jump, "invisible"), null);
  assert.equal(shareableEvent({ event: "Scan" }, "invisible"), null);
});
