import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { webcrypto } from "node:crypto";
import { applyActivityEvents, bodyValue, emptyActivity, massacreStacks, meritsThisWeek, surfaceDistance, weekStart } from "../dist/js/game/activity.js";
import { open, seal, sameMission, topicFor, wingRows } from "../dist/js/services/wing.js";

globalThis.crypto ??= webcrypto;

const at = (s) => `2026-11-01T12:${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}Z`;

test("massacre kills count once per issuing faction, oldest mission first", () => {
  const st = emptyActivity();
  applyActivityEvents(st, [
    { timestamp: at(1), event: "MissionAccepted", MissionID: 1, Name: "Mission_Massacre", Faction: "A", TargetFaction: "Pirates", KillCount: 3 },
    { timestamp: at(2), event: "MissionAccepted", MissionID: 2, Name: "Mission_Massacre", Faction: "A", TargetFaction: "Pirates", KillCount: 5 },
    { timestamp: at(3), event: "MissionAccepted", MissionID: 3, Name: "Mission_Massacre", Faction: "B", TargetFaction: "Pirates", KillCount: 4 },
    ...[4, 5, 6, 7].map((s) => ({ timestamp: at(s), event: "Bounty", VictimFaction: "Pirates" })),
  ]);
  assert.equal(st.missions[1].kills, 3); // full, then the next kill goes to mission 2
  assert.equal(st.missions[2].kills, 1);
  assert.equal(st.missions[3].kills, 4);
  const [stack] = massacreStacks(Object.values(st.missions));
  assert.equal(stack.needed, 8);
  assert.equal(stack.done, 4);
});

test("missions: login list drops finished ones, redirect marks the objective done", () => {
  const st = emptyActivity();
  applyActivityEvents(st, [
    { timestamp: at(1), event: "MissionAccepted", MissionID: 10, Name: "Mission_Courier", LocalisedName: "Courier", Faction: "F", DestinationSystem: "Sol", Wing: true },
    { timestamp: at(2), event: "MissionAccepted", MissionID: 11, Name: "Mission_Delivery", Faction: "F" },
    { timestamp: at(3), event: "MissionRedirected", MissionID: 10, NewDestinationSystem: "Achenar", NewDestinationStation: "Dawes Hub" },
    { timestamp: at(4), event: "Missions", Active: [{ MissionID: 10 }], Failed: [], Complete: [] },
  ]);
  assert.deepEqual(Object.keys(st.missions), ["10"]);
  assert.equal(st.missions[10].status, "redirected");
  assert.equal(st.missions[10].destSystem, "Achenar");
});

test("colonisation depot: requirements, contributions and station name", () => {
  const st = emptyActivity();
  applyActivityEvents(st, [
    { timestamp: at(1), event: "Docked", MarketID: 77, StationName: "Site A", StarSystem: "Col 1" },
    { timestamp: at(2), event: "ColonisationConstructionDepot", MarketID: 77, ConstructionProgress: 0.2, ResourcesRequired: [{ Name: "$Steel_name;", Name_Localised: "Steel", RequiredAmount: 100, ProvidedAmount: 20 }] },
    { timestamp: at(3), event: "ColonisationContribution", MarketID: 77, Contributions: [{ Name: "$Steel_name;", Amount: 30 }] },
  ]);
  const d = st.depots[77];
  assert.equal(d.station, "Site A");
  assert.equal(d.resources[0].id, "steel");
  assert.equal(d.resources[0].provided, 50);
});

