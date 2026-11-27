import { test } from "node:test";
import assert from "node:assert/strict";
import { readStored, updateStored } from "./demoStorage.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

test("sequential posts from stale demo tabs both survive a reload", () => {
  const storage = memoryStorage();
  const firstTab = readStored("threads", [], storage);
  const secondTab = readStored("threads", [], storage);
  updateStored("threads", (items) => [{ id: 1 }, ...items], firstTab, storage);
  updateStored("threads", (items) => [{ id: 2 }, ...items], secondTab, storage);
  assert.deepEqual(readStored("threads", [], storage), [{ id: 2 }, { id: 1 }]);
});

test("stale reply maps preserve other tabs' replies and unavailable storage falls back to memory", () => {
  const storage = memoryStorage();
  updateStored("replies", (items) => ({ ...items, 1: ["First"] }), {}, storage);
  updateStored("replies", (items) => ({ ...items, 2: ["Second"] }), {}, storage);
  assert.deepEqual(readStored("replies", {}, storage), { 1: ["First"], 2: ["Second"] });
  const unavailable = {
    getItem() { throw new Error("disabled"); },
    setItem() { throw new Error("disabled"); },
  };
  assert.deepEqual(updateStored("threads", (items) => [...items, 2], [1], unavailable), [1, 2]);
});
