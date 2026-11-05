import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { applyEvent } from "../dist/js/game/journal/events.js";
import { emptyState } from "../dist/js/game/journal/state.js";

test("a ship change is shown at once, without keeping the previous ship's name", () => {
  const s = emptyState();
  applyEvent(s, {
    event: "LoadGame",
    Ship: "Krait_MkII",
    Ship_Localised: "Krait Mk II",
    ShipID: 3,
    ShipName: "Nightjar",
    ShipIdent: "BK-01",
  });
  applyEvent(s, {
    event: "Loadout",
    Ship: "krait_mkii",
    ShipID: 3,
    ShipName: "Nightjar",
    ShipIdent: "BK-01",
    Modules: [],
  });
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

import { mergeMission, wingRows } from "../dist/js/services/wing.js";
import { applyActivity } from "../dist/js/game/activity/index.js";
import { emptyActivity } from "../dist/js/game/activity/state.js";

test("a shared mission accepted by a wingmate is linked by its id and shows the furthest progress", () => {
  // Real journals: VEKKIO accepted and shared it, MDLuffy accepted the share (nothing in his
  // journal) and only got a CargoDepot WingUpdate when the delivery was finished.
  const st = emptyActivity();
  applyActivity(st, {
    timestamp: "2026-11-01T10:01:54Z",
    event: "CargoDepot",
    MissionID: 1070079228,
    UpdateType: "WingUpdate",
    StartMarketID: 0,
    EndMarketID: 4385504003,
    ItemsCollected: 0,
    ItemsDelivered: 784,
    TotalItemsToDeliver: 784,
    Progress: 0.0,
  });
  const stub = st.missions[1070079228];
  assert.ok(stub, "the WingUpdate makes the mission known");
  assert.equal(stub.delivered, 784);

  const sharer = {
    id: 1070079228,
    name: "Mission_Mining_Boom",
    title: "Fièvre minière : 784 unités de la marchandise suivante : Bertrandite",
    faction: "Astra Militarum",
    destSystem: "LBN 623 Sector ND-S b4-1",
    destStation: "Hornby Town",
    expiry: "2026-11-08T09:11:51Z",
    status: "active",
    delivered: 384,
    total: 784,
    reward: 50000000,
  };
  const mine = {
    id: 1070079228,
    name: stub.name,
    title: stub.title,
    faction: "",
    status: "active",
    delivered: 784,
    total: 784,
  };
  const merged = mergeMission(mine, sharer);
  assert.equal(merged.faction, "Astra Militarum");
  assert.equal(merged.destStation, "Hornby Town");
  assert.equal(merged.delivered, 784);

  const now = Date.parse("2026-11-01T10:02:00Z");
  const rows = wingRows(
    { id: "me", name: "MDLuffy", at: "2026-11-01T10:02:00Z", missions: [mine] },
    [{ id: "v", name: "VEKKIO", at: "2026-11-01T10:01:00Z", missions: [sharer] }],
    now,
  );
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].holders.sort(), ["me", "v"]);
  assert.equal(rows[0].mission.faction, "Astra Militarum");
  assert.equal(rows[0].mission.delivered, 784);
});

