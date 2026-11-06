// Thargoids page: the Thargoids killed, by ship type (this session and the last weeks of journal),
// and the AX conflict zones entered this session. The type of each kill comes from its combat bond
// (the journal names neither the Thargoid killed nor those around you).

import { HISTORY_DAYS } from "../../game/activity/index.js";
import type { ThargoidKill } from "../../game/activity/state.js";
import { killsByType, type ThargoidType } from "../../game/activity/thargoids.js";
import { fmt, h, replace } from "../../ui/dom.js";
import { credits, relTime } from "../../ui/format.js";
import type { Ctx, View } from "../../state/context.js";
import { t } from "../../platform/i18n.js";
import { resetThargoidCounters, thargoidSessionStart } from "../../state/sessionReset.js";
import { resetCountersButton } from "../shared/resetCounters.js";

/** Types always listed (from the largest to the scouts), even with no kill yet. */
const LISTED_TYPES: ThargoidType[] = ["hydra", "medusa", "basilisk", "orthrus", "cyclops", "hunter", "scout"];
/** Types listed only once one was killed (rare, or a bond EDCH doesn't know). */
const RARE_TYPES: ThargoidType[] = ["banshee", "revenant", "unknown"];

/** The type's name as the game shows it ("Cyclops", "Glaive / Scythe", "Scout"…). */
const typeName = (type: ThargoidType): string =>
  ({
    revenant: t("thargoids.typeRevenant"),
    scout: t("thargoids.typeScout"),
    banshee: t("thargoids.typeBanshee"),
    hunter: t("thargoids.typeHunter"),
    cyclops: t("thargoids.typeCyclops"),
    orthrus: t("thargoids.typeOrthrus"),
    basilisk: t("thargoids.typeBasilisk"),
    medusa: t("thargoids.typeMedusa"),
    hydra: t("thargoids.typeHydra"),
    unknown: t("thargoids.typeUnknown"),
  })[type];

export class ThargoidsView implements View {
  private root?: HTMLElement;
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  update() {
    this.render();
  }

  private render() {
    if (!this.root) return;
    const activity = this.ctx.store.state.activity;
    const thargoids = activity.thargoids ?? { kills: [], zones: [] };
    // The session: since the game session started, or since the last "Reset counters".
    const sessionStart = thargoidSessionStart(activity);
    const inSession = (entry: { at: string }) => Boolean(sessionStart) && entry.at >= sessionStart!;
    const sessionKills = thargoids.kills.filter(inSession);
    const sessionZones = thargoids.zones.filter(inSession);
    const sessionByType = killsByType(sessionKills);
    const historyByType = killsByType(thargoids.kills);
    const shownTypes = [...LISTED_TYPES, ...RARE_TYPES.filter((type) => historyByType.has(type))];
    const totalCredits = (kills: ThargoidKill[]) => kills.reduce((sum, kill) => sum + kill.reward, 0);

    replace(
      this.root,
      h(
        "header.view-head",
        null,
        h("div", null, h("h1", null, t("thargoids.title")), h("p.sub", null, t("thargoids.subtitle"))),
        activity.session.start
          ? resetCountersButton(
              () => resetThargoidCounters(activity),
              () => this.render(),
            )
          : null,
      ),
      h(
        "section.card",
        null,
        h("h3", null, t("thargoids.thisSession")),
        h(
          "div.stats",
          null,
          h("div.stat", null, h("strong", null, fmt(sessionKills.length)), h("span.sub", null, t("thargoids.kills"))),
          h(
            "div.stat",
            null,
            h("strong", null, `${credits(totalCredits(sessionKills))} Cr`),
            h("span.sub", null, t("session.combatBonds")),
          ),
          h(
            "div.stat",
            null,
            h("strong", null, fmt(sessionZones.length)),
            h("span.sub", null, t("thargoids.axZonesEntered")),
          ),
        ),
        h(
          "table.table.thargoid-table",
          null,
          h(
            "thead",
            null,
            h(
              "tr",
              null,
              h("th", null, t("thargoids.type")),
              h("th.num", null, t("thargoids.thisSession")),
              h("th.num", null, t("thargoids.lastDays", { count: HISTORY_DAYS })),
              h("th.num", null, t("thargoids.bonds")),
            ),
          ),
          h(
            "tbody",
            null,
            shownTypes.map((type) => {
              const session = sessionByType.get(type);
              const history = historyByType.get(type);
              return h(
                "tr",
                { class: history ? "" : "muted" },
                h("td", { "data-no-tr": "" }, typeName(type)),
                h("td.num", null, h("strong", null, fmt(session?.count ?? 0))),
                h("td.num", null, fmt(history?.count ?? 0)),
                h("td.num", null, history ? `${credits(history.credits)} Cr` : "—"),
              );
            }),
          ),
        ),
        sessionZones.length
          ? h(
              "div",
              null,
              h("h4.settings-sub", null, t("thargoids.axZonesEntered")),
              h(
                "ul.side-list",
                null,
                [...sessionZones]
                  .reverse()
                  .map((zone) =>
                    h(
                      "li",
                      null,
                      h("span", { "data-no-tr": "" }, zone.label),
                      h("span.sub", { "data-no-tr": "" }, [zone.system, relTime(zone.at)].filter(Boolean).join(" · ")),
                    ),
                  ),
              ),
            )
          : null,
      ),
      h("section.card", null, h("p.sub", null, t("thargoids.howTypesAreKnown"))),
    );
  }
}
