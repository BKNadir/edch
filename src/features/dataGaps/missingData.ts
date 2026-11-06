// What the game showed that EDCH's data lacks: an engineer doing a modification or a grade the
// data doesn't give them, an engineered module of an unknown type, a build's engineering the
// data doesn't know. Kept on this PC (no private data: no commander name, path or position),
// written to "missing-data.txt" in the logs folder (the file exists only while the list isn't
// empty), and offered in About as a GitHub issue, so the data can be completed.
//
// Once sent, the list empties itself: the issue holds a random report id that EDCH looks for on
// GitHub (public search), or the player deletes the file.

import { isRemote, isTauri, missingDataExists, missingDataReported, missingDataSave } from "../../platform/bridge.js";
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

/** An issue opened from About, not found on GitHub yet: its id and when it was opened. */
export interface PendingReport {
  id: string;
  sentAt: string;
}

const REPORT_KEY = "edch.missingDataReport";
/** How often GitHub is searched for the pending report's issue. */
const REPORT_CHECK_EVERY_MS = 15 * 60_000;
/** An issue not found after this long was probably never sent: EDCH stops looking. */
const REPORT_GIVE_UP_MS = 14 * 24 * 3_600_000;

let pending: PendingReport | null = (() => {
  try {
    return JSON.parse(localStorage.getItem(REPORT_KEY) ?? "null") as PendingReport | null;
  } catch {
    return null;
  }
})();

/** The issue opened from About and waiting to be found on GitHub, if any. */
export const pendingReport = () => pending;

function savePending(report: PendingReport | null) {
  pending = report;
  try {
    if (report) localStorage.setItem(REPORT_KEY, JSON.stringify(report));
    else localStorage.removeItem(REPORT_KEY);
  } catch {
    /* kept in memory only */
  }
}

/** A new report id for the issue about to be opened ("edch-report-3f9a1c2b"), kept as pending. */
export function newReport(): PendingReport {
  const random = new Uint8Array(4);
  crypto.getRandomValues(random);
  const id = `edch-report-${[...random].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  savePending({ id, sentAt: new Date().toISOString() });
  for (const listener of listeners) listener();
  return pending!;
}

/** Drops the gaps already noted when `report` was opened (newer ones stay for the next issue). */
function forgetReported(report: PendingReport) {
  gaps = gaps.filter((gap) => gap.firstSeen > report.sentAt);
  savePending(null);
  log.info("data", "Missing data issue found on GitHub: the reported items left the list");
  save();
}

/**
 * At start-up and every 15 minutes: a deleted missing-data.txt empties the list, and a pending
 * report found on GitHub removes what it held.
 */
export function startMissingDataChecks() {
  if (!isTauri() || isRemote()) return;
  const check = async () => {
    if (gaps.length && !(await missingDataExists().catch(() => true))) {
      gaps = [];
      savePending(null);
      log.info("data", "missing-data.txt was deleted: the list starts again");
      save();
      return;
    }
    if (!pending) return;
    if (Date.now() - Date.parse(pending.sentAt) > REPORT_GIVE_UP_MS) {
      savePending(null);
      for (const listener of listeners) listener();
      return;
    }
    if (await missingDataReported(pending.id).catch(() => false)) forgetReported(pending);
  };
  void check();
  window.setInterval(() => void check(), REPORT_CHECK_EVERY_MS);
}

/** Keeps the list on this PC and rewrites missing-data.txt, then tells the listeners. */
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(gaps));
  } catch {
    /* kept in memory only */
  }
  if (isTauri() && !isRemote()) void missingDataSave(gaps.length ? gapsText() : "").catch(() => undefined);
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
