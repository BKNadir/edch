// Share modes (top bar switch): Normal shares a journal event as it is, Invisible shares nothing;
// EDCH starts invisible unless Settings say Normal or "the last mode used".
import { test } from "node:test";
import assert from "node:assert/strict";
import { shareableEvent } from "../dist/js/services/sync/shareMode.js";
import { startSyncSettings } from "../dist/js/state/syncSettings.js";

const jump = {
  timestamp: "2026-11-12T10:00:00Z",
  event: "FSDJump",
  StarSystem: "HIP 1",
  StarPos: [0, 0, 0],
  SystemAddress: 1,
  Factions: [{ Name: "Some Faction", Influence: 0.4, FactionState: "War" }],
};

test("share modes: normal shares the event as it is, invisible nothing", () => {
  assert.equal(shareableEvent(jump, "normal"), jump);
  assert.equal(shareableEvent(jump, "invisible"), null);
  assert.equal(shareableEvent({ event: "MarketSell" }, "invisible"), null);
});

test("share modes: invisible at start-up by default, normal or the last one if chosen", () => {
  assert.equal(startSyncSettings(undefined).shareMode, "invisible");
  assert.equal(startSyncSettings({ shareMode: "normal" }).shareMode, "invisible", "default start: invisible");
  assert.equal(startSyncSettings({ shareMode: "invisible", startShareMode: "normal" }).shareMode, "normal");
  assert.equal(startSyncSettings({ shareMode: "normal", startShareMode: "last" }).shareMode, "normal");
  assert.equal(startSyncSettings({ shareMode: "bgs", startShareMode: "last" }).shareMode, "invisible", "old BGS mode");
  assert.equal(startSyncSettings({ startShareMode: "bogus" }).startShareMode, "invisible");
});
