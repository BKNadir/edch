// Debug mode's source labels: always drawn, shown by the stylesheet only in debug mode; empty
// parts are left out, and nothing is drawn without any.
import "./i18n-setup.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const classes = new Set();
globalThis.document ??= {
  createElement: (tag) => ({
    tagName: tag.toUpperCase(),
    className: "",
    children: [],
    attributes: {},
    style: {},
    dataset: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    addEventListener() {},
    get textContent() {
      return this.children.map((c) => c.textContent).join("");
    },
  }),
  createTextNode: (text) => ({ textContent: text }),
};
globalThis.document.documentElement ??= {
  classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
};

const { debugSource, setDebugSources } = await import("../dist/js/ui/debugSource.js");

test("debug source: names the parts given, in a label of its own", () => {
  const label = debugSource("Spansh", undefined, false, "3 h");
  assert.match(label.className, /debug-source/);
  assert.match(label.textContent, /Spansh · 3 h/);
  assert.equal(debugSource(undefined, null, false), null);
});

test("debug source: debug mode shows or hides every label at once", () => {
  setDebugSources(true);
  assert.ok(classes.has("debug-sources"));
  setDebugSources(false);
  assert.ok(!classes.has("debug-sources"));
});
