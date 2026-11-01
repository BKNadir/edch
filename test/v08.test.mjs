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
