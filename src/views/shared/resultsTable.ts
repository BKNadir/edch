// Result rows shared by several pages: a system, station or body with its distance and the data
// age, clickable to copy the system; and the "where to find" sections built from Spansh results.

import { locale, t } from "../../platform/i18n.js";
import { openUrl } from "../../platform/bridge.js";
import { openSystem } from "./links.js";
import { h, icon } from "../../ui/dom.js";
import { stationIcon } from "../../ui/stationIcon.js";
import { fmtLy, runFinder, type Reference, type ResultRow } from "../../services/spansh.js";
import type { Finder } from "../../features/materials/sources.js";
import type { Settings } from "../../state/store.js";

/** A system name was clicked (see links.ts: copy, and open Navigation if chosen in Settings). */
export const copySystem = (system: string) => openSystem(system);

/** Where the commander is, from the journal: shown on the matching result. */
let here: () => { system?: string; seenAt?: string } = () => ({});
export function setHere(fn: typeof here) {
  here = fn;
}

function sinceText(iso?: string): string {
  if (!iso) return "";
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (min < 1) return t("results.justNow");
  if (min < 60) return t("results.minAgo", { min });
  if (min < 48 * 60) return t("results.hAgo", { value: Math.round(min / 60) });
  return t("results.dAgo", { value: Math.round(min / 1440) });
}

function ago(iso?: string): string {
  if (!iso) return "";
  const ms = Date.parse(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  if (Number.isNaN(ms)) return "";
  const hours = (Date.now() - ms) / 3600_000;
  if (hours < 1) return t("results.updated1HAgo");
  if (hours < 48) return t("results.updatedHAgo", { hours: Math.round(hours) });
  return t("results.updatedDAgo", { value: Math.round(hours / 24) });
}

export function resultRow(r: ResultRow): HTMLElement {
  return h(
    "div.result",
    null,
    h(
      "div.result-main",
      null,
      h(
        "button.sys",
        { title: t("common.copy", { name: r.system }), onclick: () => copySystem(r.system) },
        icon("copy"),
        stationIcon(r.stationType),
        h("span", null, r.title),
      ),
      h("span.dist", null, fmtLy(r.distance)),
    ),
    h(
      "div.result-meta",
      null,
      r.badges.map((b) => h(`span.badge${b.tone ? `.${b.tone}` : ""}`, null, b.text)),
      r.sub.length
        ? h(
            "span.sub",
            null,
            r.sub.flatMap((x, i) => (i ? [" · ", x] : [x])),
          )
        : null,
      (() => {
        const me = here();
        return me.system && me.system.toLowerCase() === r.system.toLowerCase()
          ? h(
              "span.badge.ok",
              { title: t("results.dataReadFromJournal") },
              me.seenAt ? t("results.areHereSeen", { sinceText: sinceText(me.seenAt) }) : t("common.areHere"),
            )
          : null;
      })(),
      r.updated ? h("span.sub.age", { title: t("results.whenSpanshLastUpdatedSystemData") }, ago(r.updated)) : null,
      h(
        "span.links",
        null,
        r.links.map((l) =>
          h(
            "button.link",
            { title: t("results.open", { label: l.label }), onclick: () => openUrl(l.url) },
            l.label,
            icon("link"),
          ),
        ),
      ),
    ),
  );
}

/** A finder section that loads its Spansh results by itself. */
export function finderSection(
  f: Finder,
  ref: Reference,
  settings: Settings,
  opts: { compact?: boolean } = {},
): HTMLElement {
  const list = h("div.results");
  const status = h("span.status");
  let force = false;
  const refresh = h(
    "button.ghost.small",
    { title: t("results.runSearchAgainSkipping10Minute"), onclick: () => ((force = true), load()) },
    t("common.refresh"),
  );
  const section = h(
    `section.finder.${f.type}`,
    null,
    h("div.finder-head", null, h("h4", null, f.title), status, f.type === "info" ? null : refresh),
    f.hint && !opts.compact ? h("p.hint", null, f.hint) : null,
    f.type === "info" ? null : list,
  );
  if (f.type === "info") return section;

  const load = () => {
    status.replaceChildren(h("span.spinner"), t("common.searchingSpansh"));
    list.replaceChildren();
    runFinder(f, ref, settings, force)
      .then((res) => {
        force = false;
        status.replaceChildren();
        if (!res.rows.length) {
          list.replaceChildren(
            h(
              "p.empty",
              null,
              t("results.noResultsWithinLy", { maxDistance: settings.maxDistance }),
              " " + t("results.increaseDistanceSettings"),
            ),
          );
          return;
        }
        list.replaceChildren(...res.rows.map(resultRow));
        if (res.total > res.rows.length && f.type === "systems") {
          status.replaceChildren(
            h("span.sub", null, t("results.matchingSystems", { locale: res.total.toLocaleString(locale()) })),
          );
        }
      })
      .catch((err) => {
        status.replaceChildren();
        list.replaceChildren(
          h(
            "p.error",
            null,
            icon("warn"),
            ` ${String(err?.message ?? err)}`,
            " ",
            h("button.ghost", { onclick: load }, t("common.retry")),
          ),
        );
      });
  };
  load();
  return section;
}
