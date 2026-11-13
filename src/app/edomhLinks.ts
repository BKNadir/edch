// EDOMH links clicked in EDSY or Coriolis ("Export to EDOMH"), when the user made EDCH open them
// (Settings → Wishlist): the wishlist page opens, a dialog shows the build's engineering and
// asks before adding it. Nothing is added without that confirmation.

import { recordGap } from "../features/dataGaps/missingData.js";
import { importLoadout } from "../features/materials/buildImporter.js";
import { decodeEdomhLink } from "../features/materials/edomhLink.js";
import { shipName } from "../game/journal/ship.js";
import { onEdomhLink, takeLaunchLink } from "../platform/bridge.js";
import { t } from "../platform/i18n.js";
import { log } from "../platform/logger.js";
import type { Ctx } from "../state/context.js";
import { dialog } from "../ui/dialog.js";
import { h, toast } from "../ui/dom.js";
import { lineLabel } from "../views/wishlist/widgets.js";

/** Links come one at a time: a second click while a dialog is open waits its turn. */
let queue: Promise<void> = Promise.resolve();

async function handle(ctx: Ctx, link: string) {
  ctx.store.setView("wishlist");
  const loadout = await decodeEdomhLink(link);
  if (!loadout) {
    log.warn("edomh", "EDOMH link not readable");
    toast(t("edomh.unreadable"));
    return;
  }
  const result = importLoadout(ctx.game, loadout);
  for (const unknown of result.unknownEngineering)
    recordGap({ kind: "notInData", ...unknown, gameVersion: ctx.store.state.cmdr.gameVersion });
  if (!result.items.length) {
    toast(t("edomh.nothingToAdd"));
    return;
  }
  const ship = loadout.Ship ? shipName(loadout.Ship) : "";
  const answer = await dialog(
    t("edomh.importTitle"),
    [
      h("p", null, t("edomh.importQuestion", { count: result.items.length }), ship ? ` (${ship})` : ""),
      h(
        "ul.edomh-lines",
        null,
        result.items.map((item) => h("li", null, lineLabel(ctx, item), item.count > 1 ? ` ×${item.count}` : "")),
      ),
      result.skipped.length
        ? h("p.sub", null, t("wishlist.notRecognised", { value: result.skipped.join(", ") }))
        : null,
    ],
    [
      { label: t("common.cancel"), value: "cancel" },
      { label: t("edomh.addToWishlist"), value: "add", primary: true },
    ],
  );
  if (answer !== "add") return;
  ctx.store.setWishlist([...ctx.store.state.wishlist, ...result.items]);
  toast(t("wishlist.buildImported", { count: result.items.length }));
  log.info("edomh", `EDOMH build added: ${result.items.length} lines`);
}

/** Handles the link EDCH was started with, then those clicked while it runs. */
export async function startEdomhLinks(ctx: Ctx) {
  const take = (link: string) => {
    queue = queue.then(() => handle(ctx, link)).catch((e) => log.warn("edomh", `EDOMH link: ${e}`));
  };
  await onEdomhLink(take);
  const first = await takeLaunchLink();
  if (first) take(first);
}
