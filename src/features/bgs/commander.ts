/** EDCH-BGS-v1.4.1: personal, LOCAL journal activity. Not a BGS influence estimator. */
export type CommanderEventKind =
  "jump" | "mission" | "mission-accepted" | "voucher" | "kill-bond" | "trade" | "bounty" | "exploration";
export interface CommanderBgsEntry {
  at: string;
  kind: CommanderEventKind;
  system?: string;
  factions: string[]; // Explicitly named by the journal; no inferred beneficiaries.
  amount?: number; // Credits, not BGS influence points.
  key: string;
}
export interface CommanderBgsLog {
  commander: string;
  followedFaction?: string;
  entries: CommanderBgsEntry[];
}
export const CMD_BGS_LIMIT = 1200;
const PREFIX = "edch.bgs.commander.v1.";
const allowedKinds: readonly CommanderEventKind[] = [
  "jump",
  "mission",
  "mission-accepted",
  "voucher",
  "kill-bond",
  "trade",
  "bounty",
  "exploration",
];
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const name = (x: unknown, limit = 120): string | undefined =>
  typeof x === "string" && x.trim().length > 0 && x.trim().length <= limit ? x.trim() : undefined;
const date = (x: unknown): string | undefined => {
  if (typeof x !== "string" || x.length > 45 || !Number.isFinite(Date.parse(x))) return undefined;
  return new Date(x).toISOString();
};
const amount = (x: unknown): number | undefined =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1e15 ? x : undefined;
const same = (a: string, b: string): boolean => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
export function commanderKey(commander: string): string | undefined {
  const id = name(commander, 90);
  return id ? PREFIX + encodeURIComponent(id.toLocaleLowerCase()) : undefined;
}
export function emptyCommanderLog(commander: string): CommanderBgsLog {
  return { commander, entries: [] };
}
/** Small sanitized local record; invalid records never abort the entire saved history. */
export function readCommanderLog(commander: string): CommanderBgsLog {
  const key = commanderKey(commander);
  if (!key) return emptyCommanderLog(commander);
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 1_500_000) return emptyCommanderLog(commander);
    const value: unknown = JSON.parse(raw);
    if (
      !object(value) ||
      typeof value.commander !== "string" ||
      !same(value.commander, commander) ||
      !Array.isArray(value.entries)
    )
      return emptyCommanderLog(commander);
    const entries: CommanderBgsEntry[] = [];
    for (const item of value.entries.slice(-CMD_BGS_LIMIT)) {
      if (
        !object(item) ||
        !allowedKinds.includes(item.kind as CommanderEventKind) ||
        !date(item.at) ||
        !name(item.key, 260)
      )
        continue;
      entries.push({
        at: date(item.at)!,
        kind: item.kind as CommanderEventKind,
        key: item.key as string,
        system: name(item.system, 180),
        factions: Array.isArray(item.factions)
          ? [...new Set(item.factions.map((x) => name(x, 160)).filter((x): x is string => !!x))].slice(0, 20)
          : [],
        amount: amount(item.amount),
      });
    }
    return { commander, followedFaction: name(value.followedFaction, 160), entries };
  } catch {
    return emptyCommanderLog(commander);
  }
}
export function saveCommanderLog(value: CommanderBgsLog): boolean {
  const key = commanderKey(value.commander);
  if (!key) return false;
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        commander: value.commander,
        followedFaction: name(value.followedFaction, 160),
        entries: value.entries.slice(-CMD_BGS_LIMIT),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
const namedFactions = (e: Record<string, unknown>): string[] => {
  const items: unknown[] = [e.Faction];
  if (Array.isArray(e.FactionEffects))
    for (const effect of e.FactionEffects) if (object(effect)) items.push(effect.Faction);
  if (Array.isArray(e.Factions)) for (const effect of e.Factions) if (object(effect)) items.push(effect.Faction);
  return [...new Set(items.map((x) => name(x, 160)).filter((x): x is string => !!x))].slice(0, 20);
};
/** Only live events should call this. We do not assign an inferred BGS gain to any entry. */
export function classifyCommanderEvent(event: Record<string, unknown>): CommanderBgsEntry | null {
  const at = date(event.timestamp);
  if (!at || typeof event.event !== "string") return null;
  const types: Record<string, CommanderEventKind> = {
    FSDJump: "jump",
    MissionCompleted: "mission",
    MissionAccepted: "mission-accepted",
    RedeemVoucher: "voucher",
    FactionKillBond: "kill-bond",
    MarketSell: "trade",
    Bounty: "bounty",
    SellExplorationData: "exploration",
    MultiSellExplorationData: "exploration",
  };
  const kind = types[event.event];
  if (!kind) return null;
  const system = name(event.StarSystem, 180);
  const factions = namedFactions(event);
  const credits = amount(event.Reward ?? event.Amount ?? event.TotalReward ?? event.TotalSale);
  const missionId =
    typeof event.MissionID === "number" && Number.isSafeInteger(event.MissionID) ? String(event.MissionID) : "";
  const key = [
    at,
    event.event,
    missionId,
    system ?? "",
    credits ?? "",
    factions.join("|"),
    name(event.Target, 80) ?? "",
  ].join(";");
  return { at, kind, system, factions, amount: credits, key };
}
/** Idempotent and bounded, with no cross-commander merging. */
export function recordCommanderEvents(commander: string, events: readonly Record<string, unknown>[]): number {
  if (!commanderKey(commander)) return 0;
  const profile = readCommanderLog(commander);
  const seen = new Set(profile.entries.map((x) => x.key));
  let added = 0;
  for (const e of events) {
    const row = classifyCommanderEvent(e);
    if (!row || seen.has(row.key)) continue;
    seen.add(row.key);
    profile.entries.push(row);
    added++;
  }
  if (added && !saveCommanderLog({ ...profile, entries: profile.entries.slice(-CMD_BGS_LIMIT) })) return 0;
  return added;
}
export function setCommanderFaction(commander: string, faction: string): boolean {
  if (!commanderKey(commander) || !name(faction, 160)) return false;
  const p = readCommanderLog(commander);
  p.followedFaction = faction.trim();
  return saveCommanderLog(p);
}
export function commanderSummary(
  log: CommanderBgsLog,
  faction: string,
  trackedSystems: readonly string[],
  now = Date.now(),
) {
  const known = new Set(trackedSystems.map((x) => x.toLocaleLowerCase()));
  let jumps = 0,
    trackedJumps = 0,
    missionForFaction = 0,
    linkedEvents = 0,
    unattributed = 0;
  let lastAt: string | undefined;
  const latest30 = log.entries.filter((e) => now - Date.parse(e.at) <= 30 * 86400_000 && now >= Date.parse(e.at));
  for (const e of latest30) {
    if (!lastAt || e.at > lastAt) lastAt = e.at;
    const forFaction = e.factions.some((f) => same(f, faction));
    if (e.kind === "jump") {
      jumps++;
      if (e.system && known.has(e.system.toLocaleLowerCase())) trackedJumps++;
    }
    if (e.kind === "mission" && forFaction) missionForFaction++;
    if (forFaction) linkedEvents++;
    if (e.kind !== "jump" && !e.factions.length) unattributed++;
  }
  return {
    lastAt,
    jumps,
    trackedJumps,
    missionForFaction,
    linkedEvents,
    unattributed,
    entries30: latest30.length,
    entriesAll: log.entries.length,
  };
}
export function commanderCsv(log: CommanderBgsLog): string {
  const esc = (v: unknown): string => {
    const raw = String(v ?? "");
    // Spreadsheet applications must not interpret user-supplied names as formulas.
    const safe = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  return [
    ["CMDR", "UTC", "Type", "Système", "Factions explicitement nommées", "Crédits (pas influence)"].map(esc).join(";"),
    ...log.entries.map((e) =>
      [log.commander, e.at, e.kind, e.system, e.factions.join(" / "), e.amount].map(esc).join(";"),
    ),
  ].join("\n");
}
