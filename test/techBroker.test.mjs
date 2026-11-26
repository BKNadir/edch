// The nearest technology broker shown on the Engineering page: a Spansh station search for the
// "Technology Broker" service, its kind told by the station's economy.

import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { brokerFinder } from "../dist/js/features/materials/sources.js";
import { buildRequest } from "../dist/js/services/spansh.js";

const settings = { maxDistance: 300, maxAgeDays: 3, fallbackSystem: "Sol", largePadOnly: false, sourceCount: 3 };

test("Guardian brokers are looked for at High Tech stations, human ones at Industrial stations", () => {
  const guardian = brokerFinder("guardian", settings);
  assert.equal(guardian.type, "stations");
  assert.deepEqual(guardian.filters.services, [{ name: { value: ["Technology Broker"] } }]);
  assert.deepEqual(guardian.filters.primary_economy, { value: ["High Tech"] });
  assert.deepEqual(brokerFinder("human", settings).filters.primary_economy, { value: ["Industrial"] });
  assert.notEqual(guardian.title, brokerFinder("human", settings).title);
});

test("the large pad setting reaches the broker search", () => {
  const finder = brokerFinder("human", { ...settings, largePadOnly: true });
  assert.deepEqual(finder.filters.has_large_pad, { value: ["true"] });
  assert.notEqual(finder.key, brokerFinder("human", settings).key);
  const request = buildRequest(finder, { system: "Sol" }, settings, 0);
  assert.deepEqual(request.filters.services, [{ name: { value: ["Technology Broker"] } }]);
});
