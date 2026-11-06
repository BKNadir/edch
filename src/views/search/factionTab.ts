// Search page, Faction tab: the systems where a minor faction is present or that it controls,
// optionally only where it is in some states (Famine, Expansion…), nearest first (Spansh).

import { gameName, locale, t } from "../../platform/i18n.js";
import { searchFaction } from "../../services/spansh.js";
import { referenceOf, type Ctx } from "../../state/context.js";
import { h, icon, replace } from "../../ui/dom.js";
import { resultRow } from "../shared/resultsTable.js";

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
  const known = ctx.store.state.cmdr.knownFactions ?? [];
  const input = h("input.big", {
    type: "text",
    value: query.faction,
    list: "dl-factions",
    placeholder: t("search.factionName"),
    spellcheck: false,
    oninput: (e: Event) => (query.faction = (e.target as HTMLInputElement).value),
    onkeydown: (e: KeyboardEvent) => e.key === "Enter" && run(),
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
    "div",
    null,
    h(
      "datalist#dl-factions",
      null,
      known.map((name) => h("option", { value: name })),
    ),
    h("div.row", null, input, h("button.primary", { onclick: run }, icon("search"), " " + t("common.search"))),
    h(
      "div.row.opts",
      null,
      presence(false, t("search.factionPresent")),
      presence(true, t("search.factionOwner")),
      h("span.sub", null, t("search.nearestFrom", { label: referenceOf(ctx).label })),
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

async function runSearch(ctx: Ctx, out: HTMLElement) {
  const faction = query.faction.trim();
  if (!faction) return;
  // A faction typed with other capitals than the journal's: use the journal's spelling.
  const known = (ctx.store.state.cmdr.knownFactions ?? []).find((n) => n.toLowerCase() === faction.toLowerCase());
  const id = ++runId;
  replace(out, h("p.sub", null, h("span.spinner"), " " + t("common.searchingSpansh")));
  try {
    const res = await searchFaction(
      { faction: known ?? faction, ownerOnly: query.ownerOnly, states: [...query.states] },
      referenceOf(ctx),
    );
    if (id !== runId) return;
    if (!res.rows.length) {
      replace(out, h("p.empty", null, t("search.noFactionSystems", { faction })));
      return;
    }
    replace(
      out,
      h("p.sub", null, t("search.factionSystemsShown", { count: res.total, shown: res.rows.length })),
      h("div.results", null, res.rows.map(resultRow)),
    );
  } catch (e) {
    if (id !== runId) return;
    replace(out, h("p.error", null, icon("warn"), ` ${String((e as Error).message ?? e)}`));
  }
}
