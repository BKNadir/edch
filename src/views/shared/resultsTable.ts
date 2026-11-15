// Result rows shared by several pages: a system, station or body with its distance and the data
// age, clickable to copy the system; and the "where to find" sections built from Spansh results.

import { locale, t } from "../../platform/i18n.js";
import { openUrl } from "../../platform/bridge.js";
import { openSystem, systemInfo } from "./links.js";
import { h, icon } from "../../ui/dom.js";
import { stationIcon } from "../../ui/stationIcon.js";
import { debugSource } from "../../ui/debugSource.js";
import { fmtLy, runFinder, type Reference, type ResultRow } from "../../services/spansh.js";
import type { Finder } from "../../features/materials/sources.js";
import type { Settings } from "../../state/store.js";
import { showPagedList } from "./pagedList.js";

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
      systemInfo(r.system),
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
              { title: t("results.yourOwnData") },
              me.seenAt ? t("results.areHereSeen", { sinceText: sinceText(me.seenAt) }) : t("common.areHere"),
            )
          : null;
      })(),
      r.updated ? h("span.sub.age", { title: t("results.lastUpdated") }, ago(r.updated)) : null,
      debugSource(r.source ?? "Spansh"),
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
  const list = h("div.finder-results");
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
    h(
      "div.finder-head",
      null,
      h("h4", null, f.title, debugSource(f.type === "info" ? "EDEngineer / d47" : "Spansh")),
      status,
      f.type === "info" ? null : refresh,
    ),
    f.hint && !opts.compact ? h("p.hint", null, f.hint) : null,
    f.type === "info" ? null : list,
  );
  if (f.type === "info") return section;

  const load = () => {
    status.replaceChildren(h("span.spinner"), t("common.searching"));
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
        if (res.total > res.rows.length && f.type === "systems") {
          status.replaceChildren(
            h("span.sub", null, t("results.matchingSystems", { locale: res.total.toLocaleString(locale()) })),
          );
        }
        // A page at a time when they don't fit on the screen; the next results are asked for when
        // a page needs them (not for the best-share bodies, already picked).
        const rows = [...res.rows];
        let spanshPage = 0;
        void showPagedList(
          list,
          {
            rows: () => rows,
            total: () => res.total,
            hasMore: () => !f.materialName && rows.length < res.total,
            more: async () => {
              const next = await runFinder(f, ref, settings, false, ++spanshPage);
              rows.push(...next.rows);
              return next.rows.length > 0;
            },
          },
          {
            summary: (from, to, count) => t("pager.linesShown", { from, to, count }),
            draw: (shown) => h("div.results", null, shown.map(resultRow)),
          },
        );
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
