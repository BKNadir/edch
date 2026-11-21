// Settings of the data sharing services (Sync page): EDDN, EDSM and Inara, with the API keys, the
// squadron's Discord bot (EDCH-Discord) with the member's key, and EDCN (read only) with the key it
// gave this copy. The keys never leave the PC
// (not sent to phones, never written to the logs).

/**
 * What EDCH shares with EDDN, EDSM and Inara (the switch in the top bar):
 * - "normal": everything each enabled service takes;
 * - "invisible": nothing at all, not even with EDDN (public data is still read).
 */
export type ShareMode = "normal" | "invisible";

/** The share mode EDCH starts in: always invisible or normal, or the last one used. */
export type StartShareMode = ShareMode | "last";

export interface SyncSettings {
  /** What is shared with the three services. */
  shareMode: ShareMode;
  /** The mode at start-up: invisible (the default), normal, or the last one used. */
  startShareMode: StartShareMode;
  eddn: boolean;
  edsm: boolean;
  edsmCommander: string;
  edsmKey: string;
  inara: boolean;
  inaraKey: string;
  /** Send BGS reports to the squadron's Discord bot (off until the member ticks it). */
  discord: boolean;
  /** The key `/bgs link` gave the member ("edch1.…"): it names the bot, server and member. */
  discordKey: string;
  /**
   * A squadron's own bot the member confirmed ("https://host"); empty for the shared bot. EDCH
   * reaches no other bot address.
   */
  discordBot: string;
  /**
   * When BGS reports go to the bot: right after a new action or arrival ("now", a few seconds to
   * group a burst), or every 5 or 15 minutes. What the squadron saw comes back at the same time.
   */
  discordEvery: DiscordEvery;
  /** Ask EDCN, the maintainer's EDDN collector, too (searches take its data when more recent). */
  edcn: boolean;
  /** The key EDCN gave this copy of EDCH when it registered (services/edcn.ts); empty until then. */
  edcnKey: string;
}

/** How often the BGS reports go to the squadron's Discord bot. */
export type DiscordEvery = "now" | "5min" | "15min";

export const DEFAULT_SYNC: SyncSettings = {
  shareMode: "invisible",
  startShareMode: "invisible",
  eddn: true,
  edsm: false,
  edsmCommander: "",
  edsmKey: "",
  inara: false,
  inaraKey: "",
  discord: false,
  discordKey: "",
  discordBot: "",
  discordEvery: "now",
  edcn: true,
  edcnKey: "",
};

/**
 * The Sync settings as saved, with the mode EDCH starts in: the chosen start mode, or the last one
 * used. The former "bgs" mode (it shared everything but the BGS data) becomes invisible.
 */
export function startSyncSettings(saved: Partial<SyncSettings> | undefined): SyncSettings {
  const sync = { ...DEFAULT_SYNC, ...(saved ?? {}) };
  const start: StartShareMode = ["normal", "invisible", "last"].includes(sync.startShareMode)
    ? sync.startShareMode
    : "invisible";
  const last: ShareMode = sync.shareMode === "normal" ? "normal" : "invisible";
  return { ...sync, startShareMode: start, shareMode: start === "last" ? last : start };
}
