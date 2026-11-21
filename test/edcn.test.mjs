// EDCN: asked only when turned on, with the key this copy got, its answers read in the shapes EDCH already compares
// (Ardent's quotes, EliteBGS's systems), and for each market or system the most recent data of
// all sources kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { edcnKeyring, edcnPadSize, edcnQueryValue, edcnQuotesOf, edcnSystemOf } from "../dist/js/services/edcn.js";
import { freshestQuote, newestZoneQuotes, QUOTE_SOURCE_LABELS } from "../dist/js/features/market/freshestQuote.js";
import { newestSystem } from "../dist/js/features/systems/freshFactions.js";

/** A store holding only the Sync settings, as the keyring sees the app's. */
function fakeStore(sync) {
  return {
    state: { settings: { sync } },
    updateSettings(patch) {
      this.state.settings = { ...this.state.settings, ...patch };
    },
  };
}

const KEY = "0123456789abcdef0123456789abcdef";

test("EDCN is asked only when turned on, with the key this copy got", async () => {
  assert.equal(await edcnKeyring(fakeStore({ edcn: false, edcnKey: KEY }))(), null);
  const store = fakeStore({ edcn: true, edcnKey: KEY });
  const access = await edcnKeyring(store)();
  assert.equal(access.key, KEY);
  // EDCN no longer knows the key: it is dropped, a new one is asked next time.
  access.forget();
  assert.equal(store.state.settings.sync.edcnKey, "");
  // Outside the app (here, the tests) registering can't happen: no access, nothing kept.
  assert.equal(await edcnKeyring(store)(), null);
  assert.equal(store.state.settings.sync.edcnKey, "");
});

test("names go into EDCN's queries with only the characters its door accepts", () => {
  assert.equal(edcnQueryValue("Barnard's Star"), "Barnard%27s%20Star");
  assert.equal(edcnQueryValue("Synuefe UW-I a91-4"), "Synuefe%20UW-I%20a91-4");
  assert.match(edcnQueryValue("Col 285 Sector (A) *!"), /^[A-Za-z0-9%\-_.~]+$/);
});

test("the largest landing pad from EDCN's pads", () => {
  assert.equal(edcnPadSize({ Small: 4, Medium: 4, Large: 2 }, true), 3);
  assert.equal(edcnPadSize({ Small: 4, Medium: 1 }, false), 2);
  assert.equal(edcnPadSize({ Small: 2 }, false), 1);
  assert.equal(edcnPadSize(undefined, false), 0);
});

const OFFERS = [
  {
    marketId: 128016640,
    station: "Galileo",
    type: "Ocellus",
    system: "Sol",
    distanceLy: 0,
    distanceLs: 507.97,
    largePad: true,
    pads: { Large: 6 },
    buy: 53710,
    sell: 52606,
    stock: 533120,
    demand: 1,
    updated: "2026-11-21T11:35:56Z",
  },
  { marketId: 1, station: "No price", system: "Sol", buy: 0, sell: 0, updated: "2026-11-21T11:35:56Z" },
];

test("EDCN's offers become quotes like Ardent's, marked EDCN", () => {
  const buying = edcnQuotesOf(OFFERS, true);
  assert.equal(buying.size, 1);
  const galileo = buying.get(128016640);
  assert.equal(galileo.price, 53710);
  assert.equal(galileo.demand, 533120);
  assert.equal(galileo.padSize, 3);
  assert.equal(galileo.stationType, "Ocellus");
  assert.equal(galileo.source, "edcn");
  assert.equal(edcnQuotesOf(OFFERS, false).get(128016640).demand, 1);
  assert.equal(QUOTE_SOURCE_LABELS.edcn, "EDCN");
});

test("for each market, the most recently seen price of Spansh, Ardent and EDCN wins", () => {
  const ardent = new Map([
    [1, { marketId: 1, price: 100, demand: 10, updated: "2026-11-20T10:00:00Z" }],
    [2, { marketId: 2, price: 200, demand: 20, updated: "2026-11-21T10:00:00Z" }],
  ]);
  const edcn = new Map([
    [1, { marketId: 1, price: 110, demand: 11, updated: "2026-11-21T09:00:00Z", source: "edcn" }],
    [2, { marketId: 2, price: 210, demand: 21, updated: "2026-11-20T09:00:00Z", source: "edcn" }],
    [3, { marketId: 3, price: 300, demand: 30, updated: "2026-11-19T09:00:00Z", source: "edcn" }],
  ]);
  const zone = newestZoneQuotes(ardent, edcn);
  assert.equal(zone.get(1).price, 110);
  assert.equal(zone.get(2).price, 200);
  assert.equal(zone.get(3).source, "edcn");
  const spansh = { price: 90, demand: 9, updated: "2026-11-21 08:00:00+00", source: "spansh" };
  assert.equal(freshestQuote(spansh, zone.get(1)).source, "edcn");
  assert.equal(freshestQuote(spansh, zone.get(2)).source, "ardent");
  assert.equal(freshestQuote(spansh, zone.get(3)).source, "spansh");
});

test("an EDCN system reads like an EliteBGS one, and the most recent of the two wins", () => {
  const edcn = edcnSystemOf({
    name: "Sol",
    controllingFaction: "Mother Gaia",
    factionsUpdated: "2026-11-21T14:32:18Z",
    factions: [
      { name: "Mother Gaia", influence: 30.1, state: "Expansion", active: ["Expansion"] },
      { name: "Sol Workers' Party", influence: 21.8, state: "None" },
    ],
  });
  assert.equal(edcn.controlling, "Mother Gaia");
  assert.equal(edcn.controllingState, "Expansion");
  assert.equal(edcn.factions[0].influence, 30.1);
  assert.deepEqual(edcn.factions[1].active, []);
  assert.equal(edcnSystemOf({ name: "Empty", factions: [] }), null);
  const eliteBgs = { name: "Sol", updatedAt: "2026-11-20T00:00:00Z", factions: [] };
  assert.equal(newestSystem([eliteBgs, edcn]), edcn);
  assert.equal(newestSystem([eliteBgs, undefined]), eliteBgs);
  assert.equal(newestSystem([undefined, undefined]), undefined);
});
