// Controls page: which control you press, while EDCH's window has the focus. Joysticks and gamepads
// are read with the browser's Gamepad API (polled while the page is shown), the keyboard from its
// key events. Each press is turned into what a .binds file calls it: the device ("231D0200",
// "GamePad", "Keyboard") and the key ("Joy_4", "Joy_POV1Up", "GamePad_FaceDown", "Key_A").

import type { BindsMeta } from "../../features/controls/binds.js";
import type { ControlKey } from "../../features/controls/bindsEditor.js";
import { KEY_IDS, layoutFamily, type Id } from "./keyLayouts.js";

/** A control pressed: the names a .binds file may give its device (best first), and its key. */
export interface ControlPress {
  devices: string[];
  key: string;
}

/** Standard-mapped gamepads (XInput): button index → the game's key. */
const STANDARD_PAD_KEYS = [
  "GamePad_FaceDown",
  "GamePad_FaceRight",
  "GamePad_FaceLeft",
  "GamePad_FaceUp",
  "GamePad_LBumper",
  "GamePad_RBumper",
  "GamePad_LTrigger",
  "GamePad_RTrigger",
  "GamePad_Back",
  "GamePad_Start",
  "GamePad_LThumb",
  "GamePad_RThumb",
  "GamePad_DPadUp",
  "GamePad_DPadDown",
  "GamePad_DPadLeft",
  "GamePad_DPadRight",
];

/**
 * A hat switch (POV) shows up as an axis: one value per direction, and a value above 1 when
 * released. The four main directions (diagonals are left out).
 */
const HAT_DIRECTIONS: [number, string][] = [
  [-1, "Up"],
  [-0.4286, "Right"],
  [0.1429, "Down"],
  [0.7143, "Left"],
];
const HAT_RELEASED_ABOVE = 1.1;
const HAT_TOLERANCE = 0.05;

/** Keys outside the letter rows: the browser's physical key code → the game's key. */
const KEY_CODES: Record<string, string> = {
  Escape: "Key_Escape",
  Tab: "Key_Tab",
  CapsLock: "Key_CapsLock",
  ShiftLeft: "Key_LeftShift",
  ShiftRight: "Key_RightShift",
  ControlLeft: "Key_LeftControl",
  ControlRight: "Key_RightControl",
  AltLeft: "Key_LeftAlt",
  AltRight: "Key_RightAlt",
  Space: "Key_Space",
  Enter: "Key_Enter",
  Backspace: "Key_Backspace",
  Insert: "Key_Insert",
  Delete: "Key_Delete",
  Home: "Key_Home",
  End: "Key_End",
  PageUp: "Key_PageUp",
  PageDown: "Key_PageDown",
  ArrowUp: "Key_UpArrow",
  ArrowDown: "Key_DownArrow",
  ArrowLeft: "Key_LeftArrow",
  ArrowRight: "Key_RightArrow",
  NumLock: "Key_NumLock",
  NumpadDivide: "Key_Numpad_Divide",
  NumpadMultiply: "Key_Numpad_Multiply",
  NumpadSubtract: "Key_Numpad_Subtract",
  NumpadAdd: "Key_Numpad_Add",
  NumpadEnter: "Key_Numpad_Enter",
  NumpadDecimal: "Key_Numpad_Decimal",
  ScrollLock: "Key_ScrollLock",
  Pause: "Key_Pause",
};

/** Physical positions of the letter rows (US names of the browser's key codes), as in KEY_IDS. */
const ROW_CODES = {
  num: [
    "Backquote",
    "Digit1",
    "Digit2",
    "Digit3",
    "Digit4",
    "Digit5",
    "Digit6",
    "Digit7",
    "Digit8",
    "Digit9",
    "Digit0",
    "Minus",
    "Equal",
  ],
  r1: ["KeyQ", "KeyW", "KeyE", "KeyR", "KeyT", "KeyY", "KeyU", "KeyI", "KeyO", "KeyP", "BracketLeft", "BracketRight"],
  r2: ["KeyA", "KeyS", "KeyD", "KeyF", "KeyG", "KeyH", "KeyJ", "KeyK", "KeyL", "Semicolon", "Quote"],
  r3: ["KeyZ", "KeyX", "KeyC", "KeyV", "KeyB", "KeyN", "KeyM", "Comma", "Period", "Slash"],
};

const firstId = (id: Id | undefined) => (Array.isArray(id) ? id[0] : id);

