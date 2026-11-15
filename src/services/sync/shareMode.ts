// Share modes of the uploaders (EDDN, EDSM, Inara): what a journal event becomes before it is
// shared. "normal" shares what the enabled services take; "invisible" shares nothing at all (not
// even with EDDN), while EDCH still reads every public source. The event EDCH reads is untouched.

import type { ShareMode } from "../../state/syncSettings.js";
import type { Json } from "./common.js";

/** The event as it may be shared in `mode`: itself ("normal"), or null ("invisible"). */
export function shareableEvent(event: Json, mode: ShareMode): Json | null {
  return mode === "normal" ? event : null;
}
