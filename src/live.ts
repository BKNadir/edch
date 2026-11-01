import { inStartup, startupAlert, goTo } from "./alerts.js";
// Glue between the journal, the activity tracker, the wing link and the notifications.

import { applyActivity, emptyActivity, HISTORY_DAYS, HISTORY_EVENTS, type Mission } from "./activity.js";
import { isRemote, scanHistory } from "./bridge.js";
import { h } from "./dom.js";
import { log } from "./logger.js";
import { gameName } from "./i18n.js";
import { mountSideTab, notify, recentAlerts, refresh as refreshTab } from "./notifier.js";
import type { Store } from "./store.js";
import { hoursLeft, relTime } from "./time.js";
import { sameMission, toWingMission, toWingMissions, wingRows, WingLink, type WingMember, type WingRow } from "./wing.js";

type Json = Record<string, any>;

let store: Store;
let historyEnd = "";
const historyEdge = new Set<string>();
let link: WingLink | null = null;
let linkCode = "";
let publishTimer: number | undefined;

const WING_ID_KEY = "edch.wingId";

function wingId(): string {
  try {
    let id = localStorage.getItem(WING_ID_KEY);
    if (!id) {
      id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(WING_ID_KEY, id);
    }
    return id;
  } catch {
    return "local";
  }
}

export function activeMissions(): Mission[] {
  return Object.values(store.state.activity.missions).sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? ""));
}

/** Does another member show this mission? (Then accepting it means taking part: it is shared.) */
function heldByOthers(m: Mission): boolean {
  if (!link) return false;
  const mine = toWingMission(m);
  return [...link.members.values()].some((o) => !o.left && o.missions.some((x) => sameMission(mine, x)));
}

/** Is this mission shared with the wing? By hand, automatically, or because a wingmate shared it. */
export function isShared(m: Mission): boolean {
  const s = store.state.settings.wing;
  return s.shared.includes(m.id) || (s.autoShare && m.wing) || heldByOthers(m);
}

/** Shares or stops sharing one mission. */
export function setShared(id: number, on: boolean) {
  const s = store.state.settings.wing;
  const active = new Set(Object.keys(store.state.activity.missions).map(Number));
  const shared = s.shared.filter((x) => x !== id && active.has(x));
  if (on) shared.push(id);
  store.updateSettings({ wing: { ...s, shared } });
  missionsChanged();
}

export function wingMe(): WingMember {
  const s = store.state.settings.wing;
  return { id: wingId(), name: s.name.trim() || store.state.cmdr.commander || "CMDR", at: new Date().toISOString(), missions: toWingMissions(activeMissions(), isShared) };
}

/** The wing as the views see it (on a phone: as the PC last published it). */
export function wingView(): { status: string; error: string; me: WingMember; members: WingMember[]; rows: WingRow[] } | null {
  const remote = (store.state as Json).remoteWing;
  if (isRemote()) return remote ?? null;
  if (!link) return null;
  const me = wingMe();
  const members = [...link.members.values()];
  return { status: link.status, error: link.lastError, me, members, rows: wingRows(me, members) };
}

/** Starts, restarts or stops the wing link to match the settings. */
export async function syncWing() {
  if (isRemote()) return;
  const s = store.state.settings.wing;
  const want = s.enabled && s.code.trim().length >= 8 ? s.code : "";
  if (want === linkCode) return;
  if (link) {
    log.info("wing", "Wing link stopped");
    await link.stop();
  }
  link = null;
  linkCode = want;
  if (!want) {
    store.notify();
    return;
  }
  log.info("wing", "Wing link started");
  link = new WingLink(want, wingMe, {
    newMission: (row, by) => {
      if (store.state.settings.wing.notifyNew) notify(`${by} : nouvelle mission d'escadrille « ${row.mission.title} »`);
    },
    everyone: (row) => {
      if (store.state.settings.wing.notifyAll) notify(`Toute l'escadrille a accepté « ${row.mission.title} »`);
    },
    accepted: (row, by) => {
      if (store.state.settings.wing.notifyAccept) notify(`${by} a accepté « ${row.mission.title} »`);
    },
    left: (name, reason) => {
      log.info("wing", `${name} left (${reason ?? "?"})`);
      if (!store.state.settings.wing.notifyLeave) return;
      if (reason === "closed") notify(`${name} a fermé EDCH`);
      else if (reason === "wing") notify(`${name} a quitté l'escadrille en jeu`);
      else notify(`${name} a arrêté le partage d'escadrille`);
    },
    changed: () => {
      enrichFromWing();
      // A wingmate's new mission may be one we hold: publish it as shared.
      missionsChanged();
      store.notify();
    },
    error: (message) => {
      if (inStartup()) startupAlert("wing", "Escadrille : connexion impossible", message, goTo("missions", "Missions"));
    },
  });
  store.notify();
  try {
    await link.start();
  } catch {
    /* status shows the error */
  }
}

