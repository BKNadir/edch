// Search → services: a material trader's or technology broker's kind follows the station's economy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SERVICE_KINDS, serviceKindOf } from "../dist/js/game/serviceKinds.js";

test("service kinds: the station's economy gives the trader's or broker's kind", () => {
  const kind = (service, economy) => serviceKindOf(service, economy)?.kind;
  assert.equal(kind("Material Trader", "Refinery"), "raw");
  assert.equal(kind("Material Trader", "Extraction"), "raw");
  assert.equal(kind("Material Trader", "Industrial"), "manufactured");
  assert.equal(kind("Material Trader", "High Tech"), "encoded");
  assert.equal(kind("Material Trader", "Military"), "encoded");
  assert.equal(kind("Technology Broker", "High Tech"), "guardian");
  assert.equal(kind("Technology Broker", "Industrial"), "human");
  assert.equal(kind("Technology Broker", "Agriculture"), undefined);
  assert.equal(kind("Material Trader", undefined), undefined);
});

test("service kinds: each economy gives one kind per service", () => {
  for (const service of ["Material Trader", "Technology Broker"]) {
    const economies = SERVICE_KINDS.filter((k) => k.service === service).flatMap((k) => k.economies);
    assert.equal(new Set(economies).size, economies.length, service);
  }
});
