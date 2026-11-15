// Wishlist: a ship build exported from Inara (SLEF, capitalised symbols) imports like EDSY's.
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractLoadout } from "../dist/js/features/materials/buildImporter.js";

test("wishlist import: Inara's SLEF export is found", () => {
  const inara = JSON.stringify([
    {
      header: { appName: "Inara", appVersion: "1.0", appURL: "https://inara.cz/" },
      data: {
        Ship: "Anaconda",
        Modules: [
          {
            Slot: "HugeHardpoint1",
            Item: "Hpt_BeamLaser_Gimbal_Huge",
            Engineering: { BlueprintName: "Weapon_LightWeight", Level: 4, Quality: 0.95 },
          },
        ],
      },
    },
  ]);
  const loadout = extractLoadout(inara);
  assert.equal(loadout.Ship, "Anaconda");
  assert.equal(loadout.Modules[0].Engineering.BlueprintName, "Weapon_LightWeight");
});
