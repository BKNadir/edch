// The Hailport link (docs/HAILPORT.md): the protocol messages, and a whole session against a
// pretend Hailport (approval, token, register then context, commands, long commands, closings).

import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";

// A pretend Rust side: what EDCH sends, and a way to make Hailport speak or close.
const sent = [];
const listeners = {};
let generation = 0;
const calls = [];
globalThis.window ??= globalThis;
window.setTimeout = globalThis.setTimeout;
window.clearTimeout = globalThis.clearTimeout;
window.__TAURI__ = {
  core: {
    invoke: async (command, args) => {
      calls.push(command);
      if (command === "hailport_connect") return ++generation;
      if (command === "hailport_send") sent.push(JSON.parse(args.text));
      return undefined;
    },
  },
  event: {
    listen: async (name, callback) => {
      listeners[name] = callback;
      return () => delete listeners[name];
    },
  },
};
const status = (state, code = null) => listeners["hailport-status"]({ payload: { generation, state, code } });
const hailportSays = (message) =>
  listeners["hailport-message"]({ payload: { generation, text: JSON.stringify({ v: 1, ...message }) } });
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

const { HailportClient } = await import("../dist/js/services/hailport/client.js");
const protocol = await import("../dist/js/services/hailport/protocol.js");

test("protocol: limits and checks", () => {
  assert.equal(protocol.clip("é".repeat(400)).length, 300);
  assert.equal(protocol.fitData({ text: "x".repeat(5000) }), undefined);
  assert.deepEqual(protocol.readIncoming('{"v":2,"type":"welcome"}'), { type: "other" });
  assert.deepEqual(protocol.readIncoming("not json"), { type: "other" });
  assert.deepEqual(protocol.readIncoming('{"v":1,"type":"invoke","id":"c-1","command":"Bad Name","args":{}}'), {
    type: "other",
  });
  const declaration = {
    name: "find",
    description: "",
    params: {
      service: { type: "string", enum: ["a", "b"], description: "" },
      count: { type: "integer", minimum: 1, maximum: 5, description: "" },
    },
    required: ["service"],
  };
  assert.ok(protocol.validArguments(declaration, { service: "a", count: 3 }));
  assert.ok(!protocol.validArguments(declaration, { service: "c" }));
  assert.ok(!protocol.validArguments(declaration, { count: 3 }));
  assert.ok(!protocol.validArguments(declaration, { service: "a", count: 2.5 }));
  assert.ok(!protocol.validArguments(declaration, { service: "a", other: true }));
  const hello = JSON.parse(protocol.helloMessage("0.10.12"));
  assert.deepEqual(hello, { v: 1, type: "hello", app: { id: "com.bknadir.edch", name: "EDCH", version: "0.10.12" } });
});

test("a session: approval, token, register then context, commands, closings", async () => {
  let token;
  const states = [];
  let release;
  const client = new HailportClient({
    version: "0.10.12",
    useLanguage: async (language) => (language === "fr" ? "fr" : "en"),
    commands: () => [
      { name: "say_hi", description: "Say hi.", params: {} },
      { name: "slow", description: "A long one.", params: {} },
    ],
    events: () => [{ name: "docked", description: "Docked." }],
    run: async (command) =>
      command === "say_hi"
        ? { ok: true, say: "Hi." }
        : { ok: true, say: "Working…", later: new Promise((resolve) => (release = resolve)) },
    context: () => ({ system: "Sol" }),
    loadToken: () => token,
    saveToken: (value) => (token = value ?? undefined),
    onState: (state) => states.push(state),
  });

  await client.start(47615);
  status("open");
  await settle();
  // No token yet: hello without one, and the user is asked.
  assert.deepEqual(sent.shift(), {
    v: 1,
    type: "hello",
    app: { id: "com.bknadir.edch", name: "EDCH", version: "0.10.12" },
  });
  assert.equal(states.at(-1), "approval");

  hailportSays({ type: "welcome", token: "abc_DEF-123", language: "fr", hailport: { version: "0.2.0" } });
  await settle();
  assert.equal(token, "abc_DEF-123");
  assert.equal(states.at(-1), "connected");
  assert.deepEqual(
    sent.map((m) => m.type),
    ["register", "context"],
  );
  assert.deepEqual(sent[1].data, { system: "Sol" });
  sent.length = 0;

  // A command, a command with wrong arguments, an unknown one.
  // (Hailport sends one at a time and waits for the answer.)
  for (const [id, command, args] of [
    ["c-1", "say_hi", {}],
    ["c-2", "say_hi", { extra: 1 }],
    ["c-3", "nope", {}],
  ]) {
    hailportSays({ type: "invoke", id, command, args });
    await settle();
  }
  assert.deepEqual(sent.shift(), { v: 1, type: "result", id: "c-1", ok: true, say: "Hi." });
  assert.equal(sent.shift().error.code, "invalid_argument");
  assert.equal(sent.shift().error.code, "invalid_argument");

  // A long command: answered at once, its answer spoken later ("notify", reply_to).
  hailportSays({ type: "invoke", id: "c-4", command: "slow", args: {} });
  await settle();
  assert.deepEqual(sent.shift(), { v: 1, type: "result", id: "c-4", ok: true, say: "Working…" });
  release({ say: "Done: 12 jumps.", data: { jumps: 12 } });
  await settle();
  assert.deepEqual(sent.shift(), {
    v: 1,
    type: "notify",
    say: "Done: 12 jumps.",
    data: { jumps: 12 },
    reply_to: "c-4",
  });

  // The same context isn't sent twice.
  client.contextChanged();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  assert.equal(sent.length, 0);

  // Events go out only while connected.
  client.event("docked", { station: "Jameson Memorial" }, "Docked.");
  assert.deepEqual(sent.shift(), {
    v: 1,
    type: "event",
    name: "docked",
    data: { station: "Jameson Memorial" },
    say: "Docked.",
  });

  // Removed by the user: the token is forgotten, no reconnection.
  status("closed", 4001);
  assert.equal(token, undefined);
  assert.equal(states.at(-1), "removed");
  const connects = calls.filter((c) => c === "hailport_connect").length;
  client.stop();
  assert.equal(states.at(-1), "off");
  assert.equal(calls.filter((c) => c === "hailport_connect").length, connects);
});

