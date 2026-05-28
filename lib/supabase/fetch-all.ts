/**
 * Fetch every row matching a query, paging past PostgREST's per-request
 * row cap (~1000 rows). A plain `.select()` is silently truncated once the
 * result exceeds that cap, so any unbounded read drops rows as the data
 * grows. Call sites pass a factory that applies `.range(from, to)`; we loop
 * until a short page comes back.
 *
 * The query MUST include a stable `.order()` (ideally on the unique key),
 * otherwise pages can overlap or skip rows between requests.
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await makeQuery(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const batch = data ?? []
    all.push(...batch)
    if (batch.length < pageSize) break
  }
  return all
}
