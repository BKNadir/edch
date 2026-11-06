// Missing data: what the game shows that EDCH's data lacks, noted once per gap, without private data.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { readFileSync } from "node:fs";

// The toasts and the clipboard aren't used here; the tour module needs a stand-in page.
globalThis.document ??= { getElementById: () => ({ textContent: "", classList: { add() {}, remove() {} } }) };
globalThis.window ??= { setTimeout: () => 0, clearTimeout() {} };

const { Game } = await import("../dist/js/game/data.js");
const { emptyState } = await import("../dist/js/game/journal/state.js");
const { DEFAULT_ENGINEER_SETTINGS } = await import("../dist/js/state/store.js");
const { bindTour, tourEvent } = await import("../dist/js/features/engineers/tour.js");
const { dataGaps, gapLine, gapsText, newReport, pendingReport, recordGap } =
  await import("../dist/js/features/dataGaps/missingData.js");

const game = new Game(JSON.parse(readFileSync(new URL("../public/data/game.json", import.meta.url))));

function bindWithShip() {
  const cmdr = emptyState();
  cmdr.gameVersion = "4.2.3.0";
  const settings = { engineers: { ...DEFAULT_ENGINEER_SETTINGS, autoTick: false }, fallbackSystem: "Sol" };
  bindTour({ game, store: { state: { wishlist: [], settings, cmdr }, notify() {}, setWishlist() {} } });
}

/** The gap noted for `engineer` and `module`, if any. */
const gapOf = (engineer, module) => dataGaps().find((gap) => gap.engineer === engineer && gap.module === module);

test("a gap seen again is counted once, with the highest grade", () => {
  const gap = { kind: "engineerGrade", engineer: "Test Engineer", module: "Life Support", blueprint: "Reinforced" };
  recordGap({ ...gap, grade: 4, dataGrade: 3 });
  recordGap({ ...gap, grade: 5, dataGrade: 3 });
  const noted = gapOf("Test Engineer", "Life Support");
  assert.equal(noted.count, 2);
  assert.equal(noted.grade, 5);
  assert.match(
    gapLine(noted),
    /Engineer grade beyond the data \| Test Engineer \| Life Support \| Reinforced \| G5 \(data: G3\)/,
  );
});

test("the ship's engineering the data doesn't know is noted (Guardian weapons), the rest isn't", () => {
  bindWithShip();
  const before = dataGaps().length;
  const slef = JSON.parse(readFileSync(new URL("./fixtures/caspian-slef.json", import.meta.url), "utf8"))[0].data;
  tourEvent({ ...slef, event: "Loadout" });
  const lines = dataGaps()
    .slice(before)
    .map((gap) => `${gap.module} | ${gap.blueprint}`);
  assert.deepEqual(lines.sort(), [
    "Caustic Sink Launcher | Misc_HeatSinkCapacity",
    "Guardian Plasma Charger | Weapon_Overcharged",
  ]);
  assert.equal(dataGaps().find((gap) => gap.module === "Guardian Plasma Charger").count, 6, "six chargers, one gap");
  // The game's version is kept with a "v": the log filter would mask a bare "4.2.3.0" as an IP address.
  assert.match(gapsText(), /game v4\.2\.3\.0/);
});

test("an engineer's grade beyond the data, seen in game", () => {
  bindWithShip();
  tourEvent({
    event: "EngineerCraft",
    Engineer: "Lori Jameson",
    BlueprintName: "Misc_Reinforced",
    Module: "int_lifesupport_size5_class5",
    Slot: "LifeSupport",
    Level: 5,
  });
  const noted = gapOf("Lori Jameson", "Life Support");
  assert.deepEqual(
    {
      kind: noted.kind,
      engineer: noted.engineer,
      grade: noted.grade,
      data: noted.dataGrade,
    },
    { kind: "engineerGrade", engineer: "Lori Jameson", grade: 5, data: 4 },
  );
  // Within the data: nothing new noted.
  const before = dataGaps().length;
  tourEvent({
    event: "EngineerCraft",
    Engineer: "Lori Jameson",
    BlueprintName: "Misc_Reinforced",
    Module: "int_lifesupport_size5_class5",
    Slot: "LifeSupport",
    Level: 4,
  });
  assert.equal(dataGaps().length, before);
});

test("an issue opened from About gets a random report id, kept until GitHub shows the issue", () => {
  const report = newReport();
  assert.match(report.id, /^edch-report-[0-9a-f]{8}$/);
  assert.equal(pendingReport().id, report.id);
  assert.notEqual(newReport().id, report.id);
});
