// Editing a .binds copy (Controls page, "Configure"): only the slots changed, the rest untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import {
  assignControl,
  bindingsOn,
  buttonActions,
  clearSlot,
  copyPresetXml,
  edchPresetFile,
  edchPresetName,
  firstFreeSlot,
  isEdchPreset,
} from "../dist/js/features/controls/bindsEditor.js";
import { parseBinds } from "../dist/js/features/controls/binds.js";

const XML = `﻿<?xml version="1.0" encoding="UTF-8" ?>
<Root PresetName="Custom" MajorVersion="4" MinorVersion="2">
	<KeyboardLayout>fr-FR</KeyboardLayout>
	<MouseXMode Value="" />
	<YawAxisRaw>
		<Binding Device="231D0200" Key="Joy_RZAxis" />
		<Inverted Value="0" />
		<Deadzone Value="0.00000000" />
	</YawAxisRaw>
	<CycleNextTarget>
		<Primary Device="231D0200" Key="Joy_3">
			<Modifier Device="Keyboard" Key="Key_LeftShift" />
		</Primary>
		<Secondary Device="{NoDevice}" Key="" />
	</CycleNextTarget>
	<SelectHighestThreat>
		<Primary Device="231D0200" Key="Joy_4" />
		<Secondary Device="Keyboard" Key="Key_H" />
	</SelectHighestThreat>
	<LandingGearToggle>
		<Primary Device="{NoDevice}" Key="" />
		<Secondary Device="{NoDevice}" Key="" />
	</LandingGearToggle>
</Root>
`;

test("binds copy: named <preset>_EDCH, same version, only the preset name changes", () => {
  assert.equal(edchPresetName("Custom"), "Custom_EDCH");
  assert.equal(edchPresetName("Custom_EDCH"), "Custom_EDCH", "a copy is edited, not copied again");
  assert.ok(isEdchPreset("Custom_EDCH"));
  assert.ok(!isEdchPreset("Custom"));
  assert.equal(edchPresetFile("Custom", "Custom.4.2.binds"), "Custom_EDCH.4.2.binds");
  const copy = copyPresetXml(XML, "Custom_EDCH");
  assert.equal(parseBinds(copy).preset, "Custom_EDCH");
  assert.equal(copy.replace('PresetName="Custom_EDCH"', 'PresetName="Custom"'), XML);
});

test("binds copy: the button actions are listed, not the axes", () => {
  assert.deepEqual(buttonActions(XML), ["CycleNextTarget", "SelectHighestThreat", "LandingGearToggle"]);
});

test("binds copy: assigning and clearing change only that slot", () => {
  const assigned = assignControl(XML, "LandingGearToggle", "primary", { device: "231D0200", key: "Joy_20" });
  const gear = parseBinds(assigned).binds.filter((bind) => bind.action === "LandingGearToggle");
  assert.deepEqual(
    gear.map((bind) => [bind.slot, bind.device, bind.key]),
    [["primary", "231D0200", "Joy_20"]],
  );
  // Everything outside the changed element is byte for byte the same.
  assert.equal(
    assigned.replace('<Primary Device="231D0200" Key="Joy_20" />', '<Primary Device="{NoDevice}" Key="" />'),
    XML,
  );
  // A slot with a modifier is replaced whole.
  const replaced = assignControl(XML, "CycleNextTarget", "primary", { device: "Keyboard", key: "Key_T" });
  const next = parseBinds(replaced).binds.find((bind) => bind.action === "CycleNextTarget");
  assert.deepEqual([next.device, next.key, next.modifiers.length], ["Keyboard", "Key_T", 0]);
  const cleared = clearSlot(XML, "SelectHighestThreat", "secondary");
  assert.equal(parseBinds(cleared).binds.filter((bind) => bind.action === "SelectHighestThreat").length, 1);
});

test("binds copy: first free slot, and what is already on a control", () => {
  const binds = parseBinds(XML).binds;
  assert.equal(firstFreeSlot(binds, "LandingGearToggle"), "primary");
  assert.equal(firstFreeSlot(binds, "CycleNextTarget"), "secondary");
  assert.equal(firstFreeSlot(binds, "SelectHighestThreat"), undefined);
  assert.deepEqual(
    bindingsOn(binds, { device: "231D0200", key: "Joy_4" }).map((bind) => bind.action),
    ["SelectHighestThreat"],
  );
  assert.equal(bindingsOn(binds, { device: "231D0200", key: "Joy_3" }).length, 0, "Shift+Joy_3 is another combo");
  assert.throws(() => assignControl(XML, "NotAnAction", "primary", { device: "Keyboard", key: "Key_T" }));
});
