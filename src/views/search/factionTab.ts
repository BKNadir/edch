// Search page, Faction tab: the systems where a minor faction is present or that it controls,
// optionally only where it is in some states (Famine, Expansion…), nearest first (Spansh).

import { gameName, locale, t } from "../../platform/i18n.js";
import { searchFaction } from "../../services/spansh.js";
import { type Ctx } from "../../state/context.js";
import { referenceField, searchReference } from "./reference.js";
import { h, icon, replace } from "../../ui/dom.js";
import { resultRow } from "../shared/resultsTable.js";
import { exactFaction, factionIndex, matchFactions, type FactionIndex } from "../../features/search/factionNames.js";
import { suggestBox } from "../../ui/suggestBox.js";
import { log } from "../../platform/logger.js";

/** Every faction of the game (public/data/factions.txt), loaded the first time the tab opens. */
let allFactions: Promise<string[]> | undefined;

function loadFactions(): Promise<string[]> {
  return (allFactions ??= fetch("data/factions.txt")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    })
    .then((text) => text.split("\n").filter(Boolean))
    .catch((error) => {
      log.warn("search", `Faction list unavailable, journal factions only: ${String(error?.message ?? error)}`);
      return [];
    }));
}

/** The journal's factions first, then the game's; rebuilt when the journal knows new ones. */
let index: { known: string[]; value: FactionIndex } | undefined;

async function factionsOf(ctx: Ctx): Promise<FactionIndex> {
  const known = ctx.store.state.cmdr.knownFactions ?? [];
  const all = await loadFactions();
  if (index?.known !== known) index = { known, value: factionIndex(known, all) };
  return index.value;
}

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
  // The list is ready by the time a name is typed; until then, the journal's factions.
  let ready: FactionIndex = factionIndex(ctx.store.state.cmdr.knownFactions ?? []);
  void factionsOf(ctx).then((value) => (ready = value));
  const input = h("input.big", {
    type: "text",
    value: query.faction,
    placeholder: t("search.factionName"),
    spellcheck: false,
    oninput: (e: Event) => (query.faction = (e.target as HTMLInputElement).value),
    onkeydown: (e: KeyboardEvent) => e.key === "Enter" && run(),
  }) as HTMLInputElement;
  const field = suggestBox(
    input,
    (text) => matchFactions(ready, text),
    (value) => {
      query.faction = value;
      run();
    },
  );
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
    h("div.row", null, field, h("button.primary", { onclick: run }, icon("search"), " " + t("common.search"))),
    h(
      "div.row.opts",
      null,
      presence(false, t("search.factionPresent")),
      presence(true, t("search.factionOwner")),
      h("span.sub.faction-from", null, t("search.nearestFrom", { label: searchReference(ctx).label })),
    ),
    h(
      "div.row.opts",
      null,
      referenceField(ctx, () => {
        const from = document.querySelector(".faction-from");
        if (from) from.textContent = t("search.nearestFrom", { label: searchReference(ctx).label });
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

async function runSearch(ctx: Ctx, out: HTMLElement) {
  const faction = query.faction.trim();
  if (!faction) return;
  // Spansh wants the exact spelling: a name typed with other capitals or accents gets the game's.
  const known = exactFaction(await factionsOf(ctx), faction);
  const id = ++runId;
  replace(out, h("p.sub", null, h("span.spinner"), " " + t("common.searchingSpansh")));
  try {
    const res = await searchFaction(
      { faction: known ?? faction, ownerOnly: query.ownerOnly, states: [...query.states] },
      searchReference(ctx),
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
