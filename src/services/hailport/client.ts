// The session with Hailport (docs/HAILPORT.md): hello and approval, the token, declaring the
// commands and events, running the commands Hailport asks for, sending events and the context,
// and connecting again when the rules say so (Hailport closed, or not running yet). The
// connection itself is in Rust (platform/bridge.ts: hailportConnect…); what EDCH declares and
// does is given by the app (app/hailport.ts).

import { hailportConnect, hailportDisconnect, hailportSend, onHailport } from "../../platform/bridge.js";
import { log } from "../../platform/logger.js";
import {
  type CommandAnswer,
  type CommandDeclaration,
  contextMessage,
  type EventDeclaration,
  eventMessage,
  helloMessage,
  type Invoke,
  jsonBytes,
  LIMITS,
  notifyMessage,
  readIncoming,
  registerMessage,
  resultMessage,
  validArguments,
} from "./protocol.js";

/** Where the link stands, for the Settings page. */
export type HailportState =
  /** Not wanted (setting off), or not offered by this build. */
  | "off"
  /** Trying to reach Hailport (or waiting to try again: it isn't running or doesn't allow apps). */
  | "connecting"
  /** Hailport asks the user to allow EDCH (up to 60 seconds). */
  | "approval"
  | "connected"
  /** The user refused EDCH, or didn't answer: connect again from the Settings page. */
  | "refused"
  /** The user removed EDCH from Hailport's connected apps: connect again from the Settings page. */
  | "removed"
  /** This EDCH is too old for this Hailport. */
  | "outdated";

/** What the app gives the client: what EDCH declares, how it runs commands, its token. */
export interface HailportApp {
  version: string;
  /** Called with Hailport's language (EDCH's texts in it, else English) before each register. */
  useLanguage(language: string): Promise<string>;
  commands(language: string): CommandDeclaration[];
  events(language: string): EventDeclaration[];
  run(command: string, args: Record<string, unknown>, language: string): Promise<CommandAnswer>;
  context(language: string): Record<string, unknown>;
  loadToken(): string | undefined;
  saveToken(token: string | null): void;
  onState(state: HailportState): void;
}

/** Waits between attempts while Hailport isn't there ("every 10 seconds or more"). */
const RETRY_MS = 15_000;
/** After "already_connected" (an approval is still pending somewhere): a few seconds. */
const RETRY_SOON_MS = 5_000;
/** An answer must reach Hailport within 10 seconds: past this, a slow command says so. */
const ANSWER_WITHIN_MS = 8_000;
/** At most one context per second (Hailport's rule); quick changes are merged. */
const CONTEXT_EVERY_MS = 1_000;

export class HailportClient {
  private generation = 0;
  /** Between start() and stop(). */
  private active = false;
  private port = 0;
  private language = "en";
  private state: HailportState = "off";
  private retryTimer: number | undefined;
  private contextTimer: number | undefined;
  private lastContext = "";
  private lastContextAt = 0;
  private stopListening: (() => void) | undefined;
  private declared: CommandDeclaration[] = [];

  constructor(private app: HailportApp) {}

  /** Connects on `port` (again from the start, e.g. after a refusal or a port change). */
  async start(port: number) {
    this.port = port;
    this.active = true;
    if (!this.stopListening)
      this.stopListening = await onHailport(
        (generation, text) => {
          if (this.current(generation)) void this.receive(text);
        },
        (generation, state, code) => {
          if (this.current(generation)) this.statusChanged(state, code);
        },
      );
    this.connect();
  }

  /**
   * Whether a message is from the latest connection. Rust numbers connections in order, and its
   * first news may come before hailportConnect's answer: a newer number becomes the current one.
   */
  private current(generation: number): boolean {
    if (!this.active || generation < this.generation) return false;
    this.generation = generation;
    return true;
  }

  /** Disconnects and stops trying. */
  stop() {
    this.active = false;
    window.clearTimeout(this.retryTimer);
    window.clearTimeout(this.contextTimer);
    void hailportDisconnect();
    this.stopListening?.();
    this.stopListening = undefined;
    this.setState("off");
  }

  /** The state Hailport reads: sent when it changed, at most once per second. */
  contextChanged() {
    if (this.state !== "connected" || this.contextTimer !== undefined) return;
    const wait = Math.max(0, this.lastContextAt + CONTEXT_EVERY_MS - Date.now());
    this.contextTimer = window.setTimeout(() => {
      this.contextTimer = undefined;
      this.sendContext();
    }, wait);
  }

  /** Something happened in the game (an event declared in "register"). */
  event(name: string, data?: Record<string, unknown>, say?: string) {
    if (this.state === "connected") this.send(eventMessage(name, data, say));
  }

  /** Commands changed (one became available or not): declared again. */
  redeclare() {
    if (this.state === "connected") void this.register();
  }

  get currentLanguage() {
    return this.language;
  }

