import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "./load-source.mjs";

const { threadPages } = await loadSource("../src/pagination.ts");

test("older discussions beyond the first twenty remain reachable after refresh", async () => {
  const all = Array.from({ length: 45 }, (_, id) => ({ id: 45 - id }));
  const readPage = async (page, limit) => all.slice((page - 1) * limit, page * limit);
  const first = await threadPages(readPage, 1);
  assert.equal(first.items.length, 20);
  assert.equal(first.hasMore, true);
  const loaded = await threadPages(readPage, 3);
  assert.deepEqual(loaded.items, all);
  assert.equal(loaded.hasMore, false);
  assert.deepEqual((await threadPages(readPage, 3)).items, all);
});

test("new discussion shifts do not render duplicate cards across pages", async () => {
  const result = await threadPages(async (page) => page === 1 ? [{ id: 3 }, { id: 2 }] : [{ id: 2 }, { id: 1 }], 2);
  assert.deepEqual(result.items.map((item) => item.id), [3, 2, 1]);
});