function missionsChanged() {
  window.clearTimeout(publishTimer);
  publishTimer = window.setTimeout(() => {
    if (!link) return;
    void link.publish();
    link.check();
  }, 1000);
}

/**
 * Accepting a wingmate's shared mission writes nothing to the journal: EDCH first learns about it
 * from a cargo depot update (same mission id as the wingmate's). Such a mission only has an id
 * and a progress: complete it with what the wingmate's EDCH published, and keep the furthest
 * delivery progress anyone reported.
 */
function enrichFromWing() {
  if (!link) return;
  const others = [...link.members.values()].filter((o) => !o.left);
  for (const m of Object.values(store.state.activity.missions)) {
    const copies = others.flatMap((o) => o.missions.filter((x) => x.id === m.id));
    for (const c of copies) {
      // A stub (known only from a cargo depot update or the login list) has no faction.
      if (!m.faction && c.faction) {
        m.faction = c.faction;
        if (c.name) m.name = c.name;
        if (c.title) m.title = c.title;
        m.wing = true;
      }
      m.destSystem ??= c.destSystem;
      m.destStation ??= c.destStation;
      m.expiry ??= c.expiry;
      m.reward ??= c.reward;
      m.commodity ??= c.commodity;
      m.count ??= c.count;
      if (c.total && (c.delivered ?? 0) > (m.delivered ?? 0)) {
        m.delivered = c.delivered;
        m.total = c.total;
      }
    }
  }
}

function checkMining(ev: Json) {
  const m = store.state.settings.mining;
  if (!m.alert || ev.event !== "ProspectedAsteroid") return;
  const hits = (ev.Materials ?? [])
    .map((x: Json) => ({ id: String(x.Name ?? "").toLowerCase(), label: String(x.Name_Localised ?? x.Name ?? ""), pct: Number(x.Proportion ?? 0) }))
    .filter((x: { id: string; pct: number }) => m.targets.some((t) => t.id === x.id && x.pct >= t.min));
  if (ev.MotherlodeMaterial) notify(`Cœur : ${gameName(String(ev.MotherlodeMaterial_Localised ?? ev.MotherlodeMaterial))}`);
  else if (hits.length) notify(hits.map((x: { label: string; pct: number }) => `${gameName(x.label)} ${x.pct.toFixed(1)} %`).join(" · "));
}

const lineKey = (ev: Json) => JSON.stringify(ev);

/** Live journal events (never the start-up replay). */
export function onLiveEvents(events: Json[]) {
  const st = store.state.activity;
  let changed = false;
  let missions = false;
  const surface = store.state.cmdr.surface;
  for (const ev of events) {
    // Leaving or joining a wing in game: tell the EDCH wing (live events only, not the replay).
    if (ev.event === "WingLeave") void link?.leftWing();
    else if (ev.event === "WingJoin") void link?.joinedWing();
    const at = String(ev.timestamp ?? "");
    // Lines already read from the archive at start-up.
    if (historyEnd && at && (at < historyEnd || (at === historyEnd && historyEdge.has(lineKey(ev))))) continue;
    if (applyActivity(st, ev, { position: surface ? { lat: surface.lat, lon: surface.lon } : undefined })) {
      changed = true;
      if (/^Mission|^CargoDepot$|^Bounty$/.test(ev.event)) missions = true;
    }
    checkMining(ev);
  }
  if (missions) {
    enrichFromWing();
    missionsChanged();
  }
  if (changed) {
    store.notify();
    refreshTab();
  }
}

