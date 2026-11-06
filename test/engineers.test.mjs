// Engineers: lines already on the ship, the tour order (current stop, passed stops), the
// requirement texts in the app's language, and the factions remembered from the journal.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { readFileSync } from "node:fs";
import { Game, engineerText, siteText } from "../dist/js/game/data.js";
import { applyLines } from "../dist/js/game/journal/events.js";
import { emptyState } from "../dist/js/game/journal/state.js";
import { DEFAULT_ENGINEER_SETTINGS } from "../dist/js/state/store.js";
import { doneOnShip } from "../dist/js/features/engineers/doneOnShip.js";
import {
  bindTour,
  goToStop,
  passStop,
  planTour,
  stopTour,
  tourEvent,
  tourProgress,
} from "../dist/js/features/engineers/tour.js";

// No clipboard here: a copy that never finishes (so no toast is drawn without a page).
Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: () => new Promise(() => {}) } });

// The toasts need a page: a stand-in element is enough here.
const toastElement = { textContent: "", classList: { add() {}, remove() {} } };
globalThis.document ??= { getElementById: () => toastElement };
globalThis.window ??= { setTimeout: () => 0, clearTimeout() {} };

const game = new Game(JSON.parse(readFileSync(new URL("../public/data/game.json", import.meta.url))));

const line = (bp, gradeTo, extra = {}) => ({
  id: bp + gradeTo,
  bp,
  gradeFrom: 1,
  gradeTo,
  rolls: {},
  count: 1,
  ...extra,
});
const FSD_RANGE = "modification|Frame Shift Drive|Increased FSD Range";
const MASS_MANAGER = "experimental|Frame Shift Drive|Mass Manager";
const PP_OVERCHARGED = "modification|Power Plant|Overcharged";

function ctxWith(wishlist, modules = []) {
  const cmdr = emptyState();
  cmdr.location = { system: "Sol", pos: [0, 0, 0], docked: false, factions: [] };
  cmdr.loadout = { ship: "anaconda", modules };
  const settings = { engineers: { ...DEFAULT_ENGINEER_SETTINGS, knownOnly: false }, fallbackSystem: "Sol" };
  return { game, store: { state: { wishlist, settings, cmdr }, notify() {} } };
}

test("done on ship: the blueprint at the wanted grade or higher, and the experimental effect", () => {
  const fsd = { slot: "FrameShiftDrive", item: "int_hyperdrive_size5_class5" };
  const g4 = ctxWith([], [{ ...fsd, engineering: { blueprint: "FSD_LongRange", level: 4 } }]);
  assert.equal(doneOnShip(g4, line(FSD_RANGE, 5)), false, "G4 is not G5");
  assert.equal(doneOnShip(g4, line(FSD_RANGE, 4)), true);
  assert.equal(doneOnShip(g4, line(MASS_MANAGER, 0)), false, "no effect yet");
  const withEffect = ctxWith(
    [],
    [{ ...fsd, engineering: { blueprint: "FSD_LongRange", level: 5, experimental: "special_fsd_heavy" } }],
  );
  assert.equal(doneOnShip(withEffect, line(FSD_RANGE, 5)), true);
  assert.equal(doneOnShip(withEffect, line(MASS_MANAGER, 0)), true);
  assert.equal(doneOnShip(withEffect, line(FSD_RANGE, 5, { count: 2 })), false, "two modules wanted, one on the ship");
});

