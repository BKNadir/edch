/** EDCH-COG-DURABLE-v1.5.2
 * Existing EDCH journal is the ONLY reader; the agent never tails a file twice.
 * The main thread only sanitises inputs and queues asynchronous IndexedDB requests.
 * Worker's actions are independently checked and only dispatched inside EDCH.
 * No Mistral, outbound AI API, shell commands, automatic game inputs or BGS data writes.
 */
import { notify } from "../../ui/notifier.js";
import { log } from "../../platform/logger.js";
import { eventKey, safeEvent, verifyAction, type AgentAction, type AgentEvent } from "./protocol.js";
import { runMultiAgentPipeline } from "./multiAgents.js"; // EDCH-COG-MULTI-v1.6.0
import {
  createAgentQueue,
  AGENT_BATCH_LIMIT,
  type AgentQueue,
  type AgentQueueResult,
  type AgentQueueStats,
  type PendingAgentEvent,
} from "./durableQueue.js";

const ENABLE_KEY = "edch.bgs.agent.journal.v1";
const WORKER_TIMEOUT_MS = 10000;
let worker: Worker | null = null;
let generation = 0;
let queuePromise: Promise<AgentQueue> | null = null;
let pendingBatch: { id: number; gen: number; rows: PendingAgentEvent[] } | null = null;
let batchSeq = 0;
let timeout: number | undefined;
let retryTimer: number | undefined;
let statsTimer: number | undefined;
let pumping = false;
let pumpRequested = false;
let outboxBusy = false;
let last = "En attente";
let processed = 0;
let ignored = 0;
let duplicate = 0;
let overflow = 0;
let retries = 0;
type AgentQueueMode = "initialisation" | "indexeddb" | "volatile";
let queueMode: AgentQueueMode = "initialisation";
let counts: AgentQueueStats = { pending: 0, outbox: 0, seen: 0 };
let lastAction: AgentAction | null = null;

export interface AgentQueueHealth extends AgentQueueStats {
  mode: AgentQueueMode;
  processed: number;
  ignored: number;
  duplicate: number;
  overflow: number;
  retries: number;
  inFlight: number;
  last: string;
}
export function agentQueueHealth(): AgentQueueHealth {
  return {
    ...counts,
    mode: queueMode,
    processed,
    ignored,
    duplicate,
    overflow,
    retries,
    inFlight: pendingBatch?.rows.length ?? 0,
    last,
  };
}
export function agentEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLE_KEY) === "yes";
  } catch {
    return false;
  }
}
export function agentStatus(): string {
  if (!agentEnabled()) return "Agent arrêté · file conservée";
  const mode = queueMode === "indexeddb" ? "file persistante" : queueMode === "volatile" ? "mémoire volatile (dégradée)" : "initialisation";
  return `${worker ? "Agent actif" : "Agent en reprise"} · ${processed} événements · ${ignored} ignorés · ${counts.pending} en attente · ${mode} · ${last}`;
}
function report() {
  window.dispatchEvent(new Event("edch-agent-status"));
  window.dispatchEvent(new CustomEvent("edch-agent-queue", { detail: agentQueueHealth() }));
}
function queueReady(): Promise<AgentQueue> {
  if (!queuePromise) {
    queuePromise = createAgentQueue().then((queue) => {
      queueMode = queue.mode;
      if (queue.mode === "volatile") last = "Stockage persistant indisponible : file non récupérable après arrêt";
      scheduleStats();
      return queue;
    });
  }
  return queuePromise;
}
function stopWorker() {
  generation++;
  if (timeout !== undefined) window.clearTimeout(timeout);
  timeout = undefined;
  pendingBatch = null; // unacknowledged events remain in IndexedDB
  if (worker) {
    worker.terminate();
    worker = null;
  }
}
function scheduleStats() {
  if (statsTimer !== undefined) return;
  statsTimer = window.setTimeout(() => {
    statsTimer = undefined;
    void queueReady()
      .then((q) => q.stats())
      .then((stats) => {
        counts = stats;
        report();
      })
      .catch((error: unknown) => log.warn("bgs-agent", `Queue stats: ${String(error)}`));
  }, 180);
}
function failure(reason: string) {
  if (!agentEnabled()) return;
  log.warn("bgs-agent", reason);
  last = reason.slice(0, 180);
  stopWorker();
  retries++;
  if (retryTimer !== undefined) window.clearTimeout(retryTimer);
  const delay = Math.min(15000, 500 * 2 ** Math.min(retries - 1, 5));
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined;
    start();
  }, delay);
  scheduleStats();
  report();
}

