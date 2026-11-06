// About → "Help complete the data": the engineering the game showed that EDCH's data lacks
// (features/dataGaps), with buttons to show missing-data.txt and to open a GitHub issue already
// filled with the list.

import { clearGaps, dataGaps, gapsText, onDataGaps } from "../../features/dataGaps/missingData.js";
import { isRemote, isTauri, missingDataShow, openUrl } from "../../platform/bridge.js";
import { t } from "../../platform/i18n.js";
import { SOFTWARE_VERSION } from "../../platform/version.js";
import { h, icon, replace, toast } from "../../ui/dom.js";

const REPO = "https://github.com/BKNadir/edch";
/** Longest issue body put in the link (browsers and GitHub refuse very long addresses). */
const ISSUE_BODY_MAX_CHARS = 6000;

/** The card; it redraws itself when the list changes. */
export function missingDataCard(): HTMLElement | null {
  if (!isTauri() || isRemote()) return null;
  const card = h("section.card.missing-data");
  const draw = () => replace(card, ...cardContent());
  onDataGaps(draw);
  draw();
  return card;
}

function cardContent(): (HTMLElement | null)[] {
  const count = dataGaps().length;
  return [
    h("h3", null, t("missingData.title")),
    h("p", null, t("missingData.intro")),
    h("p.sub", null, count ? t("missingData.found", { count }) : t("missingData.none")),
    count
      ? h(
          "div.row",
          null,
          h(
            "button.ghost",
            { onclick: () => missingDataShow().catch((e) => toast(t("common.canTOpenFolder", { e }))) },
            t("missingData.showFile"),
          ),
          h("button.primary", { onclick: openIssue }, icon("link"), " " + t("missingData.openIssue")),
          h(
            "button.ghost",
            { title: t("missingData.clearHelp"), onclick: () => clearGaps() },
            icon("close"),
            " " + t("missingData.clear"),
          ),
        )
      : null,
    h("p.sub", null, t("missingData.privacy")),
  ];
}

/** Opens a new GitHub issue with the list (cut when too long: then the file is attached). */
function openIssue() {
  const list = gapsText();
  const tooLong = list.length > ISSUE_BODY_MAX_CHARS;
  const body = [
    `**EDCH version:** ${SOFTWARE_VERSION}`,
    "",
    "**Game data missing from EDCH**",
    "```",
    tooLong ? `${list.slice(0, ISSUE_BODY_MAX_CHARS)}\n…` : list,
    "```",
    tooLong ? "(the list is cut: drag missing-data.txt from the logs folder here)" : "",
  ].join("\n");
  void openUrl(
    `${REPO}/issues/new?labels=data&title=${encodeURIComponent("[Data] Missing game data")}&body=${encodeURIComponent(body)}`,
  );
}
