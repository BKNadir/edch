// The side menu: pages in groups separated by a line, and an edit mode (button at the bottom)
// where pages are dragged to a new place, switched on/off for the phone, and hidden or shown.
// Dragging uses pointer events: HTML5 drag and drop is unreliable in the Windows webview.

import { h, replace } from "./dom.js";
import { log } from "./logger.js";
import { ALWAYS_SHOWN, DEFAULT_ORDER, NEVER_ON_PHONE, menuOrder, navItem, phoneHiddenPages, visibleNav } from "./nav.js";
import type { Store } from "./store.js";
import { t } from "./i18n.js";

let editing = false;
export const menuEditing = () => editing;

const SVG = "http://www.w3.org/2000/svg";
function svgIcon(d: string, cls = "icon"): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", cls);
  const p = document.createElementNS(SVG, "path");
  p.setAttribute("d", d);
  svg.append(p);
  return svg;
}
const PHONE = "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2";
const PHONE_OFF = "M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2M3 3l18 18";
const EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z";
const EYE_OFF = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM3 3l18 18";
const GRIP = "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01";
const PEN = "M4 20h4L19 9l-4-4L4 16zM14 6l4 4";

export interface MenuOptions {
  /** Remote (phone, tablet): pages switched off for the phone are left out, no edit mode. */
  remote: boolean;
  /** "Open in the browser" on a second screen: every page stays reachable. */
  everything: boolean;
  navIcon: (d: string) => SVGSVGElement;
}

/** Pages left out of the menu here. */
export function excludedHere(store: Store, o: Pick<MenuOptions, "remote" | "everything">): string[] {
  if (!o.remote) return [];
  if (o.everything) return ["mobile"];
  return phoneHiddenPages(store.state.settings.phoneHidden);
}

export function renderMenu(nav: HTMLElement, store: Store, o: MenuOptions) {
  const s = store.state;
  nav.classList.toggle("editing", editing && !o.remote);
  document.body.classList.toggle("menu-editing", editing && !o.remote);
  if (editing && !o.remote) return renderEditing(nav, store, o);
  const items = visibleNav(s.settings.hiddenViews ?? [], excludedHere(store, o), s.settings.navOrder);
  replace(
    nav,
    items.map((n) =>
      n.id === "-"
        ? h("div.nav-sep")
        : h(
            "button",
            { class: s.view === n.id ? "active" : "", "data-nav": n.id, title: n.label, onclick: () => store.setView(n.id) },
            o.navIcon(n.icon),
            h("span", null, n.label),
            n.id === "wishlist" && s.wishlist.length ? h("small.count", null, String(s.wishlist.length)) : null,
          ),
    ),
    o.remote ? null : h("button.nav-edit", { title: t("menuEdit.reorderMenuChoosePhoneSPages"), onclick: () => setEditing(store, true) }, svgIcon(PEN), h("span", null, t("common.editMenu"))),
  );
}

/** Opens the menu's edit mode (also from Settings → Display). */
export const startMenuEdit = (store: Store) => setEditing(store, true);

function setEditing(store: Store, on: boolean) {
  editing = on;
  log.debug("ui", `Menu edit mode ${on ? "on" : "off"}`);
  store.notify();
}

