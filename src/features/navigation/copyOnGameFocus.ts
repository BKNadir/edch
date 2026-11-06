// Going back to the game copies the next system to enter (the next system of the route in
// progress, or the engineer of the tour), so it's ready to paste in the galaxy map. Windows only:
// the backend tells whether Elite Dangerous is the window in front.

import { copyText, gameFocused, isRemote, isTauri } from "../../platform/bridge.js";
import type { Ctx } from "../../state/context.js";
import { toast } from "../../ui/dom.js";
import { notify } from "../../ui/notifier.js";
import { nextSystemToEnter } from "../engineers/tour.js";

/** How often the window in front is checked, while there is something to copy. */
const CHECK_EVERY_MS = 1500;

export function startCopyOnGameFocus(ctx: Ctx) {
  if (!isTauri() || isRemote()) return;
  let gameWasInFront = true;
  let checking = false;
  const check = async () => {
    const settings = ctx.store.state.settings;
    const target = settings.copyOnGameFocus ? nextSystemToEnter() : null;
    if (!target || checking) return;
    checking = true;
    try {
      const front = await gameFocused();
      if (front === "unknown") return;
      const inFront = front === "yes";
      if (inFront && !gameWasInFront && (await copyText(target.system))) {
        toast(target.label);
        if (settings.navNotifyCopy) notify(target.label, { sound: false });
      }
      gameWasInFront = inFront;
    } finally {
      checking = false;
    }
  };
  window.setInterval(() => void check(), CHECK_EVERY_MS);
}
