// Wing mission sharing between EDCH users, through ntfy.sh.
//
// Everyone in the wing types the same code. The code gives the ntfy topic (a hash of it, so the
// code itself never travels) and the AES-GCM key that encrypts every message: ntfy only ever sees
// random-looking text. Each EDCH publishes its wing missions when they change, plus a heartbeat,
// and polls the topic for the others'.

import { httpFetch } from "./bridge.js";
import type { Mission } from "./activity.js";

export interface WingMission {
  id: number;
  title: string;
  faction: string;
  destSystem?: string;
  destStation?: string;
  expiry?: string;
  status: string;
  killCount?: number;
  kills?: number;
  delivered?: number;
  total?: number;
}

export interface WingMember {
  id: string;
  name: string;
  at: string;
  missions: WingMission[];
  left?: boolean;
}

interface Packet {
  v: 1;
  from: string;
  name: string;
  at: string;
  missions: WingMission[];
  bye?: boolean;
}

const NTFY = "https://ntfy.sh/";
const enc = new TextEncoder();
const dec = new TextDecoder();

export const normaliseCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function topicFor(code: string): Promise<string> {
  return `edch_${(await sha256Hex(`edch-wing-topic:${normaliseCode(code)}`)).slice(0, 32)}`;
}

async function keyFor(code: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(normaliseCode(code)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("edch-wing-v1"), iterations: 150_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function seal(key: CryptoKey, packet: Packet): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(packet))));
  const out = new Uint8Array(iv.length + data.length);
  out.set(iv);
  out.set(data, iv.length);
  return `edch1:${toB64(out)}`;
}

export async function open(key: CryptoKey, text: string): Promise<Packet | null> {
  if (!text.startsWith("edch1:")) return null;
  try {
    const raw = fromB64(text.slice(6));
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
    const p = JSON.parse(dec.decode(plain));
    return p && p.v === 1 && typeof p.from === "string" ? (p as Packet) : null;
  } catch {
    return null; // another wing's message on a colliding topic, or tampered: ignore
  }
}

export function toWingMissions(missions: Mission[]): WingMission[] {
  return missions
    .filter((m) => m.wing)
    .slice(0, 20)
    .map((m) => ({
      id: m.id,
      title: m.title.slice(0, 80),
      faction: m.faction.slice(0, 60),
      destSystem: m.destSystem,
      destStation: m.destStation,
      expiry: m.expiry,
      status: m.status,
      killCount: m.killCount,
      kills: m.killCount ? m.kills : undefined,
      delivered: m.delivered,
      total: m.total,
    }));
}

/** Same mission seen by two commanders: same id, or same title, faction, destination and expiry hour. */
export function sameMission(a: WingMission, b: WingMission): boolean {
  if (a.id === b.id) return true;
  return a.title === b.title && a.faction === b.faction && (a.destSystem ?? "") === (b.destSystem ?? "") && (a.expiry ?? "").slice(0, 13) === (b.expiry ?? "").slice(0, 13);
}

export interface WingRow {
  mission: WingMission;
  holders: string[];
  /** Ids of active members who don't have it. */
  missing: string[];
  mine: boolean;
}

const ACTIVE_MS = 2 * 60 * 60 * 1000;

export const isActive = (m: WingMember, now = Date.now()) => !m.left && now - Date.parse(m.at) < ACTIVE_MS;

/** Every wing mission anyone has, with who holds it. */
export function wingRows(me: WingMember, others: WingMember[], now = Date.now()): WingRow[] {
  const members = [me, ...others.filter((o) => isActive(o, now))];
  const rows: WingRow[] = [];
  for (const m of members) {
    for (const mission of m.missions) {
      let row = rows.find((r) => sameMission(r.mission, mission));
      if (!row) {
        row = { mission, holders: [], missing: [], mine: false };
        rows.push(row);
      }
      if (!row.holders.includes(m.id)) row.holders.push(m.id);
      if (m.id === me.id) row.mine = true;
    }
  }
  for (const r of rows) r.missing = members.filter((m) => !r.holders.includes(m.id)).map((m) => m.id);
  return rows.sort((a, b) => (a.mission.expiry ?? "").localeCompare(b.mission.expiry ?? ""));
}

export interface WingEvents {
  /** Someone has a wing mission you don't. */
  newMission: (row: WingRow, by: string) => void;
  /** Every active member now has this mission. */
  everyone: (row: WingRow) => void;
  changed: () => void;
  error: (message: string) => void;
}