function renderEditing(nav: HTMLElement, store: Store, o: MenuOptions) {
  const s = store.state.settings;
  const order = menuOrder(s.navOrder);
  const hidden = new Set(s.hiddenViews ?? []);
  const phoneOff = new Set(s.phoneHidden ?? []);
  const save = (next: string[]) => {
    // No line at either end, never two lines side by side.
    const clean = next.filter((id, i) => id !== "-" || (i > 0 && i < next.length - 1 && next[i - 1] !== "-"));
    store.updateSettings({ navOrder: clean });
  };

  const rows = order.map((id, index) => {
    const n = navItem(id)!;
    if (id === "-") {
      return h("div.nav-edit-row.sep", { "data-index": String(index), title: t("menuEdit.lineBetweenTwoGroupsDragChange") }, h("span.grip", null, svgIcon(GRIP)), h("span.sep-line"));
    }
    const never = NEVER_ON_PHONE.has(id);
    const onPhone = !never && !phoneOff.has(id);
    const shown = ALWAYS_SHOWN.has(id) || !hidden.has(id);
    return h(
      "div.nav-edit-row",
      { "data-index": String(index), class: shown ? "" : "is-hidden" },
      h("span.grip", { title: t("menuEdit.dragMove") }, svgIcon(GRIP)),
      o.navIcon(n.icon),
      h("span.label", null, n.label),
      h(
        "button.toggle",
        {
          class: onPhone ? "on" : "",
          disabled: never,
          title: never ? t("menuEdit.neverPhonePcSettings") : onPhone ? t("menuEdit.alsoShownPhoneClickKeepPc") : t("menuEdit.pcOnlyClickAlsoShowPhone"),
          onclick: () => {
            const next = new Set(store.state.settings.phoneHidden ?? []);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            store.updateSettings({ phoneHidden: [...next] });
          },
        },
        svgIcon(onPhone ? PHONE : PHONE_OFF),
      ),
      h(
        "button.toggle",
        {
          class: shown ? "on" : "",
          disabled: ALWAYS_SHOWN.has(id),
          title: ALWAYS_SHOWN.has(id) ? t("menuEdit.alwaysShown") : shown ? t("menuEdit.hidePage") : t("menuEdit.showPage"),
          onclick: () => {
            const next = new Set(store.state.settings.hiddenViews ?? []);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            store.updateSettings({ hiddenViews: [...next] });
          },
        },
        svgIcon(shown ? EYE : EYE_OFF),
      ),
    );
  });

  const list = h("div.nav-edit-list", null, rows);
  enableDrag(list, order, save);
  replace(
    nav,
    h(
      "div.nav-edit-help",
      null,
      h("p", null, h("strong", null, t("common.editMenu"))),
      h("p", null, svgIcon(PHONE, "icon inline"), (" " + t("menuEdit.pageAlsoShowsPhone"))),
      h("p", null, svgIcon(EYE, "icon inline"), (" " + t("menuEdit.showHidePage"))),
      h("p", null, t("menuEdit.dragPageLineMove")),
    ),
    list,
    h(
      "div.nav-edit-actions",
      null,
      h("button.primary.small", { onclick: () => setEditing(store, false) }, t("common.done")),
      h("button.ghost.small", { title: t("menuEdit.originalOrderGroupsHiddenPagesPhone"), onclick: () => store.updateSettings({ navOrder: [...DEFAULT_ORDER] }) }, t("menuEdit.originalOrder")),
    ),
  );
}

/** Drag a row with the mouse (or a finger): a line shows where it will land. */
function enableDrag(list: HTMLElement, order: string[], save: (next: string[]) => void) {
  let from = -1;
  let to = -1;
  let startY = 0;
  let moving = false;
  let row: HTMLElement | null = null;
  const rows = () => [...list.querySelectorAll<HTMLElement>(".nav-edit-row")];
  const clearMarks = () => rows().forEach((r) => r.classList.remove("drop-before", "drop-after"));

  list.addEventListener("pointerdown", (e) => {
    const target = e.target as HTMLElement;
    if (target.closest("button")) return; // the phone / eye toggles
    row = target.closest<HTMLElement>(".nav-edit-row");
    if (!row) return;
    from = Number(row.dataset.index);
    startY = e.clientY;
    moving = false;
    list.setPointerCapture(e.pointerId);
  });
  list.addEventListener("pointermove", (e) => {
    if (!row) return;
    if (!moving && Math.abs(e.clientY - startY) < 4) return;
    moving = true;
    row.classList.add("dragging");
    clearMarks();
    const all = rows();
    // The row under the pointer, and which half of it.
    let hit = all.findIndex((r) => {
      const b = r.getBoundingClientRect();
      return e.clientY < b.top + b.height / 2;
    });
    if (hit === -1) hit = all.length;
    to = hit;
    if (hit < all.length) all[hit].classList.add("drop-before");
    else all[all.length - 1]?.classList.add("drop-after");
  });
  const end = () => {
    if (!row) return;
    row.classList.remove("dragging");
    clearMarks();
    if (moving && to >= 0 && to !== from && to !== from + 1) {
      const next = [...order];
      const [item] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, item);
      save(next);
    }
    row = null;
    moving = false;
  };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);
}
