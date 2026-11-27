import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fetchJson,
  fetchPublicWorkspace,
  safeRepoUrl,
  taskPresentation,
  buildTaskBrief,
} from "./api.js";

test("public links reject executable and malformed URLs", () => {
  assert.equal(safeRepoUrl("javascript:alert(1)"), null);
  assert.equal(safeRepoUrl("data:text/html,bad"), null);
  assert.equal(safeRepoUrl("not a URL"), null);
  assert.equal(
    safeRepoUrl("https://github.com/example/project"),
    "https://github.com/example/project",
  );
});
test("workspace uses API v1 paths and reads public data without credentials", async () => {
  const paths = [];
  const fixtures = {
    "/goals": [{ id: 7, title: "A public tool" }],
    "/stats": { agents_running: 2, contributors: 3, prs_merged: 1 },
    "/threads?page=1&limit=20": [],
    "/activity?limit=12": [],
  };
  const workspace = await fetchPublicWorkspace(
    "https://platform.example/api/v1/",
    {
      fetcher: async (url, options) => {
        assert.equal(options.credentials, "omit");
        assert.equal(options.headers.Authorization, undefined);
        const path = url.replace("https://platform.example/api/v1", "");
        paths.push(path);
        return { ok: true, json: async () => fixtures[path] };
      },
    },
  );
  assert.equal(paths.length, 4);
  assert.equal(workspace.goals[0].id, 7);
});
test("unavailable or incompatible API data fails rather than faking live data", async () => {
  await assert.rejects(
    fetchJson("https://example.com", "/goals", {
      fetcher: async () => ({ ok: false, status: 503 }),
    }),
    /503/,
  );
  await assert.rejects(
    fetchPublicWorkspace("https://example.com", {
      fetcher: async () => ({
        ok: true,
        json: async () => ({ unexpected: true }),
      }),
    }),
    /did not match/,
  );
});

test("task availability honors moderation, dependencies, and active claims", () => {
  assert.equal(
    taskPresentation({ status: "open", visibility: "approved", ready: true })
      .available,
    true,
  );
  for (const task of [
    { status: "open", visibility: "pending" },
    { status: "open", ready: false },
    { status: "claimed" },
    { status: "done" },
    { status: "submitted" },
    { status: "unexpected" },
  ]) {
    assert.equal(taskPresentation(task).available, false);
  }
  assert.match(taskPresentation({ status: "submitted" }).label, /unverified/);
  assert.match(
    taskPresentation({ status: "done" }).description,
    /not independently verified/,
  );
});

test("copied briefs never instruct duplicate work on unavailable tasks", () => {
  const goal = {
    title: "Accessible search",
    repo_url: "https://github.com/example/project",
  };
  const task = {
    title: "Keyboard navigation",
    description: "Add focus order",
    criteria: "Tab through the page",
    status: "open",
    ready: true,
  };
  assert.match(buildTaskBrief(goal, task), /Claim this task/);
  for (const status of ["claimed", "submitted", "done"]) {
    const brief = buildTaskBrief(goal, { ...task, status });
    assert.match(brief, /Reference only/);
    assert.doesNotMatch(brief, /Claim this task/);
  }
  const claimed = { ...task, status: "claimed", claimant: "contributor" };
  assert.match(
    buildTaskBrief(goal, claimed, "contributor"),
    /You hold this task claim/,
  );
  assert.doesNotMatch(
    buildTaskBrief(goal, claimed, "contributor"),
    /Do not duplicate/,
  );
  assert.match(buildTaskBrief(goal, claimed, "someone-else"), /Reference only/);
  assert.equal(taskPresentation(claimed, "contributor").available, false);
});

test("authenticated reads carry only the configured bearer and scope live data to a goal", async () => {
  const paths = [];
  const result = await fetchPublicWorkspace("http://localhost:8000/api/v1", {
    token: "test-session-not-a-secret",
    goalId: 4,
    fetcher: async (url, options) => {
      assert.equal(
        options.headers.Authorization,
        "Bearer test-session-not-a-secret",
      );
      assert.equal(options.credentials, "omit");
      const path =
        new URL(url).pathname.replace("/api/v1", "") + new URL(url).search;
      paths.push(path);
      const data =
        path === "/stats?goal_id=4"
          ? { agents_running: 1, contributors: 3, prs_merged: 0 }
          : [];
      return { ok: true, json: async () => data };
    },
  });
  assert.equal(result.stats.agents_running, 1);
  assert.ok(paths.includes("/stats?goal_id=4"));
  assert.ok(paths.includes("/threads?goal_id=4&page=1&limit=20"));
});

test("write requests support JSON and vote removal without implicit browser cookies", async () => {
  await fetchJson("https://platform.example/api/v1", "/goals/4/vote", {
    token: "test-token",
    method: "DELETE",
    fetcher: async (url, options) => {
      assert.equal(url, "https://platform.example/api/v1/goals/4/vote");
      assert.equal(options.method, "DELETE");
      assert.equal(options.credentials, "omit");
      assert.equal(options.body, undefined);
      return { ok: true, json: async () => ({ id: 4, viewer_voted: false }) };
    },
  });
  await fetchJson("https://platform.example/api/v1", "/threads", {
    method: "POST",
    body: { title: "Public work", body: "A useful discussion" },
    fetcher: async (_url, options) => {
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.equal(JSON.parse(options.body).title, "Public work");
      assert.equal(options.headers.Authorization, undefined);
      return { ok: true, json: async () => ({ id: 4 }) };
    },
  });
});

test("API error codes preserve backend detail and retry guidance", async () => {
  for (const status of [401, 403, 409, 413, 429]) {
    await assert.rejects(
      fetchJson("https://platform.example", "/action", {
        fetcher: async () => ({
          ok: false,
          status,
          headers: { get: () => (status === 429 ? "60" : null) },
          json: async () => ({ detail: "Exact server reason" }),
        }),
      }),
      (e) =>
        e.status === status &&
        e.message.includes("Exact server reason") &&
        (status !== 429 || e.message.includes("60 seconds")),
    );
  }
});
