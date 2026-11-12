// Fleet carrier holds on the Colonisation page: rebuilt from transfers, trades and the carrier's
// market, through every back-and-forth between the ship and the carrier.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyActivityEvents } from "../dist/js/game/activity/index.js";
import { noteCarrierStock } from "../dist/js/game/activity/carriers.js";
import { emptyActivity } from "../dist/js/game/activity/state.js";
import { applyMarketFile } from "../dist/js/game/journal/companionFiles.js";
import { applyLines } from "../dist/js/game/journal/events.js";
import { emptyState } from "../dist/js/game/journal/state.js";

const CARRIER = 3702811392;
const STATION = 128666762;
const at = (minute) => `2026-11-12T10:${String(minute).padStart(2, "0")}:00Z`;
const dockCarrier = (minute) => ({
  timestamp: at(minute),
  event: "Docked",
  StationName: "H7N-WVK",
  StationType: "FleetCarrier",
  MarketID: CARRIER,
});
const dockStation = (minute) => ({
  timestamp: at(minute),
  event: "Docked",
  StationName: "Jameson Memorial",
  StationType: "Orbis",
  MarketID: STATION,
});
const undock = (minute, marketId) => ({ timestamp: at(minute), event: "Undocked", MarketID: marketId });
const transfer = (minute, count, direction) => ({
  timestamp: at(minute),
  event: "CargoTransfer",
  Transfers: [{ Type: "steel", Type_Localised: "Steel", Count: count, Direction: direction }],
});
const steelOn = (st) => st.carriers[CARRIER]?.items.steel?.count ?? 0;

test("carrier hold: deposit, take back, leave and come back", () => {
  const st = emptyActivity();
  applyActivityEvents(st, [
    dockCarrier(1),
    transfer(2, 400, "tocarrier"),
    transfer(3, 150, "toship"),
    undock(4, CARRIER),
    // Away from the carrier: nothing changes its hold.
    dockStation(10),
    { timestamp: at(11), event: "MarketSell", MarketID: STATION, Type: "steel", Count: 50, TotalSale: 1 },
    { timestamp: at(12), event: "MarketBuy", MarketID: STATION, Type: "steel", Count: 300 },
    undock(13, STATION),
    dockCarrier(20),
    transfer(21, 300, "tocarrier"),
  ]);
  assert.equal(steelOn(st), 400 - 150 + 300);
});

test("carrier hold: buying from and selling to the carrier's market", () => {
  const st = emptyActivity();
  applyActivityEvents(st, [
    dockCarrier(1),
    transfer(2, 500, "tocarrier"),
    { timestamp: at(3), event: "MarketBuy", MarketID: CARRIER, Type: "steel", Count: 120 },
    { timestamp: at(4), event: "MarketSell", MarketID: CARRIER, Type: "steel", Count: 20, TotalSale: 1 },
  ]);
  assert.equal(steelOn(st), 500 - 120 + 20);
});

test("carrier hold: the market's stock is a floor, later transfers count from it", () => {
  // Steel already on the carrier before the journal history: only its market shows it.
  const cmdr = emptyState();
  applyMarketFile(cmdr, {
    timestamp: at(2),
    MarketID: CARRIER,
    StationName: "H7N-WVK",
    StationType: "FleetCarrier",
    Items: [{ Name: "$steel_name;", Name_Localised: "Steel", Stock: 800, Demand: 0 }],
  });
  const st = emptyActivity();
  applyActivityEvents(st, [dockCarrier(1), transfer(1, 100, "tocarrier")]);
  assert.equal(steelOn(st), 100);
  // Live: Market.json read → the hold holds at least the 800 offered.
  noteCarrierStock(st, CARRIER, cmdr.carrierMarkets[CARRIER]);
  assert.equal(steelOn(st), 800);
  // Taking some back after leaving the market lowers it (the old stock no longer hides it).
  applyActivityEvents(st, [transfer(3, 300, "toship"), undock(4, CARRIER)]);
  assert.equal(steelOn(st), 500);
});

test("carrier hold: after a restart, the replay applies the market where it was read", () => {
  const cmdr = emptyState();
  applyMarketFile(cmdr, {
    timestamp: at(2),
    MarketID: CARRIER,
    StationName: "H7N-WVK",
    StationType: "FleetCarrier",
    Items: [{ Name: "$steel_name;", Name_Localised: "Steel", Stock: 800, Demand: 0 }],
  });
  // A trade after the read changes the snapshot, not when it was read.
  applyLines(cmdr, [
    JSON.stringify({ timestamp: at(3), event: "MarketBuy", MarketID: CARRIER, Type: "steel", Count: 100 }),
  ]);
  const st = emptyActivity();
  const carrierMarket = (marketId) => cmdr.carrierMarkets[marketId];
  applyActivityEvents(
    st,
    [
      dockCarrier(1),
      { timestamp: at(2), event: "Market", MarketID: CARRIER, StationName: "H7N-WVK" },
      { timestamp: at(3), event: "MarketBuy", MarketID: CARRIER, Type: "steel", Count: 100 },
      transfer(4, 200, "toship"),
      undock(5, CARRIER),
    ],
    { carrierMarket },
  );
  assert.equal(steelOn(st), 800 - 100 - 200);
});

test("ship hold: a commodity on several lines of the Cargo event is added up", () => {
  const cmdr = emptyState();
  applyLines(cmdr, [
    JSON.stringify({
      timestamp: at(1),
      event: "Cargo",
      Vessel: "Ship",
      Count: 30,
      Inventory: [
        { Name: "steel", Count: 20, Stolen: 0 },
        { Name: "steel", Count: 10, Stolen: 0, MissionID: 42 },
      ],
    }),
  ]);
  assert.equal(cmdr.cargo.steel, 30);
});

test("carrier hold: donating tritium for fuel comes from the ship, not the carrier's hold", () => {
  const st = emptyActivity();
  applyActivityEvents(st, [
    dockCarrier(1),
    {
      timestamp: at(2),
      event: "CargoTransfer",
      Transfers: [{ Type: "tritium", Count: 786, Direction: "tocarrier" }],
    },
    { timestamp: at(3), event: "CarrierDepositFuel", CarrierID: CARRIER, Amount: 415, Total: 1000 },
  ]);
  assert.equal(st.carriers[CARRIER].items.tritium.count, 786);
});
