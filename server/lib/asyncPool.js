/**
 * Run async iterator over items with at most `limit` concurrent executions.
 * Results preserve input order.
 */
export async function asyncPool(limit, items, iteratorFn) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await iteratorFn(items[i], i);
    }
  }

  const n = Math.min(Math.max(1, limit), Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
