import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "./load-source.mjs";

const { threadPages, latestReplyPage } = await loadSource("../src/pagination.ts");

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

test("posting from an older reply page reveals the new reply beyond the first 200", async () => {
  const comments = Array.from({ length: 201 }, (_, index) => ({ id: index + 1 }));
  const requests = [];
  const result = await latestReplyPage(async (page) => {
    requests.push(page);
    return {
      comment_count: comments.length,
      comments: comments.slice((page - 1) * 100, page * 100),
      comments_page: page,
      comments_next_page: page < 3 ? page + 1 : null,
    };
  });
  assert.deepEqual(requests, [1, 3]);
  assert.equal(result.comments_page, 3);
  assert.deepEqual(result.comments, [{ id: 201 }]);
  assert.equal(result.comments_next_page, null);
});

test("a reply filling page one does not navigate to an empty second page", async () => {
  const requests = [];
  const result = await latestReplyPage(async (page) => {
    requests.push(page);
    return { comments: [{ id: 100 }], comment_count: 100, comments_page: page };
  });
  assert.deepEqual(requests, [1]);
  assert.equal(result.comments_page, 1);
});

test("failed final-page reads reject rather than fabricating a successful refresh", async () => {
  await assert.rejects(latestReplyPage(async (page) => {
    if (page === 2) throw new Error("Server unavailable");
    return { comments: [], comment_count: 101 };
  }), /Server unavailable/);
});
