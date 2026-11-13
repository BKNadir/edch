// BGS: the journal domain (actions for or against a faction, factions seen on arrival), Spansh's
// faction systems and EDSM's influence history decoded, the history kept between sessions, the
// page's rows, trend, forecast and alerts, the activity summary, the refresh tour, the tick and
// the report a squadron bot will read later.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyActivityEvents } from "../dist/js/game/activity/index.js";
import { emptyActivity } from "../dist/js/game/activity/state.js";
import { decodeFactionSystem } from "../dist/js/services/spansh.js";
import { decodeEdsmFactions } from "../dist/js/services/edsm.js";
import { recordSystem, validBgsHistory } from "../dist/js/state/bgsHistory.js";
import {
  activityFor,
  adviceFor,
  factionRows,
  influenceTrend,
  knownFactions,
  refreshTour,
} from "../dist/js/features/bgs/analysis.js";
import { BGS_REPORT_SCHEMA, bgsReport } from "../dist/js/features/bgs/report.js";

const FACTION = "Test Alliance";

/** An arrival in a system with two factions, as the journal writes it. */
const jump = (timestamp, system, address, influence, extra = {}) => ({
  timestamp,
  event: "FSDJump",
  StarSystem: system,
  SystemAddress: address,
  StarPos: [0, 0, 0],
  SystemFaction: { Name: FACTION },
  Factions: [
    { Name: FACTION, Influence: influence, FactionState: "Boom", ActiveStates: [{ State: "Boom" }] },
    { Name: "Rival Corp", Influence: 1 - influence - 0.1, FactionState: "None" },
    { Name: "Small Ones", Influence: 0.1, FactionState: "None" },
  ],
  ...extra,
});

function journal() {
  const activity = emptyActivity();
  applyActivityEvents(activity, [
    { timestamp: "2026-11-10T10:00:00Z", event: "LoadGame", Commander: "Test" },
    jump("2026-11-10T10:01:00Z", "Alpha", 11, 0.4),
    { timestamp: "2026-11-10T10:05:00Z", event: "Docked", StationName: "A Port", StationFaction: { Name: FACTION } },
    {
      timestamp: "2026-11-10T10:06:00Z",
      event: "MarketSell",
      Type: "gold",
      Count: 10,
      SellPrice: 50_000,
      TotalSale: 500_000,
      AvgPricePaid: 40_000,
    },
    {
      timestamp: "2026-11-10T10:07:00Z",
      event: "RedeemVoucher",
      Type: "bounty",
      Amount: 300_000,
      Factions: [{ Faction: FACTION, Amount: 300_000 }],
    },
    {
      timestamp: "2026-11-10T10:08:00Z",
      event: "MissionCompleted",
      Faction: FACTION,
      MissionID: 1,
      Reward: 1_000_000,
      FactionEffects: [
        { Faction: FACTION, Influence: [{ SystemAddress: 11, Trend: "UpGood", Influence: "+++" }] },
        { Faction: "Rival Corp", Influence: [{ SystemAddress: 11, Trend: "DownBad", Influence: "+" }] },
      ],
    },
    { timestamp: "2026-11-10T10:09:00Z", event: "Undocked", StationName: "A Port" },
    { timestamp: "2026-11-10T10:10:00Z", event: "CommitCrime", CrimeType: "assault", Faction: FACTION },
    jump("2026-11-10T11:00:00Z", "Alpha", 11, 0.45),
  ]);
  return activity;
}

test("bgs journal: actions for and against each faction, influence history per visit", () => {
  const { bgs } = journal();
  const kinds = bgs.actions.map((a) => `${a.kind}:${a.faction}:${a.against}`);
  assert.deepEqual(kinds, [
    `trade:${FACTION}:false`,
    `bounty:${FACTION}:false`,
    `mission:${FACTION}:false`,
    "mission:Rival Corp:true",
    `crime:${FACTION}:true`,
  ]);
  const trade = bgs.actions[0];
  assert.equal(trade.credits, 100_000);
  assert.equal(trade.system, "Alpha");
  const mission = bgs.actions[2];
  assert.equal(mission.influence, 3);
  assert.equal(mission.credits, 1_000_000);
  assert.equal(bgs.actions[3].influence, -1);
  const alpha = bgs.observed.Alpha;
  assert.equal(alpha.controlling, FACTION);
  assert.equal(alpha.factions[0].influence, 45);
  assert.deepEqual(alpha.factions[0].active, ["Boom"]);
  assert.equal(alpha.history.length, 2);
  assert.deepEqual(knownFactions(bgs.observed), ["Rival Corp", "Small Ones", FACTION].sort());
});

