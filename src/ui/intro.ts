// First-run introduction, shown once right after the language is chosen: what EDCH does in a few
// lines, and a strong nudge to visit Settings so the app fits the way the player plays.

import { t } from "../platform/i18n.js";
import { callout, h, replace } from "./dom.js";

/** One line of the feature list: its name in bold, then what it does. */
const feature = (title: string, text: string) => h("li", null, h("b", null, title), h("span", null, text));

/**
 * Draws the introduction in `app` and waits for the player: resolves `true` when they choose to
 * open Settings, `false` when they start straight away.
 */
export function showIntro(app: HTMLElement): Promise<boolean> {
  return new Promise((resolve) => {
    // Taller than a small window: the outer box scrolls, the inner one stays centred.
    replace(
      app,
      h(
        "div.intro-scroll",
        null,
        h(
          "div.lang-screen.intro-screen",
          null,
          h("img", { src: "favicon.png", alt: "" }),
          h("h1", null, "EDCH"),
          h("h2", null, t("intro.welcome")),
          h("p", null, t("intro.lead")),
          h(
            "ul.intro-features",
            null,
            feature(t("intro.engineeringTitle"), t("intro.engineeringText")),
            feature(t("intro.navigationTitle"), t("intro.navigationText")),
            feature(t("intro.activitiesTitle"), t("intro.activitiesText")),
            feature(t("intro.sharingTitle"), t("intro.sharingText")),
          ),
          callout("info", t("intro.settingsTitle"), t("intro.settingsText")),
          h(
            "div.intro-actions",
            null,
            h("button.primary", { onclick: () => resolve(true) }, t("intro.openSettings")),
            h("button.ghost", { onclick: () => resolve(false) }, t("intro.start")),
          ),
          h("p.sub", null, t("intro.later")),
        ),
      ),
    );
  });
}