/** One running link to a wing. */
export class WingLink {
  members = new Map<string, WingMember>();
  status: "connecting" | "ok" | "error" = "connecting";
  lastError = "";
  private key!: CryptoKey;
  private topic = "";
  private since = "6h";
  private timer?: number;
  private beat?: number;
  private stopped = false;
  private announcedNew = new Set<string>();
  private announcedAll = new Set<string>();
  private lastSent = "";
  /** The first poll only learns what already exists: no notifications for old news. */
  private primed = false;

  constructor(
    private code: string,
    private me: () => WingMember,
    private on: WingEvents,
  ) {}

  async start() {
    this.key = await keyFor(this.code);
    this.topic = await topicFor(this.code);
    await this.publish(true);
    await this.poll();
    this.timer = window.setInterval(() => void this.poll(), 15_000);
    this.beat = window.setInterval(() => void this.publish(true), 20 * 60 * 1000);
  }

  async stop() {
    this.stopped = true;
    window.clearInterval(this.timer);
    window.clearInterval(this.beat);
    try {
      const me = this.me();
      await this.send({ v: 1, from: me.id, name: me.name, at: new Date().toISOString(), missions: [], bye: true });
    } catch {
      /* leaving quietly is fine */
    }
  }

  /** Publishes our wing missions when they changed (or always, for the heartbeat). */
  async publish(force = false) {
    if (this.stopped || !this.key) return;
    const me = this.me();
    const body = JSON.stringify(me.missions);
    if (!force && body === this.lastSent) return;
    this.lastSent = body;
    try {
      await this.send({ v: 1, from: me.id, name: me.name, at: new Date().toISOString(), missions: me.missions });
      this.ok();
    } catch (e) {
      this.fail(e);
    }
  }

  private async send(p: Packet) {
    const text = await seal(this.key, p);
    const reply = await httpFetch("POST", NTFY + this.topic, text, "text/plain");
    if (reply.status === 429) throw new Error("ntfy.sh : trop de messages, réessaie plus tard");
    if (reply.status < 200 || reply.status >= 300) throw new Error(`ntfy.sh a répondu ${reply.status}`);
  }

  private ok() {
    if (this.status !== "ok") {
      this.status = "ok";
      this.lastError = "";
      this.on.changed();
    }
  }

  private fail(e: unknown) {
    this.status = "error";
    this.lastError = String((e as Error)?.message ?? e);
    this.on.error(this.lastError);
    this.on.changed();
  }

  async poll() {
    if (this.stopped || !this.key) return;
    try {
      const reply = await httpFetch("GET", `${NTFY}${this.topic}/json?poll=1&since=${encodeURIComponent(this.since)}`);
      if (reply.status < 200 || reply.status >= 300) throw new Error(`ntfy.sh a répondu ${reply.status}`);
      const myId = this.me().id;
      let changed = false;
      for (const line of reply.body.split("\n")) {
        if (!line.trim()) continue;
        let msg: { id?: string; event?: string; message?: string };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id) this.since = msg.id;
        if (msg.event !== "message" || !msg.message) continue;
        const p = await open(this.key, msg.message);
        if (!p || p.from === myId) continue;
        const prev = this.members.get(p.from);
        if (prev && prev.at > p.at) continue;
        this.members.set(p.from, { id: p.from, name: p.name || "CMDR", at: p.at, missions: p.bye ? [] : p.missions ?? [], left: p.bye });
        changed = true;
      }
      this.ok();
      if (changed || !this.primed) this.check();
      this.primed = true;
      if (changed) this.on.changed();
    } catch (e) {
      this.fail(e);
    }
  }

  /** Fires the notifications for what changed. Called after polls and when our missions change. */
  check() {
    const me = this.me();
    const others = [...this.members.values()];
    const rows = wingRows(me, others);
    const key = (r: WingRow) => `${r.mission.title}|${r.mission.faction}|${(r.mission.expiry ?? "").slice(0, 13)}`;
    const activeCount = 1 + others.filter((o) => isActive(o)).length;
    for (const r of rows) {
      const k = key(r);
      if (!r.mine && !this.announcedNew.has(k)) {
        this.announcedNew.add(k);
        const by = others.find((o) => r.holders.includes(o.id))?.name ?? "";
        if (this.primed) this.on.newMission(r, by);
      }
      if (activeCount >= 2 && r.missing.length === 0 && !this.announcedAll.has(k)) {
        this.announcedAll.add(k);
        if (this.primed) this.on.everyone(r);
      }
    }
  }
}
