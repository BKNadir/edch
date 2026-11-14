// Search: results in the order chosen (price, distance, volume, most recent, distance to star),
// unknown values last, ties broken by price then recency; the distance-to-star filter.
import { test } from "node:test";
import assert from "node:assert/strict";
import { STATION_SORTS, arrivalAllowed, stationOrder } from "../dist/js/features/search/stationSort.js";

const rows = [
  { id: "a", price: 100, volume: 50, distance: 30, arrival: 500, seen: 3 },
  { id: "b", price: 120, volume: 900, distance: 10, arrival: 9000, seen: 1 },
  { id: "c", price: 120, volume: 10, distance: 20, seen: 2 },
  { id: "d", distance: 5, arrival: 100 },
];
const ids = (sort, buying) => [...rows].sort(stationOrder(sort, buying)).map((r) => r.id);

test("station sort: price, distance, volume, recency, star distance", () => {
  assert.deepEqual(ids("price", false), ["c", "b", "a", "d"], "selling: best price, then most recent");
  assert.deepEqual(ids("price", true), ["a", "c", "b", "d"], "buying: cheapest first");
  assert.deepEqual(ids("distance", false), ["d", "b", "c", "a"]);
  assert.deepEqual(ids("volume", false), ["b", "a", "c", "d"]);
  assert.deepEqual(ids("recent", false), ["a", "c", "b", "d"]);
  assert.deepEqual(ids("arrival", false), ["d", "a", "b", "c"]);
});

test("station sort: each search offers its sorts, the first one by default", () => {
  assert.equal(STATION_SORTS.sell[0], "price");
  assert.equal(STATION_SORTS.service[0], "distance");
  assert.ok(!STATION_SORTS.module.includes("price"));
});

test("station sort: distance to star filter", () => {
  assert.ok(arrivalAllowed(900, 1000));
  assert.ok(!arrivalAllowed(1500, 1000));
  assert.ok(arrivalAllowed(250000, 0), "0: any distance");
  assert.ok(arrivalAllowed(undefined, 1000), "unknown: kept");
});
