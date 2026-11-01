import { massacreStacks, type Mission } from "../activity.js";
import { isRemote } from "../bridge.js";
import { callout, fmt, h, icon, replace, toast } from "../dom.js";
import { activeMissions, isShared, setShared, syncWing, wingView } from "../live.js";
import { notify, playTone, TONES } from "../notifier.js";
import { newWingCode, type NotifySettings, type WingSettings } from "../store.js";
import { credits, hoursLeft, relTime } from "../time.js";
import type { Ctx, View } from "../context.js";
import { copySystem } from "./results.js";
import { findHotspots, findSupply, HOTSPOT_NAMES, type Hotspot, type Offer } from "../sourcing.js";
import { gameName } from "../i18n.js";

/** Missions where the commander has to get the goods: sourcing, mining, donations. */
export const needsSourcing = (m: Mission) => Boolean(m.commodityId) && !/delivery|courier|passenger|sightseeing/i.test(m.name);

interface Sourcing {
  loading: boolean;
  error?: string;
  offers?: Offer[];
  hotspots?: Hotspot[];
}

function kindOf(m: Mission): string {
  const n = m.name.toLowerCase();
  if (m.killCount || n.includes("massacre")) return "Massacre";
  if (n.includes("assassin")) return "Assassinat";
  if (n.includes("courier")) return "Coursier";
  if (n.includes("mining")) return "Minage";
  if (n.includes("collect") || n.includes("altruism")) return "Approvisionnement";
  if (n.includes("delivery")) return "Livraison";
  if (n.includes("passenger") || n.includes("sightseeing") || m.passengers) return "Passagers";
  if (n.includes("salvage")) return "Récupération";
  if (n.includes("onfoot") || n.includes("on_foot")) return "À pied";
  return "Mission";
}

function progressOf(m: Mission): HTMLElement | null {
  if (m.killCount) {
    const pct = Math.min(100, (m.kills / m.killCount) * 100);
    return h("div.mission-progress", null, h("div.bar", null, h("span", { style: { width: `${pct}%` } })), h("span.sub", null, `${m.kills} / ${m.killCount} éliminations`));
  }
  if (m.total) {
    const done = m.delivered ?? 0;
    return h("div.mission-progress", null, h("div.bar", null, h("span", { style: { width: `${Math.min(100, (done / m.total) * 100)}%` } })), h("span.sub", null, `${fmt(done)} / ${fmt(m.total)} livrés`));
  }
  return null;
}

/** A field being typed in: don't redraw under the user's fingers. */
export function busy(root?: HTMLElement): boolean {
  const a = document.activeElement;
  return Boolean(root && a && root.contains(a) && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName));
}

export const sys = (name?: string) => (name ? h("button.sys", { title: "Copier", onclick: () => copySystem(name) }, icon("copy"), h("span", null, name)) : null);