/**
 * The game's name of the key at the browser's physical `code`, for the keyboard `layout` of the
 * bindings file (letters follow the layout: the AZERTY "A" is the game's Key_A).
 */
export function gameKeyForCode(code: string, layout: string): string | undefined {
  if (KEY_CODES[code]) return KEY_CODES[code];
  let match = /^F(\d{1,2})$/.exec(code);
  if (match) return `Key_F${match[1]}`;
  match = /^Numpad(\d)$/.exec(code);
  if (match) return `Key_Numpad_${match[1]}`;
  const ids = KEY_IDS[layoutFamily(layout)];
  for (const row of ["num", "r1", "r2", "r3"] as const) {
    const index = ROW_CODES[row].indexOf(code);
    if (index >= 0) return firstId(ids[row][index]);
  }
  if (code === "Backslash") return firstId(ids.extra);
  if (code === "IntlBackslash") return firstId(ids.iso);
  return undefined;
}

/** The names a .binds file may give a gamepad or joystick: the game's name for it, then "VVVVPPPP". */
function deviceNames(meta: BindsMeta, pad: Gamepad): string[] {
  const ids =
    /Vendor:\s*([0-9a-f]{4})\s*Product:\s*([0-9a-f]{4})/i.exec(pad.id) ??
    /\b([0-9a-f]{4})-([0-9a-f]{4})\b/i.exec(pad.id);
  if (!ids) return pad.mapping === "standard" ? ["GamePad"] : [];
  const vidPid = `${ids[1]}${ids[2]}`.toUpperCase();
  return [meta.vidpid[vidPid], vidPid].filter((name): name is string => Boolean(name));
}

/**
 * Calls `onPress` for each control pressed while the window has the focus, until the returned
 * function is called. `layout`: the bindings file's keyboard layout (for the keys' names).
 */
export function watchPresses(
  meta: BindsMeta,
  layout: () => string,
  onPress: (press: ControlPress) => void,
): () => void {
  /** Per gamepad: the buttons and hat directions held at the last poll. */
  const held = new Map<number, Set<string>>();
  /** Axes seen released like a hat switch (value above 1), per gamepad. */
  const hats = new Map<number, Set<number>>();
  let frame = 0;
  const poll = () => {
    frame = window.requestAnimationFrame(poll);
    if (!document.hasFocus() || !navigator.getGamepads) return;
    for (const pad of navigator.getGamepads()) {
      if (!pad) continue;
      const devices = deviceNames(meta, pad);
      const standard = pad.mapping === "standard" && devices[0] === "GamePad";
      const now = new Set<string>();
      pad.buttons.forEach((button, index) => {
        if (button.pressed) now.add(standard ? (STANDARD_PAD_KEYS[index] ?? `Joy_${index + 1}`) : `Joy_${index + 1}`);
      });
      const hatAxes = hats.get(pad.index) ?? new Set<number>();
      pad.axes.forEach((value, axis) => {
        if (value > HAT_RELEASED_ABOVE) hatAxes.add(axis);
        if (!hatAxes.has(axis)) return;
        const direction = HAT_DIRECTIONS.find(([at]) => Math.abs(value - at) < HAT_TOLERANCE)?.[1];
        if (direction) now.add(`Joy_POV${[...hatAxes].indexOf(axis) + 1}${direction}`);
      });
      hats.set(pad.index, hatAxes);
      const before = held.get(pad.index) ?? new Set<string>();
      for (const key of now) if (!before.has(key) && devices.length) onPress({ devices, key });
      held.set(pad.index, now);
    }
  };
  const onKey = (event: KeyboardEvent) => {
    // Typing in a field (search, dialog) isn't a control press.
    const target = event.target as HTMLElement | null;
    if (event.repeat || target?.closest("input, textarea, select, [contenteditable]")) return;
    const key = gameKeyForCode(event.code, layout());
    if (key) onPress({ devices: ["Keyboard"], key });
  };
  window.addEventListener("keydown", onKey);
  frame = window.requestAnimationFrame(poll);
  return () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener("keydown", onKey);
  };
}

/** The first of `press`'s device names that the bindings use (else its best name), with its key. */
export function controlOf(press: ControlPress, devicesInUse: string[]): ControlKey {
  const device = press.devices.find((name) => devicesInUse.includes(name)) ?? press.devices[0];
  return { device, key: press.key };
}
