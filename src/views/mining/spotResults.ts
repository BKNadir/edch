// Mining search results: rings with a hotspot of the chosen minerals (nearest first), then where to
// sell them at the best price.

import {
  ringMethods,
  MAX_RADIUS,
  METHOD_LABEL,
  METHOD_SHORT_LABEL,
  miningMethods,
  type MiningMethod,
  RESERVE,
  RING_TYPE,
  spanshBodyUrl,
} from "../../features/mining/miningSpots.js";
import { openUrl } from "../../platform/bridge.js";
import { gameName, t } from "../../platform/i18n.js";
import { fmt, h, icon } from "../../ui/dom.js";
import { relTime } from "../../ui/format.js";
import type { SpotResults } from "./index.js";
import { sys } from "../missions/index.js";

/** The mining types shown: a click on a type's chip hides or shows it. */
export interface MethodFilter {
  hidden: string[];
  toggle: (method: MiningMethod) => void;
}

/** Where to mine (green) first, then where to sell (blue). */
export function spotResults(
  r: SpotResults,
  title: { mine: string; sell: string },
  filter: MethodFilter,
): HTMLElement[] {
  const hidden = new Set(filter.hidden);
  const shownMethods = (mineral: string, ringType?: string) =>
    ringMethods(mineral, ringType).filter((method) => !hidden.has(method));
  const tooFar = (radius: number, widened: boolean, found: boolean, what: "hotspot" | "buyer") =>
    !found
      ? h(
          "p.notice.danger",
          null,
          icon("warn"),
          " ",
          h(
            "span",
            null,
            what === "hotspot"
              ? t("mining.noKnownHotspotWithinLyLl", { MAXRADIUS: fmt(MAX_RADIUS) })
              : t("mining.noKnownBuyerWithinLyLl", { MAXRADIUS: fmt(MAX_RADIUS) }),
          ),
        )
      : widened
        ? h(
            "p.notice",
            null,
            icon("warn"),
            " ",
            h("span", null, t("mining.nothingWithinLyRadiusWidenedLy", { start: fmt(r.start), radius: fmt(radius) })),
          )
        : null;
  const mineCard = h(
    "section.card.mine-zone",
    null,
    h("h3", null, title.mine),
    r.mine.map((m) => {
      const spots = m.spots.filter((x) => shownMethods(m.mineral, x.ringType).length > 0);
      return h(
        "div.mine-block",
        null,
        h(
          "div.mine-head",
          null,
          h("h4", null, gameName(m.mineral)),
          h(
            "div.chips",
            null,
            miningMethods(m.mineral).map((method) =>
              h(
                "button.chip.method",
                {
                  class: hidden.has(method) ? "off" : "",
                  title: hidden.has(method) ? t("mining.showMethod") : t("mining.hideMethod"),
                  "aria-pressed": String(!hidden.has(method)),
                  onclick: () => filter.toggle(method),
                },
                icon(hidden.has(method) ? "close" : "check"),
                " " + METHOD_LABEL[method],
              ),
            ),
          ),
        ),
        !m.ringable
          ? h("p.sub", null, t("mining.noHotspotsMineralSMinedLasers"))
          : [
              tooFar(m.radius, m.widened, m.spots.length > 0, "hotspot"),
              m.spots.length && !spots.length ? h("p.sub", null, t("mining.noRingForShownMethods")) : null,
              spots.length
                ? h(
                    "table.table.spot-table",
                    null,
                    h(
                      "thead",
                      null,
                      h(
                        "tr",
                        null,
                        h("th", null, t("mining.planetRing")),
                        h("th", null, t("mining.ringType")),
                        h("th", null, t("mining.reserve")),
                        h("th", null, t("mining.miningType")),
                        h("th.num", null, t("mining.hotspots")),
                        h("th", null, t("common.system")),
                        h("th.num", null, t("common.distance")),
                        h("th.num", null, t("mining.fromArrival")),
                      ),
                    ),
                    h(
                      "tbody",
                      null,
                      spots.slice(0, 15).map((x) =>
                        h(
                          "tr",
                          null,
                          h(
                            "td",
                            null,
                            x.bodyId64
                              ? h(
                                  "button.inline-link",
                                  {
                                    title: t("mining.openPlanetSpansh"),
                                    "data-no-tr": "",
                                    onclick: () => openUrl(spanshBodyUrl(x.bodyId64!)),
                                  },
                                  x.body,
                                )
                              : h("span", { "data-no-tr": "" }, x.body),
                            h("div.sub", { "data-no-tr": "" }, x.ring),
                          ),
                          h("td", null, x.ringType ? (RING_TYPE[x.ringType] ?? x.ringType) : ""),
                          h("td", null, x.reserve ? (RESERVE[x.reserve] ?? x.reserve) : ""),
                          h(
                            "td",
                            null,
                            h(
                              "div.chips.methods",
                              null,
                              shownMethods(m.mineral, x.ringType).map((method) =>
                                h("span.badge.muted", null, METHOD_SHORT_LABEL[method]),
                              ),
                            ),
                          ),
                          h("td.num", null, h("strong", null, String(x.count))),
                          h("td", null, sys(x.system), x.state ? h("div.sub", null, x.state) : null),
                          h(
                            "td.num",
                            null,
                            x.distance !== undefined ? t("common.ly", { locale: fmt(Math.round(x.distance)) }) : "",
                          ),
                          h(
                            "td.num",
                            null,
                            x.arrival !== undefined ? t("common.ls", { locale: fmt(Math.round(x.arrival)) }) : "",
                          ),
                        ),
                      ),
                    ),
                  )
                : null,
            ],
      );
    }),
  );
  const sellCard = h(
    "section.card.sell-zone",
    null,
    h("h3", null, title.sell),
    r.sell.map((m) => {
      const hot = new Set(r.mine.find((x) => x.mineral === m.mineral)?.spots.map((x) => x.system) ?? []);
      return h(
        "div.mine-block",
        null,
        h("h4", null, gameName(m.mineral)),
        tooFar(m.radius, m.widened, m.spots.length > 0, "buyer"),
        m.spots.length
          ? h(
              "table.table.spot-table",
              null,
              h(
                "thead",
                null,
                h(
                  "tr",
                  null,
                  h("th.num", null, t("mining.price")),
                  h("th.num", null, t("mining.demand")),
                  h("th", null, t("common.station")),
                  h("th", null, t("common.system")),
                  h("th.num", null, t("common.distance")),
                  h("th", null, t("mining.state")),
                ),
              ),
              h(
                "tbody",
                null,
                m.spots
                  .slice(0, 15)
                  .map((x) =>
                    h(
                      "tr",
                      { class: hot.has(x.system) ? "hot" : "" },
                      h("td.num", null, h("strong", null, `${fmt(x.price)} Cr`)),
                      h("td.num", null, fmt(x.demand)),
                      h(
                        "td",
                        null,
                        x.station,
                        x.largePad ? h("span.badge.muted", null, "L") : null,
                        x.updated ? h("div.sub", null, relTime(x.updated)) : null,
                      ),
                      h(
                        "td",
                        null,
                        sys(x.system),
                        hot.has(x.system) ? h("span.badge.ok", null, t("mining.hotspotHere")) : null,
                      ),
                      h(
                        "td.num",
                        null,
                        x.distance !== undefined ? t("common.ly", { locale: fmt(Math.round(x.distance)) }) : "",
                      ),
                      h("td", null, x.state ?? ""),
                    ),
                  ),
              ),
            )
          : null,
      );
    }),
  );
  return [mineCard, sellCard];
}