export class MissionsView implements View {
  private root?: HTMLElement;
  private sourcing = new Map<number, Sourcing>();
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    this.render();
  }

  update() {
    if (!busy(this.root)) this.render();
  }

  private render() {
    if (!this.root) return;
    const missions = activeMissions();
    const wingCount = missions.filter((m) => m.wing).length;
    replace(
      this.root,
      h("header.view-head", null, h("div", null, h("h1", null, "Missions"), h("p.sub", null, `${missions.length} missions en cours · ${wingCount} d'escadrille`))),
      callout(
        "info",
        "Page en cours de développement",
        "Toutes les fonctions ne sont pas encore opérationnelles à 100 %. Le jeu n'écrit rien dans le journal quand une mission est partagée ou reçue en escadrille, donc le suivi des missions partagées reste approximatif.",
      ),
      this.massacre(missions),
      this.list(missions),
      this.wing(),
      isRemote() ? null : this.notifications(),
    );
  }

  private list(missions: Mission[]): HTMLElement {
    if (!missions.length)
      return h("section.card", null, h("p.empty", null, "Aucune mission en cours. Les missions acceptées en jeu apparaissent ici, avec leur objectif, leur destination et le temps restant."));
    return h(
      "div.mission-grid",
      null,
      missions.map((m) => {
        const left = hoursLeft(m.expiry);
        return h(
          "article.card.mission",
          { class: m.status === "redirected" ? "redirected" : "" },
          h(
            "div.mission-head",
            null,
            h("h3", null, m.title),
            h(
              "div.badges",
              null,
              h("span.badge", null, kindOf(m)),
              m.wing ? h("span.badge.hit", null, "Escadrille") : null,
              m.status === "redirected" ? h("span.badge.ok", null, "Objectif atteint") : null,
            ),
          ),
          h("p.sub", null, m.faction),
          m.status === "redirected"
            ? h("p.mission-dest", null, h("span", null, "Retourne à "), m.destStation ? h("strong", null, m.destStation) : null, m.destStation && m.destSystem ? " · " : null, sys(m.destSystem))
            : m.destSystem || m.destStation
              ? h("p.mission-dest", null, h("span", null, "Destination : "), m.destStation ? h("strong", null, m.destStation) : null, m.destStation && m.destSystem ? " · " : null, sys(m.destSystem))
              : null,
          m.killCount && m.targetFaction ? h("p.sub", null, `Cible : ${m.targetFaction}`) : null,
          m.commodity && m.count ? h("p.sub", null, `${fmt(m.count)} × `, h("span", null, m.commodity)) : null,
          progressOf(m),
          needsSourcing(m) ? this.sourcingBlock(m) : null,
          h(
            "div.mission-foot",
            null,
            m.expiry ? h("span", { class: left < 6 ? "warn" : "" }, `Expire ${relTime(m.expiry)}`) : null,
            m.reward ? h("span", null, `${credits(m.reward)} Cr`) : null,
            m.influence ? h("span.sub", null, `Influence ${m.influence}`) : null,
          ),
          this.shareControl(m),
        );
      }),
    );
  }

  private commodityName(m: Mission): string {
    return this.ctx.game.data.commodities.find((c) => c.id === m.commodityId)?.name ?? m.commodity ?? "";
  }

  private async loadSourcing(m: Mission) {
    const name = this.commodityName(m);
    const need = Math.max(1, (m.count ?? 1) - (m.delivered ?? 0) - (this.ctx.store.state.cmdr.cargo[m.commodityId ?? ""] ?? 0));
    const state: Sourcing = { loading: true };
    this.sourcing.set(m.id, state);
    this.render();
    try {
      const hot = HOTSPOT_NAMES[m.commodityId ?? ""];
      state.offers = await findSupply(this.ctx, name, Math.min(need, 1000));
      if (hot && /mining/i.test(m.name)) state.hotspots = await findHotspots(this.ctx, hot);
    } catch (e) {
      state.error = String((e as Error)?.message ?? e);
    }
    state.loading = false;
    this.render();
  }

  private sourcingBlock(m: Mission): HTMLElement {
    const st = this.sourcing.get(m.id);
    const tagLabel: Record<string, string> = { best: "Meilleur compromis", cheapest: "Le moins cher", nearest: "Le plus proche", freshest: "Prix le plus récent" };
    const need = Math.max(0, (m.count ?? 0) - (m.delivered ?? 0));
    if (!st)
      return h(
        "div.mission-source",
        null,
        h("button.ghost.small", { onclick: () => this.loadSourcing(m) }, icon("search"), /mining/i.test(m.name) ? " Où le trouver (achat ou minage)" : " Où l'acheter"),
      );
    if (st.loading) return h("div.mission-source", null, h("span.spinner"), " Recherche Spansh…");
    return h(
      "div.mission-source",
      null,
      st.error ? h("p.error", null, st.error) : null,
      st.offers?.length
        ? h(
            "ul.offers",
            null,
            st.offers.map((o) => {
              const profit = m.reward && need ? m.reward - o.price * need : null;
              return h(
                "li",
                { class: o.tags.includes("best") ? "best" : "" },
                h("div.offer-head", null, h("strong", null, o.station), " · ", sys(o.system), o.largePad ? h("span.badge.muted", null, "L") : null, ...o.tags.map((t) => h("span.badge.hit", null, tagLabel[t]))),
                h(
                  "div.offer-line",
                  null,
                  h("span", null, `${fmt(o.price)} Cr/t`),
                  h("span.sub", null, `stock ${fmt(o.supply)}`),
                  h("span.sub", null, `${fmt(Math.round(o.distance))} al`),
                  o.arrival ? h("span.sub", null, `${fmt(Math.round(o.arrival))} ls`) : null,
                  o.updated ? h("span.sub", null, `prix ${relTime(new Date(Date.now() - o.ageDays * 86400000).toISOString())}`) : null,
                  profit !== null ? h("span", { class: profit > 0 ? "ok" : "warn" }, `bénéfice ≈ ${credits(profit)} Cr`) : null,
                ),
              );
            }),
          )
        : !st.error
          ? h("p.sub", null, `Aucune station ne vend ${gameName(this.commodityName(m))} dans le rayon choisi.`)
          : null,
      st.hotspots?.length
        ? h(
            "div",
            null,
            h("h4", null, "Points chauds de minage les plus proches"),
            h("ul.offers", null, st.hotspots.map((x) => h("li", null, h("div.offer-head", null, h("strong", null, x.ring), " · ", sys(x.system), h("span.sub", null, ` ${fmt(Math.round(x.distance))} al · ${x.count} point(s) chaud(s)`))))),
          )
        : null,
      h("button.ghost.small", { onclick: () => this.loadSourcing(m) }, "Actualiser"),
    );
  }

  /** Share / stop sharing with the wing (only when the wing link is on, on the PC). */
  private shareControl(m: Mission): HTMLElement | null {
    const w = this.ctx.store.state.settings.wing;
    if (isRemote() || !w.enabled || !wingView()) return null;
    const shared = isShared(m);
    const manual = w.shared.includes(m.id);
    const auto = shared && !manual;
    return h(
      "div.mission-share",
      null,
      shared ? h("span.badge.ok", null, auto ? (w.autoShare && m.wing ? "Partagée automatiquement" : "Partagée (mission de l'escadrille)") : "Partagée avec l'escadrille") : null,
      manual
        ? h("button.ghost.small", { onclick: () => (setShared(m.id, false), this.render()) }, "Ne plus partager")
        : !shared
          ? h("button.ghost.small", { onclick: () => (setShared(m.id, true), this.render()) }, "Partager avec l'escadrille")
          : null,
    );
  }

  private massacre(missions: Mission[]): HTMLElement | null {
    const stacks = massacreStacks(missions);
    if (!stacks.length) return null;
    return h(
      "section.card",
      null,
      h("h3", null, "Missions de massacre empilées"),
      h("p.sub", null, "Chaque élimination compte pour une mission par faction donneuse : il faut donc autant d'éliminations que la plus grosse pile."),
      stacks.map((s) =>
        h(
          "div.stack",
          null,
          h("div.stack-head", null, h("strong", null, s.target), h("span", null, `${s.done} / ${s.needed} éliminations`), h("div.bar", null, h("span", { style: { width: `${s.needed ? (s.done / s.needed) * 100 : 0}%` } }))),
          h(
            "table.table",
            null,
            h("thead", null, h("tr", null, h("th", null, "Faction donneuse"), h("th", null, "Missions"), h("th", null, "Éliminations"), h("th", null, "Récompense"))),
            h(
              "tbody",
              null,
              s.issuers.map((i) => h("tr", null, h("td", null, i.faction), h("td", null, String(i.missions)), h("td", null, `${i.kills} / ${i.total}`), h("td", null, `${credits(i.reward)} Cr`))),
            ),
          ),
        ),
      ),
    );
  }

  private wing(): HTMLElement {
    const store = this.ctx.store;
    const s = store.state.settings.wing;
    const set = (patch: Partial<WingSettings>) => {
      store.updateSettings({ wing: { ...store.state.settings.wing, ...patch } });
      void syncWing();
    };
    const view = wingView();
    const parts: (HTMLElement | null)[] = [h("h3", null, "Escadrille partagée")];
    if (!isRemote()) {
      const code = h("input", { type: "text", value: s.code, placeholder: "XXXX-XXXX-XXXX-XXXX", spellcheck: false, autocomplete: "off" }) as HTMLInputElement;
      parts.push(
        h(
          "p.sub",
          null,
          "Chaque membre de l'escadrille qui utilise EDCH saisit le même code. Les missions que tu choisis de partager sont envoyées aux autres, chiffrées avec ce code, via le service gratuit ntfy.sh : personne d'autre ne peut les lire.",
        ),
        h(
          "div.wing-form",
          null,
          h("label.check", null, h("input", { type: "checkbox", checked: s.enabled, onchange: (e: Event) => set({ enabled: (e.target as HTMLInputElement).checked }) }), " Activer le partage"),
          h(
            "label.field",
            null,
            h("span", null, "Code de l'escadrille"),
            h(
              "div.row",
              null,
              code,
              h("button.ghost", { onclick: () => set({ code: code.value.trim() }) }, "Enregistrer"),
              h(
                "button.ghost",
                {
                  onclick: () => {
                    const c = newWingCode();
                    set({ code: c });
                    toast("Nouveau code créé : donne-le aux autres membres");
                    this.render();
                  },
                },
                "Créer un code",
              ),
            ),
          ),
          h(
            "label.field",
            null,
            h("span", null, "Nom affiché"),
            h("input", { type: "text", value: s.name, placeholder: store.state.cmdr.commander ?? "CMDR", onchange: (e: Event) => set({ name: (e.target as HTMLInputElement).value }) }),
          ),
          h("label.check", null, h("input", { type: "checkbox", checked: s.notifyNew, onchange: (e: Event) => set({ notifyNew: (e.target as HTMLInputElement).checked }) }), " Prévenir quand un membre a une mission d'escadrille que je n'ai pas"),
          h("label.check", null, h("input", { type: "checkbox", checked: s.notifyAccept, onchange: (e: Event) => set({ notifyAccept: (e.target as HTMLInputElement).checked }) }), " Prévenir quand un membre accepte une mission que je partage"),
          h("label.check", null, h("input", { type: "checkbox", checked: s.notifyAll, onchange: (e: Event) => set({ notifyAll: (e.target as HTMLInputElement).checked }) }), " Prévenir quand toute l'escadrille a accepté une mission"),
          h("label.check", null, h("input", { type: "checkbox", checked: s.autoShare, onchange: (e: Event) => set({ autoShare: (e.target as HTMLInputElement).checked }) }), " Partager automatiquement toutes mes missions d'escadrille"),
          h("p.sub", null, "Sinon, partage chaque mission avec le bouton « Partager avec l'escadrille » de sa carte. Une mission qu'un membre a partagée et que tu acceptes est partagée d'office : les autres voient que tu l'as prise."),
        ),
      );
    }
    if (view) {
      const names = new Map<string, string>([[view.me.id, view.me.name], ...view.members.map((m) => [m.id, m.name] as [string, string])]);
      const status = view.status === "ok" ? h("span.badge.ok", null, "Connecté") : view.status === "error" ? h("span.badge.warn", null, view.error || "Erreur") : h("span.badge", null, "Connexion…");
      parts.push(
        h("div.wing-members", null, status, h("span.badge.hit", null, view.me.name, " (toi)"), view.members.map((m) => h("span.badge", null, m.name, m.left ? " (parti)" : null, ` · ${relTime(m.at)}`))),
        view.rows.length
          ? h(
              "table.table.wing-table",
              null,
              h("thead", null, h("tr", null, h("th", null, "Mission"), h("th", null, "Destination"), h("th", null, "Expire"), h("th", null, "Acceptée par"))),
              h(
                "tbody",
                null,
                view.rows.map((r) =>
                  h(
                    "tr",
                    { class: r.mine ? "" : "not-mine" },
                    h("td", null, h("strong", null, r.mission.title), h("div.sub", null, r.mission.faction)),
                    h("td", null, r.mission.destStation ? `${r.mission.destStation} · ` : "", r.mission.destSystem ?? ""),
                    h("td", null, relTime(r.mission.expiry)),
                    h(
                      "td",
                      null,
                      r.holders.map((id) => h("span.badge.ok", null, `✓ ${names.get(id) ?? "?"}`)),
                      r.missing.map((id) => h("span.badge.muted", null, `✗ ${names.get(id) ?? "?"}`)),
                    ),
                  ),
                ),
              ),
            )
          : h("p.empty", null, "Aucune mission d'escadrille partagée pour l'instant."),
      );
    } else if (s.enabled && !isRemote()) {
      parts.push(h("p.sub", null, "Saisis ou crée un code (au moins 8 caractères) pour rejoindre l'escadrille."));
    }
    return h("section.card.wing", null, parts);
  }

  private notifications(): HTMLElement {
    const store = this.ctx.store;
    const n = store.state.settings.notify;
    const set = (patch: Partial<NotifySettings>) => store.updateSettings({ notify: { ...store.state.settings.notify, ...patch } });
    return h(
      "section.card",
      null,
      h("h3", null, "Notifications"),
      h("p.sub", null, "Pas de fenêtre Windows : un son et/ou la languette sur le bord droit qui clignote. Clique sur la languette pour voir l'aperçu, clique ailleurs pour le refermer."),
      h(
        "div.notify-form",
        null,
        h("label.check", null, h("input", { type: "checkbox", checked: n.sound, onchange: (e: Event) => set({ sound: (e.target as HTMLInputElement).checked }) }), " Son"),
        h(
          "select",
          { "data-no-tr": "", onchange: (e: Event) => set({ tone: (e.target as HTMLSelectElement).value }) },
          TONES.map(([v, l]) => h("option", { value: v, selected: v === n.tone }, l)),
        ),
        h("input", { type: "range", min: "0", max: "1", step: "0.05", value: String(n.volume), title: "Volume", onchange: (e: Event) => set({ volume: Number((e.target as HTMLInputElement).value) }) }),
        h("button.ghost.small", { onclick: () => playTone(store.state.settings.notify.tone, store.state.settings.notify.volume) }, "Écouter"),
      ),
      h(
        "div.notify-form",
        null,
        h("label.check", null, h("input", { type: "checkbox", checked: n.color, onchange: (e: Event) => set({ color: (e.target as HTMLInputElement).checked }) }), " Couleur"),
        h("input", { type: "color", value: n.flash, onchange: (e: Event) => set({ flash: (e.target as HTMLInputElement).value }) }),
        h("button.ghost.small", { onclick: () => notify("Test de notification") }, "Tester"),
      ),
      h("label.check", null, h("input", { type: "checkbox", checked: n.hideTab, onchange: (e: Event) => set({ hideTab: (e.target as HTMLInputElement).checked }) }), " Masquer la languette"),
    );
  }
}
