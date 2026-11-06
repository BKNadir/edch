// Thargoids page: kills recognised by their combat bond, AX conflict zones, and the session's bonds
// still counted (FactionKillBond is handled by two domains).
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyActivityEvents } from "../dist/js/game/activity/index.js";
import { emptyActivity } from "../dist/js/game/activity/state.js";
import { axZoneIntensity, killsByType, thargoidType } from "../dist/js/game/activity/thargoids.js";

/** A Thargoid kill bond as the journal writes it. */
const thargoidBond = (timestamp, reward) => ({
  timestamp,
  event: "FactionKillBond",
  Reward: reward,
  AwardingFaction: "$faction_PilotsFederation;",
  VictimFaction: "$faction_Thargoid;",
});

test("thargoid type: recognised from the bond", () => {
  assert.equal(thargoidType(80_000), "scout");
  assert.equal(thargoidType(65_000), "scout");
  assert.equal(thargoidType(4_500_000), "hunter");
  assert.equal(thargoidType(8_000_000), "cyclops");
  assert.equal(thargoidType(15_000_000), "orthrus");
  assert.equal(thargoidType(24_000_000), "basilisk");
  assert.equal(thargoidType(40_000_000), "medusa");
  assert.equal(thargoidType(60_000_000), "hydra");
  assert.equal(thargoidType(3_000_000), "unknown");
});

test("thargoid kills: by type, the session's bonds still counted", () => {
  const activity = emptyActivity();
  applyActivityEvents(activity, [
    { timestamp: "2026-10-12T08:50:00Z", event: "LoadGame", Commander: "Test" },
    { timestamp: "2026-10-12T08:51:00Z", event: "FSDJump", StarSystem: "HIP 1", StarPos: [0, 0, 0] },
    {
      timestamp: "2026-10-12T08:54:53Z",
      event: "SupercruiseDestinationDrop",
      Type: "$Warzone_TG_Med:#index=1;",
      Type_Localised: "AX Conflict Zone [Medium Intensity]",
    },
    thargoidBond("2026-10-12T08:55:56Z", 80_000),
    thargoidBond("2026-10-12T08:59:40Z", 8_000_000),
    thargoidBond("2026-10-12T09:00:45Z", 8_000_000),
    // A kill bond against humans is no Thargoid.
    { timestamp: "2026-10-12T09:01:00Z", event: "FactionKillBond", Reward: 30_000, VictimFaction: "Some Faction" },
  ]);
  const byType = killsByType(activity.thargoids.kills);
  assert.deepEqual(byType.get("scout"), { count: 1, credits: 80_000 });
  assert.deepEqual(byType.get("cyclops"), { count: 2, credits: 16_000_000 });
  assert.equal(activity.thargoids.kills.length, 3);
  assert.equal(activity.thargoids.kills[0].system, "HIP 1");
  assert.equal(activity.session.kills, 4);
  assert.equal(activity.session.bonds, 16_110_000);
  assert.equal(activity.thargoids.zones.length, 1);
  assert.equal(activity.thargoids.zones[0].intensity, "med");
  assert.equal(activity.thargoids.zones[0].label, "AX Conflict Zone [Medium Intensity]");
});

test("AX zone intensity from its symbol", () => {
  assert.equal(axZoneIntensity("$Warzone_TG_High:#index=1;"), "high");
  assert.equal(axZoneIntensity("$Warzone_TG_VeryHigh:#index=1;"), "veryhigh");
});
