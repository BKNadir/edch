// What the three uploaders share: the settings, the game session they track, the journal folder,
// and the sync log (counters and last exchanges shown on the Sync page).

import type { SyncSettings } from "../../state/syncSettings.js";
import type { GameSession } from "../eddn.js";

export type Json = Record<string, any>;

export interface SyncLogEntry {
  at: number;
  service: "EDDN" | "EDSM" | "Inara";
  what: string;
  ok: boolean;
  detail?: string;
}

export interface SyncStats {
  sent: Record<string, number>;
  failed: Record<string, number>;
  log: SyncLogEntry[];
}

/** Given by the coordinator (index.ts) to each uploader. */
export interface UploadContext {
  settings: () => SyncSettings;
  journalDir: () => string;
  materials: () => Record<string, number>;
  fid: () => string | undefined;
  /** The game session (commander, game version…), tracked from the journal. */
  session: GameSession;
  /** Records the outcome of one exchange with a service. */
  log: (service: SyncLogEntry["service"], what: string, ok: boolean, detail?: string) => void;
}