test("tour: lines on the ship leave it, the current stop comes first, passed stops come last", () => {
  const wishlist = [line(FSD_RANGE, 5), line(PP_OVERCHARGED, 5)];
  const fsd = { slot: "FrameShiftDrive", item: "x", engineering: { blueprint: "FSD_LongRange", level: 5 } };
  const shipHasFsd = planTour(ctxWith(wishlist, [fsd]));
  assert.equal(shipHasFsd.doneOnShip.length, 1);
  assert.deepEqual(
    shipHasFsd.stops.map((s) => s.pick.engineer.name),
    ["Hera Tani"],
  );

  const ctx = ctxWith(wishlist);
  const first = planTour(ctx).stops.map((s) => s.pick.engineer.name);
  assert.equal(first.length, 2);
  // Start on the farther stop: it becomes the first one.
  const farther = planTour(ctx).stops[1];
  goToStop(ctx, farther);
  assert.equal(tourProgress()?.engineer, farther.pick.engineer.name);
  assert.equal(planTour(ctx).stops[0].pick.engineer.name, farther.pick.engineer.name);
  // "Next engineer": the other one becomes current, the passed one goes last.
  passStop(ctx);
  const after = planTour(ctx).stops.map((s) => s.pick.engineer.name);
  assert.equal(tourProgress()?.engineer, after[0]);
  assert.notEqual(after[0], farther.pick.engineer.name);
  assert.equal(after.at(-1), farther.pick.engineer.name);
  stopTour(ctx);
  assert.equal(tourProgress(), null);
});

test("tour: arriving is noted, and once a stop has nothing left the next engineer becomes current", () => {
  const ctx = ctxWith([line(FSD_RANGE, 5), line(PP_OVERCHARGED, 5)]);
  bindTour(ctx);
  const hera = planTour(ctx).stops.find((s) => s.pick.engineer.name === "Hera Tani");
  goToStop(ctx, hera);
  assert.equal(tourProgress()?.arrived, false);
  ctx.store.state.cmdr.location = { system: "Kuwemaki", pos: hera.pick.engineer.pos, docked: false, factions: [] };
  tourEvent({ event: "FSDJump", StarSystem: "Kuwemaki" });
  assert.equal(tourProgress()?.arrived, true);
  // The power plant is engineered (the ship's Loadout says so): Hera Tani has nothing left.
  ctx.store.state.cmdr.loadout.modules = [
    { slot: "PowerPlant", item: "x", engineering: { blueprint: "PowerPlant_Boosted", level: 5 } },
  ];
  tourEvent({ event: "Loadout" });
  assert.notEqual(tourProgress()?.engineer, "Hera Tani");
  assert.equal(tourProgress()?.arrived, false);
  // The last stop done: the tour ends.
  ctx.store.state.cmdr.loadout.modules.push({
    slot: "FrameShiftDrive",
    item: "y",
    engineering: { blueprint: "FSD_LongRange", level: 5 },
  });
  tourEvent({ event: "Loadout" });
  assert.equal(tourProgress(), null);
});

test("engineer requirements and farming sites in the app's language (French)", () => {
  const byName = (name) => game.data.engineers.find((e) => e.name === name);
  assert.equal(engineerText(byName("Felicity Farseer"), "unlock"), "Fournis 1 t de Méta-alliages.");
  assert.equal(engineerText(byName("Tod 'The Blaster' McQuinn"), "meeting"), "Gagne plus de 15 primes.");
  assert.equal(engineerText(byName("Broo Tarquin"), "discovery"), "Recommandé par Hera Tani (au grade 3-4).");
  assert.equal(engineerText(byName("The Dweller"), "discovery"), "Connu de tous.");
  assert.equal(engineerText(byName("Oden Geiger"), "unlock"), "", "no unlock text in the data");
  // Every engineer text of the data has its French version.
  for (const e of game.data.engineers)
    for (const field of ["meeting", "unlock"])
      if (e[field]) assert.notEqual(engineerText(e, field), e[field], `${e.name} ${field}`);
  assert.equal(siteText("Crashed Thargoid ship"), "Vaisseau Thargoïd écrasé");
  assert.match(siteText("Crystalline shards (Antimony)"), /^Éclats cristallins/);
});

test("journal: factions of the systems visited are remembered, most recent first", () => {
  const st = emptyState();
  const jump = (system, factions) =>
    JSON.stringify({
      timestamp: "2026-11-06T10:00:00Z",
      event: "FSDJump",
      StarSystem: system,
      StarPos: [0, 0, 0],
      Factions: factions.map((Name) => ({ Name, FactionState: "None", Influence: 0.1 })),
    });
  applyLines(st, [jump("A", ["Mother Gaia", "Sol Workers' Party"]), jump("B", ["Mother Gaia", "Other One"])], () => 0);
  assert.deepEqual(st.knownFactions, ["Mother Gaia", "Other One", "Sol Workers' Party"]);
});
