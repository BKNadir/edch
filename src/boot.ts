// Entry point. Picks the language and loads its texts BEFORE the rest of the app is imported, so
// every module (including module-level constants) can use t(). Only light modules are imported
// statically here: the app itself (main.ts) is loaded with a dynamic import once i18n is ready.

import { forgetRemoteToken, installerLanguage, isTauri, remoteFetch, remoteState } from "./platform/bridge.js";
import { h, replace } from "./ui/dom.js";
import { browserLang, guessLang, initI18n, LANGS, saveLang, savedLang, t } from "./platform/i18n.js";

/** Served by EDCH's local server? "paired" when this device holds the current secret. */
async function detectRemote(): Promise<"paired" | "unpaired" | null> {
  try {
    const res = await remoteFetch("/api/hello");
    if (!res.ok) return null;
    const body = await res.json();
    if (body?.remote !== true) return null;
    if (body.paired) return "paired";
    forgetRemoteToken(); // stale secret ("New code" on the PC)
    return "unpaired";
  } catch {
    return null;
  }
}

/** The PC's language, so the phone shows the same one until the user picks another. */
async function remoteLanguage(): Promise<string | null> {
  try {
    const reply = await Promise.race([remoteState(0), new Promise<null>((ok) => setTimeout(() => ok(null), 4000))]);
    return typeof reply?.state?.lang === "string" ? reply.state.lang : null;
  } catch {
    return null;
  }
}

async function boot() {
  const app = document.getElementById("app")!;
  // Language: chosen once (pre-selected from the installer / Windows language), changeable in Settings.
  // A phone served by EDCH's local server follows the PC's language until it picks its own.
  const remoteMode = isTauri() ? null : await detectRemote();
  let code = savedLang();
  if (remoteMode) {
    // A phone is the PC's screen elsewhere: same language, no language screen.
    code = (remoteMode === "paired" ? await remoteLanguage() : null) ?? code ?? browserLang();
  } else if (!code || !LANGS.some((l) => l.code === code)) {
    code = await pickLanguage(app, guessLang(await installerLanguage()));
    saveLang(code);
  }
  await initI18n(code);
  if (remoteMode === "unpaired") {
    replace(app, unpairedScreen());
    return;
  }
  const { startApp } = await import("./app/main.js");
  await startApp(code, remoteMode);
}

/** Shown on a phone that reached the local server without (or with an outdated) QR code. */
function unpairedScreen(): HTMLElement {
  const expired = location.hash === "#expired";
  return h(
    "div.lang-screen",
    null,
    h("img", { src: "favicon.png", alt: "" }),
    h("h1", null, "EDCH"),
    h("h2", null, t("boot.deviceNotConnected")),
    expired ? h("p.warn", null, t("boot.qrCodeExpired")) : null,
    h("p", null, t("boot.scanQrCode")),
    h("p.sub", null, t("boot.openInRealBrowser")),
    h("button.primary", { onclick: () => location.replace("/") }, t("common.retry")),
  );
}

/** First-run language screen. Labels are in each language, so it needs no translation. */
function pickLanguage(app: HTMLElement, preselected: string): Promise<string> {
  return new Promise((resolve) => {
    let chosen = preselected;
    const buttons = LANGS.map((l) =>
      h(
        "button.lang-choice",
        { class: l.code === chosen ? "active" : "", "data-code": l.code, onclick: () => select(l.code) },
        l.label,
      ),
    );
    const select = (c: string) => {
      chosen = c;
      for (const b of buttons) b.classList.toggle("active", b.dataset.code === c);
    };
    replace(
      app,
      h(
        "div.lang-screen",
        null,
        h("img", { src: "favicon.png", alt: "" }),
        h("h1", null, "EDCH"),
        h(
          "p.sub",
          null,
          "Choose your language · Choisis ta langue · Sprache wählen · Elige tu idioma · Escolha o idioma · Выберите язык",
        ),
        h("div.lang-grid", null, buttons),
        h("button.primary", { onclick: () => resolve(chosen) }, "OK"),
      ),
    );
  });
}

boot();
