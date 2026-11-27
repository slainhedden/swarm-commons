import test from "node:test";
import assert from "node:assert/strict";
import {
  canApproveProposal,
  connectedGoals,
  request,
  safeUrl,
} from "../src/client.js";

test("only moderators or the task's goal owner can approve pending proposals", () => {
  const goals = [{ id: "7", author: "owner" }];
  const task = { goal_id: 7, author: "contributor" };
  assert.equal(
    canApproveProposal("tasks", task, false, goals, "contributor"),
    false,
  );
  assert.equal(canApproveProposal("tasks", task, false, goals, "owner"), true);
  assert.equal(
    canApproveProposal("goals", { author: "owner" }, false, goals, "owner"),
    false,
  );
  assert.equal(canApproveProposal("tasks", task, true, [], "moderator"), true);
  assert.equal(canApproveProposal("goals", {}, true, [], "moderator"), true);
  assert.equal(
    canApproveProposal("tasks", task, false, goals, undefined),
    false,
  );
});

test("connected goals retain server vote identity and live progress", () => {
  const result = connectedGoals([
    {
      id: 1,
      title: "Public mission",
      votes: 3,
      viewer_voted: true,
      visibility: "approved",
      progress: { total: 2, done: 1, percent_done: 50 },
    },
  ]);
  assert.equal(result[0].id, "1");
  assert.equal(result[0].viewer_voted, true);
  assert.equal(result[0].votes, 3);
  assert.equal(result[0].progress.percent_done, 50);
  assert.equal(result[0].state, "BUILDING");
});
test("cookie identity is sent on reads and writes, with no optimistic vote mutation", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ id: 1, votes: 2, viewer_voted: false })),
  );
  const result = await request("/goals/1/vote", { method: "DELETE" });
  assert.equal(fetch.mock.calls[0].arguments[1].credentials, "include");
  assert.equal(fetch.mock.calls[0].arguments[1].method, "DELETE");
  assert.equal(result.viewer_voted, false);
  assert.equal(result.votes, 2);
  await request("/goals");
  assert.equal(fetch.mock.calls[1].arguments[1].credentials, "include");
});
test("writes encode JSON and preserve server error explanations and statuses", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          detail: "Account must wait ten minutes before voting",
        }),
        { status: 403 },
      ),
  );
  await assert.rejects(
    request("/goals", { method: "POST", body: { title: "Public good" } }),
    (error) => error.status === 403 && /ten minutes/.test(error.message),
  );
  assert.equal(
    fetch.mock.calls[0].arguments[1].body,
    '{"title":"Public good"}',
  );
  for (const status of [401, 409, 413, 429]) {
    fetch.mock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ detail: `Server says ${status}` }), {
          status,
        }),
    );
    await assert.rejects(
      request("/goals/1/vote", { method: "POST" }),
      (error) =>
        error.status === status && error.message.includes(`HTTP ${status}`),
    );
  }
});
test("validation errors and proxy sign-in HTML are visible rather than accepted", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          detail: [{ loc: ["body", "title"], msg: "Too short" }],
        }),
        { status: 422 },
      ),
  );
  await assert.rejects(request("/goals"), /title: Too short/);
  fetch.mock.mockImplementation(
    async () => new Response("<html>Sign in</html>"),
  );
  await assert.rejects(request("/goals"), /unreadable response/);
});
test("community-controlled repository links reject executable schemes", () => {
  assert.equal(
    safeUrl("javascript:alert(1)", "https://github.com"),
    "https://github.com",
  );
  assert.equal(
    safeUrl("https://github.com/org/repo"),
    "https://github.com/org/repo",
  );
});

test("daily quotas do not promise a one-minute retry", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({
          detail: "Daily proposal limit reached. Try tomorrow.",
        }),
        { status: 429 },
      ),
  );
  await assert.rejects(
    request("/goals", { method: "POST", body: {} }),
    (error) => {
      assert.equal(error.status, 429);
      assert.match(error.message, /Daily proposal limit/);
      assert.doesNotMatch(error.message, /minute/);
      return true;
    },
  );
});