test("exobiology: three scans make an unsold analysis; selling and dying clear data", () => {
  const st = emptyActivity();
  const scan = (s, type) => ({ timestamp: at(s), event: "ScanOrganic", ScanType: type, Genus: "$Codex_Ent_Stratum_Genus_Name;", Species: "$Codex_Ent_Stratum_07_Name;", Species_Localised: "Stratum Tectonicas", SystemAddress: 5, Body: 3 });
  applyActivityEvents(st, [scan(1, "Log"), scan(2, "Sample")], { position: { lat: 1, lon: 2 } });
  assert.equal(st.sampling.samples.length, 2);
  applyActivityEvents(st, [scan(3, "Analyse")]);
  assert.equal(st.sampling, undefined);
  assert.equal(st.organics.length, 1);
  applyActivityEvents(st, [{ timestamp: at(4), event: "SellOrganicData", BioData: [{ Species: "$Codex_Ent_Stratum_07_Name;", Value: 19010800, Bonus: 0 }] }]);
  assert.equal(st.organics.length, 0);
  assert.equal(st.session.exobiology, 19010800);
});

test("exploration: scans are unsold until the system is sold", () => {
  const st = emptyActivity();
  applyActivityEvents(st, [
    { timestamp: at(1), event: "FSDJump", StarSystem: "Alpha", SystemAddress: 1, JumpDist: 20 },
    { timestamp: at(2), event: "Scan", ScanType: "Detailed", StarSystem: "Alpha", SystemAddress: 1, BodyID: 2, BodyName: "Alpha 1", PlanetClass: "Earthlike body", MassEM: 1, TerraformState: "", WasDiscovered: false, WasMapped: false },
    { timestamp: at(3), event: "FSDJump", StarSystem: "Beta", SystemAddress: 9, JumpDist: 10 },
  ]);
  assert.deepEqual(Object.keys(st.unsoldSystems), ["Alpha"]);
  assert.equal(st.session.jumps, 2);
  applyActivityEvents(st, [{ timestamp: at(4), event: "SellExplorationData", Systems: ["Alpha"], TotalEarnings: 1000 }]);
  assert.deepEqual(st.unsoldSystems, {});
});

test("body values follow the community formula", () => {
  // Earth-like world, 1 Earth mass, already discovered, not mapped: about 270k.
  const elw = bodyValue({ planetClass: "Earthlike body", massEM: 1, wasDiscovered: true, wasMapped: true, genera: [] });
  assert.ok(elw > 250_000 && elw < 300_000, String(elw));
  // Mapping multiplies by 3.33 (+30 % Odyssey bonus).
  const mapped = bodyValue({ planetClass: "Earthlike body", massEM: 1, wasDiscovered: true, wasMapped: true, mapped: true, genera: [] });
  assert.ok(mapped > elw * 4 && mapped < elw * 4.5, String(mapped));
});

test("powerplay week starts on Thursday 07:00 UTC", () => {
  assert.equal(weekStart(new Date("2026-11-01T12:00:00Z")).toISOString(), "2026-10-29T07:00:00.000Z");
  assert.equal(weekStart(new Date("2026-10-29T06:59:00Z")).toISOString(), "2026-10-22T07:00:00.000Z");
  const pp = { gains: [{ at: "2026-10-28T10:00:00Z", merits: 50 }, { at: "2026-10-30T10:00:00Z", merits: 70 }] };
  assert.equal(meritsThisWeek(pp, new Date("2026-11-01T12:00:00Z")), 70);
});

test("surface distance", () => {
  const d = surfaceDistance({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }, 1_000_000);
  assert.ok(Math.abs(d - 17453) < 2, String(d));
});

