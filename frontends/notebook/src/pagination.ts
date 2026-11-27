export const THREAD_PAGE_SIZE = 20;

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
