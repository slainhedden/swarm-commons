import test from "node:test";
import assert from "node:assert/strict";
import {
  API_BASE,
  goalVoteIds,
  goalFromApi,
  updateGoalVote,
  saveToken,
  requestThreadPages,
} from "./api.js";

test("server vote state overrides stale local flags, with account-specific older-API fallback", () => {
  const goals = [
    { id: 1, viewer_voted: false },
    { id: 2, viewer_voted: true },
    { id: 3 },
    { id: 4 },
  ];
  const stored = { [`${API_BASE}:river`]: [1, 3], [`${API_BASE}:cedar`]: [4] };
  assert.deepEqual(goalVoteIds(goals, "river", stored), [2, 3]);
  assert.deepEqual(goalVoteIds(goals, "cedar", stored), [2, 4]);
  assert.deepEqual(goalVoteIds(goals, undefined, stored), []);
});

test("older discussion pages stay reachable and overlapping page boundaries do not duplicate threads", async (t) => {
  const first = Array.from({ length: 20 }, (_, index) => ({ id: index + 1 }));
  const second = [{ id: 20 }, { id: 21 }];
  t.mock.method(globalThis, "fetch", async (url) => {
    const page = new URL(url, "http://localhost").searchParams.get("page");
    assert.equal(new URL(url, "http://localhost").searchParams.get("limit"), "20");
    return Response.json(page === "1" ? first : second);
  });
  assert.equal((await requestThreadPages()).hasMore, true);
  const loaded = await requestThreadPages(2);
  assert.equal(loaded.items.length, 21);
  assert.equal(loaded.items.at(-1).id, 21);
  assert.equal(loaded.hasMore, false);
});

test("vote and undo use the v2 methods, bearer auth and canonical response", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url, options });
    return Response.json({
      id: 7,
      votes: options.method === "DELETE" ? 12 : 13,
      viewer_voted: options.method !== "DELETE",
    });
  });
  saveToken("adapter-test-token");
  t.after(() => saveToken(null));
  assert.equal((await updateGoalVote(7, false)).votes, 13);
  assert.deepEqual(await updateGoalVote(7, true), {
    id: 7,
    votes: 12,
    viewer_voted: false,
  });
  assert.deepEqual(
    calls.map((c) => c.options.method),
    ["POST", "DELETE"],
  );
  assert.ok(calls.every((c) => c.url === `${API_BASE}/goals/7/vote`));
  assert.ok(
    calls.every(
      (c) => c.options.headers.Authorization === "Bearer adapter-test-token",
    ),
  );
  assert.ok(calls.every((c) => !("body" in c.options)));
});

test("API failures preserve status and server explanation for recovery and feedback", async (t) => {
  let status = 401;
  let detail = "Session expired";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ detail }, { status }),
  );
  for (const failure of [
    [401, "Session expired"],
    [403, "Please wait ten minutes before voting"],
    [409, "Task is not available"],
    [413, "Request body is too large"],
    [429, "Too many writes. Try again in a minute."],
  ]) {
    [status, detail] = failure;
    await assert.rejects(updateGoalVote(7, false), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.message, detail);
      return true;
    });
  }
});

test("goal adaptation preserves moderation, lifecycle and viewer-vote fields separately", () => {
  const goal = goalFromApi(
    {
      id: 9,
      title: "Accessible parks",
      visibility: "pending",
      status: "open",
      viewer_voted: false,
      progress: { claimed: 1, submitted: 2, done: 0, percent_done: 0 },
    },
    0,
    [{ goal_id: 9, title: "Review routes", status: "submitted" }],
  );
  assert.equal(goal.visibility, "pending");
  assert.equal(goal.status, "open");
  assert.equal(goal.viewer_voted, false);
  assert.equal(goal.agents, 1);
  assert.equal(goal.progressDetail.submitted, 2);
  assert.deepEqual(goal.tasks, ["Review routes"]);
});
