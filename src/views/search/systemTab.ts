// Search page, Systems tab: systems around the reference system with a star type, Powerplay,
// allegiance, government, economy, security, faction state, station type or number of bodies,
// nearest first, a page at a time (services/systemSearch.ts).

import { gameName, locale, t } from "../../platform/i18n.js";
import {
  ALLEGIANCES,
  ECONOMIES,
  FACTION_STATES,
  GOVERNMENTS,
  POWER_STATES,
  POWERS,
  searchSystems,
  SECURITIES,
  securityLabel,
  STAR_TYPES,
  SYSTEM_STATION_TYPES,
  SYSTEMS_PAGE_SIZE,
  type SystemCriteria,
} from "../../services/systemSearch.js";
import { referenceOf, type Ctx } from "../../state/context.js";
import { h, icon, replace } from "../../ui/dom.js";
import { referenceField } from "../shared/referenceField.js";
import { radiusField, rangeOf } from "../shared/radiusField.js";
import { resultRow } from "../shared/resultsTable.js";
import { pager } from "../shared/pager.js";

/** Pages Spansh is asked for at most (the nearest 1000 systems). */
const MAX_PAGES = 20;

/** What was chosen, kept while the app runs. */
const criteria: SystemCriteria = {};
/** The range typed on this tab (light years), or undefined for the Settings default. */
let ownRange: number | undefined;
/** Only the latest search may show its results (an older, slower answer is dropped). */
let runId = 0;

/** A select of `values` (game names) for `key`, with "any" first. */
function choice(
  key: Exclude<keyof SystemCriteria, "minBodies">,
  label: string,
  values: string[],
  sorted = true,
  labelOf: (value: string) => string = gameName,
): HTMLElement {
  const shown = sorted ? [...values].sort((a, b) => labelOf(a).localeCompare(labelOf(b), locale())) : values;
  return h(
    "label.check",
    null,
    label + " ",
    h(
      "select",
      { onchange: (e: Event) => (criteria[key] = (e.target as HTMLSelectElement).value || undefined) },
      h("option", { value: "" }, t("search.systemAny")),
      shown.map((v) => h("option", { value: v, selected: criteria[key] === v }, labelOf(v))),
    ),
  );
}

/** The tab's form; results go to `out`. */
export function systemForm(ctx: Ctx, out: HTMLElement): HTMLElement {
  const run = () => void runSearch(ctx, out, 0);
  const range = () => rangeOf(ownRange, ctx.store.state.settings.maxDistance);
  const around = h("span.sub", null, t("common.aroundLyMax", { label: referenceOf(ctx).label, maxDistance: range() }));
  const refreshAround = () =>
    (around.textContent = t("common.aroundLyMax", { label: referenceOf(ctx).label, maxDistance: range() }));
  return h(
    "div",
    null,
    h(
      "div.row.opts",
      null,
      choice("starType", t("search.systemStar"), STAR_TYPES, false),
      choice("stationType", t("search.systemStation"), SYSTEM_STATION_TYPES),
      h(
        "label.check",
        null,
        t("search.systemMinBodies") + " ",
        h("input.num-small", {
          type: "number",
          min: "0",
          step: "1",
          value: criteria.minBodies ? String(criteria.minBodies) : "",
          onchange: (e: Event) => {
            const value = Math.floor(Number((e.target as HTMLInputElement).value));
            criteria.minBodies = value > 0 ? value : undefined;
          },
        }),
      ),
      h("button.primary", { onclick: run }, icon("search"), " " + t("common.search")),
    ),
    h(
      "div.row.opts",
      null,
      choice("power", t("search.systemPower"), POWERS),
      choice("powerState", t("search.systemPowerState"), POWER_STATES, false),
    ),
    h(
      "div.row.opts",
      null,
      choice("allegiance", t("search.systemAllegiance"), ALLEGIANCES),
      choice("government", t("search.systemGovernment"), GOVERNMENTS),
      choice("economy", t("search.systemEconomy"), ECONOMIES),
      choice("security", t("search.systemSecurity"), SECURITIES, false, securityLabel),
      choice("factionState", t("search.systemFactionState"), FACTION_STATES),
    ),
    h(
      "div.row.opts",
      null,
      referenceField(ctx, refreshAround),
      radiusField(ownRange, ctx.store.state.settings.maxDistance, (value) => {
        ownRange = value;
        refreshAround();
      }),
      around,
    ),
    h("p.sub", null, t("search.systemRingsHint")),
  );
}

async function runSearch(ctx: Ctx, out: HTMLElement, page: number) {
  const id = ++runId;
  replace(out, h("p.sub", null, h("span.spinner"), " " + t("common.searching")));
  try {
    const res = await searchSystems(
      criteria,
      referenceOf(ctx),
      rangeOf(ownRange, ctx.store.state.settings.maxDistance),
      page,
      ctx.store.state.settings.maxAgeDays,
    );
    if (id !== runId) return;
    if (!res.rows.length) {
      replace(out, h("p.empty", null, t("search.noSystems")));
      return;
    }
    const pages = Math.min(MAX_PAGES, Math.ceil(res.total / SYSTEMS_PAGE_SIZE));
    replace(
      out,
      h(
        "p.sub",
        null,
        t("search.systemsPage", {
          count: res.total,
          from: page * SYSTEMS_PAGE_SIZE + 1,
          to: page * SYSTEMS_PAGE_SIZE + res.rows.length,
        }),
      ),
      h("div.results", null, res.rows.map(resultRow)),
      pager(page, pages, false, (wanted) => {
        void runSearch(ctx, out, wanted);
        out.scrollIntoView({ block: "start", behavior: "smooth" });
      }),
    );
  } catch (e) {
    if (id !== runId) return;
    replace(out, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
  }
}
