// The first-run introduction: drawn in the chosen language, and its two buttons tell start-up
// whether to open Settings first. A small stand-in for the DOM is enough for h().
import "./i18n-setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

/** A minimal element: tag, classes, attributes, children, click handlers. */
class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = "";
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.style = {};
    this.dataset = {};
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    this.children = children;
  }
  addEventListener(type, handler) {
    (this.listeners[type] ??= []).push(handler);
  }
  click() {
    for (const handler of this.listeners.click ?? []) handler();
  }
  get textContent() {
    return this.children.map((c) => c.textContent).join("");
  }
  /** Every element below this one, depth first. */
  *all() {
    for (const c of this.children)
      if (c instanceof FakeElement) {
        yield c;
        yield* c.all();
      }
  }
}

globalThis.document ??= {
  createElement: (tag) => new FakeElement(tag),
  createElementNS: (_ns, tag) => new FakeElement(tag),
  createTextNode: (text) => ({ textContent: text }),
};

const { showIntro } = await import("../dist/js/ui/intro.js");

const buttons = (app) => [...app.all()].filter((el) => el.tagName === "BUTTON");

test("intro: shows the features and the Settings reminder in the chosen language", () => {
  const app = new FakeElement("div");
  void showIntro(app);
  const text = app.textContent;
  assert.match(text, /Bienvenue, Commandant/);
  assert.match(text, /Matériaux et ingénierie/);
  assert.match(text, /Paramètres/);
  assert.deepEqual(
    buttons(app).map((b) => b.textContent),
    ["Ouvrir les Paramètres", "Commencer"],
  );
});

test("intro: 'Open Settings' asks start-up to show Settings, 'Start' doesn't", async () => {
  const first = new FakeElement("div");
  const toSettings = showIntro(first);
  buttons(first)[0].click();
  assert.equal(await toSettings, true);

  const second = new FakeElement("div");
  const straight = showIntro(second);
  buttons(second)[1].click();
  assert.equal(await straight, false);
});
