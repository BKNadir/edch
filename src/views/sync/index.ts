// Sync page: sharing the journal with EDDN, EDSM and Inara (what is sent, keys, counters and the
// last exchanges), and the link to the squadron's Discord bot (EDCH-Discord) for BGS reports.

import { locale, t } from "../../platform/i18n.js";
import { openUrl, trustBot } from "../../platform/bridge.js";
import { botLog, botSync, discordEvery, sendBgsNow } from "../../features/bgs/botSync.js";
import { BOT_SOURCE, readBotKey, SHARED_BOT } from "../../services/discordBot.js";
import { dialog } from "../../ui/dialog.js";
import { relTime } from "../../ui/format.js";
import { h, icon, replace, toast } from "../../ui/dom.js";
import type { Ctx, View } from "../../state/context.js";
import type { DiscordEvery, SyncSettings } from "../../state/syncSettings.js";
import { shareModeSwitch } from "../shared/shareModeSwitch.js";
import { clearShared } from "../../state/bgsShared.js";
import { log } from "../../platform/logger.js";

/** EDMC-style connections: EDDN, EDSM, Inara. */
export class SyncView implements View {
  private root?: HTMLElement;
  private activity = h("div.sync-activity");
  private discordStatus = h("div.discord-status");
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
            h("div", null, h("h3", null, t("shareMode.title")), h("p.sub", null, t("shareMode.intro"))),
            shareModeSwitch(this.ctx.store),
          ),
          h(
            "ul.share-mode-help",
            null,
            h("li", null, h("strong", null, t("shareMode.normal")), " — ", t("shareMode.normalHelp")),
            h("li", null, h("strong", null, t("shareMode.bgs")), " — ", t("shareMode.bgsHelp")),
            h("li", null, h("strong", null, t("shareMode.invisible")), " — ", t("shareMode.invisibleHelp")),
          ),
          h("p.sub", null, t("shareMode.othersStillShare")),
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
        this.discordCard(toggle),
        h("section.card", null, h("h3", null, t("common.activity")), this.activity),
      ),
    );
    this.update();
  }

  /**
   * "Connect to the Discord bot": the key from `/bgs link`, the switch that sends the BGS reports,
   * and the link to the guide for hosting the squadron's own bot.
   */
  private discordCard(toggle: (checked: boolean, onChange: (v: boolean) => void) => HTMLElement): HTMLElement {
    const store = this.ctx.store;
    const set = (patch: Partial<SyncSettings>) =>
      store.updateSettings({ sync: { ...store.state.settings.sync, ...patch } });
    const s = store.state.settings.sync;
    const keyInput = h("input", {
      type: "password",
      value: s.discordKey,
      spellcheck: false,
      autocomplete: "off",
      placeholder: "edch1.…",
      onchange: (e: Event) => void this.setDiscordKey((e.target as HTMLInputElement).value.trim(), keyInput),
    }) as HTMLInputElement;
    return h(
      "section.card",
      null,
      h(
        "div.sync-head",
        null,
        h("div", null, h("h3", null, t("discord.title")), h("p.sub", null, t("discord.intro"))),
        toggle(s.discord, (on) => {
          set({ discord: on });
          void sendBgsNow(store);
        }),
      ),
      h("label.field", null, h("span", null, t("discord.key")), keyInput, h("small", null, t("discord.keyHelp"))),
      h(
        "label.field",
        null,
        h("span", null, t("discord.every")),
        h(
          "select",
          {
            onchange: (e: Event) => set({ discordEvery: (e.target as HTMLSelectElement).value as DiscordEvery }),
          },
          (
            [
              ["now", t("discord.everyNow")],
              ["5min", t("discord.every5")],
              ["15min", t("discord.every15")],
            ] as [DiscordEvery, string][]
          ).map(([value, label]) => h("option", { value, selected: discordEvery(s.discordEvery) === value }, label)),
        ),
      ),
      this.discordStatus,
      h("div.row", null, h("button.ghost", { onclick: () => void sendBgsNow(store) }, t("discord.sendNow"))),
      // No bot on the squadron's server yet: the guide to host one's own.
      h("div.row", null, h("button.inline-link", { onclick: () => openUrl(BOT_SOURCE) }, t("discord.hostOwn"))),
      h("p.sub", null, t("discord.addBotHelp")),
    );
  }

  /** A pasted key: checked, and a bot other than the shared one is confirmed by the member first. */
  private async setDiscordKey(key: string, input: HTMLInputElement) {
    const store = this.ctx.store;
    const set = (patch: Partial<SyncSettings>) =>
      store.updateSettings({ sync: { ...store.state.settings.sync, ...patch } });
    if (!key) {
      set({ discordKey: "", discordBot: "", discord: false });
      // Unlinked: what the squadron shared isn't shown any more.
      clearShared();
      log.info("discord", "Discord bot unlinked");
      await trustBot(null).catch(() => undefined);
      this.showDiscordStatus();
      return;
    }
    const claims = readBotKey(key);
    if (!claims) {
      input.value = store.state.settings.sync.discordKey;
      toast(t("discordError.badKey"));
      return;
    }
    let bot = "";
    if (claims.bot !== SHARED_BOT) {
      if (claims.bot !== store.state.settings.sync.discordBot) {
        const answer = await dialog(
          t("discord.otherBotTitle"),
          [h("p", null, t("discord.otherBot", { host: new URL(claims.bot).host }))],
          [
            { label: t("common.cancel"), value: "no" },
            { label: t("discord.trustBot"), value: "yes", primary: true },
          ],
        );
        if (answer !== "yes") {
          input.value = store.state.settings.sync.discordKey;
          return;
        }
      }
      bot = claims.bot;
    }
    await trustBot(bot || null).catch(() => undefined);
    // Another server: the previous squadron's systems are not this one's.
    const previous = readBotKey(store.state.settings.sync.discordKey);
    if (previous && previous.guildId !== claims.guildId) clearShared();
    set({ discordKey: key, discordBot: bot });
    // Never the key itself, nor the server or member it names.
    log.info("discord", `Discord bot linked (${bot ? "a squadron's own bot, confirmed" : "the shared bot"})`);
    void sendBgsNow(store);
  }

  private showDiscordStatus() {
    const s = this.ctx.store.state.settings.sync;
    const claims = s.discordKey ? readBotKey(s.discordKey) : null;
    const lines: (Node | string | null)[] = [];
    if (!claims) lines.push(h("p.sub", null, t("discord.notLinked")));
    else {
      const host = new URL(claims.bot).host;
      lines.push(
        h(
          "p.sub",
          null,
          botSync.factions?.length
            ? t("discord.linkedFaction", { faction: botSync.factions.join(", "), host })
            : t("discord.linked", { host }),
        ),
      );
      if (botSync.state === "sending") lines.push(h("p.sub", null, h("span.spinner"), " ", t("discord.sending")));
      else if (botSync.state === "error" && botSync.error)
        lines.push(h("p.bad", null, icon("warn"), " ", t(`discordError.${botSync.error}`)));
      else if (botSync.lastSent)
        lines.push(
          h("p.sub", null, t("discord.lastSent", { time: relTime(botSync.lastSent), count: botSync.lastCount ?? 0 })),
        );
      if (!s.discord) lines.push(h("p.sub", null, t("discord.off")));
    }
    replace(this.discordStatus, ...lines);
  }

  update() {
    if (!this.root) return;
    this.showDiscordStatus();
    const stats = this.ctx.sync?.stats;
    if (!stats) {
      replace(this.activity, h("p.sub", null, t("common.availableAppNotDemoMode")));
      return;
    }
    const counter = (name: string, sent: number, failed: number) =>
      h(
        "div.counter",
        null,
        h("strong", null, String(sent)),
        h("span", null, name),
        failed ? h("small.bad", null, t("sync.failed", { count: failed })) : null,
      );
    const service = (name: string) => counter(name, stats.sent[name] ?? 0, stats.failed[name] ?? 0);
    // The Discord bot's exchanges, in the same list (what was sent or received, never the key).
    const discordLines = botLog.entries.map((e) => ({
      at: e.at,
      ok: e.ok,
      service: "Discord",
      what: e.error
        ? t(`discordError.${e.error}`)
        : e.what === "report"
          ? t("discord.logReport", { count: e.count, systems: e.systems ?? 0 })
          : t("discord.logSystems", { count: e.count }),
      detail: undefined as string | undefined,
    }));
    const lines = [...stats.log, ...discordLines].sort((a, b) => b.at - a.at).slice(0, 60);
    const discordOn = this.ctx.store.state.settings.sync.discord || botLog.entries.length > 0;
    replace(
      this.activity,
      h(
        "div.counters",
        null,
        service("EDDN"),
        service("EDSM"),
        service("Inara"),
        discordOn ? counter("Discord", botLog.sent, botLog.failed) : null,
      ),
      lines.length
        ? h(
            "ul.sync-log",
            null,
            lines.map((l) =>
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
