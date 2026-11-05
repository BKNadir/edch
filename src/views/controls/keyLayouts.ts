// Keyboard layouts for the keyboard picture: the game's key names and the printed caps, row by
// row, for the QWERTY, AZERTY and QWERTZ families (ISO and ANSI).

/** Letter rows for the common layouts (Elite names keys after the layout's printed letters). */
export type Family = "qwerty" | "azerty" | "qwertz";

export type Id = string | string[];

interface KeyRows<T> {
  num: T[];
  r1: T[];
  r2: T[];
  r3: T[];
  /** ANSI: the key at the end of the Q row; ISO: the key left of Enter. */
  extra: T;
  /** ISO only: the key between left Shift and the first letter. */
  iso: T;
}

/** The keyboard family of a layout code from the bindings file (fr-FR, de-DE, en-GB…). */
export function layoutFamily(layout: string): Family {
  const l = layout.toLowerCase();
  if (/^(de|cs|sk|hu|sl|hr|bs|sr-latn|sq)\b|-ch$/.test(l)) return "qwertz";
  if (/^(fr|nl-be)\b/.test(l)) return "azerty";
  return "qwerty";
}

const letters = (s: string) => s.split("").map((c) => `Key_${c}`);

const digits = "1234567890".split("").map((c) => `Key_${c}`);

/**
 * The names the game gives the keys, position by position, for each family of layouts. Letters
 * follow the layout; for the other keys the usual name comes first, then the alternatives some
 * layouts use.
 */
export const KEY_IDS: Record<Family, KeyRows<Id>> = {
  qwerty: {
    num: ["Key_Grave", ...digits, "Key_Minus", "Key_Equals"],
    r1: [...letters("QWERTYUIOP"), "Key_LeftBracket", "Key_RightBracket"],
    r2: [...letters("ASDFGHJKL"), "Key_SemiColon", "Key_Apostrophe"],
    r3: [...letters("ZXCVBNM"), "Key_Comma", "Key_Period", "Key_Slash"],
    extra: ["Key_BackSlash", "Key_Hash"],
    iso: ["Key_LessThan", "Key_OEM102"],
  },
  azerty: {
    num: [["Key_Grave", "Key_Superscript_Two"], ...digits, ["Key_Minus", "Key_RightParenthesis"], "Key_Equals"],
    r1: [...letters("AZERTYUIOP"), ["Key_LeftBracket", "Key_Circumflex"], ["Key_RightBracket", "Key_Dollar"]],
    r2: [...letters("QSDFGHJKLM"), ["Key_Apostrophe", "Key_U_Grave"]],
    r3: [
      ...letters("WXCVBN"),
      "Key_Comma",
      "Key_SemiColon",
      ["Key_Period", "Key_Colon"],
      ["Key_Slash", "Key_Exclamation"],
    ],
    extra: ["Key_BackSlash", "Key_Hash", "Key_Asterisk"],
    iso: ["Key_LessThan", "Key_OEM102"],
  },
  qwertz: {
    num: [["Key_Grave", "Key_Circumflex"], ...digits, ["Key_Minus", "Key_SZ"], ["Key_Equals", "Key_Acute"]],
    r1: [...letters("QWERTZUIOP"), ["Key_LeftBracket", "Key_U_Umlaut"], ["Key_RightBracket", "Key_Plus"]],
    r2: [...letters("ASDFGHJKL"), ["Key_SemiColon", "Key_O_Umlaut"], ["Key_Apostrophe", "Key_A_Umlaut"]],
    r3: [...letters("YXCVBNM"), "Key_Comma", "Key_Period", "Key_Slash"],
    extra: ["Key_BackSlash", "Key_Hash"],
    iso: ["Key_LessThan", "Key_OEM102"],
  },
};

/** What is printed on the keys, for the keyboard chosen in EDCH. */
export const KEY_CAPS: Record<Family, KeyRows<string>> = {
  qwerty: {
    num: ["`", ..."1234567890".split(""), "-", "="],
    r1: [..."QWERTYUIOP".split(""), "[", "]"],
    r2: [..."ASDFGHJKL".split(""), ";", "'"],
    r3: [..."ZXCVBNM".split(""), ",", ".", "/"],
    extra: "\\",
    iso: "\\",
  },
  azerty: {
    num: ["²", "& 1", "é 2", '" 3', "' 4", "( 5", "- 6", "è 7", "_ 8", "ç 9", "à 0", ")", "="],
    r1: [..."AZERTYUIOP".split(""), "^", "$"],
    r2: [..."QSDFGHJKLM".split(""), "ù"],
    r3: [..."WXCVBN".split(""), ",", ";", ":", "!"],
    extra: "*",
    iso: "<",
  },
  qwertz: {
    num: ["^", ..."1234567890".split(""), "ß", "´"],
    r1: [..."QWERTZUIOP".split(""), "Ü", "+"],
    r2: [..."ASDFGHJKL".split(""), "Ö", "Ä"],
    r3: [..."YXCVBNM".split(""), ",", ".", "-"],
    extra: "#",
    iso: "<",
  },
};
