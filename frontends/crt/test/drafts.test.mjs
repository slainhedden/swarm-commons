import test from "node:test";
import assert from "node:assert/strict";
import {
  adoptReplyDrafts,
  editReplyDraft,
  emptyDrafts,
  readReplyDraft,
} from "../src/drafts.js";

test("guest sign-in adopts its draft without exposing it to other accounts or guests", () => {
  const guest = editReplyDraft(emptyDrafts(), undefined, 7, "unfinished reply");
  const signedIn = adoptReplyDrafts(guest, "alice");
  assert.equal(readReplyDraft(signedIn, "alice", 7), "unfinished reply");
  assert.equal(readReplyDraft(signedIn, "bob", 7), "");
  assert.equal(readReplyDraft(signedIn, undefined, 7), "");
  assert.equal(readReplyDraft(adoptReplyDrafts(signedIn, "bob"), "bob", 7), "");
});

test("reauthentication restores only the same account's unpublished replies", () => {
  const alice = editReplyDraft(emptyDrafts(), "alice", 7, "unfinished reply");
  assert.equal(readReplyDraft(alice, undefined, 7), "");
  assert.equal(
    readReplyDraft(adoptReplyDrafts(alice, "alice"), "alice", 7),
    "unfinished reply",
  );
  assert.equal(readReplyDraft(adoptReplyDrafts(alice, "bob"), "bob", 7), "");
  assert.equal(
    readReplyDraft(adoptReplyDrafts(emptyDrafts(), "alice"), "alice", 7),
    "",
  );
});

test("account switches and successful sends cannot copy another principal's drafts", () => {
  const alice = editReplyDraft(emptyDrafts(), "alice", 7, "private draft");
  const bob = editReplyDraft(alice, "bob", 8, "bob reply");
  assert.equal(readReplyDraft(bob, "bob", 7), "");
  assert.equal(readReplyDraft(bob, "bob", 8), "bob reply");
  const sent = editReplyDraft(bob, "bob", 8, "");
  assert.equal(readReplyDraft(sent, "bob", 8), "");
  assert.equal(readReplyDraft(emptyDrafts(), "alice", 7), "");
});
