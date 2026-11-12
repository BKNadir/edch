// Settings of the data sharing services (Sync page): EDDN, EDSM and Inara, with the API keys.
// The keys never leave the PC (not sent to phones, never written to the logs).

/**
 * What EDCH shares with EDDN, EDSM and Inara (the switch in the top bar):
 * - "normal": everything each enabled service takes;
 * - "bgs": no BGS data (factions, influence, states, conflicts, and the actions that move
 *   influence: missions, vouchers, trade, cartography…), so your BGS work isn't published;
 * - "invisible": nothing at all.
 */
export type ShareMode = "normal" | "bgs" | "invisible";

export interface SyncSettings {
  /** What is shared with the three services (kept after a restart). */
  shareMode: ShareMode;
  eddn: boolean;
  edsm: boolean;
  edsmCommander: string;
  edsmKey: string;
  inara: boolean;
  inaraKey: string;
}

export const DEFAULT_SYNC: SyncSettings = {
  shareMode: "normal",
  eddn: true,
  edsm: false,
  edsmCommander: "",
  edsmKey: "",
  inara: false,
  inaraKey: "",
};
