// Hailport's integration protocol, version 1 (docs/HAILPORT.md): the messages EDCH sends and
// receives, their checks and Hailport's limits. Pure functions, no connection here (see client.ts).

/** Protocol version, in the URL (/v1) and in every message. */
export const PROTOCOL_VERSION = 1;
/** EDCH's identifier for Hailport (reverse domain form, stable). */
export const APP_ID = "com.bknadir.edch";
/** Hailport's limits (bytes are of the compact UTF-8 JSON; characters are code points). */
export const LIMITS = {
  messageBytes: 64 * 1024,
  dataBytes: 4 * 1024,
  sayCharacters: 300,
  descriptionCharacters: 300,
  commands: 64,
  events: 64,
  parameters: 16,
};

/** A parameter of a command, as Hailport checks it before running the command. */
export type CommandParameter =
  | { type: "string"; description: string; enum?: string[]; maxLength?: number }
  | { type: "integer" | "number"; description: string; minimum?: number; maximum?: number }
  | { type: "boolean"; description: string };

/** A command EDCH offers to the assistant. */
export interface CommandDeclaration {
  name: string;
  description: string;
  params: Record<string, CommandParameter>;
  required?: string[];
  /** Hailport asks the user to confirm out loud before running it. */
  confirm?: boolean;
}

/** Something that can happen in EDCH, that Hailport may announce. */
export interface EventDeclaration {
  name: string;
  description: string;
  /** Suggests announcing it out loud by default (the user's choice in Hailport wins). */
  announce?: boolean;
}

/** A command Hailport asks EDCH to run. */
export interface Invoke {
  id: string;
  command: string;
  args: Record<string, unknown>;
}

/** What a command answers: at once, and for long commands the answer to speak later. */
export interface CommandAnswer {
  ok: boolean;
  say?: string;
  data?: Record<string, unknown>;
  error?: { code: string; message?: string };
  /** A long command: its answer (or its failure), spoken when it comes (a "notify"). */
  later?: Promise<{ say: string; data?: Record<string, unknown> }>;
}

/** Messages Hailport sends, as EDCH reads them. */
export type Incoming =
  | { type: "welcome"; token?: string; language: string }
  | { type: "denied"; reason: string }
  | { type: "invoke"; invoke: Invoke }
  | { type: "settings"; language: string }
  | { type: "error"; code: string }
  | { type: "other" };

const NAME = /^[a-z0-9_]{1,48}$/;
const LANGUAGE = /^[a-z]{2}$/;

/** The size of `value` as Hailport counts it: bytes of its compact UTF-8 JSON. */
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** `text` cut to `max` characters (code points, as Hailport counts), with "…" when cut. */
export function clip(text: string, max = LIMITS.sayCharacters): string {
  const characters = Array.from(text);
  return characters.length <= max ? text : `${characters.slice(0, max - 1).join("")}…`;
}

/** `data` if it fits Hailport's 4 KB, else nothing (better no details than a refused message). */
export const fitData = (data?: Record<string, unknown>) =>
  data && jsonBytes(data) <= LIMITS.dataBytes ? data : undefined;

/** Reads a message from Hailport; anything malformed or unknown is "other" (and ignored). */
export function readIncoming(text: string): Incoming {
  let message: unknown;
  try {
    message = JSON.parse(text);
  } catch {
    return { type: "other" };
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) return { type: "other" };
  const m = message as Record<string, unknown>;
  if (m.v !== PROTOCOL_VERSION) return { type: "other" };
  const language = typeof m.language === "string" && LANGUAGE.test(m.language) ? m.language : "en";
  switch (m.type) {
    case "welcome":
      return { type: "welcome", token: typeof m.token === "string" ? m.token : undefined, language };
    case "denied":
      return { type: "denied", reason: typeof m.reason === "string" ? m.reason.slice(0, 40) : "unknown" };
    case "settings":
      return { type: "settings", language };
    case "error":
      return { type: "error", code: typeof m.code === "string" ? m.code.slice(0, 40) : "unknown" };
    case "invoke": {
      const args = m.args && typeof m.args === "object" && !Array.isArray(m.args) ? m.args : {};
      if (typeof m.id !== "string" || m.id.length > 64 || typeof m.command !== "string" || !NAME.test(m.command))
        return { type: "other" };
      return { type: "invoke", invoke: { id: m.id, command: m.command, args: args as Record<string, unknown> } };
    }
    default:
      return { type: "other" };
  }
}

