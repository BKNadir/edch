// The quick ship route (Spansh Neutron Plotter): the straight-line estimate, then the plotted
// route with neutron stars.

import { setNavRoute } from "../../features/engineers/tour.js";
import { spanshJob } from "../../platform/bridge.js";
import { t } from "../../platform/i18n.js";
import { fmtLy } from "../../services/spansh.js";
import type { Ctx } from "../../state/context.js";
import { fmt, h, icon, replace } from "../../ui/dom.js";
import { coordsOf, type Json } from "./index.js";
import { hours, stat } from "./widgets.js";
import { copySystem } from "../shared/resultsTable.js";

export async function estimateShip(out: HTMLElement, from: string, to: string, range: number) {
  if (!from || !to || !range) return replace(out, h("p.error", null, t("navigation.enterStartDestinationRange")));
  replace(out, h("p.sub", null, h("span.spinner"), " " + t("navigation.lookingUpCoordinates")));
  try {
    const [a, b] = await Promise.all([coordsOf(from), coordsOf(to)]);
    if (!a || !b) throw new Error(t("navigation.systemNotFoundSpansh"));
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const jumps = Math.ceil(d / range);
    replace(
      out,
      h(
        "div.estimate",
        null,
        stat(t("common.distance"), fmtLy(d)),
        stat(t("navigation.jumpsStraightLine"), `≥ ${fmt(jumps)}`),
        stat(t("navigation.duration"), `≈ ${hours((jumps * 50) / 60)}`),
      ),
      h("p.sub", null, t("navigation.theoreticalMinimumWithoutNeutronBoostsReal")),
    );
  } catch (e) {
    replace(out, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
  }
}

export async function plotShipNow(
  ctx: Ctx,
  out: HTMLElement,
  from: string,
  to: string,
  range: number,
  efficiency: number,
  supercharge: 4 | 6,
) {
  replace(out, h("p.sub", null, h("span.spinner"), " " + t("common.spanshPlottingRoute")));
  try {
    const res: Json = await spanshJob("route", [
      ["from", from],
      ["to", to],
      ["range", String(range)],
      ["efficiency", String(efficiency)],
      ["supercharge_multiplier", String(supercharge)],
    ]);
    const jumps: Json[] = res.system_jumps ?? [];
    const total = jumps.reduce((s, j) => s + Number(j.jumps ?? 0), 0);
    // Kept for the auto-copy of the next system on arrival (Settings → Navigation).
    setNavRoute(jumps.map((j) => String(j.system)));
    const auto = ctx.store.state.settings.navAutoCopy;
    replace(
      out,
      h(
        "div.estimate",
        null,
        stat(t("common.distance"), fmtLy(Number(res.distance ?? 0))),
        stat(t("navigation.jumps"), fmt(total || Number(res.total_jumps ?? 0))),
        stat(t("navigation.waypoints"), fmt(jumps.length)),
        stat(t("navigation.duration"), `≈ ${hours(((total || jumps.length) * 50) / 60)}`),
      ),
      h(
        "p.sub",
        null,
        auto ? t("navigation.autoCopyNextSystemArrival") : t("navigation.autoCopyNextSystemOffSettings"),
      ),
      h(
        "table.table.route",
        null,
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, t("common.system")),
            h("th.num", null, t("common.distance")),
            h("th.num", null, t("common.left")),
            h("th.num", null, t("navigation.jumps")),
          ),
        ),
        h(
          "tbody",
          null,
          jumps.map((j) =>
            h(
              "tr",
              null,
              h(
                "td",
                null,
                h("button.sys", { onclick: () => copySystem(j.system) }, icon("copy"), h("span", null, j.system)),
                j.neutron_star ? h("span.badge.hit", null, "Neutron") : null,
              ),
              h("td.num", null, fmtLy(Number(j.distance_jumped ?? 0))),
              h("td.num", null, fmtLy(Number(j.distance_left ?? 0))),
              h("td.num", null, String(j.jumps ?? "")),
            ),
          ),
        ),
      ),
    );
  } catch (e) {
    replace(out, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
  }
}
