// EDOMH links (EDSY's and Coriolis's "Export to EDOMH"): the link is read, its build becomes a
// journal Loadout (experimental effects joined to their module) and then wishlist lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { Game } from "../dist/js/game/data.js";
import { importLoadout } from "../dist/js/features/materials/buildImporter.js";
import { decodeEdomhLink, edomhToLoadout, parseEdomhLink } from "../dist/js/features/materials/edomhLink.js";

const game = new Game(JSON.parse(readFileSync(new URL("../public/data/game.json", import.meta.url))));

/** A link as EDSY makes it: JSON, deflated, URL-safe base64 without padding. */
const linkOf = (build, kind = "edsy") =>
  `edomh://${kind}/?` +
  deflateSync(JSON.stringify(build)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const BUILD = {
  version: 1,
  ship: "smallcombat01_nx",
  name: "",
  items: [
    {
      item: "hpt_shieldbooster_size0_class5",
      blueprint: "shieldbooster_resistive",
      grade: 5,
      highestGradePercentage: 1,
    },
    { item: "hpt_shieldbooster_size0_class5", blueprint: "special_shieldbooster_thermic" },
    {
      item: "hpt_shieldbooster_size0_class5",
      blueprint: "shieldbooster_resistive",
      grade: 5,
      highestGradePercentage: 1,
    },
    { item: "hpt_shieldbooster_size0_class5", blueprint: "special_shieldbooster_thermic" },
    { item: "int_powerplant_size5_class5", blueprint: "powerplant_boosted", grade: 5, highestGradePercentage: 1 },
    {
      item: "int_mkiiagileboost_engine_size5_class5",
      blueprint: "engine_dirty",
      grade: 4,
      highestGradePercentage: 0.5,
    },
  ],
};

test("edomh link: kind and data, anything else refused", () => {
  assert.deepEqual(parseEdomhLink("edomh://edsy/?eJzt-_"), { kind: "edsy", data: "eJzt-_" });
  assert.equal(parseEdomhLink("EDOMH://Coriolis/?abc").kind, "coriolis");
  assert.equal(parseEdomhLink("https://edsy.org/#/L=abc"), null);
  assert.equal(parseEdomhLink("edomh://edsy/?<script>"), null);
  assert.equal(parseEdomhLink(`edomh://edsy/?${"a".repeat(70_000)}`), null);
});

test("edomh link: the build as a Loadout, experimental effects joined to their module", () => {
  const loadout = edomhToLoadout(BUILD);
  assert.equal(loadout.Ship, "smallcombat01_nx");
  assert.equal(loadout.Modules.length, 4);
  assert.deepEqual(loadout.Modules[0].Engineering, {
    BlueprintName: "shieldbooster_resistive",
    Level: 5,
    ExperimentalEffect: "special_shieldbooster_thermic",
  });
  // An experimental effect with no module before it stays on its own.
  const alone = edomhToLoadout({
    items: [{ item: "int_powerplant_size5_class5", blueprint: "special_powerplant_highcharge" }],
  });
  assert.deepEqual(alone.Modules[0].Engineering, { ExperimentalEffect: "special_powerplant_highcharge" });
  assert.equal(edomhToLoadout({ items: [] }), null);
  assert.equal(edomhToLoadout("nope"), null);
});

test("edomh link: decoded and imported as wishlist lines", async () => {
  const loadout = await decodeEdomhLink(linkOf(BUILD));
  const result = importLoadout(game, loadout);
  const lines = result.items.map((item) => `${item.bp} ${item.gradeFrom}-${item.gradeTo} x${item.count}`).sort();
  assert.ok(lines.includes("modification|Shield Booster|Resistance Augmented 1-5 x2"), lines.join("\n"));
  assert.ok(lines.some((line) => line.startsWith("experimental|Shield Booster|Thermo Block") && line.endsWith("x2")));
  assert.ok(lines.some((line) => line.startsWith("modification|Power Plant|Overcharged 1-5")));
  // The Mk II thrusters are thrusters.
  assert.ok(
    lines.some((line) => line.startsWith("modification|Thrusters|Dirty Drive Tuning 1-4")),
    lines.join("\n"),
  );
  assert.deepEqual(result.skipped, []);
  assert.equal(await decodeEdomhLink(linkOf(BUILD, "wishlist")), null);
  assert.equal(await decodeEdomhLink("edomh://edsy/?bm90IHpsaWI"), null);
});