/** Checks a command's arguments against its declaration (Hailport does too; EDCH never trusts). */
export function validArguments(declaration: CommandDeclaration, args: Record<string, unknown>): boolean {
  for (const name of declaration.required ?? []) if (!(name in args)) return false;
  for (const [name, value] of Object.entries(args)) {
    const parameter = declaration.params[name];
    if (!parameter) return false;
    switch (parameter.type) {
      case "string":
        if (typeof value !== "string") return false;
        if (parameter.enum && !parameter.enum.includes(value)) return false;
        if (Array.from(value).length > (parameter.maxLength ?? 200)) return false;
        break;
      case "integer":
      case "number":
        if (typeof value !== "number" || !Number.isFinite(value)) return false;
        if (parameter.type === "integer" && !Number.isInteger(value)) return false;
        if (parameter.minimum !== undefined && value < parameter.minimum) return false;
        if (parameter.maximum !== undefined && value > parameter.maximum) return false;
        break;
      case "boolean":
        if (typeof value !== "boolean") return false;
    }
  }
  return true;
}

const message = (type: string, fields: Record<string, unknown>) =>
  JSON.stringify({ v: PROTOCOL_VERSION, type, ...fields });

/** Opens the session ("token": the one Hailport gave at the first approval). */
export const helloMessage = (version: string, token?: string) =>
  message("hello", { app: { id: APP_ID, name: "EDCH", version }, ...(token ? { token } : {}) });

/** The commands and events, within Hailport's limits. */
export function registerMessage(commands: CommandDeclaration[], events: EventDeclaration[]): string {
  const description = (text: string) => clip(text, LIMITS.descriptionCharacters);
  return message("register", {
    commands: commands.slice(0, LIMITS.commands).map((command) => ({
      ...command,
      description: description(command.description),
      params: Object.fromEntries(
        Object.entries(command.params)
          .slice(0, LIMITS.parameters)
          .map(([name, parameter]) => [name, { ...parameter, description: description(parameter.description) }]),
      ),
    })),
    events: events.slice(0, LIMITS.events).map((event) => ({ ...event, description: description(event.description) })),
  });
}

/** The answer to an "invoke". */
export function resultMessage(id: string, answer: CommandAnswer): string {
  return message("result", {
    id,
    ok: answer.ok,
    ...(answer.say ? { say: clip(answer.say) } : {}),
    ...(fitData(answer.data) ? { data: answer.data } : {}),
    ...(answer.error
      ? {
          error: {
            code: answer.error.code.slice(0, 40),
            ...(answer.error.message ? { message: clip(answer.error.message) } : {}),
          },
        }
      : {}),
  });
}

/** A sentence to speak now (the answer to a long command, `replyTo` its "invoke" id). */
export const notifyMessage = (say: string, data?: Record<string, unknown>, replyTo?: string) =>
  message("notify", {
    say: clip(say),
    ...(fitData(data) ? { data } : {}),
    ...(replyTo ? { reply_to: replyTo } : {}),
  });

/** Something that happened in the game. */
export const eventMessage = (name: string, data?: Record<string, unknown>, say?: string) =>
  message("event", { name, ...(fitData(data) ? { data } : {}), ...(say ? { say: clip(say) } : {}) });

/** EDCH's current state, for the assistant's questions (dropped if it doesn't fit 4 KB). */
export const contextMessage = (data: Record<string, unknown>) => message("context", { data: fitData(data) ?? {} });
