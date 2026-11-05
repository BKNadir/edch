// Ways to give a page the whole screen:
// - the side menu folds away with a click on the EDCH logo (remembered on this device);
// - focus mode: only the page, without the menu and the top bar (and the window full screen on the PC);
// - "open in the browser": this page alone, full screen, in the PC's browser (second screen).

import { isRemote, isTauri, openPageInBrowser, setFullscreen } from "../platform/bridge.js";
import { h, icon, toast } from "../ui/dom.js";
import { log } from "../platform/logger.js";
import { remoteRunning } from "../services/remoteServer.js";
import type { Store } from "../state/store.js";
import { t } from "../platform/i18n.js";

let store: Store | null = null;
let focused = false;
/** Opened as "this page alone" (second screen): every page stays reachable. */
let openedAlone = false;
export const openedAsSinglePage = () => openedAlone;
let exitButton: HTMLElement | null = null;

const KEY = "edc.navCollapsed";

export function initFocus(s: Store) {
  store = s;
  try {
    if (localStorage.getItem(KEY) === "1") document.body.classList.add("nav-collapsed");
  } catch {
    /* not kept: fine */
  }
  // Opened as "#focus=missions" (from "open in the browser"): that page, alone.
  const m = /^#focus=([a-z0-9-]+)$/i.exec(location.hash);
  if (m) {
    s.state.view = m[1];
    openedAlone = true;
    history.replaceState(null, "", location.pathname);
    setFocus(true);
  }
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && focused) setFocus(false);
    if (e.key === "F11" && isTauri() && !isRemote()) {
      e.preventDefault();
      setFocus(!focused);
    }
  });
}

/** Folds or unfolds the side menu. */
export function toggleNav() {
  const on = document.body.classList.toggle("nav-collapsed");
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* not kept: fine */
  }
}

export function setFocus(on: boolean) {
  focused = on;
  document.body.classList.toggle("focus-mode", on);
  void setFullscreen(on);
  log.debug("ui", `Focus mode ${on ? "on" : "off"}`);
  if (on && !exitButton) {
    exitButton = h("button.focus-exit", { title: t("focus.exitFullScreenEsc"), onclick: () => setFocus(false) }, icon("close"), h("span", null, t("focus.exitFullScreen")));
    document.body.append(exitButton);
  }
}

/** Opens the current page alone, full screen, in the PC's browser. */
export async function openInBrowser() {
  if (!store) return;
  try {
    await openPageInBrowser(store.state.view);
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    if (msg.includes("local-server-off")) {
      toast(t("focus.turnRemoteAccessServerFirstRemote"));
      store.setView("mobile");
    } else toast(msg);
  }
}

/** The buttons of the top bar ("open in the browser" needs the remote access server: it serves the page). */
export function focusButtons(): HTMLElement {
  return h(
    "div.focus-buttons",
    null,
    h("button.icon-btn", { title: t("focus.fullScreenPageOnlyEscExit"), onclick: () => setFocus(true) }, icon("expand")),
    isTauri() && !isRemote() && remoteRunning() ? h("button.icon-btn", { title: t("focus.openPageAloneBrowserSecondScreen"), onclick: () => openInBrowser() }, icon("link")) : null,
  );
}
