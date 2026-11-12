// Editing a .binds file (Controls page, "Configure"): EDCH never changes the game's presets, it
// makes a copy named "<preset>_EDCH" and edits only that copy. The edits are made on the file's
// text, element by element, so everything else in it (settings, axes, comments, formatting) stays
// exactly as the game wrote it. No DOM needed, so it is unit-testable in Node.

import { type Bind, parseXml } from "./binds.js";

/** Ending of the presets EDCH creates (and the only ones it ever writes). */
export const EDCH_PRESET_SUFFIX = "_EDCH";

/** The two slots of a button action in a .binds file. */
export type ButtonSlot = "primary" | "secondary";

/** What a pressed or clicked control is: the device as the .binds file names it, and the key. */
export interface ControlKey {
  device: string;
  key: string;
}

/** Is `preset` a copy EDCH made (so EDCH may write it)? */
export const isEdchPreset = (preset: string) => preset.endsWith(EDCH_PRESET_SUFFIX);

/** The name of EDCH's copy of `preset` ("Custom" → "Custom_EDCH"; a copy keeps its name). */
export const edchPresetName = (preset: string) => (isEdchPreset(preset) ? preset : `${preset}${EDCH_PRESET_SUFFIX}`);

/**
 * The file name of the copy: the original's name with the copy's preset name ("Custom.4.2.binds"
 * → "Custom_EDCH.4.2.binds"), so the game lists it with the same version as the original.
 */
export function edchPresetFile(preset: string, originalFile: string): string {
  const versionAndExtension = originalFile.startsWith(preset) ? originalFile.slice(preset.length) : ".binds";
  return `${edchPresetName(preset)}${versionAndExtension}`;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The copy's text: the same file with the copy's preset name in its Root element. */
export function copyPresetXml(xml: string, copyName: string): string {
  const named = xml.replace(/(<Root\b[^>]*\bPresetName=")[^"]*(")/, `$1${escapeXml(copyName)}$2`);
  if (named === xml && !xml.includes(`PresetName="${escapeXml(copyName)}"`)) throw new Error("notBindsFile");
  return named;
}

/** The actions of the file that take buttons or keys (they have a Primary slot), in file order. */
export function buttonActions(xml: string): string[] {
  const root = parseXml(xml.replace(/^﻿/, "")).children.find((node) => node.tag === "Root");
  return (root?.children ?? [])
    .filter((node) => node.children.some((child) => child.tag === "Primary"))
    .map((node) => node.tag);
}

/** The text of `action`'s element, with where it starts and ends, or undefined when absent. */
function actionElement(xml: string, action: string): { start: number; end: number; text: string } | undefined {
  const match = new RegExp(`<${escapeRegExp(action)}>[\\s\\S]*?</${escapeRegExp(action)}>`).exec(xml);
  return match ? { start: match.index, end: match.index + match[0].length, text: match[0] } : undefined;
}

/** Writes `control` (or nothing: `undefined`) into `action`'s `slot`, keeping the rest of the file. */
function writeSlot(xml: string, action: string, slot: ButtonSlot, control: ControlKey | undefined): string {
  const element = actionElement(xml, action);
  if (!element) throw new Error(`actionNotInFile: ${action}`);
  const tag = slot === "primary" ? "Primary" : "Secondary";
  const slotPattern = new RegExp(`<${tag}\\b[^>]*?(?:/>|>[\\s\\S]*?</${tag}>)`);
  if (!slotPattern.test(element.text)) throw new Error(`slotNotInFile: ${action}`);
  const device = control ? escapeXml(control.device) : "{NoDevice}";
  const key = control ? escapeXml(control.key) : "";
  const updated = element.text.replace(slotPattern, `<${tag} Device="${device}" Key="${key}" />`);
  return xml.slice(0, element.start) + updated + xml.slice(element.end);
}

/** Puts `control` in `action`'s `slot` (any modifier the slot had is dropped). */
export const assignControl = (xml: string, action: string, slot: ButtonSlot, control: ControlKey) =>
  writeSlot(xml, action, slot, control);

/** Empties `action`'s `slot`. */
export const clearSlot = (xml: string, action: string, slot: ButtonSlot) => writeSlot(xml, action, slot, undefined);

/**
 * Where a new control goes for `action`: its primary slot when empty, else its secondary slot when
 * empty, else undefined (both are taken: the user picks which to replace).
 */
export function firstFreeSlot(binds: Bind[], action: string): ButtonSlot | undefined {
  const taken = new Set(binds.filter((bind) => bind.action === action).map((bind) => bind.slot));
  if (!taken.has("primary")) return "primary";
  if (!taken.has("secondary")) return "secondary";
  return undefined;
}

/** The button bindings already on `control` alone (same device and key, no modifier). */
export function bindingsOn(binds: Bind[], control: ControlKey): Bind[] {
  return binds.filter(
    (bind) =>
      bind.slot !== "axis" && bind.device === control.device && bind.key === control.key && !bind.modifiers.length,
  );
}
