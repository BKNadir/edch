import type { CommunityGoal } from "../activity.js";
import { httpFetch, openUrl } from "../bridge.js";
import { fmt, h, replace } from "../dom.js";
import { SOFTWARE_NAME, SOFTWARE_VERSION } from "../eddn.js";
import { relTime } from "../time.js";
import type { Ctx, View } from "../context.js";
import { busy, sys } from "./missions.js";

interface InaraGoal {
  communitygoalGameID: number;
  communitygoalName: string;
  starsystemName: string;
  stationName: string;
  goalExpiry: string;
  tierReached: number;
  tierMax: number;
  contributorsNum: number;
  contributionsTotal: number;
  isCompleted: boolean;
  goalObjectiveText?: string;
  goalRewardText?: string;
  goalDescriptionText?: string;
  inaraURL?: string;
}

export class GoalsView implements View {
  private root?: HTMLElement;
  private inara: InaraGoal[] | null = null;
  private inaraError = "";
  private loading = false;
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  update() {
    if (!busy(this.root)) this.render();
  }

  private async loadInara() {
    const st = this.ctx.store.state;
    const key = st.settings.sync.inaraKey;
    if (!key) {
      this.inaraError = "Ajoute ta clé API Inara dans Synchro pour voir tous les objectifs en cours.";
      this.render();
      return;
    }
    this.loading = true;
    this.inaraError = "";
    this.render();
    try {
      const body = {
        header: { appName: SOFTWARE_NAME, appVersion: SOFTWARE_VERSION, isBeingDeveloped: false, APIkey: key, commanderName: st.cmdr.commander ?? "" },
        events: [{ eventName: "getCommunityGoalsRecent", eventTimestamp: new Date().toISOString().slice(0, 19) + "Z", eventData: [] }],
      };
      const reply = await httpFetch("POST", "https://inara.cz/inapi/v1/", JSON.stringify(body));
      const res = JSON.parse(reply.body || "{}");
      const ev = res?.events?.[0];
      if (!ev || Number(ev.eventStatus) >= 300) throw new Error(String(ev?.eventStatusText ?? res?.header?.eventStatusText ?? `Inara : ${reply.status}`));
      this.inara = (ev.eventData ?? []) as InaraGoal[];
    } catch (e) {
      this.inaraError = String((e as Error)?.message ?? e);
    }
    this.loading = false;
    this.render();
  }

  private render() {
    if (!this.root) return;
    const goals = Object.values(this.ctx.store.state.activity.goals).sort((a, b) => Number(a.complete) - Number(b.complete) || a.expiry.localeCompare(b.expiry));
    const live = goals.filter((g) => !g.complete && Date.parse(g.expiry) > Date.now());
    const past = goals.filter((g) => !live.includes(g));
    replace(
      this.root,
      h("header.view-head", null, h("div", null, h("h1", null, "Objectifs communautaires"), h("p.sub", null, "Ta participation, lue dans le journal du jeu."))),
      live.length ? h("div.goal-grid", null, live.map((g) => this.goal(g))) : h("section.card", null, h("p.empty", null, "Aucun objectif communautaire suivi. Inscris-toi à un objectif en jeu (ou ouvre son panneau) : il apparaîtra ici.")),
      this.inaraSection(),
      past.length ? h("section.card", null, h("h3", null, "Objectifs passés"), h("ul.plain", null, past.slice(0, 10).map((g) => h("li", null, h("strong", null, g.title), h("span.sub", null, ` · ${g.system} · ${g.tierReached ?? ""} · ${fmt(g.contribution ?? 0)}`))))) : null,
    );
  }

  private goal(g: CommunityGoal): HTMLElement {
    const left = Date.parse(g.expiry) - Date.now();
    return h(
      "article.card.goal",
      null,
      h("h3", null, g.title),
      h("p.mission-dest", null, h("strong", null, g.market), " · ", sys(g.system)),
      h(
        "div.stats",
        null,
        h("div.stat", null, h("strong", null, fmt(g.contribution ?? 0)), h("span.sub", null, "ta contribution")),
        g.percentile !== undefined ? h("div.stat", null, h("strong", null, `Top ${g.percentile} %`), h("span.sub", null, "ta tranche de récompense")) : null,
        g.tierReached ? h("div.stat", null, h("strong", null, g.tierReached), h("span.sub", null, g.topTier ? `sur ${g.topTier.name}` : "palier atteint")) : null,
        g.contributors !== undefined ? h("div.stat", null, h("strong", null, fmt(g.contributors)), h("span.sub", null, "participants")) : null,
      ),
      g.inTopRank ? h("p.ok", null, `Tu es dans le top ${g.topRankSize ?? ""} des contributeurs.`) : null,
      h("div.mission-foot", null, h("span", { class: left < 86400000 ? "warn" : "" }, `Se termine ${relTime(g.expiry)}`), g.total !== undefined ? h("span.sub", null, `Total : ${fmt(g.total)}`) : null, h("span.sub", null, `Mis à jour ${relTime(g.updated)}`)),
    );
  }

  private inaraSection(): HTMLElement {
    const list = this.inara?.filter((g) => !g.isCompleted) ?? [];
    return h(
      "section.card",
      null,
      h("div.sync-head", null, h("div", null, h("h3", null, "Tous les objectifs en cours"), h("p.sub", null, "Via Inara, avec ta clé API (page Synchro).")), h("button.ghost", { onclick: () => this.loadInara(), disabled: this.loading }, this.loading ? "Chargement…" : "Charger")),
      this.inaraError ? h("p.error", null, this.inaraError) : null,
      this.inara
        ? list.length
          ? h(
              "table.table",
              null,
              h("thead", null, h("tr", null, h("th", null, "Objectif"), h("th", null, "Lieu"), h("th.num", null, "Palier"), h("th.num", null, "Participants"), h("th", null, "Fin"), h("th", null, ""))),
              h(
                "tbody",
                null,
                list.map((g) =>
                  h(
                    "tr",
                    null,
                    h("td", null, h("strong", null, g.communitygoalName), g.goalObjectiveText ? h("div.sub", null, g.goalObjectiveText) : null),
                    h("td", null, g.stationName, " · ", sys(g.starsystemName)),
                    h("td.num", null, `${g.tierReached} / ${g.tierMax}`),
                    h("td.num", null, fmt(g.contributorsNum)),
                    h("td", null, relTime(g.goalExpiry)),
                    h("td", null, g.inaraURL ? h("button.inline-link", { onclick: () => openUrl(g.inaraURL!) }, "Inara") : null),
                  ),
                ),
              ),
            )
          : h("p.empty", null, "Aucun objectif en cours sur Inara.")
        : null,
    );
  }
}
