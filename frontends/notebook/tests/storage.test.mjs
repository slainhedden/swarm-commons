import assert from "node:assert/strict";
import test from "node:test";
import { loadSource } from "./load-source.mjs";

const { readStored, store, updateStored } = await loadSource("../src/data.ts");

test("stale demo tabs preserve each other's proposals, votes, notes, and replies", async () => {
  const saved = new Map();
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, value),
  };
  for (const key of ["proposals", "votes", "notes"]) {
    const staleTab = [];
    store(key, ["first tab"]);
    const next = await updateStored(key, staleTab, (current) => [...current, "second tab"]);
    assert.deepEqual(next, ["first tab", "second tab"]);
    assert.deepEqual(readStored(key, []), next);
  }
  store("comments", { discussion: [{ body: "first tab" }] });
  await updateStored("comments", {}, (current) => ({
    ...current, discussion: [...current.discussion, { body: "second tab" }],
  }));
  assert.deepEqual(readStored("comments", {}).discussion, [
    { body: "first tab" }, { body: "second tab" },
  ]);
});

test("quota failures reject each edit instead of claiming old storage contains the new note", async () => {
  const saved = JSON.stringify([{ id: "already saved" }]);
  globalThis.localStorage = {
    getItem: () => saved,
    setItem() { throw new DOMException("Quota exceeded", "QuotaExceededError"); },
  };
  for (const id of ["first unsaved draft", "second unsaved draft"]) {
    await assert.rejects(
      updateStored("notes", [], (current) => [{ id }, ...current]),
      /could not save/,
    );
    assert.deepEqual(readStored("notes", []), [{ id: "already saved" }]);
  }
});

test("blocked browser storage rejects edits rather than reporting a durable save", async () => {
  globalThis.localStorage = {
    getItem() { throw new Error("Storage blocked"); },
    setItem() { throw new Error("Storage blocked"); },
  };
  await assert.rejects(updateStored("votes", ["existing"], (current) => [...current, "new"]), /could not save/);
});
