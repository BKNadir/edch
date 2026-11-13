// The BGS refresh tour as a route: started by a click, each arrival moves on to the next stop
// (the copy itself needs the app; here navAutoCopy is off, only the order is checked).
import { test } from "node:test";
import assert from "node:assert/strict";
import { bgsTourArrival, bgsTourTarget, setBgsTourStops, startBgsTour } from "../dist/js/features/bgs/tourCopy.js";

const store = { state: { settings: { navAutoCopy: false, navNotifyCopy: false } } };

test("bgs tour: nothing in progress until a stop is clicked", () => {
  setBgsTourStops(["Alpha", "Beta", "Gamma"]);
  assert.equal(bgsTourTarget(), null);
  bgsTourArrival(store, "Alpha");
  assert.equal(bgsTourTarget(), null);
});

test("bgs tour: arriving at the target moves on to the next stop, in order", () => {
  setBgsTourStops(["Alpha", "Beta", "Gamma"]);
  startBgsTour("Beta");
  assert.equal(bgsTourTarget().system, "Beta");
  // Elsewhere: still heading to Beta.
  bgsTourArrival(store, "Alpha");
  assert.equal(bgsTourTarget().system, "Beta");
  bgsTourArrival(store, "beta");
  assert.equal(bgsTourTarget().system, "Gamma");
  // The page drew the tour again without the visited systems.
  setBgsTourStops(["Alpha", "Gamma"]);
  bgsTourArrival(store, "Gamma");
  assert.equal(bgsTourTarget().system, "Alpha");
});
