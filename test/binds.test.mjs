import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { readFileSync } from "node:fs";
import {
  comboLabel,
  deviceInfo,
  fileForPreset,
  groupOf,
  padControl,
  parseBinds,
  parseStartPreset,
  presetLineFor,
} from "../dist/js/features/controls/binds.js";
import { DEMO_BINDS } from "../dist/js/game/demo.js";

const meta = JSON.parse(readFileSync(new URL("../public/data/binds.json", import.meta.url)));

test("parses a .binds file with BOM, modifiers, axes and layout", () => {
  const f = parseBinds(DEMO_BINDS);
  assert.equal(f.preset, "Custom");
  assert.equal(f.keyboardLayout, "fr-FR");
  const gal = f.binds.find((b) => b.action === "GalaxyMapOpen");
  assert.deepEqual(gal.modifiers, [{ device: "Keyboard", key: "Key_LeftShift" }]);
  assert.equal(comboLabel(meta, gal), "Left Shift + M");
  const pitch = f.binds.find((b) => b.action === "PitchAxisRaw");
  assert.equal(pitch.slot, "axis");
  assert.equal(pitch.inverted, true);
  assert.ok(!f.binds.some((b) => b.device === "{NoDevice}"), "unbound slots are dropped");
  const fire = f.binds.filter((b) => b.action === "PrimaryFire");
  assert.deepEqual(
    fire.map((b) => `${b.slot}:${b.device}:${b.key}`),
    ["primary:231D0200:Joy_1", "secondary:Mouse:Mouse_1"],
  );
});

test("device names, pads and presets", () => {
  assert.equal(deviceInfo(meta, "231D9999").label, "VKB 231D9999");
  assert.equal(deviceInfo(meta, "045E028E").kind, "gamepad");
  assert.equal(deviceInfo(meta, "Keyboard").kind, "keyboard");
  assert.equal(padControl("GamePad", "GamePad_FaceRight"), "B");
  assert.equal(padControl("DualShock4", "Joy_2"), "A");
  assert.equal(padControl("DualShock4", "Joy_POV1Left"), "DPadLeft");
  assert.deepEqual(parseStartPreset("﻿Custom\r\nCustom\r\nKeyboardMouseOnly\r\nCustom\r\n"), [
    "Custom",
    "Custom",
    "KeyboardMouseOnly",
    "Custom",
  ]);
  assert.equal(
    fileForPreset("Custom", [
      "Custom.3.0.binds",
      "Custom.4.2.binds",
      "Custom.4.1.binds",
      "CustomOther.4.2.binds",
      "StartPreset.4.start",
    ]),
    "Custom.4.2.binds",
  );
  assert.equal(presetLineFor(groupOf(meta, "HumanoidJumpButton")), 3);
  assert.equal(presetLineFor(groupOf(meta, "SteeringAxis")), 2);
  assert.equal(presetLineFor(groupOf(meta, "PrimaryFire")), 1);
});

test("templates: VKB Gladiator picture and pad box matching", async () => {
  const { templateBox } = await import("../dist/js/features/controls/binds.js");
  const vkb = meta.templates["231D0200"];
  assert.equal(vkb.image, "vkb-gladiator-nxt-premium-right");
  assert.equal(templateBox(vkb, "231D0200", "Joy_1"), "Joy_1");
  assert.equal(deviceInfo(meta, "231D0200").label, "VKB Gladiator NXT Premium Right");
  const pad = meta.templates["GamePad"];
  assert.ok(templateBox(pad, "GamePad", "GamePad_FaceDown"), "GamePad_* names find the Pad_* boxes");
  assert.ok(meta.templateBase.startsWith("https://raw.githubusercontent.com/brammmers/edrefcard2/"));
});

test("templates: newer EDRefCard devices, and kept pictures named after their source", async () => {
  const { keptPictureName } = await import("../dist/js/services/controllerPictures.js");
  const meta = JSON.parse(readFileSync(new URL("../public/data/binds.json", import.meta.url), "utf8"));
  // Thrustmaster TPR pedals, Virpil Alpha Prime, VKB STECS (first of two same-id devices).
  assert.equal(meta.templates["044FB68F"].image, "tpr-rudder");
  assert.equal(meta.templates["334483F3"].image, "vpc-alpha-prime-left");
  assert.equal(meta.templates["231D012D"].image, "vkb-stecs-1");
  assert.ok(!Object.keys(meta.templates).some((key) => key.includes("::")));
  assert.deepEqual(meta.templates["3344825A"].size, [3790, 2091]);
  assert.equal(keptPictureName(meta.templateBase, "hotas4"), "hotas4-f2e91f8");
  assert.equal(keptPictureName("https://example.com/res/", "hotas4"), "hotas4");
});
