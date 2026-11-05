// The fleet carrier route (Spansh Fleet Carrier plotter): the estimate (jumps, tritium), then the
// plotted route.

import { carrierEstimate } from "../../features/navigation/jumpRange.js";
import { spanshJob } from "../../platform/bridge.js";
import { t } from "../../platform/i18n.js";
import { fmtLy } from "../../services/spansh.js";
import { fmt, h, icon, replace } from "../../ui/dom.js";
import { coordsOf, type Json } from "./index.js";
import { hours, stat } from "./widgets.js";
import { copySystem } from "../shared/resultsTable.js";

export async function estimateCarrier(
  out: HTMLElement,
  from: string,
  to: string,
  used: number,
  tank: number,
  hold: number,
) {
  if (!from || !to) return replace(out, h("p.error", null, t("navigation.enterStartDestination")));
  replace(out, h("p.sub", null, h("span.spinner"), " " + t("navigation.lookingUpCoordinates")));
  try {
    const [a, b] = await Promise.all([coordsOf(from), coordsOf(to)]);
    if (!a || !b) throw new Error(t("navigation.systemNotFoundSpansh"));
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const est = carrierEstimate(d, used);
    const missing = Math.max(0, est.fuel - tank - hold);
    replace(
      out,
      h(
        "div.estimate",
        null,
        stat(t("common.distance"), fmtLy(d)),
        stat(t("navigation.jumps"), fmt(est.jumps)),
        stat(t("common.tritium"), `≈ ${fmt(est.fuel)} t`),
        stat(t("navigation.duration"), `≈ ${hours(est.minutes)}`),
      ),
      missing
        ? h("p.notice", null, icon("warn"), " " + t("navigation.reAboutTTritiumShortTank", { missing: fmt(missing) }))
        : h("p.sub", null, t("navigation.tritiumTankHoldEnoughEstimate")),
      h("p.sub", null, t("navigation.communityEstimate5Distance25Used")),
    );
  } catch (e) {
    replace(out, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
  }
}

export async function plotCarrierNow(
  out: HTMLElement,
  from: string,
  to: string,
  used: number,
  tank: number,
  hold: number,
) {
  replace(out, h("p.sub", null, h("span.spinner"), " " + t("navigation.spanshPlottingCarrierRoute")));
  try {
    const res: Json = await spanshJob("fleetcarrier/route", [
      ["source", from],
      ["destinations", to],
      ["capacity_used", String(used)],
      ["fuel_loaded", String(tank)],
      ["tritium_stored", String(hold)],
      ["capacity", "25000"],
    ]);
    const jumps: Json[] = res.jumps ?? [];
    const legs = jumps.filter((j, i) => i > 0 || Number(j.distance ?? 0) > 0);
    const fuel = jumps.reduce((s, j) => s + Number(j.fuel_used ?? 0), 0);
    const restock = jumps.filter((j) => j.must_restock);
    replace(
      out,
      h(
        "div.estimate",
        null,
        stat(t("navigation.jumps"), fmt(Math.max(0, jumps.length - 1))),
        stat(t("common.tritium"), `${fmt(fuel)} t`),
        stat(t("navigation.duration"), `≈ ${hours(Math.max(0, jumps.length - 1) * 20)}`),
      ),
      restock.length
        ? h("p.notice", null, icon("warn"), " " + t("navigation.refuelStops", { count: restock.length }))
        : null,
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
            h("th.num", null, t("navigation.jump")),
            h("th.num", null, t("common.left")),
            h("th.num", null, t("common.tritium")),
            h("th.num", null, t("navigation.tank")),
          ),
        ),
        h(
          "tbody",
          null,
          legs.map((j) =>
            h(
              "tr",
              { class: j.must_restock ? "short" : "" },
              h(
                "td",
                null,
                h("button.sys", { onclick: () => copySystem(j.name) }, icon("copy"), h("span", null, j.name)),
                j.has_icy_ring
                  ? h(
                      "span.badge.muted",
                      null,
                      j.is_system_pristine ? t("navigation.pristineIcyRing") : t("navigation.icyRing"),
                    )
                  : null,
                j.must_restock
                  ? h(
                      "span.badge.warn",
                      null,
                      t("navigation.restockT", { restockAmount: fmt(Number(j.restock_amount ?? 0)) }),
                    )
                  : null,
              ),
              h("td.num", null, fmtLy(Number(j.distance ?? 0))),
              h("td.num", null, fmtLy(Number(j.distance_to_destination ?? 0))),
              h("td.num", null, fmt(Number(j.fuel_used ?? 0))),
              h("td.num", null, fmt(Number(j.fuel_in_tank ?? 0))),
            ),
          ),
        ),
      ),
    );
  } catch (e) {
    replace(out, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
  }
}