test("bgs activity: one row per system, missions by influence, the rest in credits", () => {
  const { bgs } = journal();
  const [row, ...others] = activityFor(bgs.actions, FACTION.toUpperCase(), "2026-11-10T00:00:00Z");
  assert.equal(others.length, 0);
  assert.equal(row.system, "Alpha");
  assert.equal(row.missions, 1);
  assert.equal(row.influence, 3);
  assert.equal(row.tradeProfit, 100_000);
  assert.equal(row.bounties, 300_000);
  assert.equal(row.against, 1);
  assert.deepEqual(activityFor(bgs.actions, FACTION, "2026-11-11T00:00:00Z"), []);
});

test("bgs report: the faction's actions of the period, without the faction repeated nor the commander", () => {
  const { bgs } = journal();
  const report = bgsReport(bgs.actions, FACTION, "2026-11-10T00:00:00Z", "2026-11-11T00:00:00Z", "0.10.13", "now");
  assert.equal(report.schema, BGS_REPORT_SCHEMA);
  assert.equal(report.actions.length, 4);
  assert.ok(report.actions.every((a) => !("faction" in a)));
  assert.ok(!JSON.stringify(report).includes('"Test"'));
});

test("spansh faction systems: influence 0–1 or 0–100, dates as ISO, nothing made up", () => {
  const system = decodeFactionSystem({
    name: "Beta",
    coords: { x: 1, y: 2, z: 3 },
    updated_at: "2026-11-10 12:00:00+00",
    controlling_minor_faction: FACTION,
    minor_faction_presences: [
      { name: FACTION, influence: 0.123, state: "War", active_states: [{ name: "War" }] },
      { name: "Rival Corp", influence: 55 },
      { name: "No Data" },
    ],
  });
  assert.deepEqual(system.coords, [1, 2, 3]);
  assert.equal(system.updatedAt, "2026-11-10T12:00:00.000Z");
  assert.equal(system.factions[0].influence, 12.3);
  assert.equal(system.factions[1].influence, 55);
  assert.ok(Number.isNaN(system.factions[2].influence));
  assert.equal(decodeFactionSystem({ name: "" }), null);
});

test("bgs rows: the newest data wins, alerts, advice and the refresh tour", () => {
  const { bgs } = journal();
  const now = Date.parse("2026-11-20T00:00:00Z");
  const presence = (name, influence, state = "None") => ({
    name,
    influence,
    state,
    active: state === "None" ? [] : [state],
    pending: [],
    recovering: [],
  });
  const known = {};
  // Older than the journal's visit: the journal wins.
  recordSystem(
    known,
    "Alpha",
    { coords: [0, 0, 0], snapshot: { at: "2026-11-01T00:00:00Z", source: "spansh", factions: [] } },
    now,
  );
  recordSystem(
    known,
    "Gamma",
    {
      coords: [10, 0, 0],
      snapshot: {
        at: "2026-11-19T00:00:00Z",
        source: "edsm",
        controlling: "Rival Corp",
        factions: [presence(FACTION, 3), presence("Rival Corp", 90)],
      },
    },
    now,
  );
  recordSystem(
    known,
    "Delta",
    {
      coords: [5, 0, 0],
      snapshot: {
        at: "2026-11-02T00:00:00Z",
        source: "spansh",
        factions: [presence(FACTION, 30, "War"), presence("Rival Corp", 29, "War")],
      },
    },
    now,
  );
  const rows = factionRows(FACTION, known, bgs.observed, now, [0, 0, 0]);
  const by = Object.fromEntries(rows.map((row) => [row.system, row]));
  assert.equal(by.Alpha.source, "journal");
  assert.equal(by.Alpha.influence, 45);
  assert.ok(by.Alpha.controls);
  assert.equal(by.Gamma.source, "edsm");
  assert.equal(by.Gamma.distance, 10);
  assert.ok(by.Gamma.alerts.includes("retreat"));
  assert.ok(by.Delta.alerts.includes("conflict"));
  assert.ok(by.Delta.alerts.includes("staleData"));
  assert.deepEqual(adviceFor(by.Delta), ["conflictZones"]);
  assert.deepEqual(adviceFor(by.Alpha), ["trade"]);
  // What is most at stake comes first: the war with a rival one point behind.
  assert.ok(by.Delta.alerts.includes("rivalClose"));
  assert.equal(rows[0].system, "Delta");
  const tour = refreshTour(rows, [0, 0, 0]).map((row) => row.system);
  assert.deepEqual(tour, ["Alpha", "Delta"]);
});

