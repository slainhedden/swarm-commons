import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGoals, loadPublicGoals } from "../src/api.js";

test("completed goals stay complete even when they contain tasks", () => {
  const result = normalizeGoals([
    {
      id: 1,
      title: "Shipped",
      status: "done",
      progress: { total: 3, done: 3 },
    },
    {
      id: 2,
      title: "In progress",
      status: "open",
      progress: { total: 3, done: 1 },
    },
    { id: 3, title: "Proposed", status: "open", progress: { total: 0 } },
  ]);
  assert.deepEqual(
    result.map((g) => g.state),
    ["SHIPPED", "BUILDING", "VOTING"],
  );
});

test("pending, rejected and hidden proposals are not displayed publicly", () => {
  const result = normalizeGoals(
    ["approved", "pending", "rejected", "hidden", "deleted"].map(
      (visibility, id) => ({ id, title: visibility, visibility }),
    ),
  );
  assert.deepEqual(
    result.map((g) => g.title),
    ["approved"],
  );
});

test("legacy public records remain compatible and malformed entries are ignored", () => {
  assert.deepEqual(
    normalizeGoals({
      goals: [null, {}, { id: 7, title: "Legacy goal", votes: 4 }],
    }),
    [
      {
        id: "7",
        title: "Legacy goal",
        description: "",
        tags: ["COMMUNITY", "PUBLIC GOOD"],
        votes: 4,
        state: "VOTING",
      },
    ],
  );
  assert.throws(() => normalizeGoals(null), /Unexpected goal response/);
  assert.throws(
    () => normalizeGoals({ detail: "Not authorized" }),
    /Unexpected goal response/,
  );
});

test("unconfigured demos make no network request", async (t) => {
  const request = t.mock.method(globalThis, "fetch", () => {
    throw new Error("Must not fetch");
  });
  assert.equal(await loadPublicGoals(""), null);
  assert.equal(request.mock.calls.length, 0);
});

test("malformed-only lists fail while empty and moderated queues remain valid", () => {
  for (const payload of [[{ error: "auth required" }], { goals: [null, {}] }]) {
    assert.throws(() => normalizeGoals(payload), /Unexpected goal response/);
  }
  assert.deepEqual(normalizeGoals([]), []);
  assert.deepEqual(normalizeGoals({ goals: [] }), []);
  assert.deepEqual(
    normalizeGoals([
      { id: 9, title: "Awaiting approval", visibility: "pending" },
    ]),
    [],
  );
});

test("successful configured reads use the documented goal endpoint", async (t) => {
  const request = t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify([
          { id: 8, title: "Live goal", visibility: "approved", status: "done" },
        ]),
      ),
  );
  assert.equal(
    (await loadPublicGoals("https://api.example/api/v1/"))[0].state,
    "SHIPPED",
  );
  assert.equal(
    request.mock.calls[0].arguments[0],
    "https://api.example/api/v1/goals",
  );
  assert.equal(
    request.mock.calls[0].arguments[1].headers.Accept,
    "application/json",
  );
});

test("API denial and proxy sign-in HTML fail rather than masquerading as a live queue", async (t) => {
  const request = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 401 }),
  );
  await assert.rejects(loadPublicGoals("https://api.example/api/v1"), /401/);
  request.mock.mockImplementation(
    async () => new Response("<html>Sign in</html>"),
  );
  await assert.rejects(
    loadPublicGoals("https://api.example/api/v1"),
    SyntaxError,
  );
});
