/** EDCH-COG-MEMORY-v1.5.3 — local SQLite bridge, no API/AI calls. */
import { verifyAction, type AgentAction } from "./protocol.js";

export interface MemoryScope {
  commander: string;
  faction: string;
}
export interface MemoryRow {
  id: number;
  category: "note" | "event" | "decision";
  text: string;
  eventKey: string | null;
  createdAt: string;
}
export function validMemoryScope(value: unknown): value is MemoryScope {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return [s.commander, s.faction].every(
    (name) => typeof name === "string" && name.trim().length > 0 && name.trim().length <= 160 && !/[\x00-\x1f\x7f]/.test(name),
  );
}
export function checkedMemoryAction(action: unknown): { text: string; eventKey: string } | null {
  if (!verifyAction(action)) return null;
  const a = action as AgentAction;
  const text = a.text.trim().slice(0, 1800);
  if (!text) return null;
  // Deterministic, scope-specific key used for deduplication only. Not raw journal content.
  return { text, eventKey: `${a.event}|${a.at}|${a.type}`.slice(0, 180) };
}
function invoke<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const tauri = window.__TAURI__?.core;
  if (!tauri) return Promise.reject(new Error("Mémoire SQLite disponible uniquement dans EDCH PC"));
  return tauri.invoke<T>(name, args);
}
export function memoryAdd(scope: MemoryScope, category: "note" | "event" | "decision", text: string, eventKey?: string): Promise<void> {
  if (!validMemoryScope(scope)) return Promise.reject(new Error("Sélectionne d'abord un CMDR et une faction"));
  if (!text.trim() || text.length > 2000) return Promise.reject(new Error("Texte absent ou trop long"));
  return invoke("agent_memory_add", { ...scope, category, text, eventKey: eventKey ?? null });
}
export function memoryList(scope: MemoryScope): Promise<MemoryRow[]> {
  if (!validMemoryScope(scope)) return Promise.resolve([]);
  return invoke<MemoryRow[]>("agent_memory_list", { ...scope, limit: 50 });
}
export function memoryDelete(scope: MemoryScope, id: number): Promise<boolean> {
  if (!validMemoryScope(scope) || !Number.isSafeInteger(id) || id <= 0) return Promise.reject(new Error("Suppression refusée"));
  return invoke<boolean>("agent_memory_delete", { ...scope, id });
}
