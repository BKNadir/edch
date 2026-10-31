import { locale } from "../i18n.js";
import { copyText, openUrl } from "../bridge.js";
import { h, icon, toast } from "../dom.js";
import { fmtLy, runFinder, type Reference, type ResultRow } from "../spansh.js";
import type { Finder } from "../sources.js";
import type { Settings } from "../store.js";

export async function copySystem(system: string) {
  const ok = await copyText(system);
  toast(ok ? `« ${system} » copié — colle-le dans la carte galactique` : "Copie impossible");
}

function ago(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  if (Number.isNaN(t)) return "";
  const hours = (Date.now() - t) / 3600_000;
  if (hours < 1) return "màj < 1 h";
  if (hours < 48) return `màj il y a ${Math.round(hours)} h`;
  return `màj il y a ${Math.round(hours / 24)} j`;
}

export function resultRow(r: ResultRow): HTMLElement {
  return h(
    "div.result",
    null,
    h(
      "div.result-main",
      null,
      h(
        "button.sys",
        { title: `Copier « ${r.system} »`, onclick: () => copySystem(r.system) },
        icon("copy"),
        h("span", null, r.title),
      ),
      h("span.dist", null, fmtLy(r.distance)),
    ),
    h(
      "div.result-meta",
      null,
      r.badges.map((b) => h(`span.badge${b.tone ? `.${b.tone}` : ""}`, null, b.text)),
      r.sub.length ? h("span.sub", null, r.sub.flatMap((x, i) => (i ? [" · ", x] : [x]))) : null,
      r.updated ? h("span.sub.age", null, ago(r.updated)) : null,
      h(
        "span.links",
        null,
        r.links.map((l) => h("button.link", { title: `Ouvrir sur ${l.label}`, onclick: () => openUrl(l.url) }, l.label, icon("link"))),
      ),
    ),
  );
}

/** A finder section that loads its Spansh results by itself. */
export function finderSection(f: Finder, ref: Reference, settings: Settings, opts: { compact?: boolean } = {}): HTMLElement {
  const list = h("div.results");
  const status = h("span.status");
  const section = h(
    `section.finder.${f.type}`,
    null,
    h("div.finder-head", null, h("h4", null, f.title), status),
    f.hint && !opts.compact ? h("p.hint", null, f.hint) : null,
    f.type === "info" ? null : list,
  );
  if (f.type === "info") return section;

  const load = () => {
    status.replaceChildren(h("span.spinner"), "Recherche Spansh…");
    list.replaceChildren();
    runFinder(f, ref, settings)
      .then((res) => {
        status.replaceChildren();
        if (!res.rows.length) {
          list.replaceChildren(
            h("p.empty", null, `Aucun résultat à moins de ${settings.maxDistance} al.`, " Augmente la distance dans les Paramètres."),
          );
          return;
        }
        list.replaceChildren(...res.rows.map(resultRow));
        if (res.total > res.rows.length && f.type === "systems") {
          status.replaceChildren(h("span.sub", null, `${res.total.toLocaleString(locale())} systèmes correspondent`));
        }
      })
      .catch((err) => {
        status.replaceChildren();
        list.replaceChildren(
          h("p.error", null, icon("warn"), ` ${String(err?.message ?? err)}`, " ", h("button.ghost", { onclick: load }, "Réessayer")),
        );
      });
  };
  load();
  return section;
}
