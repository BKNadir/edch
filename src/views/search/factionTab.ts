// Search page, Faction tab: the systems where a minor faction is present or that it controls,
// optionally only where it is in some states (Famine, Expansion…), nearest first (Spansh).

import { gameName, locale, t } from "../../platform/i18n.js";
import { searchFactionFreshest } from "../../features/search/factionSources.js";
import { referenceOf, type Ctx } from "../../state/context.js";
import { referenceField } from "../shared/referenceField.js";
import { h, icon, replace } from "../../ui/dom.js";
import { resultRow } from "../shared/resultsTable.js";
import { showPagedList } from "../shared/pagedList.js";
import { exactFaction } from "../../features/search/factionNames.js";
import { factionField, factionsOf } from "../shared/factionField.js";

/** Faction states Spansh knows, by their English game name (shown with the game's translation). */
const FACTION_STATES = [
  "Blight",
  "Boom",
  "Bust",
  "Civil Liberty",
  "Civil Unrest",
  "Civil War",
  "Drought",
  "Election",
  "Expansion",
  "Famine",
  "Infrastructure Failure",
  "Investment",
  "Lockdown",
  "Natural Disaster",
  "Outbreak",
  "Pirate Attack",
  "Public Holiday",
  "Retreat",
  "War",
];

/** What was typed and ticked, kept while the app runs. */
const query = { faction: "", ownerOnly: false, states: new Set<string>() };
/** Only the latest search may show its results (an older, slower answer is dropped). */
let runId = 0;

/** The tab's form; results go to `out`. */
export function factionForm(ctx: Ctx, out: HTMLElement): HTMLElement {
  const run = () => void runSearch(ctx, out);
  const input = h("input.big", {
    type: "text",
    value: query.faction,
    placeholder: t("search.factionName"),
    spellcheck: false,
    oninput: (e: Event) => (query.faction = (e.target as HTMLInputElement).value),
    onkeydown: (e: KeyboardEvent) => e.key === "Enter" && run(),
  }) as HTMLInputElement;
  const field = factionField(ctx, input, (name) => {
    query.faction = name;
    run();
  });
  const presence = (ownerOnly: boolean, label: string) =>
    h(
      "label.check",
      null,
      h("input", {
        type: "radio",
        name: "faction-presence",
        checked: query.ownerOnly === ownerOnly,
        onchange: () => (query.ownerOnly = ownerOnly),
      }),
      ` ${label}`,
    );
  const byName = [...FACTION_STATES].sort((a, b) => gameName(a).localeCompare(gameName(b), locale()));
  const stateChips = byName.map((state) =>
    h(
      "label.check",
      null,
      h("input", {
        type: "checkbox",
        checked: query.states.has(state),
        onchange: (e: Event) =>
          (e.target as HTMLInputElement).checked ? query.states.add(state) : query.states.delete(state),
      }),
      ` ${gameName(state)}`,
    ),
  );
  return h(
    "div.search-form",
    null,
    h("div.row", null, field, h("button.primary", { onclick: run }, icon("search"), " " + t("common.search"))),
    h(
      "div.row.opts",
      null,
      presence(false, t("search.factionPresent")),
      presence(true, t("search.factionOwner")),
      h("span.sub.faction-from", null, t("search.nearestFrom", { label: referenceOf(ctx).label })),
    ),
    h(
      "div.row.opts",
      null,
      referenceField(ctx, () => {
        const from = document.querySelector(".faction-from");
        if (from) from.textContent = t("search.nearestFrom", { label: referenceOf(ctx).label });
      }),
    ),
    h(
      "details.faction-states",
      { open: query.states.size > 0 },
      h("summary", null, t("search.factionStates")),
      h("p.sub", null, t("search.factionStatesHelp")),
      h("div.row.opts", null, stateChips),
    ),
  );
}

/** Searches the systems of `faction` straight away (Search → Auto found a faction's name). */
export function searchFactionNow(ctx: Ctx, out: HTMLElement, faction: string) {
  query.faction = faction;
  void runSearch(ctx, out);
}

async function runSearch(ctx: Ctx, out: HTMLElement) {
  const faction = query.faction.trim();
  if (!faction) return;
  // Spansh wants the exact spelling: a name typed with other capitals or accents gets the game's.
  const known = exactFaction(await factionsOf(ctx), faction);
  const id = ++runId;
  replace(out, h("p.sub", null, h("span.spinner"), " " + t("common.searching")));
  try {
    const res = await searchFactionFreshest(
      {
        faction: known ?? faction,
        ownerOnly: query.ownerOnly,
        states: [...query.states],
        maxAgeDays: ctx.store.state.settings.maxAgeDays,
      },
      referenceOf(ctx),
    );
    if (id !== runId) return;
    if (!res.rows.length) {
      replace(out, h("p.empty", null, t("search.noFactionSystems", { faction })));
      return;
    }
    // A page at a time (all the systems are already here).
    await showPagedList(
      out,
      { rows: () => res.rows, total: () => res.total },
      {
        summary: (from, to, count) => t("search.factionSystemsPage", { count, from, to }),
        draw: (rows) => h("div.results", null, rows.map(resultRow)),
      },
    );
  } catch (e) {
    if (id !== runId) return;
    replace(out, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
  }
}