test("a fleet carrier's hold is rebuilt from transfers, fuel deposits and carrier market trades", () => {
  // Real lines from a journal (own carrier H7N-WVK).
  const st = emptyActivity();
  const lines = [
    {
      timestamp: "2026-10-05T07:42:31Z",
      event: "Docked",
      StationName: "[DSFS] THOUSAND SUNNY H7N-WVK",
      StationType: "FleetCarrier",
      MarketID: 3702811392,
      StarSystem: "Mbutsi",
    },
    {
      timestamp: "2026-10-05T09:03:46Z",
      event: "CargoTransfer",
      Transfers: [
        { Type: "powertransferconduits", Type_Localised: "Power Transfer Bus", Count: 17, Direction: "tocarrier" },
        { Type: "powerconverter", Type_Localised: "Power Converter", Count: 18, Direction: "tocarrier" },
      ],
    },
    {
      timestamp: "2026-10-11T12:06:25Z",
      event: "CargoTransfer",
      Transfers: [{ Type: "tritium", Count: 786, Direction: "tocarrier" }],
    },
    { timestamp: "2026-10-11T12:07:00Z", event: "CarrierDepositFuel", CarrierID: 3702811392, Amount: 200, Total: 1000 },
    {
      timestamp: "2026-10-11T12:08:00Z",
      event: "CargoTransfer",
      Transfers: [{ Type: "powerconverter", Count: 8, Direction: "toship" }],
    },
    {
      timestamp: "2026-10-11T12:09:00Z",
      event: "MarketSell",
      MarketID: 3702811392,
      Type: "steel",
      Type_Localised: "Steel",
      Count: 100,
      SellPrice: 1,
      TotalSale: 100,
      AvgPricePaid: 1,
    },
    {
      timestamp: "2026-10-11T12:10:00Z",
      event: "Undocked",
      StationName: "[DSFS] THOUSAND SUNNY H7N-WVK",
      MarketID: 3702811392,
    },
    {
      timestamp: "2026-10-11T12:11:00Z",
      event: "CargoTransfer",
      Transfers: [{ Type: "steel", Count: 5, Direction: "tocarrier" }],
    },
    {
      timestamp: "2026-10-29T15:42:53Z",
      event: "CarrierStats",
      CarrierID: 3702811392,
      CarrierType: "FleetCarrier",
      Callsign: "H7N-WVK",
      Name: "[DSFS] THOUSAND SUNNY",
      SpaceUsage: { Cargo: 2486 },
    },
  ];
  for (const e of lines) applyActivity(st, e);
  const c = st.carriers[3702811392];
  assert.equal(c.mine, true);
  assert.equal(c.total, 2486);
  assert.equal(c.items.powertransferconduits.count, 17);
  assert.equal(c.items.powerconverter.count, 10);
  assert.equal(c.items.tritium.count, 586);
  assert.equal(c.items.steel.count, 100, "a transfer after undocking doesn't count");
});

import { applyEvent as applyJournal } from "../dist/js/game/journal/events.js";
import { applyMarketFile } from "../dist/js/game/journal/companionFiles.js";
import { emptyState as emptyCmdr } from "../dist/js/game/journal/state.js";

test("a carrier's market comes from Market.json and follows purchases made there", () => {
  const s = emptyCmdr();
  applyMarketFile(s, {
    timestamp: "2026-11-01T13:28:19Z",
    event: "Market",
    MarketID: 3708867072,
    StationName: "T7G-27Z",
    StationType: "FleetCarrier",
    Items: [
      { Name: "$steel_name;", Name_Localised: "Steel", Stock: 1200, Demand: 0, BuyPrice: 5000, SellPrice: 0 },
      { Name: "$aluminium_name;", Name_Localised: "Aluminium", Stock: 0, Demand: 800, BuyPrice: 0, SellPrice: 900 },
    ],
  });
  const m = s.carrierMarkets[3708867072];
  assert.equal(m.selling.steel.count, 1200);
  assert.equal(m.buying.aluminium.count, 800);
  applyJournal(s, {
    timestamp: "2026-11-01T13:28:41Z",
    event: "MarketBuy",
    MarketID: 3708867072,
    Type: "steel",
    Count: 200,
    BuyPrice: 5000,
    TotalCost: 1000000,
  });
  assert.equal(s.carrierMarkets[3708867072].selling.steel.count, 1000);
  // A station that isn't a carrier is ignored.
  assert.equal(
    applyMarketFile(s, { timestamp: "2026-11-01T14:00:00Z", MarketID: 128666762, StationType: "Coriolis", Items: [] }),
    false,
  );
});
