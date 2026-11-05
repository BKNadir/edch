// The exact ship route (Spansh Galaxy Plotter) as a table: each jump with the fuel left, the
// scoopable stars, neutron stars and where to refuel.

import type { GalaxyRoute } from "../../features/navigation/galaxyRoute.js";
import { t } from "../../platform/i18n.js";
import { fmtLy } from "../../services/spansh.js";
import type { Ctx } from "../../state/context.js";
import { fmt, h, icon, replace } from "../../ui/dom.js";
import { hours, stat } from "./widgets.js";
import { copySystem } from "../shared/resultsTable.js";

export function renderExact(ctx: Ctx, out: HTMLElement, r: GalaxyRoute, tank: number, hasScoop: boolean) {
  const auto = ctx.store.state.settings.navAutoCopy;
  const jumps = r.jumps;
  replace(
    out,
    h(
      "div.estimate",
      null,
      stat(t("common.distance"), fmtLy(r.distance)),
      stat(t("navigation.jumps"), fmt(Math.max(0, jumps.length - 1))),
      stat(t("navigation.refuels"), fmt(r.refuels)),
      stat(t("navigation.neutronStars"), fmt(r.neutrons)),
      stat(t("navigation.duration"), `≈ ${hours((Math.max(1, jumps.length - 1) * 50 + r.refuels * 40) / 60)}`),
    ),
    !hasScoop && r.refuels
      ? h("p.notice.danger", null, icon("warn"), " " + t("navigation.shipHasNoFuelScoopPlanned"))
      : null,
    h("p.sub", null, auto ? t("navigation.autoCopyNextSystemArrival") : t("navigation.autoCopyNextSystemOffSettings")),
    h(
      "table.table.route.exact",
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
          h("th", null, t("navigation.fuel")),
        ),
      ),
      h(
        "tbody",
        null,
        jumps.map((j) =>
          h(
            "tr",
            { class: j.mustRefuel ? "refuel" : "" },
            h(
              "td",
              null,
              h("button.sys", { onclick: () => copySystem(j.system) }, icon("copy"), h("span", null, j.system)),
              j.neutron ? h("span.badge.hit", null, "Neutron") : null,
              j.mustRefuel
                ? h("span.badge.warn", { title: t("navigation.scoopHereFuelIsnTEnough") }, t("navigation.refuel"))
                : j.scoopable
                  ? h("span.badge.muted", { title: t("navigation.scoopableStarKgbfoam") }, t("navigation.scoopable"))
                  : null,
            ),
            h("td.num", null, j.distance ? fmtLy(j.distance) : ""),
            h("td.num", null, fmtLy(j.toGo)),
            h(
              "td.fuel",
              null,
              h(
                "div.bar.small",
                null,
                h("span", {
                  style: { width: `${Math.max(0, Math.min(100, (j.fuelInTank / Math.max(1, tank)) * 100))}%` },
                }),
              ),
              h("small", null, `${fmt(Math.round(j.fuelInTank * 10) / 10)} t`),
            ),
          ),
        ),
      ),
    ),
  );
}
