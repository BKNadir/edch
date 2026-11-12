// What EDCH accepts from outside (a phone, a wing member, an old save): only the expected fields,
// of the expected kinds and sizes.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { webcrypto } from "node:crypto";
import { validWishItems, DEFAULT_NOTIFY } from "../dist/js/state/store.js";
import { DEFAULT_THEME, validTheme } from "../dist/js/state/themeSettings.js";
import { validPhoneSettings } from "../dist/js/state/phoneSettings.js";
import { open, seal } from "../dist/js/services/wing.js";

globalThis.crypto ??= webcrypto;

test("theme colours from outside: only #rrggbb colours", () => {
  assert.deepEqual(validTheme({ accent: "#ff7a18", cyan: "#ABC", bg: "#000000", preset: "custom", oled: true }), {
    accent: "#ff7a18",
    cyan: "#ABC",
    bg: "#000000",
    preset: "custom",
    oled: true,
  });
  assert.deepEqual(
    validTheme({ accent: "url(https://example.com/x.png)", cyan: "red;background:url(x)", bg: 12, oled: "yes" }),
    {},
  );
  assert.deepEqual(validTheme(null), {});
  assert.deepEqual(validTheme("#ff0000"), {});
});

test("wishlist from outside: wrong lines are dropped, wrong optional fields left out", () => {
  const good = {
    id: "a1",
    bp: "modification|FSD|Increased Range",
    gradeFrom: 1,
    gradeTo: 5,
    rolls: { 5: 3 },
    count: 1,
  };
  const items = validWishItems([
    good,
    { ...good, id: "a2", note: "x".repeat(5000), slots: ["frameshiftdrive", 42], shipType: "krait_mkii" },
    { ...good, id: 3 },
    { ...good, id: "a4", gradeTo: "5" },
    { ...good, id: "a5", count: Infinity },
    "not a line",
    null,
  ]);
  assert.deepEqual(
    items.map((item) => item.id),
    ["a1", "a2"],
  );
  assert.equal(items[1].note, undefined);
  assert.deepEqual(items[1].slots, ["frameshiftdrive"]);
  assert.equal(items[1].shipType, "krait_mkii");
  assert.deepEqual(validWishItems({ not: "a list" }), []);
  assert.equal(validWishItems(Array.from({ length: 5000 }, (_, i) => ({ ...good, id: `x${i}` }))).length, 2000);
});

test("phone settings: only display settings, of the kind they already have", () => {
  const settings = {
    theme: DEFAULT_THEME,
    hiddenViews: [],
    uiScale: 100,
    startView: "",
    notify: DEFAULT_NOTIFY,
    journalDir: "C:\\Journal",
    sync: { edsmApiKey: "secret" },
  };
  const patch = validPhoneSettings(
    {
      uiScale: "200",
      startView: "mining",
      hiddenViews: ["thargoids", { evil: true }],
      theme: { accent: "#00ff00", bg: "url(x)" },
      notify: { ...DEFAULT_NOTIFY, unknownField: 1, sound: "loud" },
      journalDir: "C:\\Windows",
      sync: { edsmApiKey: "stolen" },
    },
    settings,
  );
  assert.deepEqual(Object.keys(patch).sort(), ["hiddenViews", "notify", "startView", "theme"]);
  assert.deepEqual(patch.hiddenViews, ["thargoids"]);
  assert.equal(patch.theme.accent, "#00ff00");
  assert.equal(patch.theme.bg, DEFAULT_THEME.bg);
  assert.equal(patch.notify.unknownField, undefined);
});

test("wing messages: a member's message is checked field by field", async () => {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  const hostile = {
    v: 1,
    from: "them",
    name: "N".repeat(500),
    at: "2026-11-01T12:00:00Z",
    reason: "<script>",
    missions: [
      { id: 1, title: "T".repeat(500), faction: "F", status: "active", reward: "lots", extra: "ignored" },
      { title: "no id" },
      ...Array.from({ length: 100 }, (_, i) => ({ id: i + 2, title: "x", faction: "f", status: "active" })),
    ],
  };
  const received = await open(key, await seal(key, hostile));
  assert.equal(received.name.length, 40);
  assert.equal(received.reason, undefined);
  assert.equal(received.missions.length, 39);
  assert.equal(received.missions[0].title.length, 80);
  assert.equal(received.missions[0].reward, undefined);
  assert.equal(received.missions[0].extra, undefined);
  // Not a wing message at all.
  assert.equal(await open(key, await seal(key, { v: 1, from: 42, at: "x" })), null);
  assert.equal(await open(key, await seal(key, ["not", "an", "object"])), null);
});
