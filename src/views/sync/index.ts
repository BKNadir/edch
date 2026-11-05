// Sync page: sharing the journal with EDDN, EDSM and Inara (what is sent, keys, counters and the
// last exchanges).

import { locale, t } from "../../platform/i18n.js";
import { openUrl } from "../../platform/bridge.js";
import { h, icon, replace } from "../../ui/dom.js";
import type { Ctx, View } from "../../state/context.js";
import type { SyncSettings } from "../../state/syncSettings.js";

/** EDMC-style connections: EDDN, EDSM, Inara. */
export class SyncView implements View {
  private root?: HTMLElement;
  private activity = h("div.sync-activity");
  constructor(private ctx: Ctx) {}

  mount(root: HTMLElement) {
    this.root = root;
    const s = this.ctx.store.state.settings.sync;
    const set = (patch: Partial<SyncSettings>) =>
      this.ctx.store.updateSettings({ sync: { ...this.ctx.store.state.settings.sync, ...patch } });
    const toggle = (checked: boolean, onChange: (v: boolean) => void) =>
      h(
        "label.switch",
        null,
        h("input", {
          type: "checkbox",
          checked,
          onchange: (e: Event) => onChange((e.target as HTMLInputElement).checked),
        }),
        h("span"),
      );
    const text = (label: string, value: string, onChange: (v: string) => void, secret = false, help?: string) =>
      h(
        "label.field",
        null,
        h("span", null, label),
        h("input", {
          type: secret ? "password" : "text",
          value,
          spellcheck: false,
          autocomplete: "off",
          onchange: (e: Event) => onChange((e.target as HTMLInputElement).value.trim()),
        }),
        help ? h("small", null, help) : null,
      );

    replace(
      root,
      h(
        "header.view-head",
        null,
        h("h1", null, t("sync.synchronisation")),
        h("p.sub", null, t("sync.whatEdmcDoesShareWhatSee")),
      ),
      h(
        "div.settings",
        null,
        h(
          "section.card",
          null,
          h(
            "div.sync-head",
            null,
            h(
              "div",
              null,
              h("h3", null, t("sync.eddnCommunityDataNetwork")),
              h("p.sub", null, t("sync.sendsMarketsOutfittingShipyardsSystemsScans")),
            ),
            toggle(s.eddn, (v) => set({ eddn: v })),
          ),
          h("p.sub", null, t("sync.noAccountNeededNothingPersonalSent")),
        ),
        h(
          "section.card",
          null,
          h(
            "div.sync-head",
            null,
            h(
              "div",
              null,
              h("h3", null, t("sync.edsmFlightLog")),
              h("p.sub", null, t("sync.sendsJournalEdsmTravelDiscoveriesInventory")),
            ),
            toggle(s.edsm, (v) => set({ edsm: v })),
          ),
          text(t("sync.cmdrNameEdsm"), s.edsmCommander, (v) => set({ edsmCommander: v })),
          text(t("sync.edsmApiKey"), s.edsmKey, (v) => set({ edsmKey: v }), true, t("sync.edsmProfileSettingsApiKey")),
          h(
            "button.inline-link",
            { onclick: () => openUrl("https://www.edsm.net/en/settings/api") },
            t("sync.openEdsmApiKeyPage"),
          ),
        ),
        h(
          "section.card",
          null,
          h(
            "div.sync-head",
            null,
            h(
              "div",
              null,
              h("h3", null, t("sync.inaraCommanderProfile")),
              h("p.sub", null, t("sync.updatesLocationShipMaterialsEngineersInara")),
            ),
            toggle(s.inara, (v) => set({ inara: v })),
          ),
          text(
            t("sync.personalInaraApiKey"),
            s.inaraKey,
            (v) => set({ inaraKey: v }),
            true,
            t("sync.inaraSettingsApiKeyInaraMay"),
          ),
          h(
            "button.inline-link",
            { onclick: () => openUrl("https://inara.cz/elite/settings-api/") },
            t("sync.openInaraApiKeyPage"),
          ),
        ),
        h("section.card", null, h("h3", null, t("common.activity")), this.activity),
      ),
    );
    this.update();
  }

  update() {
    if (!this.root) return;
    const stats = this.ctx.sync?.stats;
    if (!stats) {
      replace(this.activity, h("p.sub", null, t("common.availableAppNotDemoMode")));
      return;
    }
    const counter = (name: string) =>
      h(
        "div.counter",
        null,
        h("strong", null, String(stats.sent[name] ?? 0)),
        h("span", null, name),
        stats.failed[name] ? h("small.bad", null, t("sync.failed", { count: stats.failed[name] })) : null,
      );
    replace(
      this.activity,
      h("div.counters", null, counter("EDDN"), counter("EDSM"), counter("Inara")),
      stats.log.length
        ? h(
            "ul.sync-log",
            null,
            stats.log.map((l) =>
              h(
                "li",
                { class: l.ok ? "ok" : "bad" },
                l.ok ? icon("check") : icon("warn"),
                h("span.when", null, new Date(l.at).toLocaleTimeString(locale())),
                h("strong", null, l.service),
                h("span", null, l.what),
                l.detail ? h("span.sub", null, l.detail) : null,
              ),
            ),
          )
        : h("p.sub", null, t("sync.nothingSentYetStartsNextGame")),
    );
  }
}
