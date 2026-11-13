// Tiny DOM helper: h("div.card", { onclick }, child, "text").

import { locale } from "../platform/i18n.js";
type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, any> | null | undefined;

export function h<K extends keyof HTMLElementTagNameMap>(
  spec: K | `${K}.${string}` | `${K}#${string}`,
  props?: Props,
  ...children: Child[]
): HTMLElementTagNameMap[K];
export function h(spec: string, props?: Props, ...children: Child[]): HTMLElement {
  const [tagAndId, ...classes] = spec.split(".");
  const [tag, id] = tagAndId.split("#");
  const el = document.createElement(tag || "div");
  if (id) el.id = id;
  if (classes.length) el.className = classes.join(" ");
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = [el.className, v].filter(Boolean).join(" ");
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k === "dataset") Object.assign(el.dataset, v);
      else if (k in el && k !== "list" && typeof v !== "string") (el as any)[k] = v;
      else el.setAttribute(k, v === true ? "" : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
  }
}

export function replace(el: Element, ...children: Child[]) {
  el.replaceChildren();
  append(el, children);
}

let toastTimer: number | undefined;
export function toast(message: string) {
  let el = document.getElementById("toast");
  if (!el) {
    el = h("div#toast", { role: "status" });
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el!.classList.remove("show"), 2600);
}

export const fmt = (n: number) => n.toLocaleString(locale());

/** Small inline SVG icons. */
export function icon(
  name:
    | "copy"
    | "link"
    | "search"
    | "star"
    | "close"
    | "plus"
    | "check"
    | "warn"
    | "pin"
    | "play"
    | "expand"
    | "eye"
    | "eyeOff"
    | "chat",
): SVGSVGElement {
  const paths: Record<string, string> = {
    copy: "M8 8h11v11H8zM5 16V5h11",
    link: "M10 14l10-10M14 4h6v6M20 14v6H4V4h6",
    search: "M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5L20 20",
    star: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z",
    close: "M6 6l12 12M18 6L6 18",
    plus: "M12 5v14M5 12h14",
    check: "M5 12.5l4.5 4.5L19 7",
    warn: "M12 4l9 16H3zM12 10v4M12 17.5v.5",
    play: "M7 5l12 7-12 7z",
    expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
    pin: "M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
    chat: "M4 5h16v11H10l-5 4v-4H4z",
    eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    eyeOff:
      "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2",
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", paths[name]);
  svg.appendChild(path);
  return svg;
}

/** A highlighted box: "info" follows the theme colour, "danger" is red for important warnings. */
export function callout(kind: "info" | "danger", title: string, ...body: (Node | string | null)[]): HTMLElement {
  return h(
    `div.callout.${kind}`,
    { role: kind === "danger" ? "alert" : "note" },
    h("div.callout-title", null, icon("warn"), h("span", null, title)),
    h("p", null, ...body),
  );
}
