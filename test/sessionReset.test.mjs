// "Reset counters": the pages show the counters since the reset, until the next game session.
import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyActivity } from "../dist/js/game/activity/state.js";
import {
  miningSinceReset,
  powerplaySessionStart,
  resetMiningCounters,
  resetPowerplayCounters,
  resetSessionCounters,
  sessionSinceReset,
} from "../dist/js/state/sessionReset.js";

/** An activity in a game session started at `start`, with some counters. */
function activityAt(start) {
  const activity = emptyActivity();
  activity.session = { ...activity.session, start, jumps: 10, bounties: 500_000, credits: 1_000_000 };
  activity.mining = { ...activity.mining, prospected: 4, refined: { painite: { label: "Painite", count: 20 } } };
  return activity;
}

test("session: counters since the reset, the game's credits kept", () => {
  const activity = activityAt("2026-11-06T18:00:00Z");
  resetSessionCounters(activity);
  activity.session.jumps += 3;
  activity.session.bounties += 100_000;
  const since = sessionSinceReset(activity);
  assert.equal(since.jumps, 3);
  assert.equal(since.bounties, 100_000);
  assert.equal(since.credits, 1_000_000);
  assert.notEqual(since.start, activity.session.start, "counted from the reset");
  // A new game session (LoadGame): from zero as usual, the reset no longer applies.
  const next = activityAt("2026-11-07T18:00:00Z");
  assert.equal(sessionSinceReset(next).jumps, 10);
});

test("mining: counters and tonnes per mineral since the reset, the last asteroids stay", () => {
  const activity = activityAt("2026-11-06T18:00:00Z");
  activity.mining.last = [{ at: "2026-11-06T18:30:00Z", materials: [] }];
  resetMiningCounters(activity);
  activity.mining.prospected += 2;
  activity.mining.refined.painite.count += 5;
  activity.mining.refined.platinum = { label: "Platinum", count: 3 };
  const since = miningSinceReset(activity);
  assert.equal(since.prospected, 2);
  assert.deepEqual(since.refined, {
    painite: { label: "Painite", count: 5 },
    platinum: { label: "Platinum", count: 3 },
  });
  assert.equal(since.last.length, 1);
});

test("powerplay: the session's merits count from the reset", () => {
  const activity = activityAt("2026-11-06T18:00:00Z");
  assert.equal(powerplaySessionStart(activity), "2026-11-06T18:00:00Z");
  resetPowerplayCounters(activity);
  assert.ok(powerplaySessionStart(activity) > "2026-11-06T18:00:00Z");
});
