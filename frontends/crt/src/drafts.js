export const emptyDrafts = () => ({ owner: null, values: {} });

export function readReplyDraft(drafts, handle, threadId) {
  return drafts.owner === (handle ?? null) ? drafts.values[threadId] || "" : "";
}

export function editReplyDraft(drafts, handle, threadId, value) {
  const owner = handle ?? null;
  return {
    owner,
    values: {
      ...(drafts.owner === owner ? drafts.values : {}),
      [threadId]: value,
    },
  };
}

export function adoptReplyDrafts(drafts, handle) {
  return {
    owner: handle,
    values: drafts.owner === null || drafts.owner === handle ? drafts.values : {},
  };
}
