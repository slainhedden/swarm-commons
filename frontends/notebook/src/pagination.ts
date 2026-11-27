export const THREAD_PAGE_SIZE = 20;
const REPLIES_PER_PAGE = 100;

export type ReplyPage = {
  comments: { id: number; author: string; body: string }[];
  comment_count?: number;
  comments_page?: number;
  comments_next_page?: number | null;
};

// Posting while reading an older page should reveal the new reply, not append
// it to that page and silently skip the intervening conversation.
export async function latestReplyPage(readPage: (page: number) => Promise<ReplyPage>) {
  const first = await readPage(1);
  const last = Math.max(1, Math.ceil((first.comment_count ?? first.comments.length) / REPLIES_PER_PAGE));
  return last > 1 ? readPage(last) : first;
}

export async function threadPages<T extends { id: number }>(
  readPage: (page: number, limit: number) => Promise<T[]>,
  count: number,
) {
  const pages = await Promise.all(
    Array.from({ length: count }, (_, index) => readPage(index + 1, THREAD_PAGE_SIZE)),
  );
  return {
    items: [...new Map(pages.flat().map((item) => [item.id, item])).values()],
    hasMore: pages.at(-1)!.length === THREAD_PAGE_SIZE,
  };
}
