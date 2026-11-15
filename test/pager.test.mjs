// Pages of a long result list: the first, the last and two around the current page, gaps marked.
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
