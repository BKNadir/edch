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

test("bounties and combat bonds count at the kill (Thargoids too); cashing in is kept apart", async () => {
  const { applyActivity } = await import("../dist/js/game/activity/index.js");
  const activity = emptyActivity();
  const at = "2026-11-06T20:57:10Z";
  applyActivity(activity, { event: "LoadGame", timestamp: "2026-11-06T20:00:00Z", Credits: 1000 });
  for (let i = 0; i < 7; i++)
    applyActivity(activity, {
      event: "FactionKillBond",
      timestamp: at,
      Reward: 80000,
      AwardingFaction: "$faction_PilotsFederation;",
      VictimFaction: "$faction_Thargoid;",
    });
  applyActivity(activity, { event: "Bounty", timestamp: at, TotalReward: 25000, VictimFaction: "Pirates" });
  assert.equal(activity.session.kills, 8);
  assert.equal(activity.session.bonds, 560000);
  assert.equal(activity.session.bounties, 25000);
  // Cashing in doesn't count twice.
  applyActivity(activity, { event: "RedeemVoucher", timestamp: at, Type: "CombatBond", Amount: 560000 });
  assert.equal(activity.session.bonds, 560000);
  assert.equal(activity.session.bondsCashed, 560000);
});