/** Deliver a durable outbox after the processing acknowledgement has committed. */
async function deliverOutbox(q: AgentQueue): Promise<void> {
  if (outboxBusy) return;
  outboxBusy = true;
  try {
    for (let i = 0; i < 8 && agentEnabled(); i++) {
      const rows = await q.takeOutbox(AGENT_BATCH_LIMIT);
      if (!rows.length) break;
      for (const row of rows) {
        if (!verifyAction(row.action)) {
          // A corrupt outbox is never used as an instruction; surface the failure.
          throw new Error("Action invalide dans la boîte de sortie : restauration manuelle nécessaire");
        }
        lastAction = row.action;
        last = row.action.text.slice(0, 100);
        window.dispatchEvent(new CustomEvent("edch-agent-action", { detail: row.action }));
        if (row.action.important) notify(row.action.text, { sound: false });
      }
      await q.delivered(rows.map((row) => row.id));
    }
  } finally {
    outboxBusy = false;
  }
}

function kickPump() {
  if (pumping) {
    pumpRequested = true;
    return;
  }
  if (!agentEnabled() || !worker || pendingBatch) return;
  pumping = true;
  void (async () => {
    const q = await queueReady();
    await deliverOutbox(q);
    if (!agentEnabled() || !worker || pendingBatch) return;
    const rows = await q.take(AGENT_BATCH_LIMIT);
    if (!rows.length) {
      scheduleStats();
      return;
    }
    const active = worker;
    const gen = generation;
    const id = ++batchSeq;
    pendingBatch = { id, gen, rows };
    timeout = window.setTimeout(() => {
      if (pendingBatch?.id === id && pendingBatch.gen === gen) failure("Délai du Worker dépassé : reprise de la file");
    }, WORKER_TIMEOUT_MS);
    active.postMessage({ type: "batch", batchId: id, items: rows.map(({ key, event }) => ({ key, event })) });
  })()
    .catch((err: unknown) => failure(`Traitement de file : ${String(err)}`))
    .finally(() => {
      pumping = false;
      if (pumpRequested) {
        pumpRequested = false;
        kickPump();
      }
    });
}

async function receiveBatch(data: Record<string, unknown>, gen: number) {
  const batch = pendingBatch;
  if (!batch || gen !== batch.gen || batch.id !== data.batchId) return;
  if (!Array.isArray(data.results) || data.results.length !== batch.rows.length) {
    failure("Réponse Worker de taille incorrecte");
    return;
  }
  const results: AgentQueueResult[] = [];
  for (let i = 0; i < batch.rows.length; i++) {
    const row = batch.rows[i];
    const value = data.results[i] as Record<string, unknown> | null;
    if (!value || value.key !== row.key) {
      failure("Ordre des accusés Worker incorrect");
      return;
    }
    const action = value.action;
    const reference = runMultiAgentPipeline(row.event, row.key).action;
    // The main thread independently reconstructs the only permitted action.
    // A structurally valid but fabricated visit or mission is never acknowledged.
    if (
      (action !== null && (!verifyAction(action) || action.event !== row.event.event || action.at !== row.event.timestamp)) ||
      JSON.stringify(action) !== JSON.stringify(reference)
    ) {
      failure("Action Worker rejetée par le vérificateur");
      return;
    }
    results.push({ key: row.key, action: action as AgentAction | null });
  }
  if (timeout !== undefined) window.clearTimeout(timeout);
  timeout = undefined;
  // Commit the queue and action-outbox in ONE IndexedDB transaction, before UI dispatch.
  try {
    const q = await queueReady();
    await q.acknowledge(batch.rows, results);
    if (!agentEnabled() || gen !== generation) return;
    pendingBatch = null;
    processed += batch.rows.length;
    ignored += results.filter((r) => r.action === null).length;
    retries = 0;
    // EDCH-COG-MULTI-v1.6.0: audit counters are informational, never executable instructions.
    const audit = data.audit as Record<string, unknown> | undefined;
    if (audit && ["observed", "proposed", "verified", "rejected"].every((k) =>
      Number.isSafeInteger(audit[k]) && (audit[k] as number) >= 0)) {
      const observed = audit.observed as number;
      const proposed = audit.proposed as number;
      const verified = audit.verified as number;
      const rejected = audit.rejected as number;
      const accepted = results.filter((r) => r.action !== null).length;
      if (observed === batch.rows.length && verified === accepted &&
          proposed <= observed && verified <= proposed && rejected === proposed - verified) {
        window.dispatchEvent(new CustomEvent("edch-cog-audit", {
          detail: { observed, proposed, verified, rejected },
        }));
      }
    }
    await deliverOutbox(q);
    scheduleStats();
    report();
    kickPump();
  } catch (error) {
    failure(`Accusé non enregistré : ${String(error)}`);
  }
}

