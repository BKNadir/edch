// Sortable tables: the number a cell starts with, read with the language's separators, and the
// order of values (numbers, texts, missing values always last).
import { test } from "node:test";
import assert from "node:assert/strict";
import { compareValues, leadingNumber } from "../dist/js/ui/sortableTables.js";

test("sortable tables: a cell's leading number in English and French formats", () => {
  assert.equal(leadingNumber("45.2 %"), 45.2);
  assert.equal(leadingNumber("1,234,567 CR"), 1234567);
  assert.equal(leadingNumber("+3.1 · Rival Corp"), 3.1);
  assert.equal(leadingNumber("−2.5"), -2.5);
  assert.equal(leadingNumber("12.40 ly"), 12.4);
  assert.equal(leadingNumber("1 234,5 al", ","), 1234.5);
  assert.equal(leadingNumber("1.234.567 Cr", ","), 1234567);
  assert.equal(leadingNumber("3 / 5"), 3);
  assert.equal(leadingNumber("Sol"), undefined);
  assert.equal(leadingNumber("—"), undefined);
});

test("sortable tables: numbers, texts, missing values last in both directions", () => {
  const values = ["beta", 10, undefined, 2, "Alpha", "system 10", "system 9"];
  const sorted = (direction) => [...values].sort((a, b) => compareValues(a, b, direction));
  assert.deepEqual(sorted("ascending"), [2, 10, "Alpha", "beta", "system 9", "system 10", undefined]);
  assert.deepEqual(sorted("descending"), ["system 10", "system 9", "beta", "Alpha", 10, 2, undefined]);
});
