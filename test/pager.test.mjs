// Pages of a long result list: the first, the last and two around the current page, gaps marked;
// and the number of lines a page shows.
import { test } from "node:test";
import assert from "node:assert/strict";
import "./i18n-setup.mjs";
import { pageNumbers } from "../dist/js/views/shared/pager.js";

test("pager: page numbers around the current one, gaps as null", () => {
  assert.deepEqual(pageNumbers(0, 1), [0]);
  assert.deepEqual(pageNumbers(0, 4), [0, 1, 2, 3]);
  assert.deepEqual(pageNumbers(0, 10), [0, 1, 2, null, 9]);
  assert.deepEqual(pageNumbers(5, 10), [0, null, 3, 4, 5, 6, 7, null, 9]);
  assert.deepEqual(pageNumbers(9, 10), [0, null, 7, 8, 9]);
});

test("lines per page: 50 until chosen, then the saved choice; anything else is ignored", async () => {
  const saved = new Map();
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
  };
  const { savedPageSize, PAGE_SIZES } = await import("../dist/js/views/shared/pagedList.js");
  assert.deepEqual(PAGE_SIZES, ["auto", 10, 50, 100]);
  assert.equal(savedPageSize(), 50);
  for (const choice of ["auto", "10", "100"]) {
    saved.set("edch.pageSize", choice);
    assert.equal(savedPageSize(), choice === "auto" ? "auto" : Number(choice));
  }
  saved.set("edch.pageSize", "37");
  assert.equal(savedPageSize(), 50);
});