function start() {
  if (worker || !agentEnabled() || retryTimer !== undefined) return;
  if (typeof Worker === "undefined") {
    last = "Web Worker indisponible";
    report();
    return;
  }
  try {
    const w = new Worker(new URL("./agentWorker.js", import.meta.url), { type: "module", name: "edch-bgs-agent" });
    worker = w;
    const gen = ++generation;
    w.onmessage = (msg: MessageEvent<unknown>) => {
      if (gen !== generation) return;
      const data = msg.data as Record<string, unknown> | null;
      if (data?.type === "pong") {
        last = "Worker répond au diagnostic";
        window.dispatchEvent(new Event("edch-agent-pong"));
        report();
        return;
      }
      if (data?.type === "capabilities" && data.version === "1.6.0" &&
          Array.isArray(data.agents) && data.agents.join(",") === "observateur,analyste,verificateur") {
        window.dispatchEvent(new CustomEvent("edch-cog-capabilities", {
          detail: { version: "1.6.0", agents: data.agents.slice() },
        }));
        return;
      }
      if (data?.type === "batch-result") void receiveBatch(data, gen);
    };
    w.onerror = (err) => {
      failure(`Worker indisponible : ${err.message || "erreur inconnue"}`);
    };
    w.onmessageerror = () => failure("Worker : message non lisible");
    last = "Lecture du journal et reprise des événements en attente";
    void queueReady().then(() => {
      scheduleStats();
      kickPump();
    });
    report();
  } catch (error) {
    failure(`Démarrage du Worker : ${String(error)}`);
  }
}
export function setAgentEnabled(on: boolean): boolean {
  try {
    localStorage.setItem(ENABLE_KEY, on ? "yes" : "no");
  } catch {
    last = "Stockage des paramètres indisponible";
    report();
    return false;
  }
  if (!on) {
    if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    retryTimer = undefined;
    stopWorker();
    last = "Arrêt demandé : événements non traités conservés";
  } else {
    start();
  }
  scheduleStats();
  report();
  return true;
}

/** Called only for LIVE journal events by EDCH's original reader. Never blocks it. */
export function enqueueAgentEvents(events: readonly unknown[]): void {
  if (!agentEnabled()) return;
  start();
  const safe = events.map(safeEvent).filter((ev): ev is AgentEvent => ev !== null);
  window.dispatchEvent(
    new CustomEvent("edch-agent-feed", { detail: { received: events.length, eligible: safe.length } }),
  );
  if (!safe.length) return;
  // Serialized by IndexedDB transactions. No raw journal lines or secrets are stored.
  void queueReady()
    .then((q) => q.enqueue(safe))
    .then((result) => {
      duplicate += result.duplicate;
      overflow += result.overflow;
      if (result.overflow) last = `${result.overflow} événement(s) refusés : file pleine (4096)`;
      scheduleStats();
      kickPump();
      report();
    })
    .catch((error: unknown) => failure(`Persistance de file : ${String(error)}`));
}

export function lastAgentAction(): AgentAction | null {
  return lastAction;
}
/** Diagnostic only; does not simulate a journal event. */
export function requestAgentPing(): boolean {
  if (!agentEnabled()) return false;
  start();
  if (!worker) return false;
  worker.postMessage({ type: "ping" });
  return true;
}
/** Explicit v1.6.0 diagnostic; unlike a game event it never enters the queue. */
export function requestMultiAgentDiagnostic(): boolean {
  if (!agentEnabled()) return false;
  start();
  if (!worker) return false;
  worker.postMessage({ type: "diagnostic" });
  return true;
}
/** Optional manual retry after a transient storage or Worker problem. */
export function retryAgentQueue(): void {
  if (!agentEnabled()) return;
  if (retryTimer !== undefined) window.clearTimeout(retryTimer);
  retryTimer = undefined;
  stopWorker();
  start();
  scheduleStats();
}
/** Explicit and destructive only for unprocessed queue entries; never edits game data. */
export async function clearAgentPendingQueue(): Promise<number> {
  if (retryTimer !== undefined) window.clearTimeout(retryTimer);
  retryTimer = undefined;
  stopWorker();
  const count = await (await queueReady()).clearPending();
  last = `File vidée à la demande : ${count} événement(s) non traité(s)`;
  if (agentEnabled()) start();
  scheduleStats();
  report();
  return count;
}
/** Exposed for tests of deterministic sanitisation, without accessing raw journal. */
export function agentEventDedupKey(event: AgentEvent): string {
  return eventKey(event);
}

// Resume durable pending work on EDCH startup even if no NEW journal line arrives.
if (typeof window !== "undefined" && agentEnabled()) {
  void Promise.resolve().then(() => start());
}
