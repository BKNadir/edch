import type { CommunityGoal } from "../../game/activity.js";
import { httpFetch, openUrl } from "../../platform/bridge.js";
import { fmt, h, replace } from "../../ui/dom.js";
import { SOFTWARE_NAME } from "../../platform/version.js";
import { SOFTWARE_VERSION } from "../../platform/version.js";
import { relTime } from "../../ui/format.js";
import type { Ctx, View } from "../../state/context.js";
import { busy, sys } from "../missions/index.js";
import { t } from "../../platform/i18n.js";

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
      this.inaraError = t("goals.addInaraApiKeySyncSee");
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
      h("header.view-head", null, h("div", null, h("h1", null, t("common.communityGoals")), h("p.sub", null, t("goals.participationReadFromGameJournal")))),
      live.length ? h("div.goal-grid", null, live.map((g) => this.goal(g))) : h("section.card", null, h("p.empty", null, t("goals.noCommunityGoalTrackedSignUp"))),
      this.inaraSection(),
      past.length ? h("section.card", null, h("h3", null, t("goals.pastGoals")), h("ul.plain", null, past.slice(0, 10).map((g) => h("li", null, h("strong", null, g.title), h("span.sub", null, " · ", sys(g.system), ` · ${g.tierReached ?? ""} · ${fmt(g.contribution ?? 0)}`))))) : null,
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
        h("div.stat", null, h("strong", null, fmt(g.contribution ?? 0)), h("span.sub", null, t("goals.contribution"))),
        g.percentile !== undefined ? h("div.stat", null, h("strong", null, t("goals.top", { percentile: g.percentile })), h("span.sub", null, t("goals.rewardBand"))) : null,
        g.tierReached ? h("div.stat", null, h("strong", null, g.tierReached), h("span.sub", null, g.topTier ? t("goals.of", { name: g.topTier.name }) : t("goals.tierReached"))) : null,
        g.contributors !== undefined ? h("div.stat", null, h("strong", null, fmt(g.contributors)), h("span.sub", null, t("goals.contributors2"))) : null,
      ),
      g.inTopRank ? h("p.ok", null, t("goals.areTopContributors", { topRankSize: g.topRankSize ?? "" })) : null,
      h("div.mission-foot", null, h("span", { class: left < 86400000 ? "warn" : "" }, t("goals.ends", { relTime: relTime(g.expiry) })), g.total !== undefined ? h("span.sub", null, t("goals.total", { total: fmt(g.total) })) : null, h("span.sub", null, t("common.updated", { relTime: relTime(g.updated) }))),
    );
  }

  private inaraSection(): HTMLElement {
    const list = this.inara?.filter((g) => !g.isCompleted) ?? [];
    return h(
      "section.card",
      null,
      h("div.sync-head", null, h("div", null, h("h3", null, t("goals.allCurrentGoals")), h("p.sub", null, t("goals.throughInaraApiKeySyncPage"))), h("button.ghost", { onclick: () => this.loadInara(), disabled: this.loading }, this.loading ? t("goals.loading") : t("goals.load"))),
      this.inaraError ? h("p.error", null, this.inaraError) : null,
      this.inara
        ? list.length
          ? h(
              "table.table",
              null,
              h("thead", null, h("tr", null, h("th", null, t("goals.goal")), h("th", null, t("common.location")), h("th.num", null, t("goals.tier")), h("th.num", null, t("goals.contributors")), h("th", null, t("common.end")), h("th", null, ""))),
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
          : h("p.empty", null, t("goals.noCurrentGoalsInara"))
        : null,
    );
  }
}
