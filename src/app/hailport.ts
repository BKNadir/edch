// Wiring of the Hailport link: starts or stops it with its setting, gives it EDCH's commands,
// events and context (features/hailport), and passes it the live journal events. Only on the PC,
// in builds that offer it (not the portable exe), and only when the user turned it on.

import { runHailportCommand, hailportCommands } from "../features/hailport/commands.js";
import { eventsFromJournal, hailportContext, hailportEvents, missionsEndingSoon } from "../features/hailport/events.js";
import { hailportAvailable } from "../platform/bridge.js";
import { useTextsOf } from "../platform/i18n.js";
import { log } from "../platform/logger.js";
import { SOFTWARE_VERSION } from "../platform/version.js";
import { HailportClient } from "../services/hailport/client.js";
import { hailportState, setHailportOffer, setHailportState } from "../services/hailport/status.js";
import type { Ctx } from "../state/context.js";
import { loadHailportToken, saveHailportToken } from "../state/hailportSettings.js";
import { onLiveJournal } from "./journalFeed.js";

/** Missions ending soon are looked for this often. */
const ENDING_CHECK_MS = 60_000;

export async function startHailport(ctx: Ctx) {
  const available = await hailportAvailable();
  if (!available) return;
  const { store } = ctx;
  const hailport = new HailportClient({
    version: SOFTWARE_VERSION,
    useLanguage: useTextsOf,
    commands: hailportCommands,
    events: hailportEvents,
    run: (command, args, language) => runHailportCommand(ctx, command, args, language),
    context: () => hailportContext(ctx),
    loadToken: loadHailportToken,
    saveToken: (token) => {
      if (!saveHailportToken(token)) log.warn("hailport", "Hailport's token was not in the expected form: not kept");
    },
    onState: setHailportState,
  });

  let client: HailportClient | null = null;
  let running: { port: number } | null = null;
  const apply = () => {
    const { enabled, port } = store.state.settings.hailport;
    if (!enabled) {
      if (running) hailport.stop();
      running = null;
      client = null;
      return;
    }
    if (running?.port === port) return;
    running = { port };
    client = hailport;
    void hailport.start(port);
  };
  setHailportOffer(true, () => {
    if (!store.state.settings.hailport.enabled) return;
    running = { port: store.state.settings.hailport.port };
    void hailport.start(running.port);
  });
  apply();
  store.subscribe(() => {
    apply();
    client?.contextChanged();
  });

  onLiveJournal((events) => {
    if (!client) return;
    for (const event of eventsFromJournal(ctx, events, client.currentLanguage))
      client.event(event.name, event.data, event.say);
  });
  window.setInterval(() => {
    if (!client || hailportState() !== "connected") return;
    for (const event of missionsEndingSoon(ctx, client.currentLanguage))
      client.event(event.name, event.data, event.say);
  }, ENDING_CHECK_MS);
}
