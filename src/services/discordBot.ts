// EDCH-Discord, the squadron's Discord bot (its own repository, edch-discord): a member links EDCH
// with the key `/bgs link` gives them, and EDCH sends their BGS reports (docs/BGS_SYNC.md). The
// bot keeps nothing itself: reports go to the #edch-bgs channel of the squadron's server.
//
// The key ("edch1.<payload>.<signature>") is signed by the bot; EDCH reads the payload only to
// know which bot to call and to show who it's linked to. Calls go through Rust (discord_bot.rs),
// which reaches only the shared bot and a squadron's own bot the member confirmed.

import { botFetch } from "../platform/bridge.js";
import { type SharedSystem, validSharedSystem } from "../state/bgsShared.js";

/** The shared bot (EDCH-Discord hosted for every squadron). Same value as discord_bot.rs. */
export const SHARED_BOT = "https://edch-discord.default-community.workers.dev";
/**
 * The link that adds the shared bot to a Discord server: the application's own install link
 * (Discord asks for the Manage Server right there, scopes and permissions are set in the app).
 */
export const SHARED_BOT_INVITE = "https://discord.com/oauth2/authorize?client_id=1570896049889869915";
/** The bot's code, for a squadron that hosts its own copy. */
export const BOT_SOURCE = "https://github.com/BKNadir/edch-discord";

/** What a key says (not checked: only the bot can check its signature). */
export interface BotKey {
  /** The bot's address, "https://host". */
  bot: string;
  guildId: string;
  userId: string;
  /** When the key was made. */
  issuedAt: string;
}

const SNOWFLAKE = /^\d{17,20}$/;

/** The key's payload when it looks like an EDCH-Discord key; null otherwise. */
export function readBotKey(key: string): BotKey | null {
  const parts = key.trim().split(".");
  if (parts.length !== 3 || parts[0] !== "edch1" || parts[1].length > 1000 || !/^[A-Za-z0-9_-]+$/.test(parts[2]))
    return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const raw = JSON.parse(atob(base64 + "===".slice((base64.length + 3) % 4)));
    const bot = typeof raw.b === "string" ? raw.b : "";
    if (!/^https:\/\/[A-Za-z0-9.-]+\.[A-Za-z0-9-]+(:\d{1,5})?$/.test(bot)) return null;
    if (!SNOWFLAKE.test(raw.g) || !SNOWFLAKE.test(raw.u) || !Number.isInteger(raw.t)) return null;
    return { bot, guildId: raw.g, userId: raw.u, issuedAt: new Date(raw.t * 1000).toISOString() };
  } catch {
    return null;
  }
}

/** A refusal from the bot, by code (translated as `discordError.<code>`). */
export class BotError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** The bot's error codes EDCH knows (anything else is shown as "unavailable"). */
const KNOWN_ERRORS = new Set([
  "badKey",
  "noFaction",
  "otherServer",
  "notSetUp",
  "revoked",
  "roleMissing",
  "badFormat",
  "unknownVersion",
  "otherFaction",
  "tooLarge",
]);

async function call(
  key: string,
  path: "/v1/config" | "/v1/report" | "/v1/systems",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const claims = readBotKey(key);
  if (!claims) throw new BotError("badKey");
  const reply = await botFetch(claims.bot, path, key.trim(), body === undefined ? undefined : JSON.stringify(body));
  let answer: Record<string, unknown> = {};
  try {
    answer = JSON.parse(reply.body);
  } catch {
    // Not the bot's JSON (a proxy's page…): handled below by the status.
  }
  if (reply.status >= 200 && reply.status < 300) return answer;
  const code = typeof answer.error === "string" && KNOWN_ERRORS.has(answer.error) ? answer.error : "unavailable";
  throw new BotError(code);
}

/**
 * The factions the squadron follows, the default first: its own and allied ones (also checks the
 * key, the role and the server's set-up). An older bot answers one `faction` only.
 */
export async function botFactions(key: string): Promise<string[]> {
  const answer = await call(key, "/v1/config");
  const list = Array.isArray(answer.factions) ? answer.factions : [answer.faction];
  const factions = list.filter((f): f is string => typeof f === "string" && f.trim().length > 0);
  if (!factions.length) throw new BotError("noFaction");
  return factions;
}

/**
 * What the squadron's members saw over the last days (the newest snapshot of each system where a
 * faction the server follows is), checked entry by entry.
 */
export async function botSystems(key: string): Promise<SharedSystem[]> {
  const answer = await call(key, "/v1/systems");
  const list = Array.isArray(answer.systems) ? answer.systems.slice(0, 500) : [];
  return list.map(validSharedSystem).filter((s): s is SharedSystem => s !== null);
}

/** Sends a report; returns how many actions the bot accepted. */
export async function sendBotReport(key: string, report: unknown): Promise<number> {
  const answer = await call(key, "/v1/report", report);
  return typeof answer.accepted === "number" ? answer.accepted : 0;
}