test("wing messages are encrypted and only open with the same code", async () => {
  const code = "ABCD-EFGH-JKLM-NPQR";
  const key = await (async () => {
    // Reach the private key derivation through a sealed round-trip.
    const enc = new TextEncoder();
    const base = await crypto.subtle.importKey("raw", enc.encode("ABCDEFGHJKLMNPQR"), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: enc.encode("edch-wing-v1"), iterations: 150_000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  })();
  const packet = { v: 1, from: "me", name: "CMDR A", at: at(1), missions: [{ id: 1, title: "Deliver", faction: "F", status: "active" }] };
  const text = await seal(key, packet);
  assert.ok(text.startsWith("edch1:"));
  assert.ok(!text.includes("Deliver"));
  assert.deepEqual(await open(key, text), packet);
  const other = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  assert.equal(await open(other, text), null);
  assert.match(await topicFor(code), /^edch_[0-9a-f]{32}$/);
  assert.equal(await topicFor("abcd efgh jklm npqr"), await topicFor(code));
});

test("wing rows: who holds what", () => {
  const now = Date.parse("2026-11-01T12:00:00Z");
  const m = { id: 5, title: "Deliver steel", faction: "F", destSystem: "Sol", expiry: "2026-11-02T10:00:00Z", status: "active" };
  const me = { id: "a", name: "A", at: "2026-11-01T11:59:00Z", missions: [m] };
  const b = { id: "b", name: "B", at: "2026-11-01T11:50:00Z", missions: [{ ...m, id: 99 }] }; // other id, same mission
  const c = { id: "c", name: "C", at: "2026-11-01T11:40:00Z", missions: [] };
  const rows = wingRows(me, [b, c], now);
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].holders, ["a", "b"]);
  assert.deepEqual(rows[0].missing, ["c"]);
  assert.ok(sameMission(m, { ...m, id: 99 }));
});

test("a wingmate's copy matches even with another id, language and no wing flag", async () => {
  const { sameMission } = await import("../dist/js/services/wing.js");
  const mine = { id: 1, name: "Mission_Delivery_Boom_Wing_name", title: "Livrer 720 t d'acier", faction: "Timbalderis Liberals", destSystem: "Kamadhenu", destStation: "Velazquez Port", expiry: "2026-11-02T10:00:00Z", status: "active" };
  const theirs = { ...mine, id: 2, title: "Deliver 720 t of steel", expiry: "2026-11-02T10:00:05Z" };
  assert.ok(sameMission(mine, theirs));
  assert.ok(!sameMission(mine, { ...theirs, destStation: "Other Port" }));
  assert.ok(!sameMission(mine, { ...theirs, name: "Mission_Courier_name" }));
});

test("wing notifications: shared missions only, then acceptances", async () => {
  const { WingLink } = await import("../dist/js/services/wing.js");
  const m = { id: 1, name: "Mission_Delivery_Wing", title: "Deliver", faction: "F", destSystem: "Sol", status: "active", expiry: "2026-11-02T10:00:00Z" };
  const fresh = new Date().toISOString();
  let mine = [];
  const seen = [];
  const link = new WingLink("CODE-CODE", () => ({ id: "me", name: "Me", at: fresh, missions: mine }), {
    newMission: (r, by) => seen.push(`new:${by}`),
    everyone: () => seen.push("all"),
    accepted: (r, by) => seen.push(`acc:${by}`),
    changed: () => {},
    error: () => {},
  });
  link.primed = true;
  link.members.set("b", { id: "b", name: "Bob", at: fresh, missions: [] });
  link.members.set("c", { id: "c", name: "Cid", at: fresh, missions: [] });
  link.check();
  assert.deepEqual(seen, []); // nothing shared: nobody is told anything
  mine = [m];
  link.check();
  link.members.set("b", { id: "b", name: "Bob", at: fresh, missions: [{ ...m, id: 7, title: "Livrer" }] });
  link.check();
  assert.deepEqual(seen, ["acc:Bob"]);
  link.members.set("c", { id: "c", name: "Cid", at: fresh, missions: [{ ...m, id: 8 }] });
  link.check();
  assert.deepEqual(seen, ["acc:Bob", "all"]);
});

test("missions known only from the login list or a wing delivery still show", () => {
  const st = emptyActivity();
  applyActivityEvents(st, [
    { timestamp: at(1), event: "Missions", Active: [{ MissionID: 42, Name: "Mission_Delivery_Boom_Wing_name", Expires: 3600 }] },
    { timestamp: at(2), event: "CargoDepot", MissionID: 43, UpdateType: "WingUpdate", CargoType: "Steel", ItemsDelivered: 100, TotalItemsToDeliver: 500 },
  ]);
  assert.equal(st.missions[42].title, "Delivery Boom Wing");
  assert.ok(st.missions[42].wing);
  assert.equal(st.missions[43].total, 500);
});
