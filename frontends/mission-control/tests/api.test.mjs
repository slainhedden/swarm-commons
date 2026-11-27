import { afterEach, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import ts from "typescript";

// Exercise the browser adapter with isolated storage and HTTP responses, no network.
const source = await fs.readFile(
  new URL("../src/api.ts", import.meta.url),
  "utf8",
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    /import\.meta\.env\s*\.VITE_API_BASE/g,
    '"https://platform.example/api/v1/"',
  );
const adapter = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const originalFetch = globalThis.fetch;
beforeEach(() => {
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("authenticated writes use the configured platform and tab-scoped bearer session", async () => {
  adapter.setToken("test-session-token");
  let captured;
  globalThis.fetch = async (url, options) => {
    captured = { url, options };
    return Response.json({ votes: 7 });
  };
  assert.deepEqual(await adapter.request("/goals/4/vote", { method: "POST" }), {
    votes: 7,
  });
  assert.equal(captured.url, "https://platform.example/api/v1/goals/4/vote");
  assert.equal(captured.options.method, "POST");
  assert.equal(
    captured.options.headers.Authorization,
    "Bearer test-session-token",
  );
  assert.ok(captured.options.signal instanceof AbortSignal);
  adapter.setToken("");
  await adapter.request("/me");
  assert.equal(captured.options.headers.Authorization, undefined);
  assert.equal(adapter.hasToken(), false);
});

test("platform errors surface rather than turning failed writes into successful local actions", async () => {
  globalThis.fetch = async () =>
    Response.json({ detail: "This task is already claimed" }, { status: 409 });
  await assert.rejects(
    adapter.request("/tasks/4/claim", { method: "POST" }),
    /already claimed/,
  );
  globalThis.fetch = async () =>
    new Response("<html>Gateway unavailable</html>", { status: 503 });
  await assert.rejects(adapter.request("/goals"), /503/);
});

test("expired bearer reads recover anonymously instead of forcing demo fallback", async () => {
  adapter.setToken("expired-session-token");
  const headers = [];
  globalThis.fetch = async (_url, options) => {
    headers.push(options.headers.Authorization);
    return options.headers.Authorization
      ? Response.json({ detail: "Session expired" }, { status: 401 })
      : Response.json([{ id: 3, viewer_voted: false }]);
  };
  assert.deepEqual(await adapter.request("/goals"), [
    { id: 3, viewer_voted: false },
  ]);
  assert.deepEqual(headers, ["Bearer expired-session-token", undefined]);
  assert.equal(adapter.hasToken(), false);
});

test("expired-session writes surface 401 and are never replayed", async () => {
  adapter.setToken("expired-session-token");
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ detail: "Sign in again" }, { status: 401 });
  };
  await assert.rejects(
    adapter.toggleGoalVote(3, false),
    (error) => error instanceof adapter.ApiError && error.status === 401,
  );
  assert.equal(calls, 1);
  assert.equal(adapter.hasToken(), false);
});

test("an older failing request cannot clear a newer sign-in", async () => {
  adapter.setToken("old-session");
  globalThis.fetch = async (_url, options) => {
    if (options.headers.Authorization === "Bearer old-session") {
      adapter.setToken("new-session");
      return Response.json({ detail: "Session expired" }, { status: 401 });
    }
    assert.equal(options.headers.Authorization, "Bearer new-session");
    return Response.json({ id: 3, viewer_voted: true });
  };
  assert.equal((await adapter.request("/goals/3")).viewer_voted, true);
  assert.equal(adapter.hasToken(), true);
});

test("incorrect login credentials do not revoke an existing session", async () => {
  adapter.setToken("valid-session");
  globalThis.fetch = async () =>
    Response.json(
      { detail: "Username or password is incorrect." },
      { status: 401 },
    );
  await assert.rejects(
    adapter.request("/auth/login", { method: "POST" }),
    /incorrect/,
  );
  assert.equal(adapter.hasToken(), true);
});

test("v2 goal votes can be removed and retain the server's viewer vote state", async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, method: options.method });
    return Response.json({
      id: 4,
      votes: options.method === "DELETE" ? 6 : 7,
      viewer_voted: options.method === "POST",
    });
  };
  assert.equal((await adapter.toggleGoalVote(4, false)).viewer_voted, true);
  assert.equal((await adapter.toggleGoalVote(4, true)).viewer_voted, false);
  assert.deepEqual(
    calls.map((call) => call.method),
    ["POST", "DELETE"],
  );
  assert.ok(
    calls.every(
      (call) => call.url === "https://platform.example/api/v1/goals/4/vote",
    ),
  );
});

test("mission counts come from the featured goal rather than network-wide telemetry", async () => {
  globalThis.fetch = async (url) => {
    const request = new URL(url);
    if (request.pathname.endsWith("/featured"))
      return Response.json({ id: 42 });
    if (request.pathname.endsWith("/stats"))
      return Response.json({
        agents_running: request.searchParams.get("goal_id") === "42" ? 3 : 1000,
      });
    return Response.json([]);
  };
  const workspace = await adapter.snapshot();
  assert.equal(workspace.stats.agents_running, 1000);
  assert.equal(workspace.missionStats.agents_running, 3);
});

test("loads the full workspace and permits an empty shared platform", async () => {
  const paths = [];
  globalThis.fetch = async (url) => {
    const path = new URL(url).pathname;
    paths.push(path);
    return Response.json(
      path.endsWith("/stats")
        ? { agents_running: 0, contributors: 0, prs_merged: 0 }
        : path.endsWith("/featured")
          ? null
          : [],
    );
  };
  const workspace = await adapter.snapshot();
  assert.equal(paths.length, 6);
  assert.equal(workspace.featured, null);
  assert.deepEqual(workspace.goals, []);
  assert.equal(workspace.stats.agents_running, 0);
});

test("rejects an unexpected platform payload instead of presenting it as a connected workspace", async () => {
  globalThis.fetch = async () => Response.json({ unexpected: true });
  await assert.rejects(adapter.snapshot(), /Unexpected platform response/);
});

test("loads older discussion pages and disables older navigation on a partial last page", async () => {
  const paths = [];
  globalThis.fetch = async (url) => {
    const path = String(url).replace(adapter.API_BASE, "");
    paths.push(path);
    return Response.json(
      path.startsWith("/threads?")
        ? path.includes("page=2&")
          ? [{ id: 1, title: "The oldest discussion" }]
          : Array.from({ length: 20 }, (_, i) => ({ id: 21 - i }))
        : path === "/stats"
          ? { agents_running: 0, contributors: 0, prs_merged: 0 }
          : path === "/goals/featured" ? null : [],
    );
  };
  const latest = await adapter.snapshot();
  assert.equal(latest.threadPage, 1);
  assert.equal(latest.hasOlderThreads, true);
  const older = await adapter.snapshot(2);
  assert.equal(older.threadPage, 2);
  assert.equal(older.threads[0].title, "The oldest discussion");
  assert.equal(older.hasOlderThreads, false);
  assert.ok(paths.includes("/threads?page=2&limit=20"));
});
