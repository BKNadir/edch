import { test } from "node:test";
import assert from "node:assert/strict";
import { applyEvent, emptyState } from "../dist/js/journal.js";

test("a ship change is shown at once, without keeping the previous ship's name", () => {
  const s = emptyState();
  applyEvent(s, { event: "LoadGame", Ship: "Krait_MkII", Ship_Localised: "Krait Mk II", ShipID: 3, ShipName: "Nightjar", ShipIdent: "BK-01" });
  applyEvent(s, { event: "Loadout", Ship: "krait_mkii", ShipID: 3, ShipName: "Nightjar", ShipIdent: "BK-01", Modules: [] });
  assert.equal(s.ship.type, "Krait Mk II");
  applyEvent(s, { event: "ShipyardSwap", ShipType: "anaconda", ShipType_Localised: "Anaconda", ShipID: 7 });
  assert.equal(s.ship.type, "Anaconda");
  assert.equal(s.loadout, undefined);
  applyEvent(s, { event: "Loadout", Ship: "anaconda", ShipID: 7, ShipName: "Big", ShipIdent: "AN-1", Modules: [] });
  assert.equal(s.ship.type, "Anaconda");
  assert.equal(s.ship.name, "Big");
  // A Loadout alone (no swap event) must not reuse the old localised name either.
  applyEvent(s, { event: "Loadout", Ship: "python_nx", ShipID: 9, ShipName: "P2", Modules: [] });
  assert.equal(s.ship.type, "Python Mk II");
  applyEvent(s, { event: "SetUserShipName", Ship: "python_nx", ShipID: 9, UserShipName: "Renamed", UserShipId: "XX" });
  assert.equal(s.ship.name, "Renamed");
});

import { mergeMission, wingRows } from "../dist/js/wing.js";
import { applyActivity, emptyActivity } from "../dist/js/activity.js";

test("a shared mission accepted by a wingmate is linked by its id and shows the furthest progress", () => {
  // Real journals: VEKKIO accepted and shared it, MDLuffy accepted the share (nothing in his
  // journal) and only got a CargoDepot WingUpdate when the delivery was finished.
  const st = emptyActivity();
  applyActivity(st, { timestamp: "2026-11-01T10:01:54Z", event: "CargoDepot", MissionID: 1070079228, UpdateType: "WingUpdate", StartMarketID: 0, EndMarketID: 4385504003, ItemsCollected: 0, ItemsDelivered: 784, TotalItemsToDeliver: 784, Progress: 0.0 });
  const stub = st.missions[1070079228];
  assert.ok(stub, "the WingUpdate makes the mission known");
  assert.equal(stub.delivered, 784);

  const sharer = { id: 1070079228, name: "Mission_Mining_Boom", title: "Fièvre minière : 784 unités de la marchandise suivante : Bertrandite", faction: "Astra Militarum", destSystem: "LBN 623 Sector ND-S b4-1", destStation: "Hornby Town", expiry: "2026-11-08T09:11:51Z", status: "active", delivered: 384, total: 784, reward: 50000000 };
  const mine = { id: 1070079228, name: stub.name, title: stub.title, faction: "", status: "active", delivered: 784, total: 784 };
  const merged = mergeMission(mine, sharer);
  assert.equal(merged.faction, "Astra Militarum");
  assert.equal(merged.destStation, "Hornby Town");
  assert.equal(merged.delivered, 784);

  const now = Date.parse("2026-11-01T10:02:00Z");
  const rows = wingRows({ id: "me", name: "MDLuffy", at: "2026-11-01T10:02:00Z", missions: [mine] }, [{ id: "v", name: "VEKKIO", at: "2026-11-01T10:01:00Z", missions: [sharer] }], now);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].holders.sort(), ["me", "v"]);
  assert.equal(rows[0].mission.faction, "Astra Militarum");
  assert.equal(rows[0].mission.delivered, 784);
});
