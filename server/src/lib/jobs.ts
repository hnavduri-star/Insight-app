/**
 * Background jobs for slow AI work, so no request stays open for minutes (hosting proxies
 * can drop long requests). A request starts or joins a job, waits up to WAIT_MS, then either
 * returns the result or tells the client to ask again. Results and errors are kept for a few
 * minutes so the next poll can collect them.
 */
type Job<T> = { promise: Promise<T>; done?: boolean; result?: T; error?: unknown };
const jobs = new Map<string, Job<unknown>>();
export const WAIT_MS = { value: 8_000 };
const KEEP_MS = 5 * 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runJob<T>(key: string, start: () => Promise<T>, beforeStart?: () => Promise<void>):
  Promise<{ done: true; result: T } | { done: false }> {
  let job = jobs.get(key) as Job<T> | undefined;
  if (!job) {
    await beforeStart?.();
    const j: Job<T> = { promise: start() };
    const forget = () => setTimeout(() => { if (jobs.get(key) === j) jobs.delete(key); }, KEEP_MS).unref?.();
    j.promise.then((r) => { j.done = true; j.result = r; forget(); }, (err) => {
      console.error(`[jobs] ${key.slice(0, 60)} failed:`, err instanceof Error ? err.message : err);
      j.error = err; forget();
    });
    jobs.set(key, j);
    job = j;
  }
  if (!job.done && !job.error) await Promise.race([job.promise.catch(() => {}), sleep(WAIT_MS.value)]);
  if (job.error) { jobs.delete(key); throw job.error; }
  if (job.done) { jobs.delete(key); return { done: true, result: job.result as T }; }
  return { done: false };
}