  private setState(state: HailportState) {
    if (state === this.state) return;
    this.state = state;
    this.app.onState(state);
  }

  private connect() {
    window.clearTimeout(this.retryTimer);
    this.setState("connecting");
    hailportConnect(this.port).then(
      (generation) => {
        if (this.active) this.generation = Math.max(this.generation, generation);
      },
      (error) => log.warn("hailport", `Couldn't start the link: ${error}`),
    );
  }

  private retryIn(ms: number) {
    window.clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.connect(), ms);
  }

  private send(text: string) {
    if (new TextEncoder().encode(text).length > LIMITS.messageBytes) {
      log.warn("hailport", "Message left out: larger than Hailport accepts");
      return;
    }
    hailportSend(this.generation, text).catch(() => undefined);
  }

  private statusChanged(state: "open" | "closed", code: number | null) {
    if (state === "open") {
      // Hailport wants "hello" within 10 seconds; with no token, it asks the user first.
      const token = this.app.loadToken();
      this.setState(token ? "connecting" : "approval");
      this.send(helloMessage(this.app.version, token));
      return;
    }
    window.clearTimeout(this.contextTimer);
    this.contextTimer = undefined;
    switch (code) {
      case 4001: // removed by the user
        this.app.saveToken(null);
        this.setState("removed");
        return;
      case 4002: // a newer connection of EDCH took over
        this.setState("off");
        return;
      case 4004: // refused at hello: the reason came just before ("denied")
        if (this.state === "refused" || this.state === "removed" || this.state === "outdated") return;
        this.setState("connecting");
        this.retryIn(RETRY_SOON_MS);
        return;
      case 4005: // no valid hello: a bug on EDCH's side, not worth looping on
        log.warn("hailport", "Hailport didn't accept EDCH's hello");
        this.setState("outdated");
        return;
      default: // 1001 (Hailport quitting or apps turned off), 4003 (no activity), dropped, not running
        this.setState("connecting");
        this.retryIn(RETRY_MS);
    }
  }

  private async receive(text: string) {
    const message = readIncoming(text);
    switch (message.type) {
      case "welcome":
        if (message.token) this.app.saveToken(message.token);
        this.language = await this.app.useLanguage(message.language);
        this.setState("connected");
        log.info("hailport", "Hailport accepted EDCH");
        // Every session starts empty: declare, then give the state.
        await this.register();
        this.lastContext = "";
        this.sendContext();
        return;
      case "denied":
        log.info("hailport", `Hailport refused EDCH (${message.reason})`);
        if (message.reason === "token_revoked") {
          this.app.saveToken(null);
          this.setState("removed");
        } else if (message.reason === "refused_by_user" || message.reason === "no_answer") this.setState("refused");
        else if (message.reason === "unsupported_version") this.setState("outdated");
        return;
      case "settings":
        this.language = await this.app.useLanguage(message.language);
        await this.register();
        this.lastContext = "";
        this.sendContext();
        return;
      case "invoke":
        await this.invoke(message.invoke);
        return;
      case "error":
        // Only the code: what was refused may hold game data.
        log.debug("hailport", `Hailport refused a message (${message.code})`);
        return;
      default:
        return;
    }
  }

  private async register() {
    this.declared = this.app.commands(this.language);
    this.send(registerMessage(this.declared, this.app.events(this.language)));
  }

  private sendContext() {
    if (this.state !== "connected") return;
    const data = this.app.context(this.language);
    const text = JSON.stringify(data);
    if (text === this.lastContext) return;
    if (jsonBytes(data) > LIMITS.dataBytes) log.debug("hailport", "Context larger than 4 KB: not sent");
    this.lastContext = text;
    this.lastContextAt = Date.now();
    this.send(contextMessage(data));
  }

  private async invoke({ id, command, args }: Invoke) {
    const declaration = this.declared.find((c) => c.name === command);
    if (!declaration || !validArguments(declaration, args)) {
      this.send(resultMessage(id, { ok: false, error: { code: "invalid_argument" } }));
      return;
    }
    log.info("hailport", `Command: ${command}`);
    let answer: CommandAnswer;
    try {
      // A command must answer in time: past ANSWER_WITHIN_MS, "busy" (Hailport says so itself).
      answer = await Promise.race([
        this.app.run(command, args, this.language),
        new Promise<CommandAnswer>((resolve) =>
          window.setTimeout(() => resolve({ ok: false, error: { code: "busy" } }), ANSWER_WITHIN_MS),
        ),
      ]);
    } catch (error) {
      log.warn("hailport", `Command ${command} failed: ${(error as Error)?.message ?? error}`);
      answer = { ok: false, error: { code: "not_available" } };
    }
    this.send(resultMessage(id, answer));
    if (answer.later)
      answer.later.then(
        (reply) => this.send(notifyMessage(reply.say, reply.data, id)),
        (error) => log.warn("hailport", `Command ${command} failed later: ${(error as Error)?.message ?? error}`),
      );
  }
}
