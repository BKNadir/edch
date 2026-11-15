// Search → Modules: stations selling every module of a list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sameModule, stationSells } from "../dist/js/features/search/fitModules.js";

test("module list: a station sells a module under its name or an alias, class and rating checked", () => {
  const outfitting = [
    { name: "Frame Shift Drive", class: 5, rating: "A" },
    { name: "Overloaded Beam Laser", class: 3, rating: "D" },
  ];
  const aliases = { "Beam Laser": ["Overloaded Beam Laser"] };
  assert.ok(stationSells(outfitting, { name: "Frame Shift Drive", cls: "5", rating: "A" }, aliases));
  assert.ok(!stationSells(outfitting, { name: "Frame Shift Drive", cls: "6", rating: "A" }, aliases));
  assert.ok(stationSells(outfitting, { name: "Beam Laser", cls: "3", rating: "" }, aliases));
  assert.ok(sameModule({ name: "A", cls: "1", rating: "" }, { name: "A", cls: "1", rating: "" }));
});