/** Rebuilds the activity from the journal archive. */
export async function loadHistory(dir: string) {
  if (!dir) return;
  let lines: string[] = [];
  try {
    lines = await scanHistory(dir, HISTORY_DAYS, HISTORY_EVENTS);
  } catch (e) {
    log.warn("history", `Journal archive unreadable: ${String((e as Error)?.message ?? e)}`);
    startupAlert("history", "Historique du journal illisible", "Missions, colonisation et exploration ne montreront que la session en cours.");
    return;
  }
  log.info("history", `${lines.length} archived journal line(s) read`);
  const st = emptyActivity();
  let last = "";
  for (const line of lines) {
    let ev: Json;
    try {
      ev = JSON.parse(line);
    } catch {
      continue;
    }
    applyActivity(st, ev);
    if (ev.timestamp && ev.timestamp >= last) {
      if (ev.timestamp > last) historyEdge.clear();
      last = ev.timestamp;
      historyEdge.add(lineKey(ev));
    }
  }
  historyEnd = last;
  store.state.activity = st;
  store.notify();
  refreshTab();
  missionsChanged();
}

function panel(): (Node | null)[] {
  const missions = activeMissions();
  const wing = wingView();
  const parts: (Node | null)[] = [h("div.side-head", null, h("strong", null, "Missions"), h("span.sub", null, `${missions.length} en cours`))];
  if (wing) {
    const names = new Map([[wing.me.id, wing.me.name], ...wing.members.map((m) => [m.id, m.name] as [string, string])]);
    parts.push(
      h(
        "section.side-section",
        null,
        h("h4", null, "Escadrille"),
        wing.rows.length
          ? h(
              "ul.side-list",
              null,
              wing.rows.slice(0, 8).map((r) =>
                h(
                  "li",
                  null,
                  h("span.side-title", null, r.mission.title),
                  h("span.sub", null, r.mission.destSystem ?? "", r.mission.expiry ? ` · ${relTime(r.mission.expiry)}` : ""),
                  h(
                    "span.side-holders",
                    null,
                    [...r.holders.map((id) => h("span.badge.ok", null, `✓ ${names.get(id) ?? "?"}`)), ...r.missing.map((id) => h("span.badge.muted", null, `… ${names.get(id) ?? "?"}`))],
                  ),
                ),
              ),
            )
          : h("p.sub", null, "Aucune mission d'escadrille pour l'instant."),
      ),
    );
  }
  if (missions.length) {
    parts.push(
      h(
        "section.side-section",
        null,
        h("h4", null, "Prochaines échéances"),
        h(
          "ul.side-list",
          null,
          missions.slice(0, 6).map((m) =>
            h(
              "li",
              { class: hoursLeft(m.expiry) < 6 ? "soon" : "" },
              h("span.side-title", null, m.title),
              h("span.sub", null, m.status === "redirected" ? "Objectif atteint · " : "", m.destSystem ?? "", m.expiry ? ` · ${relTime(m.expiry)}` : ""),
            ),
          ),
        ),
      ),
    );
  }
  const alerts = recentAlerts();
  if (alerts.length) {
    parts.push(h("section.side-section", null, h("h4", null, "Alertes"), h("ul.side-list", null, alerts.slice(0, 6).map((a) => h("li", null, h("span", null, a.text), h("span.sub", null, relTime(a.at)))))));
  }
  parts.push(h("button.ghost.small", { onclick: () => store.setView("missions") }, "Ouvrir la page Missions"));
  return parts;
}

/** Pages can be drawn before setupLive runs (start-up on the Missions page): give them the store first. */
export function bindStore(s: Store) {
  store = s;
}

export function setupLive(s: Store) {
  store = s;
  mountSideTab(store, panel);
  store.subscribe(() => refreshTab());
  void syncWing();
}