test("bgs trend: average change per day, forecast in 3 days, at risk when a rival passes", () => {
  const now = Date.parse("2026-11-20T00:00:00Z");
  const day = (n) => new Date(now - n * 86_400_000).toISOString();
  const samples = [
    { at: day(3), influences: { [FACTION]: 40, "Rival Corp": 30 } },
    { at: day(2), influences: { [FACTION]: 38, "Rival Corp": 32 } },
    { at: day(1), influences: { [FACTION]: 36, "Rival Corp": 34 } },
    // Too old for the trend window.
    { at: day(6), influences: { [FACTION]: 10 } },
  ];
  assert.equal(influenceTrend(samples, FACTION, now), -2);
  assert.equal(influenceTrend(samples, "Rival Corp", now), 2);
  assert.equal(influenceTrend(samples.slice(0, 1), FACTION, now), undefined);
  assert.equal(influenceTrend([samples[0], { ...samples[0], at: day(2.9) }], FACTION, now), undefined);

  const known = {};
  recordSystem(
    known,
    "Epsilon",
    {
      snapshot: {
        at: day(1),
        source: "edsm",
        factions: [
          { name: FACTION, influence: 36, state: "None", active: [], pending: [], recovering: [] },
          { name: "Rival Corp", influence: 34, state: "None", active: [], pending: [], recovering: [] },
        ],
      },
      samples,
    },
    now,
  );
  // The 6-day-old sample is kept (history: 7 days), only the trend ignores it.
  assert.equal(known.epsilon.history.length, 4);
  const [row] = factionRows(FACTION, known, {}, now);
  assert.equal(row.trend, -2);
  assert.equal(row.forecast, 30);
  assert.equal(row.rival.forecastGap, -10);
  assert.ok(row.alerts.includes("atRisk"));
});

test("bgs history: kept within 7 days, malformed entries dropped when read back", () => {
  const now = Date.parse("2026-11-20T00:00:00Z");
  const known = {};
  recordSystem(
    known,
    "Zeta",
    {
      samples: [
        { at: "2026-11-01T00:00:00Z", influences: { A: 10 } },
        { at: "2026-11-19T00:00:00Z", influences: { A: 12 } },
      ],
    },
    now,
  );
  assert.deepEqual(
    known.zeta.history.map((s) => s.at),
    ["2026-11-19T00:00:00Z"],
  );
  const back = validBgsHistory(
    JSON.parse(
      JSON.stringify({
        ...known,
        bad: { system: 42 },
        odd: {
          system: "Odd",
          coords: ["x"],
          history: [
            { at: "soon", influences: { A: 1 } },
            { at: "2026-11-19", influences: { A: 500 } },
          ],
        },
      }),
    ),
  );
  assert.deepEqual(Object.keys(back).sort(), ["odd", "zeta"]);
  assert.equal(back.odd.coords, undefined);
  assert.deepEqual(back.odd.history, []);
  assert.deepEqual(validBgsHistory("[]"), {});
});

test("edsm factions: influence and its history as percent, newest update, unknown system", () => {
  const answer = decodeEdsmFactions(
    "Eta",
    {
      controllingFaction: { name: FACTION },
      factions: [
        {
          name: FACTION,
          influence: 0.41,
          state: "Boom",
          activeStates: [{ state: "Boom" }],
          pendingStates: [{ state: "Expansion", trend: 0 }],
          lastUpdate: 1_763_500_000,
          influenceHistory: { 1_763_300_000: 0.39, 1_763_500_000: 0.41, 1_000: 0.1 },
        },
        { name: "Rival Corp", influence: 0.59, lastUpdate: 1_763_400_000, influenceHistory: { 1_763_500_000: 0.59 } },
      ],
    },
    1_700_000_000_000,
  );
  assert.equal(answer.controlling, FACTION);
  assert.equal(answer.updatedAt, new Date(1_763_500_000_000).toISOString());
  assert.equal(answer.factions[0].influence, 41);
  assert.deepEqual(answer.factions[0].pending, ["Expansion"]);
  assert.equal(answer.factions[1].state, "None");
  assert.deepEqual(
    answer.history.map((s) => s.influences),
    [{ [FACTION]: 39 }, { [FACTION]: 41, "Rival Corp": 59 }],
  );
  assert.equal(decodeEdsmFactions("Nowhere", []), null);
});

test("bgs tick: the detector's date as ISO, anything else refused", async () => {
  const { decodeTick } = await import("../dist/js/services/bgsTick.js");
  assert.equal(decodeTick('"2026-11-12T15:41:03Z"'), "2026-11-12T15:41:03.000Z");
  assert.throws(() => decodeTick('{"tick":"2026-11-12"}'));
  assert.throws(() => decodeTick('"soon"'));
  assert.throws(() => decodeTick("<html>"));
});
