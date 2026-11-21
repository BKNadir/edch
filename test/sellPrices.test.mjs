// Where to sell a commodity: Spansh's and Ardent's prices compared market by market (the most
// recent wins), recent markets only Ardent knows added, the minimum demand and the data age
// settings applied, best price first then the most recent.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import {
  ardentStationAllowed,
  bestRecentFirst,
  freshestQuote,
  meetsDemand,
  quoteTime,
  recentEnough,
} from "../dist/js/features/market/freshestQuote.js";
import { ardentQuotesOf } from "../dist/js/services/ardent.js";
import { validDataAge } from "../dist/js/state/dataAge.js";
import { findSellSpots } from "../dist/js/features/mining/miningSpots.js";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-14T20:00:00Z");
const ago = (days) => new Date(NOW - days * DAY).toISOString();

test("sell prices: Spansh's and Ardent's dates are both read", () => {
  assert.equal(quoteTime("2026-11-14 18:00:00+00"), Date.parse("2026-11-14T18:00:00Z"));
  assert.equal(quoteTime("2026-11-14T18:00:00.000Z"), Date.parse("2026-11-14T18:00:00Z"));
  assert.equal(quoteTime("2026-11-14 18:00:00"), Date.parse("2026-11-14T18:00:00Z"));
  assert.equal(quoteTime(undefined), Number.NEGATIVE_INFINITY);
});

test("sell prices: the most recently seen price wins", () => {
  const spansh = { price: 100, demand: 500, updated: "2026-11-10 12:00:00+00", source: "spansh" };
  const newer = { marketId: 1, price: 90, demand: 50, updated: "2026-11-14T10:00:00Z" };
  const older = { marketId: 1, price: 120, demand: 900, updated: "2026-11-01T10:00:00Z" };
  assert.deepEqual(freshestQuote(spansh, newer), {
    price: 90,
    demand: 50,
    updated: "2026-11-14T10:00:00Z",
    source: "ardent",
  });
  assert.equal(freshestQuote(spansh, older), spansh);
  assert.equal(freshestQuote(spansh, undefined), spansh);
});

test("sell prices: minimum demand, data age, and best price then most recent first", () => {
  assert.ok(meetsDemand({ demand: 100 }, 100));
  assert.ok(!meetsDemand({ demand: 99 }, 100));
  assert.ok(!meetsDemand({ demand: 0 }, 0), "no demand never counts");
  assert.ok(recentEnough(ago(6), 7, NOW));
  assert.ok(!recentEnough(ago(8), 7, NOW));
  assert.ok(!recentEnough(ago(400), 0, NOW), "a year-old price is never kept");
  assert.ok(!recentEnough(undefined, 30, NOW));
  assert.deepEqual([validDataAge(0), validDataAge(3), validDataAge(1000), validDataAge("x")], [90, 3, 90, 90]);
  const rows = [
    { price: 100, updated: ago(5) },
    { price: 120, updated: ago(3) },
    { price: 120, updated: ago(1) },
  ];
  assert.deepEqual(
    rows.sort(bestRecentFirst).map((r) => [r.price, r.updated]),
    [
      [120, ago(1)],
      [120, ago(3)],
      [100, ago(5)],
    ],
  );
});

test("sell prices: Ardent's rows and the search's station choices", () => {
  const quotes = ardentQuotesOf([
    {
      marketId: 7,
      sellPrice: 1000,
      demand: 300,
      updatedAt: "2026-11-14T10:00:00Z",
      stationName: "Ray Gateway",
      systemName: "Diaguandri",
      stationType: "Coriolis",
      maxLandingPadSize: 3,
      distance: 12,
    },
    { marketId: 8, sellPrice: 0, demand: 300, updatedAt: "2026-11-14T10:00:00Z" },
    { sellPrice: 500, updatedAt: "2026-11-14T10:00:00Z" },
  ]);
  assert.deepEqual([...quotes.keys()], [7]);
  assert.equal(quotes.get(7).padSize, 3);
  const all = { largePad: false, carriers: true, planetary: true };
  assert.ok(ardentStationAllowed({ stationType: "FleetCarrier", padSize: 3 }, all));
  assert.ok(!ardentStationAllowed({ stationType: "FleetCarrier", padSize: 3 }, { ...all, carriers: false }));
  assert.ok(!ardentStationAllowed({ stationType: "CraterOutpost", padSize: 3 }, { ...all, planetary: false }));
  assert.ok(!ardentStationAllowed({ stationType: "Outpost", padSize: 2 }, { ...all, largePad: true }));
});

test("mining: buyers from Spansh and Ardent merged, filtered and sorted", async () => {
  const recent = new Date(Date.now() - 2 * 3600_000).toISOString();
  const oldDate = new Date(Date.now() - 400 * DAY).toISOString();
  const spanshStation = (marketId, name, price, demand, updated) => ({
    market_id: marketId,
    name,
    system_name: "Sys " + name,
    distance: 10,
    market_updated_at: updated,
    market: [{ commodity: "Platinum", sell_price: price, demand }],
  });
  const calls = [];
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    calls.push(String(url));
    const reply = (body) => ({ status: 200, text: async () => JSON.stringify(body) });
    if (String(url).includes("spansh.co.uk"))
      return reply({
        results: [
          spanshStation(1, "A", 200000, 5000, oldDate), // Ardent saw it recently with a lower price.
          spanshStation(2, "B", 210000, 50, recent), // Not enough demand.
          spanshStation(3, "C", 250000, 9000, oldDate), // Too old, unknown to Ardent.
          spanshStation(4, "D", 190000, 8000, recent),
        ],
      });
    if (String(url).includes("/nearby/imports"))
      return reply([
        { marketId: 1, sellPrice: 180000, demand: 4000, updatedAt: recent, stationName: "A", systemName: "Sys A" },
        {
          marketId: 9,
          sellPrice: 230000,
          demand: 1200,
          updatedAt: recent,
          stationName: "Only Ardent",
          systemName: "Elsewhere",
          stationType: "Orbis",
          maxLandingPadSize: 3,
          distance: 40,
        },
      ]);
    return reply([]);
  };
  const ctx = {
    game: { data: { commodities: [{ id: "platinum", name: "Platinum", category: "Metals", rare: false }] } },
    store: {
      state: {
        settings: {
          maxDistance: 100,
          minSellDemand: 1000,
          maxAgeDays: 7,
          fallbackSystem: "Sol",
          sync: { edcn: false, edcnKey: "" },
        },
        cmdr: { location: { system: "Sol", pos: [0, 0, 0] } },
      },
    },
  };
  let found;
  try {
    found = await findSellSpots(ctx, "Platinum");
  } finally {
    globalThis.fetch = savedFetch;
  }
  assert.deepEqual(
    found.spots.map((s) => [s.station, s.price, s.source]),
    [
      ["Only Ardent", 230000, "ardent"],
      ["D", 190000, "spansh"],
      ["A", 180000, "ardent"],
    ],
  );
  const ardentCall = calls.find((u) => u.includes("/nearby/imports"));
  assert.match(ardentCall, /minVolume=1000/);
  assert.match(ardentCall, /maxDaysAgo=7/);
  assert.match(ardentCall, /system\/name\/Sol\/commodity\/name\/platinum/);
});
