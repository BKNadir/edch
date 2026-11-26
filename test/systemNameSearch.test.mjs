// A system search by name: the system named exactly so comes first, even when it is farther than
// the nearest systems loaded ("LHS 2995" among every LHS system).

import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { exactNameFirst } from "../dist/js/services/systemSearch.js";

const system = (name, id64, distance) => ({ name, id64, distance });

test("the system found by the exact search comes first, before the nearest ones", () => {
  const nearest = [system("LHS 3702", 1, 89), system("LHS 5396", 2, 106)];
  const rows = exactNameFirst(nearest, [system("LHS 2995", 3, 812)], "LHS 2995");
  assert.deepEqual(
    rows.map((r) => r.name),
    ["LHS 2995", "LHS 3702", "LHS 5396"],
  );
});

test("an exact match already loaded moves first and isn't shown twice; the case doesn't matter", () => {
  const nearest = [system("LHS 3702", 1, 89), system("LHS 2995", 3, 120)];
  const rows = exactNameFirst(nearest, [system("LHS 2995", 3, 120)], " lhs 2995 ");
  assert.deepEqual(
    rows.map((r) => r.id64),
    [3, 1],
  );
});

test("without an exact match the nearest order is kept", () => {
  const nearest = [system("LHS 3702", 1, 89), system("LHS 5396", 2, 106)];
  assert.deepEqual(exactNameFirst(nearest, [], "LHS"), nearest);
});