test("a revoked token is forgotten; a refusal stops the attempts", async () => {
  let token = "old_token";
  const states = [];
  const client = new HailportClient({
    version: "0.10.12",
    useLanguage: async () => "en",
    commands: () => [],
    events: () => [],
    run: async () => ({ ok: true }),
    context: () => ({}),
    loadToken: () => token,
    saveToken: (value) => (token = value ?? undefined),
    onState: (state) => states.push(state),
  });
  sent.length = 0;
  await client.start(47615);
  status("open");
  await settle();
  assert.equal(sent.shift().token, "old_token");
  hailportSays({ type: "denied", reason: "token_revoked" });
  await settle();
  status("closed", 4004);
  assert.equal(token, undefined);
  assert.equal(states.at(-1), "removed");
  client.stop();
});

test("what EDCH tells Hailport: events from the journal, context without personal data", async () => {
  globalThis.localStorage ??= { getItem: () => null, setItem: () => undefined, removeItem: () => undefined };
  const { eventsFromJournal, hailportContext, missionsEndingSoon } =
    await import("../dist/js/features/hailport/events.js");
  const { setNavRoute } = await import("../dist/js/features/engineers/tour.js");
  const now = Date.parse("2026-11-12T20:00:00Z");
  const ctx = {
    store: {
      state: {
        cmdr: {
          commander: "Secret Name",
          location: { system: "Achenar", docked: true, station: "Dawes Hub", factions: [] },
          ship: { type: "Krait Mk II" },
          cargo: { gold: 10, silver: 4 },
          loadout: { cargoCapacity: 64, maxJumpRange: 31.456, modules: [] },
        },
        activity: {
          missions: {
            1: { id: 1, title: "Deliver gold", expiry: "2026-11-12T20:20:00Z", kills: 0, wing: false },
            2: { id: 2, title: "Old one", expiry: "2026-11-12T23:00:00Z", kills: 0, wing: false },
          },
          finished: {},
          depots: {
            7: {
              marketId: 7,
              station: "Orbital Construction Site: Nadir",
              progress: 1,
              complete: true,
              failed: false,
              resources: [],
            },
          },
        },
        settings: { sync: { shareMode: "bgs", edsmKey: "never" } },
        game: "game",
      },
    },
  };
  setNavRoute(["Sol", "Achenar", "Shinrarta Dezhra"]);
  const events = eventsFromJournal(
    ctx,
    [
      { event: "Docked", StationName: "Dawes Hub", StarSystem: "Achenar", StationType: "Orbis" },
      { event: "FSDJump", StarSystem: "Achenar" },
      { event: "FSDJump", StarSystem: "Shinrarta Dezhra" },
      { event: "ColonisationConstructionDepot", MarketID: 7, ConstructionComplete: true },
      { event: "ColonisationConstructionDepot", MarketID: 7, ConstructionComplete: true },
    ],
    "en",
  );
  assert.deepEqual(
    events.map((e) => e.name),
    ["docked", "jump_completed", "route_finished", "construction_complete"],
  );
  assert.equal(events[1].data.jumps_left, 1);
  assert.equal(events[0].say, "Docked at Dawes Hub.");

  const ending = missionsEndingSoon(ctx, "en", now);
  assert.deepEqual(
    ending.map((e) => e.data.title),
    ["Deliver gold"],
  );
  assert.equal(missionsEndingSoon(ctx, "en", now).length, 0, "told once");

  const context = hailportContext(ctx);
  assert.equal(context.system, "Achenar");
  assert.equal(context.station, "Dawes Hub");
  assert.equal(context.cargo_t, 14);
  assert.equal(context.data_sharing, "bgs");
  const text = JSON.stringify(context);
  assert.ok(!text.includes("Secret Name") && !text.includes("never"));
  assert.ok(new TextEncoder().encode(text).length < 4096);
});
