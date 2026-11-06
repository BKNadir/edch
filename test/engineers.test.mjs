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
  nextSystemToEnter,
  passStop,
  planTour,
  setNavRoute,
  stopTour,
  tourEvent,
  tourProgress,
} from "../dist/js/features/engineers/tour.js";

// No clipboard here: by default a copy that never finishes; a test can swap `clipboard.writeText`.
const clipboard = { writeText: () => new Promise(() => {}) };
Object.defineProperty(globalThis.navigator, "clipboard", { value: clipboard });

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

test("tour: reaching the wanted grade in fewer rolls ends the stop and copies the next engineer", async () => {
  const copied = [];
  clipboard.writeText = async (text) => void copied.push(text);
  const ctx = ctxWith([line(FSD_RANGE, 5), line(PP_OVERCHARGED, 5)]);
  ctx.store.setWishlist = (list) => (ctx.store.state.wishlist = list);
  bindTour(ctx);
  const hera = planTour(ctx).stops.find((s) => s.pick.engineer.name === "Hera Tani");
  goToStop(ctx, hera);
  // One G5 roll on the power plant (5 rolls planned): the module is at G5, the line is done.
  tourEvent({ event: "EngineerCraft", Slot: "PowerPlant", BlueprintName: "PowerPlant_Boosted", Level: 5 });
  assert.equal(ctx.store.state.wishlist.length, 1);
  assert.notEqual(tourProgress()?.engineer, "Hera Tani");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(copied.at(-1), tourProgress()?.system, "next engineer's system copied");
  // A second roll on the same module counts nothing more.
  tourEvent({ event: "EngineerCraft", Slot: "PowerPlant", BlueprintName: "PowerPlant_Boosted", Level: 5 });
  assert.equal(ctx.store.state.wishlist.length, 1);
  stopTour(ctx);
});

test("back to the game: the next system of the route, else the tour's engineer", () => {
  const ctx = ctxWith([line(PP_OVERCHARGED, 5)]);
  bindTour(ctx);
  assert.equal(nextSystemToEnter(), null);
  goToStop(ctx, planTour(ctx).stops[0]);
  assert.equal(nextSystemToEnter()?.system, "Kuwemaki");
  setNavRoute(["Sol", "Alpha Centauri", "Kuwemaki"]);
  assert.equal(nextSystemToEnter()?.system, "Alpha Centauri");
  tourEvent({ event: "FSDJump", StarSystem: "Alpha Centauri" });
  assert.equal(nextSystemToEnter()?.system, "Kuwemaki");
  stopTour(ctx);
});

test("tour: as few stops as possible, an effect goes with its module's grade 5 engineer", () => {
  const ctx = ctxWith([
    line("modification|Beam Laser|Overcharged Weapon", 1),
    line("experimental|Beam Laser|Thermal Vent", 0),
    line("modification|Beam Laser|Long Range Weapon", 5),
    line("modification|Armour|Heavy Duty", 5),
    line("experimental|Armour|Deep Plating", 0),
  ]);
  // At The Dweller's (Wyrd): he does Overcharged and Thermal Vent, but Broo Tarquin is needed
  // for Long Range G5 and does both too: no stop at The Dweller.
  ctx.store.state.cmdr.location = { system: "Wyrd", pos: [-11.03, 31.25, -4.3], docked: false, factions: [] };
  const stops = planTour(ctx).stops.map((s) => [s.pick.engineer.name, s.lines.map((l) => l.bp.split("|")[2]).sort()]);
  assert.deepEqual(stops, [
    ["Selene Jean", ["Deep Plating", "Heavy Duty"]],
    ["Broo Tarquin", ["Long Range Weapon", "Overcharged Weapon", "Thermal Vent"]],
  ]);
});

test("done on ship: the module type counts (Overcharged on a multi-cannon is not on the beam laser)", () => {
  const multicannon = {
    slot: "MediumHardpoint1",
    item: "hpt_multicannon_gimbal_medium",
    engineering: { blueprint: "Weapon_Overcharged", level: 5 },
  };
  const ctx = ctxWith([], [multicannon]);
  assert.equal(doneOnShip(ctx, line("modification|Beam Laser|Overcharged Weapon", 5)), false);
  assert.equal(doneOnShip(ctx, line("modification|Multi-cannon|Overcharged Weapon", 5)), true);
});

