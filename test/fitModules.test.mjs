// Search → Modules: a fit's modules (with class and rating from the game's symbols), and stations
// selling all of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fitModules, stationSells, wantedOf } from "../dist/js/features/search/fitModules.js";

const KNOWN = [
  "Frame Shift Drive",
  "Beam Laser",
  "Shield Booster",
  "Fuel Scoop",
  "Prismatic Shield Generator",
  "Thrusters",
];

test("fit: the game's symbols give the module, its class and rating", () => {
  assert.deepEqual(wantedOf("Int_Hyperdrive_Size5_Class5", KNOWN), {
    name: "Frame Shift Drive",
    cls: "5",
    rating: "A",
  });
  assert.deepEqual(wantedOf("hpt_beamlaser_gimbal_large", KNOWN), { name: "Beam Laser", cls: "3", rating: "" });
  assert.deepEqual(wantedOf("hpt_shieldbooster_size0_class5", KNOWN), {
    name: "Shield Booster",
    cls: "0",
    rating: "A",
  });
  assert.deepEqual(wantedOf("int_shieldgenerator_size6_class5_strong", KNOWN), {
    name: "Prismatic Shield Generator",
    cls: "6",
    rating: "A",
  });
  assert.equal(wantedOf("anaconda_armour_grade3", KNOWN), undefined, "comes with the hull");
});

test("fit: a pasted SLEF gives its modules once, the unknown ones counted", () => {
  const slef = JSON.stringify([
    {
      header: { appName: "EDSY" },
      data: {
        Ship: "krait_mkii",
        Modules: [
          { Slot: "FrameShiftDrive", Item: "int_hyperdrive_size5_class5" },
          { Slot: "LargeHardpoint1", Item: "hpt_beamlaser_gimbal_large" },
          { Slot: "LargeHardpoint2", Item: "hpt_beamlaser_gimbal_large" },
          { Slot: "Armour", Item: "krait_mkii_armour_grade3" },
          { Slot: "Slot01", Item: "int_somethingnew_size2_class1" },
        ],
      },
    },
  ]);
  const fit = fitModules(slef, KNOWN);
  assert.deepEqual(
    fit.modules.map((m) => `${m.name} ${m.cls}${m.rating}`),
    ["Frame Shift Drive 5A", "Beam Laser 3"],
  );
  assert.equal(fit.unknown, 1);
  assert.equal(fitModules("not a fit", KNOWN), null);
});

test("fit: a station sells a module under its name or an alias, class and rating checked", () => {
  const outfitting = [
    { name: "Frame Shift Drive", class: 5, rating: "A" },
    { name: "Overloaded Beam Laser", class: 3, rating: "D" },
  ];
  const aliases = { "Beam Laser": ["Overloaded Beam Laser"] };
  assert.ok(stationSells(outfitting, { name: "Frame Shift Drive", cls: "5", rating: "A" }, aliases));
  assert.ok(!stationSells(outfitting, { name: "Frame Shift Drive", cls: "6", rating: "A" }, aliases));
  assert.ok(stationSells(outfitting, { name: "Beam Laser", cls: "3", rating: "" }, aliases));
});

test("fit: Inara's SLEF export (capitalised symbols) is read too", () => {
  const inara = JSON.stringify([
    {
      header: { appName: "Inara", appVersion: "1.0" },
      data: {
        Ship: "Anaconda",
        Modules: [
          { Slot: "HugeHardpoint1", Item: "Hpt_BeamLaser_Gimbal_Huge" },
          { Slot: "FrameShiftDrive", Item: "Int_Hyperdrive_Size6_Class5" },
        ],
      },
    },
  ]);
  assert.deepEqual(
    fitModules(inara, KNOWN).modules.map((m) => `${m.name} ${m.cls}${m.rating}`),
    ["Beam Laser 4", "Frame Shift Drive 6A"],
  );
});
