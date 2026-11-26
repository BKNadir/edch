// Going back to the game copies the next system of a tour or route, unless the player copied
// something meanwhile (a system from the Search page): their copy is what they mean to paste.

import { test } from "node:test";
import assert from "node:assert/strict";
import { copyOnReturn } from "../dist/js/features/navigation/copyOnGameFocus.js";

test("nothing copied since the game went to the background: the next system is copied", () => {
  assert.equal(copyOnReturn(10_000, 0), true);
  assert.equal(copyOnReturn(10_000, 9_000), true);
});

test("a system copied while away from the game is kept", () => {
  assert.equal(copyOnReturn(10_000, 12_000), false);
});