test("imported build, module by module: the grade 5 engineer until the grade is reached, the effect alone at the nearest", async () => {
  const { importLoadout } = await import("../dist/js/features/materials/buildImporter.js");
  const build = {
    Ship: "Krait_MkII",
    Modules: [
      {
        Slot: "MediumHardpoint1",
        Item: "Hpt_BeamLaser_Fixed_Medium",
        Engineering: { BlueprintName: "Weapon_LongRange", Level: 5, ExperimentalEffect: "special_thermal_vent" },
      },
    ],
  };
  const { items } = importLoadout(game, build);
  assert.deepEqual(
    items.map((i) => [i.bp, i.slots, i.shipType]),
    [
      ["modification|Beam Laser|Long Range Weapon", ["mediumhardpoint1"], "krait_mkii"],
      ["experimental|Beam Laser|Thermal Vent", ["mediumhardpoint1"], "krait_mkii"],
    ],
  );
  const laser = (engineering) => ({ slot: "MediumHardpoint1", item: "hpt_beamlaser_fixed_medium", engineering });
  const plan = (engineering) => {
    const ctx = ctxWith(items, engineering ? [laser(engineering)] : []);
    ctx.store.state.cmdr.loadout.ship = "krait_mkii";
    ctx.store.state.cmdr.location = { system: "Wyrd", pos: [-11.03, 31.25, -4.3], docked: false, factions: [] };
    return planTour(ctx).stops.map((s) => [s.pick.engineer.name, s.lines.map((l) => l.bp.split("|")[2]).sort()]);
  };
  // Nothing on the module: Long Range G5 and the effect, both at the grade 5 engineer.
  assert.deepEqual(plan(null), [["Broo Tarquin", ["Long Range Weapon", "Thermal Vent"]]]);
  // Stopped at a grade 3 engineer, who also applied the effect: only Long Range G5 is left, still at G5.
  assert.deepEqual(plan({ blueprint: "Weapon_LongRange", level: 3, experimental: "special_thermal_vent" }), [
    ["Broo Tarquin", ["Long Range Weapon"]],
  ]);
  // Long Range G5 done, no effect yet: the effect alone, at the nearest engineer (The Dweller, here).
  assert.deepEqual(plan({ blueprint: "Weapon_LongRange", level: 5 }), [["The Dweller", ["Thermal Vent"]]]);
  // Another ship type: the build's slots don't apply, the module type is checked instead.
  const other = ctxWith(items, [laser({ blueprint: "Weapon_LongRange", level: 5 })]);
  other.store.state.cmdr.loadout.ship = "python";
  assert.equal(doneOnShip(other, items[0]), true);
});

test("engineering updates the ship's module at once (the game writes no new Loadout after it)", () => {
  const st = emptyState();
  const journal = (ev) => JSON.stringify({ timestamp: "2026-11-06T17:00:00Z", ...ev });
  applyLines(
    st,
    [
      journal({
        event: "Loadout",
        Ship: "krait_mkii",
        ShipID: 5,
        Modules: [
          {
            Slot: "Armour",
            Item: "krait_mkii_armour_grade3",
            Engineering: { BlueprintName: "Armour_HeavyDuty", Level: 4, Quality: 1 },
          },
        ],
      }),
      journal({ event: "EngineerCraft", Slot: "Armour", BlueprintName: "Armour_HeavyDuty", Level: 5, Ingredients: [] }),
      journal({
        event: "EngineerCraft",
        Slot: "Armour",
        BlueprintName: "Armour_HeavyDuty",
        Level: 5,
        ApplyExperimentalEffect: "special_armour_chunky",
        Ingredients: [],
      }),
    ],
    () => 0,
  );
  assert.deepEqual(st.loadout.modules[0].engineering, {
    blueprint: "Armour_HeavyDuty",
    level: 5,
    experimental: "special_armour_chunky",
  });
  const ctx = { game, store: { state: { cmdr: st } } };
  assert.equal(doneOnShip(ctx, line("modification|Armour|Heavy Duty", 5)), true);
  assert.equal(doneOnShip(ctx, line("experimental|Armour|Deep Plating", 0)), true);
});
