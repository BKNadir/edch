// What the debug log says about journal events: other commanders' names never written.
import { test } from "node:test";
import assert from "node:assert/strict";
import { eventDetail } from "../dist/js/platform/logger.js";

test("debug log: wing events tell how many commanders, never their names", () => {
  const join = eventDetail({ event: "WingJoin", Others: ["Alice", "Bob"] });
  assert.equal(join, "WingJoin others=2");
  const add = eventDetail({ event: "WingAdd", Name: "Charlie" });
  assert.equal(add, "WingAdd (a commander)");
  assert.doesNotMatch(`${join} ${add}`, /Alice|Bob|Charlie/);
});
