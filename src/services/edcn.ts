// EDCN (Elite Dangerous Companion Network): the maintainer's own EDDN collector, read through its
// API (src-tauri/src/edcn.rs is the only way to it, and says each call comes from EDCH). Like
// Spansh, Ardent and EliteBGS it is fed by EDDN, but it keeps each message as soon as it arrives:
// searches ask it too and keep, for every market or system, the most recent data of all. On the
// phone nothing is asked; an error only means EDCN's data is missing.

import { edcnGet } from "../platform/bridge.js";
import { log } from "../platform/logger.js";
import type { Vec3 } from "../game/journal/state.js";
import type { ArdentQuote } from "./ardent.js";
import type { EliteBgsSystem } from "./eliteBgs.js";

/** EDCN answers at most this many results per search. */
const EDCN_LIMIT = 500;

/**
 * A value for an EDCN query: encodeURIComponent, plus the few characters it leaves as they are
 * ("Barnard's Star") but EDCH's Rust side only accepts encoded.
 */
export function edcnQueryValue(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/** One read from EDCN; null on any error (logged). */
async function edcnJson(path: string): Promise<any | null> {
  try {
    const reply = await edcnGet(path);
    if (reply.status === 404) return null;
    if (reply.status !== 200) throw new Error(`HTTP ${reply.status}`);
    return JSON.parse(reply.body);
  } catch (error) {
    log.warn("edcn", `No EDCN data (${String((error as Error)?.message ?? error)})`);
    return null;
  }
}

/** The reference of a search, as EDCN's query wants it: coordinates if known, else a name. */
function near(reference: { coords?: Vec3; system?: string }): string | null {
  const c = reference.coords;
  if (c && c.every(Number.isFinite)) return `x=${c[0]}&y=${c[1]}&z=${c[2]}`;
  return reference.system ? `near=${edcnQueryValue(reference.system)}` : null;
}

/** The largest landing pad of EDCN's pads ({"Small": 4, "Medium": 4, "Large": 2}): 1 to 3, 0 unknown. */
export function edcnPadSize(pads: unknown, largePad: unknown): number {
  const count = (size: string) => Number((pads as Record<string, unknown> | null)?.[size] ?? 0);
  if (largePad === true || count("Large") > 0) return 3;
  if (count("Medium") > 0) return 2;
  if (count("Small") > 0) return 1;
  return 0;
}

/**
 * Turns EDCN's offers into quotes by market id, shaped like Ardent's (marked "edcn"): selling to
 * the markets (their sell price and demand) or buying from them (`buying`: buy price and stock).
 */
export function edcnQuotesOf(offers: unknown, buying: boolean): Map<number, ArdentQuote> {
  const quotes = new Map<number, ArdentQuote>();
  if (!Array.isArray(offers)) return quotes;
  for (const offer of offers) {
    const marketId = Number(offer?.marketId);
    const price = Number(buying ? offer?.buy : offer?.sell);
    if (!Number.isFinite(marketId) || !(price > 0) || typeof offer?.updated !== "string") continue;
    quotes.set(marketId, {
      marketId,
      price,
      demand: Number((buying ? offer.stock : offer.demand) ?? 0),
      updated: offer.updated,
      station: String(offer.station ?? ""),
      system: String(offer.system ?? ""),
      stationType: String(offer.type ?? ""),
      padSize: edcnPadSize(offer.pads, offer.largePad),
      distance: typeof offer.distanceLy === "number" ? offer.distanceLy : undefined,
      arrival: typeof offer.distanceLs === "number" ? offer.distanceLs : undefined,
      source: "edcn",
    });
  }
  return quotes;
}

/**
 * The markets EDCN knows trading a commodity (the game's symbol, "tritium") within `range` light
 * years: where to sell it, or where to buy it (`buying`), the nearest first.
 */
export async function edcnQuotes(
  reference: { coords?: Vec3; system?: string },
  symbol: string,
  buying: boolean,
  range: number,
): Promise<Map<number, ArdentQuote>> {
  const from = near(reference);
  if (!from || !symbol) return new Map();
  const mode = buying ? "buy" : "sell";
  const answer = await edcnJson(
    `/api/v1/offers?commodity=${edcnQueryValue(symbol.toLowerCase())}&mode=${mode}&${from}` +
      `&range=${Math.max(1, Math.round(range))}&sort=distance&limit=${EDCN_LIMIT}`,
  );
  const quotes = edcnQuotesOf(answer?.offers, buying);
  log.debug("edcn", `${quotes.size} market(s) for ${symbol}`);
  return quotes;
}

/**
 * A system as EDCN gives it, in EliteBGS's shape (factions with influence in percent, states),
 * so both compare the same way; null when EDCN doesn't know it or has no factions for it.
 */
export function edcnSystemOf(answer: any): EliteBgsSystem | null {
  if (!answer || typeof answer.name !== "string" || !Array.isArray(answer.factions) || !answer.factionsUpdated)
    return null;
  const controlling = typeof answer.controllingFaction === "string" ? answer.controllingFaction : undefined;
  const factions = answer.factions
    .filter((f: any) => typeof f?.name === "string" && f.name)
    .map((f: any) => ({
      name: f.name,
      influence: typeof f.influence === "number" ? f.influence : NaN,
      state: typeof f.state === "string" && f.state ? f.state : undefined,
      active: Array.isArray(f.active) ? f.active.filter((s: unknown) => typeof s === "string") : [],
    }));
  const controllingState = factions.find((f: any) => f.name.toLowerCase() === controlling?.toLowerCase())?.state;
  return { name: answer.name, updatedAt: answer.factionsUpdated, controlling, controllingState, factions };
}

/** The systems EDCN knows among `names` (up to 10, asked together), with their factions. */
export async function edcnSystems(names: string[]): Promise<EliteBgsSystem[]> {
  const wanted = names.slice(0, 10);
  if (!wanted.length) return [];
  const answers = await Promise.all(wanted.map((name) => edcnJson(`/api/v1/system?name=${edcnQueryValue(name)}`)));
  const systems = answers.map(edcnSystemOf).filter((s): s is EliteBgsSystem => s !== null);
  log.debug("edcn", `${systems.length}/${wanted.length} system(s) found`);
  return systems;
}
