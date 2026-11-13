// EDCH-Discord, the squadron's Discord bot (its own repository, edch-discord): a member links EDCH
// with the key `/bgs link` gives them, and EDCH sends their BGS reports (docs/BGS_SYNC.md). The
// bot keeps nothing itself: reports go to the #edch-bgs channel of the squadron's server.
//
// The key ("edch1.<payload>.<signature>") is signed by the bot; EDCH reads the payload only to
// know which bot to call and to show who it's linked to. Calls go through Rust (discord_bot.rs),
// which reaches only the shared bot and a squadron's own bot the member confirmed.

import { botFetch } from "../platform/bridge.js";

/** The shared bot (EDCH-Discord hosted for every squadron). Same value as discord_bot.rs. */
export const SHARED_BOT = "https://edch-discord.default-community.workers.dev";
/**
 * The shared bot's Discord application, for the link that adds it to a server ("" until the
 * application exists: the link isn't shown).
 */
export const SHARED_BOT_APPLICATION_ID = "";

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
  "otherServer",
  "notSetUp",
  "revoked",
  "roleMissing",
  "badFormat",
  "unknownVersion",
  "otherFaction",
  "tooLarge",
]);

async function call(key: string, path: "/v1/config" | "/v1/report", body?: unknown): Promise<Record<string, unknown>> {
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

/** The faction the squadron follows (also checks the key, the role and the server's set-up). */
export async function botFaction(key: string): Promise<string> {
  const answer = await call(key, "/v1/config");
  if (typeof answer.faction !== "string" || !answer.faction) throw new BotError("unavailable");
  return answer.faction;
}

/** Sends a report; returns how many actions the bot accepted. */
export async function sendBotReport(key: string, report: unknown): Promise<number> {
  const answer = await call(key, "/v1/report", report);
  return typeof answer.accepted === "number" ? answer.accepted : 0;
}

/** The link that adds the shared bot to a Discord server (Discord asks for Manage Server there). */
export function botInviteUrl(): string | null {
  if (!SHARED_BOT_APPLICATION_ID) return null;
  // See it, send, read history, manage and pin messages: what #edch-bgs needs.
  const permissions = (1n << 10n) | (1n << 11n) | (1n << 13n) | (1n << 16n) | (1n << 51n);
  return `https://discord.com/oauth2/authorize?client_id=${SHARED_BOT_APPLICATION_ID}&scope=bot%20applications.commands&permissions=${permissions}`;
}
