import { test } from "node:test";
import assert from "node:assert/strict";
import { superchargeMultiplier } from "../dist/js/jump.js";
import { fold, nameMatches } from "../dist/js/i18n.js";

test("neutron boost: x6 for the Caspian's Mk II drive, x4 otherwise", () => {
  assert.equal(superchargeMultiplier("int_hyperdrive_overcharge_size8_class5_overchargebooster_mkii"), 6);
  assert.equal(superchargeMultiplier("Int_HyperDrive_Overcharge_Size8_Class5_OverchargeBooster_MkII"), 6);
  assert.equal(superchargeMultiplier("int_hyperdrive_overcharge_size7_class5"), 4);
  assert.equal(superchargeMultiplier("int_hyperdrive_size5_class5"), 4);
  assert.equal(superchargeMultiplier(undefined), 4);
});

test("searches ignore accents, case and punctuation", () => {
  assert.equal(fold("Énergie  d'Ö"), "energie d'o");
  assert.ok(nameMatches("Low Temperature Diamonds", "temperature"));
  assert.ok(!nameMatches("Gold", "silver"));
});
