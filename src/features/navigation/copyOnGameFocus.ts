// Going back to the game copies the next system to enter (the next system of the route in
// progress, the engineer of the tour, or the BGS refresh tour's next system), so it's ready to
// paste in the galaxy map. Not when the player copied something while away from the game (a
// system found on the Search page): that is what they mean to paste. Windows only: the backend
// tells whether Elite Dangerous is the window in front.

import { copyText, gameFocused, isRemote, isTauri, lastCopyTime } from "../../platform/bridge.js";
import { log } from "../../platform/logger.js";
import type { Ctx } from "../../state/context.js";
import { toast } from "../../ui/dom.js";
import { notify } from "../../ui/notifier.js";
import { nextSystemToEnter } from "../engineers/tour.js";
import { bgsTourTarget } from "../bgs/tourCopy.js";

/** How often the window in front is checked, while there is something to copy. */
const CHECK_EVERY_MS = 1500;

/**
 * Whether going back to the game copies the next system: not when the clipboard was written after
 * the game went to the background (`leftAt`), by the player's own copy.
 */
export function copyOnReturn(leftAt: number, lastCopyAt: number): boolean {
  return lastCopyAt <= leftAt;
}

export function startCopyOnGameFocus(ctx: Ctx) {
  if (!isTauri() || isRemote()) return;
  let gameWasInFront = true;
  /** When the game last went to the background. */
  let leftAt = 0;
  let checking = false;
  const check = async () => {
    const settings = ctx.store.state.settings;
    const target = settings.copyOnGameFocus ? (nextSystemToEnter() ?? bgsTourTarget()) : null;
    if (!target || checking) return;
    checking = true;
    try {
      const front = await gameFocused();
      if (front === "unknown") return;
      const inFront = front === "yes";
      if (!inFront && gameWasInFront) leftAt = Date.now();
      if (inFront && !gameWasInFront) {
        if (!copyOnReturn(leftAt, lastCopyTime())) log.debug("nav", "Back in the game: the player's copy is kept");
        else if (await copyText(target.system)) {
          toast(target.label);
          if (settings.navNotifyCopy) notify(target.label, { sound: false });
        }
      }
      gameWasInFront = inFront;
    } finally {
      checking = false;
    }
  };
  window.setInterval(() => void check(), CHECK_EVERY_MS);
}
