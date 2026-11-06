// Ship export to EDSY / Coriolis: the journal Loadout, gzipped and base64url-encoded in the address.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { buildExportUrl } from "../dist/js/features/materials/buildExporter.js";
import { applyLines } from "../dist/js/game/journal/events.js";
import { emptyState } from "../dist/js/game/journal/state.js";

const slefLoadout = JSON.parse(readFileSync(new URL("./fixtures/caspian-slef.json", import.meta.url), "utf8"))[0].data;

/** The loadout an export address holds (what EDSY or Coriolis read). */
function decode(url, prefix) {
  assert.ok(url.startsWith(prefix), url.slice(0, 40));
  const encoded = url.slice(prefix.length).replace(/%3D/g, "=");
  return JSON.parse(gunzipSync(Buffer.from(encoded, "base64url")).toString("utf8"));
}

test("the address opens the very loadout in EDSY and in Coriolis", async () => {
  const edsy = await buildExportUrl(slefLoadout, "edsy");
  assert.deepEqual(decode(edsy, "https://edsy.org/#/I="), slefLoadout);
  assert.ok(!/[+/]/.test(edsy.split("#/I=")[1]), "URL-safe characters only");
  const coriolis = await buildExportUrl(slefLoadout, "coriolis");
  assert.deepEqual(decode(coriolis, "https://coriolis.io/import?data="), slefLoadout);
});

test("engineering done after the Loadout is in the exported ship", async () => {
  const st = emptyState();
  const line = (event) => JSON.stringify({ timestamp: "2026-11-06T21:00:00Z", ...event });
  applyLines(
    st,
    [
      line({ ...slefLoadout, event: "Loadout" }),
      line({
        event: "EngineerCraft",
        Slot: "LifeSupport",
        Module: "int_lifesupport_size5_class5",
        Engineer: "Lori Jameson",
        EngineerID: 300230,
        BlueprintID: 128731493,
        BlueprintName: "Misc_LightWeight",
        Level: 2,
        Quality: 0.5,
        Modifiers: [{ Label: "Mass", Value: 15, OriginalValue: 20 }],
        Ingredients: [],
      }),
    ],
    () => 0,
  );
  const exported = decode(await buildExportUrl(st.loadoutJournal, "edsy"), "https://edsy.org/#/I=");
  const lifeSupport = exported.Modules.find((m) => m.Slot === "LifeSupport");
  assert.equal(lifeSupport.Engineering.BlueprintName, "Misc_LightWeight");
  assert.equal(lifeSupport.Engineering.Level, 2);
  assert.equal(lifeSupport.Engineering.ExperimentalEffect, undefined, "another blueprint: no effect carried over");
  // The journal event itself is untouched (the kept loadout is a copy).
  assert.equal(slefLoadout.Modules.find((m) => m.Slot === "LifeSupport").Engineering.BlueprintName, "Misc_Reinforced");
});
