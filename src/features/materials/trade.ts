// Material traders: exchange rates between grades (and between material lines), and trade
// suggestions to get a missing material from the surplus of others.

import type { Game } from "../../game/data.js";
import type { Material } from "../../game/types.js";

export interface Rate {
  paid: number;
  received: number;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/**
 * Material trader exchange rate (game rule): one grade up costs 6, one grade down gives 3,
 * changing trader line (same category) costs an extra 6.
 */
export function tradeRate(fromGrade: number, toGrade: number, sameLine: boolean): Rate | null {
  if (fromGrade < 1 || fromGrade > 5 || toGrade < 1 || toGrade > 5) return null;
  if (sameLine && fromGrade === toGrade) return null;
  const delta = toGrade - fromGrade;
  let paid = 1;
  let received = 1;
  if (delta < 0) received = 3 ** -delta;
  else paid = 6 ** delta;
  if (!sameLine) paid *= 6;
  const d = gcd(paid, received);
  return { paid: paid / d, received: received / d };
}

export interface TradeSuggestion {
  from: Material;
  rate: Rate;
  owned: number;
  reserved: number;
  /** How many of the target this trade can give using only the unreserved stock. */
  canReceive: number;
  /** Units of `from` to pay for `canReceive` (or for `wanted` when given). */
  pay: number;
  receive: number;
  usage: number; // owned / capacity
}

/**
 * Trades that produce `target` from what the commander owns, best first.
 * `wanted` (optional) limits the suggestion to that many units of the target.
 */
export function suggestTrades(
  game: Game,
  target: Material,
  owned: Record<string, number>,
  reserved: Record<string, number>,
  wanted?: number,
): TradeSuggestion[] {
  if (target.ledger !== "ship" || !target.line || !target.grade) return [];
  const out: TradeSuggestion[] = [];
  for (const from of game.data.materials) {
    if (from.id === target.id || from.ledger !== "ship" || from.category !== target.category) continue;
    if (!from.line || !from.grade) continue;
    const rate = tradeRate(from.grade, target.grade, from.line === target.line);
    if (!rate) continue;
    const have = owned[from.id] ?? 0;
    const keep = reserved[from.id] ?? 0;
    const spare = Math.max(0, have - keep);
    const batches = Math.floor(spare / rate.paid);
    if (batches <= 0) continue;
    // What to show: enough to cover the need, else a typical trader batch (~10 units),
    // never more than the target's free storage.
    const room = Math.max(0, (game.capacityOf(target.id) ?? Infinity) - (owned[target.id] ?? 0));
    const goal = Math.min(wanted !== undefined && wanted > 0 ? wanted : 10, room || 1);
    const useBatches = Math.max(1, Math.min(batches, Math.ceil(goal / rate.received)));
    const cap = game.capacityOf(from.id) ?? 1;
    out.push({
      from,
      rate,
      owned: have,
      reserved: keep,
      canReceive: batches * rate.received,
      pay: useBatches * rate.paid,
      receive: useBatches * rate.received,
      usage: have / cap,
    });
  }
  // Cheapest first (fewest units paid per unit received), then the fullest stock.
  out.sort((a, b) => a.rate.paid / a.rate.received - b.rate.paid / b.rate.received || b.usage - a.usage);
  return out;
}
