import test from "node:test";
import assert from "node:assert/strict";
import { loadThreadPage, loadThreadWithReply } from "../src/client.js";

const page = (number, total) => ({
  id: 7,
  comment_count: total,
  comments_page: number,
  comments_next_page: number * 100 < total ? number + 1 : null,
  comments: Array.from(
    { length: Math.max(0, Math.min(100, total - (number - 1) * 100)) },
    (_, index) => ({ id: (number - 1) * 100 + index + 1 }),
  ),
});

test("reply navigation requests the selected server page with cookie identity", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async (url) =>
    new Response(JSON.stringify(page(Number(new URL(url, "http://local").searchParams.get("page")), 201))),
  );
  const second = await loadThreadPage(7, 2);
  assert.equal(second.comments[0].id, 101);
  assert.equal(second.comments_next_page, 3);
  assert.equal((await loadThreadPage(7, 1)).comments[0].id, 1);
  assert.equal(fetch.mock.calls[0].arguments[0], "/threads/7?page=2");
  assert.equal(fetch.mock.calls[0].arguments[1].credentials, "include");
});

test("published replies land on their page at the 100-reply boundaries", async (t) => {
  let total;
  t.mock.method(globalThis, "fetch", async (url) =>
    new Response(JSON.stringify(page(Number(new URL(url, "http://local").searchParams.get("page")), total))),
  );
  for (total of [1, 100, 101, 200, 201]) {
    const thread = await loadThreadWithReply(7, total);
    assert.equal(thread.comments_page, Math.ceil(total / 100));
    assert.equal(thread.comments.at(-1).id, total);
    assert.equal(thread.comments_next_page, null);
  }
});

test("concurrent replies do not jump past the newly published reply", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) =>
    new Response(JSON.stringify(page(Number(new URL(url, "http://local").searchParams.get("page")), 201))),
  );
  const thread = await loadThreadWithReply(7, 101);
  assert.equal(thread.comments_page, 2);
  assert.equal(thread.comments[0].id, 101);
});

test("failed page loads preserve server errors rather than accepting an empty page", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    new Response(JSON.stringify({ detail: "Thread not found." }), { status: 404 }),
  );
  await assert.rejects(loadThreadPage(7, 2), (error) => error.status === 404);
});
