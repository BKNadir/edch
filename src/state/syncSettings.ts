// Settings of the data sharing services (Sync page): EDDN, EDSM and Inara, with the API keys.
// The keys never leave the PC (not sent to phones, never written to the logs).

export interface SyncSettings {
  eddn: boolean;
  edsm: boolean;
  edsmCommander: string;
  edsmKey: string;
  inara: boolean;
  inaraKey: string;
}

export const DEFAULT_SYNC: SyncSettings = { eddn: true, edsm: false, edsmCommander: "", edsmKey: "", inara: false, inaraKey: "" };
