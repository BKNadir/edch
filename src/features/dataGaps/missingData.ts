// What the game showed that EDCH's data lacks: an engineer doing a modification or a grade the
// data doesn't give them, an engineered module of an unknown type, a build's engineering the
// data doesn't know. Kept on this PC (no private data: no commander name, path or position),
// written to "missing-data.txt" in the logs folder, and offered in About as a GitHub issue, so
// the data can be completed.

import { isRemote, isTauri, missingDataSave } from "../../platform/bridge.js";
import { log } from "../../platform/logger.js";

export type GapKind = "engineerGrade" | "notInData" | "unknownModule";

export interface DataGap {
  kind: GapKind;
  engineer?: string;
  /** The module ("Beam Laser"), or the journal's module symbol when its type is unknown. */
  module: string;
  /** The blueprint or effect as the game names it ("Weapon_Overcharged"). */
  blueprint: string;
  grade?: number;
  /** The highest grade the data gives the engineer, 0 when it doesn't list them. */
  dataGrade?: number;
  gameVersion?: string;
  firstSeen: string;
  lastSeen: string;
  count: number;
}

const KEY = "edch.missingData";
/** Most gaps kept: the oldest go first. */
const MAX_GAPS = 200;

let gaps: DataGap[] = (() => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as DataGap[]) : [];
  } catch {
    return [];
  }
})();
const listeners = new Set<() => void>();

/** The gaps noted so far, oldest first. */
export const dataGaps = (): readonly DataGap[] => gaps;
/** Calls `listener` when the list changes; returns the function that stops it. */
export const onDataGaps = (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener));

/** Same gap: same kind, engineer, module and blueprint (the grade and dates may differ). */
const sameGap = (gap: Omit<DataGap, "firstSeen" | "lastSeen" | "count">, known: DataGap) =>
  gap.kind === known.kind &&
  gap.engineer === known.engineer &&
  gap.module === known.module &&
  gap.blueprint === known.blueprint;

/** Notes a gap (the same one again only counts and keeps the highest grade). */
export function recordGap(gap: Omit<DataGap, "firstSeen" | "lastSeen" | "count">) {
  if (isRemote()) return;
  const now = new Date().toISOString();
  const found = gaps.find((known) => sameGap(gap, known));
  if (found) {
    found.count += 1;
    found.lastSeen = now;
    found.grade = Math.max(found.grade ?? 0, gap.grade ?? 0) || undefined;
    found.gameVersion = gap.gameVersion ?? found.gameVersion;
  } else {
    gaps = [...gaps, { ...gap, firstSeen: now, lastSeen: now, count: 1 }].slice(-MAX_GAPS);
    log.info("data", `Missing data noted: ${gapLine(gaps[gaps.length - 1])}`);
  }
  save();
}

/** Empties the list (after it was reported), and the file. */
export function clearGaps() {
  gaps = [];
  save();
}

/** Keeps the list on this PC and rewrites missing-data.txt, then tells the listeners. */
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(gaps));
  } catch {
    /* kept in memory only */
  }
  if (isTauri() && !isRemote()) void missingDataSave(gapsText()).catch(() => undefined);
  for (const listener of listeners) listener();
}

const KIND_TEXT: Record<GapKind, string> = {
  engineerGrade: "Engineer grade beyond the data",
  notInData: "Engineering not in the data",
  unknownModule: "Engineered module of unknown type",
};

/** One gap as a line (English: it goes to a GitHub issue). */
export function gapLine(gap: DataGap): string {
  const grade = gap.grade ? `G${gap.grade}` : "";
  const dataGrade =
    gap.kind === "engineerGrade" ? ` (data: ${gap.dataGrade ? `G${gap.dataGrade}` : "not listed"})` : "";
  return [
    gap.lastSeen.slice(0, 10),
    KIND_TEXT[gap.kind],
    gap.engineer ?? "-",
    gap.module,
    gap.blueprint,
    grade + dataGrade,
    // "v" first: the log filter takes a bare "4.2.3.0" for an IP address and masks it.
    gap.gameVersion ? `game v${gap.gameVersion}` : "",
    gap.count > 1 ? `seen ${gap.count}×` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

/** The whole list, as written to missing-data.txt and to the issue. */
export function gapsText(): string {
  return [
    "EDCH: game data missing from EDCH (from the game's journal; no private data).",
    "Date | What | Engineer | Module | Modification | Grade | Game version | Times",
    ...gaps.map(gapLine),
  ].join("\n");
}
